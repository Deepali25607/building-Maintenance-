const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");
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
  // Tenant isolation: only platform admins can list users across all orgs.
  // Optionally they can pass ?apartment_id=N to scope the listing.
  let rows;
  if (isPlatformAdmin(req.user)) {
    const filterAp = req.query.apartment_id ? Number(req.query.apartment_id) : null;
    rows = filterAp
      ? db.prepare(
          `SELECT id, apartment_id, name, email, phone, role, avatar_url, bio, move_in_date,
                  occupation, family_members, emergency_contact, vehicle_info,
                  active, created_at
           FROM users WHERE apartment_id = ? OR apartment_id IS NULL
           ORDER BY created_at DESC`
        ).all(filterAp)
      : db.prepare(
          `SELECT id, apartment_id, name, email, phone, role, avatar_url, bio, move_in_date,
                  occupation, family_members, emergency_contact, vehicle_info,
                  active, created_at
           FROM users ORDER BY created_at DESC`
        ).all();
  } else {
    rows = db
      .prepare(
        `SELECT id, apartment_id, name, email, phone, role, avatar_url, bio, move_in_date,
                occupation, family_members, emergency_contact, vehicle_info,
                active, created_at
         FROM users WHERE apartment_id = ? ORDER BY created_at DESC`
      )
      .all(req.user.apartment_id);
  }
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
