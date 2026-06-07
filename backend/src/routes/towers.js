const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, isPlatformAdmin, canAccessApartment } = require("../permissions");

const router = express.Router();
router.use(requireAuth);

// Each tower is enriched with how many flats reference it, plus the distinct
// floors actually in use — handy for the structure overview.
const SELECT_WITH_COUNTS = `
  SELECT t.*,
         (SELECT COUNT(*) FROM flats f WHERE f.tower_id = t.id) AS flat_count,
         (SELECT COUNT(DISTINCT f.floor) FROM flats f
            WHERE f.tower_id = t.id AND f.floor IS NOT NULL) AS floors_in_use
  FROM towers t`;

router.get("/", requirePermission("towers", "view"), (req, res) => {
  // Platform admin may scope by ?apartment_id; everyone else is locked to their own.
  const apartmentId = isPlatformAdmin(req.user)
    ? (req.query.apartment_id || req.user.apartment_id || null)
    : req.user.apartment_id;
  const towers = db
    .prepare(`${SELECT_WITH_COUNTS} WHERE (? IS NULL OR t.apartment_id = ?) ORDER BY t.name`)
    .all(apartmentId || null, apartmentId || null);
  res.json({ towers });
});

router.get("/:id", requirePermission("towers", "view"), (req, res) => {
  const tower = db.prepare(`${SELECT_WITH_COUNTS} WHERE t.id = ?`).get(Number(req.params.id));
  if (!tower) return res.status(404).json({ error: "Tower not found" });
  if (!canAccessApartment(req.user, tower.apartment_id)) {
    return res.status(403).json({ error: "Forbidden — cross-organization access denied" });
  }
  res.json({ tower });
});

router.post("/", requirePermission("towers", "create"), (req, res) => {
  const { name, code, total_floors, notes, apartment_id } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "Tower name is required" });
  const apId = apartment_id || req.user.apartment_id;
  if (!apId) return res.status(400).json({ error: "apartment_id required" });
  if (!canAccessApartment(req.user, apId)) {
    return res.status(403).json({ error: "Forbidden — cross-organization access denied" });
  }
  try {
    const info = db
      .prepare("INSERT INTO towers (apartment_id, name, code, total_floors, notes) VALUES (?,?,?,?,?)")
      .run(apId, String(name).trim(), code?.trim() || null,
           total_floors === "" || total_floors == null ? null : Number(total_floors),
           notes?.trim() || null);
    res.status(201).json({ tower: db.prepare(`${SELECT_WITH_COUNTS} WHERE t.id = ?`).get(info.lastInsertRowid) });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "A tower with this name already exists" });
    }
    throw e;
  }
});

router.patch("/:id", requirePermission("towers", "edit"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM towers WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "Tower not found" });
  if (!canAccessApartment(req.user, existing.apartment_id)) {
    return res.status(403).json({ error: "Forbidden — cross-organization access denied" });
  }
  const { name, code, total_floors, notes } = req.body || {};
  if (name !== undefined && !String(name).trim()) {
    return res.status(400).json({ error: "Tower name cannot be empty" });
  }
  try {
    db.prepare(
      `UPDATE towers SET
         name = COALESCE(?, name),
         code = CASE WHEN ? IS NOT NULL THEN ? ELSE code END,
         total_floors = CASE WHEN ? IS NOT NULL THEN ? ELSE total_floors END,
         notes = CASE WHEN ? IS NOT NULL THEN ? ELSE notes END
       WHERE id = ?`
    ).run(
      name === undefined ? null : String(name).trim(),
      code === undefined ? null : 1, code === undefined ? null : (code?.trim() || null),
      total_floors === undefined ? null : 1,
      total_floors === undefined ? null : (total_floors === "" || total_floors == null ? null : Number(total_floors)),
      notes === undefined ? null : 1, notes === undefined ? null : (notes?.trim() || null),
      id
    );
    res.json({ tower: db.prepare(`${SELECT_WITH_COUNTS} WHERE t.id = ?`).get(id) });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "A tower with this name already exists" });
    }
    throw e;
  }
});

router.delete("/:id", requirePermission("towers", "delete"), (req, res) => {
  const id = Number(req.params.id);
  const tower = db.prepare("SELECT * FROM towers WHERE id = ?").get(id);
  if (!tower) return res.status(404).json({ error: "Tower not found" });
  if (!canAccessApartment(req.user, tower.apartment_id)) {
    return res.status(403).json({ error: "Forbidden — cross-organization access denied" });
  }
  // Flats are not deleted — their tower_id is set NULL by the FK. Report how many
  // flats were detached so the UI can warn the user.
  const flatCount = db.prepare("SELECT COUNT(*) AS n FROM flats WHERE tower_id = ?").get(id).n;
  db.prepare("DELETE FROM towers WHERE id = ?").run(id);
  res.json({ ok: true, deleted: tower, detached_flats: flatCount });
});

module.exports = router;
