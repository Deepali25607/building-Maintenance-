const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, can } = require("../permissions");

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = [
  "Water Leakage",
  "Electrical Issue",
  "Security Issue",
  "Lift Issue",
  "Parking Issue",
  "Cleaning Issue",
  "Other",
];

router.get("/categories", (_req, res) => res.json({ categories: CATEGORIES }));

function parseAttachments(raw) {
  if (!raw) return [];
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch { return []; }
}

function decorate(rows) {
  return rows.map((r) => ({ ...r, attachments: parseAttachments(r.attachments) }));
}

router.get("/", requirePermission("incidents", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  const where = ["i.apartment_id = ?"];
  const params = [apId];
  if (req.query.status) { where.push("i.status = ?"); params.push(req.query.status); }
  if (req.query.priority) { where.push("i.priority = ?"); params.push(req.query.priority); }
  if (req.user.role === "resident") { where.push("i.raised_by = ?"); params.push(req.user.id); }
  if (req.user.role === "maintenance") { where.push("i.assigned_to = ?"); params.push(req.user.id); }
  const incidents = db
    .prepare(
      `SELECT i.*, f.flat_number, f.block,
              ru.name AS raised_by_name,
              au.name AS assigned_to_name
       FROM incidents i
       LEFT JOIN flats f ON f.id = i.flat_id
       LEFT JOIN users ru ON ru.id = i.raised_by
       LEFT JOIN users au ON au.id = i.assigned_to
       WHERE ${where.join(" AND ")}
       ORDER BY
         CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         i.created_at DESC`
    )
    .all(...params);
  res.json({ incidents: decorate(incidents) });
});

router.post("/", requirePermission("incidents", "create"), (req, res) => {
  const { category, title, description, priority = "medium", flat_id, sla_hours = 48, attachments } = req.body || {};
  if (!category || !title) return res.status(400).json({ error: "category and title required" });
  let resolvedFlatId = flat_id;
  if (!resolvedFlatId && req.user.role === "resident") {
    const f = db.prepare("SELECT id FROM flats WHERE owner_id = ?").get(req.user.id);
    resolvedFlatId = f?.id || null;
  }
  const cleanAttachments = Array.isArray(attachments)
    ? attachments.filter((x) => typeof x === "string").slice(0, 10)
    : null;
  const info = db
    .prepare(
      `INSERT INTO incidents (apartment_id, flat_id, raised_by, category, title, description, priority, sla_hours, attachments)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(
      req.user.apartment_id, resolvedFlatId || null, req.user.id,
      category, title, description || null, priority, sla_hours,
      cleanAttachments ? JSON.stringify(cleanAttachments) : null
    );
  const created = db.prepare("SELECT * FROM incidents WHERE id = ?").get(info.lastInsertRowid);
  res.status(201).json({ incident: { ...created, attachments: parseAttachments(created.attachments) } });
});

router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const incident = db.prepare("SELECT * FROM incidents WHERE id = ?").get(id);
  if (!incident) return res.status(404).json({ error: "Not found" });
  if (incident.apartment_id !== req.user.apartment_id && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Forbidden" });
  }
  const { status, assigned_to, priority, description, attachments } = req.body || {};

  if (!can(req.user, "incidents", "edit")) {
    return res.status(403).json({ error: "Forbidden — missing permission: incidents.edit" });
  }

  let resolved_at = incident.resolved_at;
  let closed_at = incident.closed_at;
  if (status === "resolved" && !resolved_at) resolved_at = new Date().toISOString();
  if (status === "closed" && !closed_at) closed_at = new Date().toISOString();

  let finalStatus = status ?? incident.status;
  if (assigned_to && incident.status === "open") finalStatus = "assigned";

  const attachmentsJson = attachments === undefined
    ? undefined
    : Array.isArray(attachments)
      ? JSON.stringify(attachments.filter((x) => typeof x === "string").slice(0, 10))
      : null;

  db.prepare(
    `UPDATE incidents SET
       status = ?,
       assigned_to = COALESCE(?, assigned_to),
       priority = COALESCE(?, priority),
       description = COALESCE(?, description),
       resolved_at = ?,
       closed_at = ?,
       attachments = CASE WHEN ? IS NOT NULL THEN ? ELSE attachments END
     WHERE id = ?`
  ).run(
    finalStatus, assigned_to ?? null, priority ?? null, description ?? null, resolved_at, closed_at,
    attachmentsJson === undefined ? null : 1, attachmentsJson === undefined ? null : attachmentsJson,
    id
  );
  const updated = db.prepare("SELECT * FROM incidents WHERE id = ?").get(id);
  res.json({ incident: { ...updated, attachments: parseAttachments(updated.attachments) } });
});

router.get("/:id/comments", (req, res) => {
  const id = Number(req.params.id);
  const comments = db
    .prepare(
      `SELECT c.*, u.name AS author_name, u.role AS author_role
       FROM incident_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.incident_id = ?
       ORDER BY c.created_at ASC`
    )
    .all(id);
  res.json({ comments });
});

router.post("/:id/comments", (req, res) => {
  const id = Number(req.params.id);
  const { body } = req.body || {};
  if (!body) return res.status(400).json({ error: "body required" });
  const info = db
    .prepare("INSERT INTO incident_comments (incident_id, user_id, body) VALUES (?,?,?)")
    .run(id, req.user.id, body);
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = router;
