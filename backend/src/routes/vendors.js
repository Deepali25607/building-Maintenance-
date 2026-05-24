const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../permissions");

const router = express.Router();
router.use(requireAuth);

router.get("/", requirePermission("vendors", "view"), (req, res) => {
  const vendors = db
    .prepare("SELECT * FROM vendors WHERE apartment_id = ? ORDER BY name")
    .all(req.user.apartment_id);
  res.json({ vendors });
});

router.post("/", requirePermission("vendors", "create"), (req, res) => {
  const { name, service, phone, email } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const info = db
    .prepare("INSERT INTO vendors (apartment_id, name, service, phone, email) VALUES (?,?,?,?,?)")
    .run(req.user.apartment_id, name, service || null, phone || null, email || null);
  res.status(201).json({ vendor: db.prepare("SELECT * FROM vendors WHERE id = ?").get(info.lastInsertRowid) });
});

module.exports = router;
