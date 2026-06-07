const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const { signToken, requireAuth } = require("../middleware/auth");
const { effectivePermissions } = require("../permissions");
const { planFor, trialInfo } = require("../plans");

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
  const ap = db.prepare("SELECT id, org_code, name, tagline, background_url, plan, trial_ends_at FROM apartments WHERE id = ?").get(apId);
  if (!ap) return null;
  const p = planFor(ap.plan);
  return { ...ap, plan: p.key, plan_name: p.name, ...(trialInfo(p.key, ap.trial_ends_at) || {}) };
}

router.post("/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });
  const user = db.prepare("SELECT * FROM users WHERE email = ? AND active = 1").get(email);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });
  const apartment = apartmentFor(user.apartment_id);

  // Trial gate: once an organization's free trial has ended, ALL of its users
  // are blocked from signing in until the platform team moves them onto a paid
  // plan. We surface a distinct `code` so the client can route them to the
  // "contact sales" screen instead of showing a generic login error.
  if (apartment && apartment.plan === "trial" && apartment.trial_expired) {
    return res.status(403).json({
      error: "Your organization's free trial has ended. Please contact our sales team to reactivate your account.",
      code: "trial_expired",
      org_code: apartment.org_code,
      org_name: apartment.name,
    });
  }

  const safe = {
    id: user.id, name: user.name, email: user.email, role: user.role,
    apartment_id: user.apartment_id, avatar_url: user.avatar_url,
    org_code: apartment?.org_code || null,
    permissions: effectivePermissions(user),
    apartment,
  };
  res.json({ token: signToken(safe), user: safe });
});

router.post("/change-password", requireAuth, (req, res) => {
  const { current_password, new_password } = req.body || {};
  if (!current_password || !new_password) {
    return res.status(400).json({ error: "current_password and new_password required" });
  }
  if (String(new_password).length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }

  const user = db.prepare("SELECT id, password_hash FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "Not found" });

  const ok = bcrypt.compareSync(current_password, user.password_hash);
  // Use 400 (not 401) so the frontend's 401 interceptor doesn't force a logout
  // — this is a validation error on the supplied password, not a token failure.
  if (!ok) return res.status(400).json({ error: "Current password is incorrect" });

  if (bcrypt.compareSync(new_password, user.password_hash)) {
    return res.status(400).json({ error: "New password must be different from current password" });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  const user = db
    .prepare(`SELECT id, name, email, phone, role, apartment_id, avatar_url, bio, move_in_date,
                     occupation, family_members, emergency_contact, vehicle_info, permissions
              FROM users WHERE id = ?`)
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: "Not found" });
  const apartment = apartmentFor(user.apartment_id);
  const safe = {
    ...user,
    org_code: apartment?.org_code || null,
    permissions: effectivePermissions(user),
    apartment,
  };
  res.json({ user: safe });
});

module.exports = router;
