const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { channelStatus } = require("../notifications");

// Personal notification feed (BRD Module 12). Every row belongs to one user;
// these endpoints are always scoped to req.user.id — no cross-user reads.
const router = express.Router();
router.use(requireAuth);

router.get("/", (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const onlyUnread = req.query.unread === "1" || req.query.unread === "true";
  const rows = db.prepare(
    `SELECT id, type, title, body, link, read, created_at
     FROM notifications
     WHERE user_id = ? ${onlyUnread ? "AND read = 0" : ""}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`
  ).all(req.user.id, limit);
  const unread = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0").get(req.user.id).n;
  res.json({ notifications: rows, unread_count: unread });
});

router.get("/unread-count", (req, res) => {
  const unread = db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0").get(req.user.id).n;
  res.json({ unread_count: unread });
});

router.post("/:id/read", (req, res) => {
  const info = db.prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?")
    .run(Number(req.params.id), req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: "Not found" });
  res.json({ ok: true });
});

router.post("/read-all", (req, res) => {
  const info = db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0").run(req.user.id);
  res.json({ ok: true, marked: info.changes });
});

// Channel diagnostics — which delivery channels are configured on this instance.
router.get("/channels", (req, res) => {
  res.json({ channels: channelStatus() });
});

module.exports = router;
