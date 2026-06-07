const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, can, isPlatformAdmin, canAccessApartment } = require("../permissions");
const { planFor } = require("../plans");

const router = express.Router();
router.use(requireAuth);

// A flat's financial fields are visible only to people who manage bills
// (super_admin / committee / treasurer) or to the flat's own owner.
function canSeeFinancials(user, flat) {
  if (!user) return false;
  if (can(user, "bills", "edit")) return true;
  return flat?.owner_id === user.id;
}

function stripFlatFinancials(flat) {
  if (!flat) return flat;
  const { monthly_rate, opening_balance, summary, ...rest } = flat;
  return rest;
}

router.get("/", requirePermission("flats", "view"), (req, res) => {
  // Platform admin may scope by ?apartment_id; everyone else is locked to their own.
  const apartmentId = isPlatformAdmin(req.user)
    ? (req.query.apartment_id || null)
    : req.user.apartment_id;
  const flats = db
    .prepare(
      `SELECT f.*,
              u.name AS owner_name, u.email AS owner_email,
              u.phone AS owner_phone, u.avatar_url AS owner_avatar,
              t.name AS tower_name
       FROM flats f
       LEFT JOIN users u ON u.id = f.owner_id
       LEFT JOIN towers t ON t.id = f.tower_id
       WHERE (? IS NULL OR f.apartment_id = ?)
       ORDER BY t.name, f.block, f.floor, f.flat_number`
    )
    .all(apartmentId || null, apartmentId || null);

  const summary = db.prepare(
    `SELECT
       COALESCE(SUM(amount + penalty - paid_amount),0) AS bills_due,
       COALESCE(SUM(paid_amount),0) AS paid,
       COUNT(*) AS bill_count,
       COALESCE(SUM(CASE WHEN (amount + penalty - paid_amount) > 0 THEN 1 ELSE 0 END),0) AS pending_months
     FROM bills WHERE flat_id = ?`
  );
  const enriched = flats.map((f) => {
    const s = summary.get(f.id);
    const due = s.bills_due + (f.opening_balance || 0);
    const full = { ...f, summary: { ...s, opening_balance: f.opening_balance || 0, due } };
    return canSeeFinancials(req.user, full) ? full : stripFlatFinancials(full);
  });
  res.json({ flats: enriched });
});

router.get("/:id", requirePermission("flats", "view"), (req, res) => {
  const id = Number(req.params.id);
  const flat = db
    .prepare(
      `SELECT f.*, u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
              u.phone AS owner_phone, u.avatar_url AS owner_avatar,
              u.bio AS owner_bio, u.move_in_date AS owner_move_in_date,
              u.occupation AS owner_occupation,
              u.family_members AS owner_family_members,
              u.emergency_contact AS owner_emergency_contact,
              u.vehicle_info AS owner_vehicle_info,
              u.created_at AS owner_created_at,
              t.name AS tower_name
       FROM flats f
       LEFT JOIN users u ON u.id = f.owner_id
       LEFT JOIN towers t ON t.id = f.tower_id
       WHERE f.id = ?`
    )
    .get(id);
  if (!flat) return res.status(404).json({ error: "Flat not found" });
  if (!canAccessApartment(req.user, flat.apartment_id)) {
    return res.status(403).json({ error: "Forbidden — cross-organization access denied" });
  }

  // Residents (and other non-finance roles) may view other flats' owner
  // profiles, but financial details are stripped from the response.
  const showFinancials = canSeeFinancials(req.user, flat);
  if (!showFinancials) {
    return res.json({ flat: stripFlatFinancials(flat) });
  }

  const bills = db
    .prepare("SELECT * FROM bills WHERE flat_id = ? ORDER BY period DESC")
    .all(id);
  const billIds = bills.map((b) => b.id);
  let payments = [];
  if (billIds.length) {
    const placeholders = billIds.map(() => "?").join(",");
    payments = db
      .prepare(
        `SELECT p.*, u.name AS recorded_by_name
         FROM payments p LEFT JOIN users u ON u.id = p.recorded_by
         WHERE p.bill_id IN (${placeholders})
         ORDER BY p.paid_at DESC`
      )
      .all(...billIds);
  }
  const billsWithPayments = bills.map((b) => ({
    ...b,
    payments: payments.filter((p) => p.bill_id === b.id),
  }));

  const totals = bills.reduce(
    (acc, b) => {
      acc.billed += b.amount + b.penalty;
      acc.paid += b.paid_amount;
      acc.bills_due += Math.max(0, b.amount + b.penalty - b.paid_amount);
      return acc;
    },
    { billed: 0, paid: 0, bills_due: 0 }
  );
  totals.opening_balance = flat.opening_balance || 0;
  totals.due = totals.bills_due + totals.opening_balance;

  res.json({ flat, bills: billsWithPayments, totals });
});

// A flat may only point at a tower in its own organization. Returns the valid
// tower id, or undefined if none supplied; throws a {status,message} on mismatch.
function resolveTowerId(towerId, apId) {
  if (towerId === undefined || towerId === null || towerId === "") return null;
  const tower = db.prepare("SELECT id, apartment_id FROM towers WHERE id = ?").get(Number(towerId));
  if (!tower || Number(tower.apartment_id) !== Number(apId)) {
    throw { status: 400, message: "Invalid tower for this organization" };
  }
  return tower.id;
}

router.post("/", requirePermission("flats", "create"), (req, res) => {
  const { apartment_id, block, flat_number, floor, area_sqft, monthly_rate, owner_id, opening_balance, tower_id } = req.body || {};
  if (!flat_number) return res.status(400).json({ error: "flat_number required" });
  const apId = apartment_id || req.user.apartment_id;
  if (!apId) return res.status(400).json({ error: "apartment_id required" });

  let towerId;
  try { towerId = resolveTowerId(tower_id, apId); }
  catch (e) { return res.status(e.status || 400).json({ error: e.message || "Invalid tower" }); }

  // Enforce the org's subscription flat cap (BRD §6). null limit === unlimited.
  const org = db.prepare("SELECT plan FROM apartments WHERE id = ?").get(apId);
  const limit = planFor(org?.plan).flat_limit;
  if (limit !== null) {
    const used = db.prepare("SELECT COUNT(*) AS n FROM flats WHERE apartment_id = ?").get(apId).n;
    if (used >= limit) {
      return res.status(403).json({
        error: `Flat limit reached: the ${planFor(org?.plan).name} plan allows up to ${limit} flats. Upgrade the plan to add more.`,
      });
    }
  }

  try {
    const info = db
      .prepare(
        `INSERT INTO flats (apartment_id, block, flat_number, floor, area_sqft, monthly_rate, owner_id, opening_balance, tower_id)
         VALUES (?,?,?,?,?,?,?,?,?)`
      )
      .run(
        apId, block || null, flat_number, floor || null, area_sqft || null,
        monthly_rate || 0, owner_id || null,
        Number(opening_balance) || 0, towerId
      );
    res.status(201).json({ flat: db.prepare("SELECT * FROM flats WHERE id = ?").get(info.lastInsertRowid) });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Flat already exists" });
    throw e;
  }
});

router.patch("/:id", requirePermission("flats", "edit"), (req, res) => {
  const id = Number(req.params.id);
  const { block, flat_number, floor, area_sqft, monthly_rate, owner_id, opening_balance, tower_id } = req.body || {};
  const existing = db.prepare("SELECT * FROM flats WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  // tower_id is optional; when present it's validated against the flat's own org.
  // An explicit null/"" clears the assignment.
  const towerProvided = tower_id !== undefined;
  let towerId = null;
  if (towerProvided) {
    try { towerId = resolveTowerId(tower_id, existing.apartment_id); }
    catch (e) { return res.status(e.status || 400).json({ error: e.message || "Invalid tower" }); }
  }

  const obProvided = opening_balance !== undefined;
  db.prepare(
    `UPDATE flats SET
       block = COALESCE(?, block),
       flat_number = COALESCE(?, flat_number),
       floor = COALESCE(?, floor),
       area_sqft = COALESCE(?, area_sqft),
       monthly_rate = COALESCE(?, monthly_rate),
       owner_id = COALESCE(?, owner_id),
       opening_balance = CASE WHEN ? = 1 THEN ? ELSE opening_balance END,
       tower_id = CASE WHEN ? = 1 THEN ? ELSE tower_id END
     WHERE id = ?`
  ).run(
    block ?? null, flat_number ?? null, floor ?? null, area_sqft ?? null,
    monthly_rate ?? null, owner_id ?? null,
    obProvided ? 1 : 0, obProvided ? Number(opening_balance) || 0 : 0,
    towerProvided ? 1 : 0, towerId,
    id
  );
  res.json({ flat: db.prepare("SELECT * FROM flats WHERE id = ?").get(id) });
});

router.delete("/:id", requirePermission("flats", "delete"), (req, res) => {
  const id = Number(req.params.id);
  const flat = db.prepare("SELECT * FROM flats WHERE id = ?").get(id);
  if (!flat) return res.status(404).json({ error: "Flat not found" });
  if (!canAccessApartment(req.user, flat.apartment_id)) {
    return res.status(403).json({ error: "Cross-organization access denied" });
  }
  const billCount = db.prepare("SELECT COUNT(*) AS n FROM bills WHERE flat_id = ?").get(id).n;
  db.prepare("DELETE FROM flats WHERE id = ?").run(id);
  res.json({ ok: true, deleted: flat, cascaded_bills: billCount });
});

module.exports = router;
