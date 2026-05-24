const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");
const { effectivePermissions } = require("../permissions");

const router = express.Router();

router.post("/register", (req, res) => {
  const { name, email, phone, password, apartment_id, role } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: "name, email, password required" });
  }
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email already registered" });

  const hash = bcrypt.hashSync(password, 10);
  const info = db
    .prepare(
      "INSERT INTO users (apartment_id, name, email, phone, password_hash, role) VALUES (?,?,?,?,?,?)"
    )
    .run(apartment_id || null, name, email, phone || null, hash, role || "resident");
  const user = db.prepare("SELECT id, name, email, role, apartment_id FROM users WHERE id = ?").get(info.lastInsertRowid);
  const token = signToken(user);
  res.json({ token, user });
});

function apartmentFor(apId) {
  if (!apId) return null;
  return db.prepare("SELECT id, name, tagline FROM apartments WHERE id = ?").get(apId);
}

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const safe = {
    id: user.id, name: user.name, email: user.email, role: user.role,
    apartment_id: user.apartment_id, avatar_url: user.avatar_url,
    permissions: effectivePermissions(user),
    apartment: apartmentFor(user.apartment_id),
  };
  res.json({ token: signToken(safe), user: safe });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db
    .prepare(`SELECT id, name, email, phone, role, apartment_id, avatar_url, bio, move_in_date,
                     occupation, family_members, emergency_contact, vehicle_info, permissions
              FROM users WHERE id = ?`)
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  const safe = {
    ...user,
    permissions: effectivePermissions(user),
    apartment: apartmentFor(user.apartment_id),
  };
  res.json({ user: safe });
});

module.exports = router;
