const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../permissions");

const router = express.Router();
router.use(requireAuth);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function decorate(rows) {
  const today = todayIso();
  return rows.map((a) => {
    let status = "active";
    if (a.completed) status = "completed";
    else if (a.active_until && a.active_until < today) status = "expired";
    return { ...a, status };
  });
}

router.get("/", requirePermission("announcements", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  const params = [apId];
  const filters = ["a.apartment_id = ?"];
  if (req.query.status === "active") {
    filters.push("a.completed = 0");
    filters.push("(a.active_until IS NULL OR a.active_until >= ?)");
    params.push(todayIso());
  }
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS author_name
       FROM announcements a LEFT JOIN users u ON u.id = a.author_id
       WHERE ${filters.join(" AND ")}
       ORDER BY a.pinned DESC, a.created_at DESC`
    )
    .all(...params);
  res.json({ announcements: decorate(rows) });
});

router.post("/", requirePermission("announcements", "create"), (req, res) => {
  const { title, body, pinned = 0, active_until = null } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: "title and body required" });
  if (active_until && !/^\d{4}-\d{2}-\d{2}$/.test(active_until)) {
    return res.status(400).json({ error: "active_until must be YYYY-MM-DD" });
  }
  const info = db
    .prepare(
      `INSERT INTO announcements (apartment_id, title, body, pinned, author_id, active_until)
       VALUES (?,?,?,?,?,?)`
    )
    .run(req.user.apartment_id, title, body, pinned ? 1 : 0, req.user.id, active_until || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

router.patch("/:id", requirePermission("announcements", "edit"), (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare("SELECT * FROM announcements WHERE id = ? AND apartment_id = ?")
    .get(id, req.user.apartment_id);
  if (!existing) return res.status(404).json({ error: "Not found" });

  const { title, body, pinned, active_until, completed } = req.body || {};
  if (active_until !== undefined && active_until !== null && !/^\d{4}-\d{2}-\d{2}$/.test(active_until)) {
    return res.status(400).json({ error: "active_until must be YYYY-MM-DD or null" });
  }

  // Mark completed -> stamp time; un-complete -> clear stamp
  let completed_at = existing.completed_at;
  if (completed === 1 && !existing.completed) completed_at = new Date().toISOString();
  if (completed === 0) completed_at = null;

  db.prepare(
    `UPDATE announcements SET
       title = COALESCE(?, title),
       body = COALESCE(?, body),
       pinned = COALESCE(?, pinned),
       active_until = CASE WHEN ? IS NOT NULL THEN ? ELSE active_until END,
       completed = COALESCE(?, completed),
       completed_at = ?
     WHERE id = ?`
  ).run(
    title ?? null,
    body ?? null,
    pinned === undefined ? null : (pinned ? 1 : 0),
    active_until === undefined ? null : 1, active_until === undefined ? null : active_until,
    completed === undefined ? null : (completed ? 1 : 0),
    completed_at,
    id
  );
  const updated = db.prepare(
    `SELECT a.*, u.name AS author_name
     FROM announcements a LEFT JOIN users u ON u.id = a.author_id WHERE a.id = ?`
  ).get(id);
  res.json({ announcement: decorate([updated])[0] });
});

router.delete("/:id", requirePermission("announcements", "edit"), (req, res) => {
  db.prepare("DELETE FROM announcements WHERE id = ? AND apartment_id = ?")
    .run(Number(req.params.id), req.user.apartment_id);
  res.json({ ok: true });
});

module.exports = router;
