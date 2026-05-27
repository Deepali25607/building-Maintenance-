const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole, signToken } = require("../middleware/auth");
const { isPlatformAdmin, requirePlatformAdmin, effectivePermissions } = require("../permissions");

const router = express.Router();

// Public branding endpoint — for the login screen, before auth.
// Returns the most-recently-created apartment (in single-tenant demos, the only one).
router.get("/branding", (_req, res) => {
  const ap = db.prepare("SELECT id, name, tagline FROM apartments ORDER BY id DESC LIMIT 1").get();
  res.json({
    name: ap?.name || "Apartment Community",
    tagline: ap?.tagline || "Resident Portal",
  });
});

// Public organization signup — creates a new apartment AND its first
// org_admin user in one atomic transaction. No auth required.
//
// Body: {
//   org:   { name (required), tagline?, address? },
//   admin: { name (required), email (required), password (required, ≥8), phone? }
// }
//
// Returns: { token, user, apartment } — caller can drop the token straight
// into localStorage and skip the login screen.
router.post("/signup", (req, res) => {
  const { org, admin } = req.body || {};
  if (!org?.name || !String(org.name).trim()) {
    return res.status(400).json({ error: "Organization name is required" });
  }
  if (!admin?.name || !admin?.email || !admin?.password) {
    return res.status(400).json({ error: "Admin name, email, and password are required" });
  }
  const email = String(admin.email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Admin email is not valid" });
  }
  if (String(admin.password).length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }

  // Emails are globally unique across the platform (Phase 1 decision).
  const taken = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (taken) return res.status(409).json({ error: "An account with this email already exists" });

  const tx = db.transaction(() => {
    const apInfo = db.prepare("INSERT INTO apartments (name, address, tagline) VALUES (?,?,?)")
      .run(String(org.name).trim(), org.address?.trim() || null, org.tagline?.trim() || null);
    const apartmentId = apInfo.lastInsertRowid;

    const hash = bcrypt.hashSync(admin.password, 10);
    const userInfo = db.prepare(
      "INSERT INTO users (apartment_id, name, email, phone, password_hash, role, active) VALUES (?,?,?,?,?,?,1)"
    ).run(apartmentId, String(admin.name).trim(), email, admin.phone?.trim() || null, hash, "org_admin");

    return { apartmentId, userId: userInfo.lastInsertRowid };
  });

  let result;
  try {
    result = tx();
  } catch (e) {
    return res.status(500).json({ error: "Failed to create organization", detail: e.message });
  }

  const user = db.prepare(
    "SELECT id, name, email, phone, role, apartment_id, avatar_url FROM users WHERE id = ?"
  ).get(result.userId);
  const apartment = db.prepare("SELECT id, name, tagline, address FROM apartments WHERE id = ?")
    .get(result.apartmentId);

  const safe = {
    ...user,
    permissions: effectivePermissions(user),
    apartment,
  };
  res.status(201).json({ token: signToken(safe), user: safe, apartment });
});

router.use(requireAuth);

router.get("/", (req, res) => {
  if (isPlatformAdmin(req.user)) {
    // Enrich with per-org counts so the platform UI can show health at a glance.
    const apartments = db.prepare(
      `SELECT a.*,
              (SELECT COUNT(*) FROM users u WHERE u.apartment_id = a.id) AS user_count,
              (SELECT COUNT(*) FROM flats f WHERE f.apartment_id = a.id) AS flat_count,
              (SELECT COUNT(*) FROM bills b JOIN flats f ON f.id = b.flat_id
                 WHERE f.apartment_id = a.id) AS bill_count,
              (SELECT COUNT(*) FROM incidents i
                 WHERE i.apartment_id = a.id AND i.status != 'closed') AS open_incidents,
              (SELECT COUNT(*) FROM announcements an
                 WHERE an.apartment_id = a.id AND an.completed = 0) AS active_announcements
       FROM apartments a ORDER BY a.name`
    ).all();
    return res.json({ apartments });
  }
  const ap = db.prepare("SELECT * FROM apartments WHERE id = ?").get(req.user.apartment_id);
  res.json({ apartments: ap ? [ap] : [] });
});

router.get("/mine", (req, res) => {
  const ap = db.prepare("SELECT id, name, tagline, address FROM apartments WHERE id = ?")
    .get(req.user.apartment_id);
  if (!ap) return res.status(404).json({ error: "Apartment not found" });
  res.json({ apartment: ap });
});

// Creating a new organization is platform-admin-only — that's the SaaS
// onboarding path. (Public signup endpoint comes in Phase 2.)
router.post("/", requirePlatformAdmin, (req, res) => {
  const { name, address, tagline } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const info = db.prepare("INSERT INTO apartments (name, address, tagline) VALUES (?,?,?)")
    .run(name, address || null, tagline || null);
  res.status(201).json({ apartment: db.prepare("SELECT * FROM apartments WHERE id = ?").get(info.lastInsertRowid) });
});

// Org admins can rename / re-tagline their own apartment; platform admin can do any.
router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM apartments WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Apartment not found" });
  const isOwnOrg = req.user.apartment_id === id;
  const isOrgAdmin = req.user.role === "org_admin" && isOwnOrg;
  if (!isPlatformAdmin(req.user) && !isOrgAdmin) {
    return res.status(403).json({ error: "Only platform admin or this org's admin can update apartment" });
  }

  const { name, tagline, address } = req.body || {};
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: "name cannot be empty" });
  }
  db.prepare(
    `UPDATE apartments SET
       name = COALESCE(?, name),
       tagline = CASE WHEN ? IS NOT NULL THEN ? ELSE tagline END,
       address = CASE WHEN ? IS NOT NULL THEN ? ELSE address END
     WHERE id = ?`
  ).run(
    name ?? null,
    tagline === undefined ? null : 1, tagline === undefined ? null : (tagline || null),
    address === undefined ? null : 1, address === undefined ? null : (address || null),
    id
  );
  const updated = db.prepare("SELECT id, name, tagline, address FROM apartments WHERE id = ?").get(id);
  res.json({ apartment: updated });
});

// Hard-delete an organization. Platform-admin-only. Foreign keys cascade
// to flats, bills, payments, incidents, vendors, expenses, announcements.
// Users are set NULL (so platform admin accounts survive even if their last
// associated tenant goes away).
router.delete("/:id", requirePlatformAdmin, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT id, name FROM apartments WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Apartment not found" });

  // Disallow deleting the apartment the requesting platform admin happens
  // to belong to — avoids accidentally locking themselves out.
  if (req.user.apartment_id === id) {
    return res.status(400).json({ error: "Cannot delete the organization you are signed into" });
  }

  const info = db.prepare("DELETE FROM apartments WHERE id = ?").run(id);
  res.json({ ok: true, deleted: existing, rows: info.changes });
});

module.exports = router;
