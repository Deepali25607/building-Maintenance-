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
} = require("../permissions");

const router = express.Router();

router.use(requireAuth);

router.get("/permissions/meta", (_req, res) => {
  res.json({ modules: MODULES, actions: ACTIONS, role_defaults: ROLE_DEFAULTS });
});

router.get("/:id/permissions", requirePermission("users", "view"), (req, res) => {
  const id = Number(req.params.id);
  const u = db.prepare("SELECT id, role, permissions FROM users WHERE id = ?").get(id);
  if (!u) return res.status(404).json({ error: "Not found" });
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
  const existing = db.prepare("SELECT role FROM users WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Not found" });
  if (existing.role === "super_admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Cannot modify super admin permissions" });
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
  const rows = db
    .prepare(
      `SELECT id, apartment_id, name, email, phone, role, avatar_url, bio, move_in_date,
              occupation, family_members, emergency_contact, vehicle_info,
              active, created_at
       FROM users ORDER BY created_at DESC`
    )
    .all();
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
  const isStaff = ["super_admin", "committee", "treasurer"].includes(req.user.role);
  if (!isSelf && !isStaff && u.apartment_id !== req.user.apartment_id) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json({ user: u });
});

router.post("/", requirePermission("users", "create"), (req, res) => {
  const { name, email, phone, password, role, apartment_id } = req.body || {};
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: "name, email, password, role required" });
  }
  const exists = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (exists) return res.status(409).json({ error: "Email exists" });
  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      "INSERT INTO users (apartment_id, name, email, phone, password_hash, role) VALUES (?,?,?,?,?,?)"
    )
    .run(apartment_id || req.user.apartment_id || null, name, email, phone || null, hash, role);
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
  const isSuperAdmin = req.user.role === "super_admin";
  if (!isSelf && !isStaff) return res.status(403).json({ error: "Forbidden — missing permission: users.edit" });

  const {
    name, phone, role, active, apartment_id, avatar_url, bio, move_in_date,
    occupation, family_members, emergency_contact, vehicle_info,
  } = req.body || {};

  // Tightened guards:
  //   - role: only super_admin can change, never self-change (avoid escalation + lockout)
  //   - active: only staff can change, never self-disable
  //   - apartment_id: only super_admin
  //   - editing a super_admin's role/active is reserved for another super_admin
  if (role !== undefined) {
    if (!isSuperAdmin) return res.status(403).json({ error: "Only super admin can change roles" });
    if (isSelf) return res.status(403).json({ error: "Cannot change your own role" });
  }
  if (active !== undefined) {
    if (!isStaff) return res.status(403).json({ error: "Cannot change active status" });
    if (isSelf) return res.status(403).json({ error: "Cannot deactivate yourself" });
  }
  if (apartment_id !== undefined && !isSuperAdmin) {
    return res.status(403).json({ error: "Only super admin can change apartment assignment" });
  }
  if (existing.role === "super_admin" && !isSuperAdmin && (role !== undefined || active !== undefined)) {
    return res.status(403).json({ error: "Cannot modify a super admin's role or status" });
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
