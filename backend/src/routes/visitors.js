const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, can, canAccessApartment } = require("../permissions");
const { notify } = require("../notifications");

// Visitor management. Gate/security staff log a visitor and pick the flat they
// want to meet; the flat's resident (host) is notified to approve or deny. Staff
// then run the check-in / check-out lifecycle.
const router = express.Router();
router.use(requireAuth);

// "Staff" here = anyone who can run the gate lifecycle (org_admin, committee,
// maintenance). Residents can only see/approve their own visits + pre-register.
function isGateStaff(user) {
  return can(user, "visitors", "edit");
}

function flatLabel(block, flatNumber) {
  return `${block ? block + "-" : ""}${flatNumber || ""}`;
}

function getVisitor(id) {
  return db.prepare(
    `SELECT v.*, f.flat_number, f.block, h.name AS host_name, lb.name AS logged_by_name
       FROM visitors v
       LEFT JOIN flats f ON f.id = v.flat_id
       LEFT JOIN users h ON h.id = v.host_user_id
       LEFT JOIN users lb ON lb.id = v.logged_by
      WHERE v.id = ?`
  ).get(id);
}

// Minimal flat picker for the "log visitor" form. Avoids broadening flats.view
// (and exposing financials) to gate staff. Residents see only their own flats.
router.get("/flat-options", requirePermission("visitors", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  if (!apId) return res.json({ flats: [] });
  const staff = isGateStaff(req.user);
  const rows = staff
    ? db.prepare(
        `SELECT f.id, f.block, f.flat_number, f.owner_id, u.name AS owner_name
           FROM flats f LEFT JOIN users u ON u.id = f.owner_id
          WHERE f.apartment_id = ?
          ORDER BY f.block, f.flat_number`
      ).all(apId)
    : db.prepare(
        `SELECT f.id, f.block, f.flat_number, f.owner_id, u.name AS owner_name
           FROM flats f LEFT JOIN users u ON u.id = f.owner_id
          WHERE f.apartment_id = ? AND f.owner_id = ?
          ORDER BY f.block, f.flat_number`
      ).all(apId, req.user.id);
  res.json({ flats: rows.map((r) => ({ ...r, label: flatLabel(r.block, r.flat_number) })) });
});

// List visitors. Gate staff see the whole org log; residents see only visits
// that name them as host or are to a flat they own.
router.get("/", requirePermission("visitors", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  const params = [apId];
  let where = "v.apartment_id = ?";

  if (req.query.status) {
    where += " AND v.status = ?";
    params.push(String(req.query.status));
  }
  if (!isGateStaff(req.user)) {
    where += " AND (v.host_user_id = ? OR f.owner_id = ?)";
    params.push(req.user.id, req.user.id);
  }

  const visitors = db.prepare(
    `SELECT v.*, f.flat_number, f.block, h.name AS host_name, lb.name AS logged_by_name
       FROM visitors v
       LEFT JOIN flats f ON f.id = v.flat_id
       LEFT JOIN users h ON h.id = v.host_user_id
       LEFT JOIN users lb ON lb.id = v.logged_by
      WHERE ${where}
      ORDER BY v.created_at DESC, v.id DESC
      LIMIT 200`
  ).all(...params);

  // Lightweight counters for the page's filter tabs / badges.
  const counts = db.prepare(
    `SELECT status, COUNT(*) AS n FROM visitors WHERE apartment_id = ? GROUP BY status`
  ).all(apId).reduce((acc, r) => ((acc[r.status] = r.n), acc), {});

  res.json({ visitors, counts });
});

// Log a visitor and notify the flat member they're here to meet.
router.post("/", requirePermission("visitors", "create"), (req, res) => {
  const { flat_id, name, phone, purpose, vehicle_no, expected_at, notes, host_user_id } = req.body || {};
  const apId = req.user.apartment_id;
  if (!apId) return res.status(400).json({ error: "No organization context" });
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Visitor name is required" });
  if (!flat_id) return res.status(400).json({ error: "Select the flat the visitor is here to meet" });

  const flat = db.prepare("SELECT id, apartment_id, owner_id, block, flat_number FROM flats WHERE id = ?").get(Number(flat_id));
  if (!flat || flat.apartment_id !== apId) {
    return res.status(400).json({ error: "Invalid flat for this organization" });
  }

  // Residents may only register guests for a flat they own.
  if (!isGateStaff(req.user) && flat.owner_id !== req.user.id) {
    return res.status(403).json({ error: "You can only register visitors for your own flat" });
  }

  // Host defaults to the flat owner; an explicit host must live in the same org.
  let resolvedHost = flat.owner_id || null;
  if (host_user_id) {
    const h = db.prepare("SELECT id, apartment_id FROM users WHERE id = ?").get(Number(host_user_id));
    if (!h || h.apartment_id !== apId) return res.status(400).json({ error: "Invalid host resident" });
    resolvedHost = h.id;
  }

  const info = db.prepare(
    `INSERT INTO visitors
       (apartment_id, flat_id, host_user_id, name, phone, purpose, vehicle_no, expected_at, notes, logged_by, status)
     VALUES (?,?,?,?,?,?,?,?,?,?, 'pending')`
  ).run(
    apId, flat.id, resolvedHost, String(name).trim(),
    phone ? String(phone).trim() : null,
    purpose ? String(purpose).trim() : null,
    vehicle_no ? String(vehicle_no).trim() : null,
    expected_at || null,
    notes ? String(notes).trim() : null,
    req.user.id
  );

  // The core of the feature: ping the resident the visitor wants to meet.
  if (resolvedHost) {
    notify({
      apartmentId: apId,
      userIds: [resolvedHost],
      type: "visitor_arrival",
      title: "Visitor at the gate",
      body: `${String(name).trim()} is here to meet you${purpose ? ` (${String(purpose).trim()})` : ""} · Flat ${flatLabel(flat.block, flat.flat_number)}.`,
      link: "/visitors",
      excludeUserId: req.user.id,
    });
  }

  res.status(201).json({ visitor: getVisitor(info.lastInsertRowid), host_notified: !!resolvedHost && resolvedHost !== req.user.id });
});

// Status transitions. Approve/deny belong to the host (or staff); the gate
// lifecycle (check-in/out/expire) belongs to staff.
const STAMP_COL = { approved: "approved_at", checked_in: "checked_in_at", checked_out: "checked_out_at" };
const HOST_ACTIONS = ["approved", "denied"];
const GATE_ACTIONS = ["checked_in", "checked_out", "expired"];

router.patch("/:id/status", (req, res) => {
  const id = Number(req.params.id);
  const status = req.body?.status;
  const v = db.prepare("SELECT * FROM visitors WHERE id = ?").get(id);
  if (!v) return res.status(404).json({ error: "Visitor not found" });
  if (!canAccessApartment(req.user, v.apartment_id)) {
    return res.status(403).json({ error: "Cross-organization access denied" });
  }

  const isHost = !!v.host_user_id && v.host_user_id === req.user.id;
  const staff = isGateStaff(req.user);

  if (HOST_ACTIONS.includes(status)) {
    if (!isHost && !staff) return res.status(403).json({ error: "Only the resident being visited can approve or deny" });
    if (v.status !== "pending") return res.status(409).json({ error: `This visit is already ${v.status}` });
  } else if (GATE_ACTIONS.includes(status)) {
    if (!staff) return res.status(403).json({ error: "Only gate/security staff can update this" });
    if (status === "checked_out" && v.status !== "checked_in") {
      return res.status(409).json({ error: "Visitor must be checked in first" });
    }
  } else {
    return res.status(400).json({ error: "Invalid status" });
  }

  const stampCol = STAMP_COL[status]; // whitelisted — safe to interpolate
  if (stampCol) {
    db.prepare(`UPDATE visitors SET status = ?, ${stampCol} = datetime('now') WHERE id = ?`).run(status, id);
  } else {
    db.prepare("UPDATE visitors SET status = ? WHERE id = ?").run(status, id);
  }

  // Close the loop with relevant people.
  if (status === "approved" || status === "denied") {
    if (v.logged_by) {
      notify({
        apartmentId: v.apartment_id,
        userIds: [v.logged_by],
        type: `visitor_${status}`,
        title: `Visitor ${status}`,
        body: `${v.name}'s visit was ${status} by the resident.`,
        link: "/visitors",
        excludeUserId: req.user.id,
      });
    }
  } else if (status === "checked_in" && v.host_user_id) {
    notify({
      apartmentId: v.apartment_id,
      userIds: [v.host_user_id],
      type: "visitor_checked_in",
      title: "Visitor checked in",
      body: `${v.name} has entered the premises.`,
      link: "/visitors",
      excludeUserId: req.user.id,
    });
  }

  res.json({ visitor: getVisitor(id) });
});

router.delete("/:id", requirePermission("visitors", "delete"), (req, res) => {
  const id = Number(req.params.id);
  const v = db.prepare("SELECT id, apartment_id FROM visitors WHERE id = ?").get(id);
  if (!v) return res.status(404).json({ error: "Visitor not found" });
  if (!canAccessApartment(req.user, v.apartment_id)) {
    return res.status(403).json({ error: "Cross-organization access denied" });
  }
  db.prepare("DELETE FROM visitors WHERE id = ?").run(id);
  res.json({ ok: true });
});

module.exports = router;
