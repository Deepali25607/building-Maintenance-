const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
const { planFor } = require("../plans");
const {
  MODULES,
  ACTIONS,
  ROLE_DEFAULTS,
  parsePermissions,
  effectivePermissions,
  requirePermission,
  isPlatformAdmin,
  canAccessApartment,
} = require("../permissions");

// Bulk import may only create non-privileged roles — never a platform/org admin.
const BULK_ROLES = new Set(["resident", "maintenance", "committee", "treasurer"]);

// Readable temp password (base64url, no ambiguous padding) for invited residents.
function genTempPassword() {
  return crypto.randomBytes(9).toString("base64url").slice(0, 10);
}

const router = express.Router();

router.use(requireAuth);

router.get("/permissions/meta", (_req, res) => {
  res.json({ modules: MODULES, actions: ACTIONS, role_defaults: ROLE_DEFAULTS });
});

router.get("/:id/permissions", requirePermission("users", "view"), (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare("SELECT id, role, permissions, apartment_id FROM users WHERE id = ?").get(id);
  if (!u) return res.status(404).json({ error: "Not found" });
  if (!canAccessApartment(req.user, u.apartment_id)) {
    return res.status(403).json({ error: "Cannot read users in another organization" });
  }
  res.json({
    id: u.id,
    role: u.role,
    permissions: parsePermissions(u.permissions),
    effective: effectivePermissions(u),
    is_custom: !!u.permissions,
    role_default: ROLE_DEFAULTS[u.role] || {},
  });
});

router.put("/:id/permissions", requirePermission("users", "edit"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT role, apartment_id FROM users WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (!canAccessApartment(req.user, existing.apartment_id)) {
    return res.status(403).json({ error: "Cannot modify users in another organization" });
  }
  if (existing.role === "super_admin" && !isPlatformAdmin(req.user)) {
    return res.status(403).json({ error: "Cannot modify platform admin permissions" });
  }
  const { permissions } = req.body || {};
  const serialized = permissions === null ? null : JSON.stringify(permissions || {});
  db.prepare("UPDATE users SET permissions = ? WHERE id = ?").run(serialized, id);
  const u = db.prepare("SELECT id, role, permissions FROM users WHERE id = ?").get(id);
  res.json({
    id: u.id,
    role: u.role,
    permissions: parsePermissions(u.permissions),
    effective: effectivePermissions(u),
    is_custom: !!u.permissions,
  });
});

router.get("/", requirePermission("users", "view"), (req, res) => {
  // Tenant isolation rules:
  //   - Platform admin with no X-Org-Id header → sees every user.
  //   - Platform admin impersonating an org (X-Org-Id set) → only that org.
  //   - Anyone else → only their own apartment.
  // ?apartment_id= query param works as an explicit override for platform admins.
  const explicitFilter = req.query.apartment_id ? Number(req.query.apartment_id) : null;
  let filterAp = null;
  if (isPlatformAdmin(req.user)) {
    if (explicitFilter) filterAp = explicitFilter;
    else if (req.headers["x-org-id"]) filterAp = req.user.apartment_id;
    // else: no filter — list everyone
  } else {
    filterAp = req.user.apartment_id;
  }

  const rows = filterAp == null
    ? db.prepare(
        `SELECT id, apartment_id, name, email, phone, role, avatar_url, bio, move_in_date,
                occupation, family_members, emergency_contact, vehicle_info,
                active, created_at
         FROM users ORDER BY created_at DESC`
      ).all()
    : db.prepare(
        `SELECT id, apartment_id, name, email, phone, role, avatar_url, bio, move_in_date,
                occupation, family_members, emergency_contact, vehicle_info,
                active, created_at
         FROM users WHERE apartment_id = ? ORDER BY created_at DESC`
      ).all(filterAp);
  res.json({ users: rows });
});

router.get("/:id", (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare(
    `SELECT id, apartment_id, name, email, phone, role, avatar_url, bio, move_in_date,
            occupation, family_members, emergency_contact, vehicle_info, active, created_at
     FROM users WHERE id = ?`
  ).get(id);
  if (!u) return res.status(404).json({ error: "Not found" });
  const isSelf = req.user.id === id;
  // Tenant isolation: even staff (committee/treasurer/org_admin) can only see
  // users within their own apartment. Platform admins can see anyone.
  if (!isSelf && !canAccessApartment(req.user, u.apartment_id)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json({ user: u });
});

router.post("/", requirePermission("users", "create"), (req, res) => {
  const { name, email, phone, password, role, apartment_id } = req.body || {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, role required" });
  }
  // Tenant isolation: non-platform admins can only create users in their own
  // apartment, regardless of what apartment_id they put in the request body.
  let targetApId;
  if (isPlatformAdmin(req.user)) {
    targetApId = apartment_id || req.user.apartment_id || null;
  } else {
    if (apartment_id !== undefined && Number(apartment_id) !== req.user.apartment_id) {
      return res.status(403).json({ error: "Cannot create users in another organization" });
    }
    targetApId = req.user.apartment_id;
  }
  // Only platform admin can mint another platform admin (prevents escalation).
  if (role === "super_admin" && !isPlatformAdmin(req.user)) {
    return res.status(403).json({ error: "Only platform admin can create super_admin users" });
  }
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return res.status(409).json({ error: "Email exists" });
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      "INSERT INTO users (apartment_id, name, email, phone, password_hash, role) VALUES (?,?,?,?,?,?)"
    )
    .run(targetApId, name, email, phone || null, hash, role);
  const user = db.prepare("SELECT id, name, email, phone, role, apartment_id, active FROM users WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ user });
});

// Bulk import residents (BRD Module 2). Accepts an array of row objects parsed
// from CSV on the client. Each row is processed independently — a bad row is
// skipped/failed without aborting the rest — and a per-row result is returned.
// When a row carries a flat_number, the resident is also created-or-linked to a
// flat (respecting the org's subscription flat cap).
router.post("/bulk-import", requirePermission("users", "create"), (req, res) => {
  const { rows, apartment_id } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows array required" });
  }
  if (rows.length > 500) {
    return res.status(400).json({ error: "Too many rows — import up to 500 at a time" });
  }

  // Resolve the target org exactly like single create: tenants are locked to
  // their own apartment; platform admins may target one explicitly.
  let targetApId;
  if (isPlatformAdmin(req.user)) {
    targetApId = apartment_id || req.user.apartment_id || null;
  } else {
    if (apartment_id !== undefined && Number(apartment_id) !== req.user.apartment_id) {
      return res.status(403).json({ error: "Cannot import users into another organization" });
    }
    targetApId = req.user.apartment_id;
  }
  if (!targetApId) return res.status(400).json({ error: "No target organization to import into" });

  // Subscription flat cap (null = unlimited). flatCount is tracked across rows.
  const org = db.prepare("SELECT plan FROM apartments WHERE id = ?").get(targetApId);
  const flatLimit = planFor(org?.plan).flat_limit;
  let flatCount = db.prepare("SELECT COUNT(*) AS n FROM flats WHERE apartment_id = ?").get(targetApId).n;

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const insertUser = db.prepare(
    "INSERT INTO users (apartment_id, name, email, phone, password_hash, role) VALUES (?,?,?,?,?,?)"
  );

  const results = [];
  let created = 0, skipped = 0, failed = 0, flatsCreated = 0, flatsLinked = 0;

  for (let idx = 0; idx < rows.length; idx++) {
    const raw = rows[idx] || {};
    const name = String(raw.name || "").trim();
    const email = String(raw.email || "").trim().toLowerCase();
    const phone = raw.phone ? String(raw.phone).trim() : null;
    let role = String(raw.role || "resident").trim().toLowerCase();
    const flatNumber = raw.flat_number ? String(raw.flat_number).trim() : null;
    const block = raw.block ? String(raw.block).trim() : null;
    const monthlyRate = raw.monthly_rate != null && raw.monthly_rate !== "" ? Number(raw.monthly_rate) || 0 : 0;
    const label = { row: idx + 1, name, email };

    try {
      if (!name || !email) { skipped++; results.push({ ...label, status: "skipped", message: "Missing name or email" }); continue; }
      if (!emailRe.test(email)) { skipped++; results.push({ ...label, status: "skipped", message: "Invalid email" }); continue; }
      if (!BULK_ROLES.has(role)) role = "resident"; // never bulk-create an admin
      if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
        skipped++; results.push({ ...label, status: "skipped", message: "Email already exists" }); continue;
      }

      const givenPassword = raw.password && String(raw.password).length >= 8 ? String(raw.password) : null;
      const tempPassword = givenPassword || genTempPassword();
      const hash = bcrypt.hashSync(tempPassword, 10);

      // One transaction per row: user + optional flat are all-or-nothing together.
      const tx = db.transaction(() => {
        const userId = insertUser.run(targetApId, name, email, phone, hash, role).lastInsertRowid;
        let flat = { action: null, note: null };
        if (flatNumber) {
          const existingFlat = db.prepare(
            "SELECT id, owner_id FROM flats WHERE apartment_id = ? AND IFNULL(block,'') = IFNULL(?,'') AND flat_number = ?"
          ).get(targetApId, block, flatNumber);
          const flatLabel = `${block ? block + "-" : ""}${flatNumber}`;
          if (existingFlat) {
            if (existingFlat.owner_id) {
              flat = { action: null, note: `flat ${flatLabel} already owned — left as is` };
            } else {
              db.prepare("UPDATE flats SET owner_id = ? WHERE id = ?").run(userId, existingFlat.id);
              flat = { action: "linked", note: `linked to flat ${flatLabel}` };
            }
          } else if (flatLimit !== null && flatCount >= flatLimit) {
            flat = { action: null, note: `flat ${flatLabel} not created — plan limit (${flatLimit}) reached` };
          } else {
            db.prepare(
              "INSERT INTO flats (apartment_id, block, flat_number, monthly_rate, owner_id) VALUES (?,?,?,?,?)"
            ).run(targetApId, block, flatNumber, monthlyRate, userId);
            flat = { action: "created", note: `created flat ${flatLabel}` };
          }
        }
        return { userId, flat };
      });

      const { flat } = tx();
      // Mutate cross-row counters only after the row commits.
      if (flat.action === "created") { flatsCreated++; flatCount++; }
      if (flat.action === "linked") { flatsLinked++; }
      created++;
      results.push({
        ...label, status: "created", role,
        temp_password: givenPassword ? null : tempPassword,
        message: flat.note,
      });
    } catch (e) {
      failed++;
      const msg = String(e.message || "").includes("UNIQUE") ? "Duplicate flat in this organization" : (e.message || "Failed");
      results.push({ ...label, status: "error", message: msg });
    }
  }

  res.json({
    summary: { total: rows.length, created, skipped, failed, flats_created: flatsCreated, flats_linked: flatsLinked },
    results,
  });
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "User not found" });

  const { can } = require("../permissions");
  const isSelf = req.user.id === id;
  const isStaff = can(req.user, "users", "edit");
  const isSuperAdmin = isPlatformAdmin(req.user);
  if (!isSelf && !isStaff) return res.status(403).json({ error: "Forbidden — missing permission: users.edit" });

  // Tenant isolation: non-platform admins can only patch users in their own
  // apartment. Self-edit is always allowed regardless of tenant.
  if (!isSelf && !canAccessApartment(req.user, existing.apartment_id)) {
    return res.status(403).json({ error: "Cannot edit users in another organization" });
  }

  const {
    name, phone, role, active, apartment_id, avatar_url, bio, move_in_date,
    occupation, family_members, emergency_contact, vehicle_info,
  } = req.body || {};

  // Tightened guards:
  //   - role: org_admin / platform_admin can change. Never self-change.
  //           Only platform_admin can mint or demote a super_admin (no escalation).
  //   - active: only staff can change, never self-disable
  //   - apartment_id: only platform_admin (cross-tenant move)
  const isOrgAdmin = req.user.role === "org_admin";
  if (role !== undefined) {
    if (!isSuperAdmin && !isOrgAdmin) return res.status(403).json({ error: "Only an admin can change roles" });
    if (isSelf) return res.status(403).json({ error: "Cannot change your own role" });
    if (role === "super_admin" && !isSuperAdmin) {
      return res.status(403).json({ error: "Only platform admin can grant super_admin role" });
    }
  }
  if (active !== undefined) {
    if (!isStaff) return res.status(403).json({ error: "Cannot change active status" });
    if (isSelf) return res.status(403).json({ error: "Cannot deactivate yourself" });
  }
  if (apartment_id !== undefined && !isSuperAdmin) {
    return res.status(403).json({ error: "Only platform admin can change apartment assignment" });
  }
  if (existing.role === "super_admin" && !isSuperAdmin && (role !== undefined || active !== undefined)) {
    return res.status(403).json({ error: "Cannot modify a platform admin's role or status" });
  }

  const familyJson = family_members === undefined
    ? null
    : (typeof family_members === "string" ? family_members : JSON.stringify(family_members));

  db.prepare(
    `UPDATE users SET
      name = COALESCE(?, name),
      phone = COALESCE(?, phone),
      role = COALESCE(?, role),
      active = COALESCE(?, active),
      apartment_id = COALESCE(?, apartment_id),
      avatar_url = COALESCE(?, avatar_url),
      bio = COALESCE(?, bio),
      move_in_date = COALESCE(?, move_in_date),
      occupation = COALESCE(?, occupation),
      family_members = COALESCE(?, family_members),
      emergency_contact = COALESCE(?, emergency_contact),
      vehicle_info = COALESCE(?, vehicle_info)
     WHERE id = ?`
  ).run(
    name ?? null, phone ?? null, role ?? null, active ?? null, apartment_id ?? null,
    avatar_url ?? null, bio ?? null, move_in_date ?? null,
    occupation ?? null, familyJson, emergency_contact ?? null, vehicle_info ?? null,
    id
  );
  const user = db.prepare(
    `SELECT id, name, email, phone, role, apartment_id, avatar_url, bio, move_in_date,
            occupation, family_members, emergency_contact, vehicle_info, active
     FROM users WHERE id = ?`
  ).get(id);
  res.json({ user });
});

module.exports = router;
