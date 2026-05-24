const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

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

router.use(requireAuth);

router.get("/", (req, res) => {
  if (req.user.role === "super_admin") {
    return res.json({ apartments: db.prepare("SELECT * FROM apartments ORDER BY name").all() });
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

router.post("/", requireRole("super_admin"), (req, res) => {
  const { name, address, tagline } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const info = db.prepare("INSERT INTO apartments (name, address, tagline) VALUES (?,?,?)")
    .run(name, address || null, tagline || null);
  res.status(201).json({ apartment: db.prepare("SELECT * FROM apartments WHERE id = ?").get(info.lastInsertRowid) });
});

router.patch("/:id", requireRole("super_admin"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM apartments WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Apartment not found" });

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

module.exports = router;
