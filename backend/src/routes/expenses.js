const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, canAccessApartment, isPlatformAdmin } = require("../permissions");

const router = express.Router();
router.use(requireAuth);

const CATEGORIES = [
  "Security Guard Salary",
  "Cleaning Staff Salary",
  "DG Maintenance",
  "Lift AMC",
  "Electrical Repairs",
  "Plumbing Repairs",
  "Miscellaneous",
];

router.get("/categories", (_req, res) => res.json({ categories: CATEGORIES }));

router.get("/", requirePermission("expenses", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  const where = ["e.apartment_id = ?"];
  const params = [apId];
  if (req.query.status) { where.push("e.status = ?"); params.push(req.query.status); }
  if (req.query.category) { where.push("e.category = ?"); params.push(req.query.category); }
  if (req.query.from) { where.push("e.expense_date >= ?"); params.push(req.query.from); }
  if (req.query.to) { where.push("e.expense_date <= ?"); params.push(req.query.to); }
  const expenses = db
    .prepare(
      `SELECT e.*, v.name AS vendor_name, sub.name AS submitted_by_name, app.name AS approved_by_name
       FROM expenses e
       LEFT JOIN vendors v ON v.id = e.vendor_id
       LEFT JOIN users sub ON sub.id = e.submitted_by
       LEFT JOIN users app ON app.id = e.approved_by
       WHERE ${where.join(" AND ")}
       ORDER BY e.expense_date DESC, e.id DESC`
    )
    .all(...params);
  res.json({ expenses });
});

router.post("/", requirePermission("expenses", "create"), (req, res) => {
  const { category, vendor_id, amount, expense_date, description, invoice_url, status = "pending_approval" } = req.body || {};
  if (!category || !amount || !expense_date) return res.status(400).json({ error: "category, amount, expense_date required" });
  const info = db
    .prepare(
      `INSERT INTO expenses (apartment_id, category, vendor_id, amount, expense_date, description, invoice_url, status, submitted_by)
       VALUES (?,?,?,?,?,?,?,?,?)`
    )
    .run(req.user.apartment_id, category, vendor_id || null, amount, expense_date, description || null, invoice_url || null, status, req.user.id);
  res.status(201).json({ expense: db.prepare("SELECT * FROM expenses WHERE id = ?").get(info.lastInsertRowid) });
});

router.patch("/:id", requirePermission("expenses", "edit"), (req, res) => {
  const id = Number(req.params.id);
  const e = db.prepare("SELECT * FROM expenses WHERE id = ?").get(id);
  if (!e) return res.status(404).json({ error: "Not found" });
  if (!canAccessApartment(req.user, e.apartment_id)) {
    return res.status(403).json({ error: "Forbidden — cross-organization access denied" });
  }
  const { status, amount, description, vendor_id, category, expense_date } = req.body || {};

  const approverRoles = ["super_admin", "org_admin", "committee"];
  let approved_by = e.approved_by;
  if (status === "approved" && approverRoles.includes(req.user.role)) approved_by = req.user.id;
  if (status === "approved" && !approverRoles.includes(req.user.role)) {
    return res.status(403).json({ error: "Only committee or admin can approve" });
  }

  db.prepare(
    `UPDATE expenses SET
       status = COALESCE(?, status),
       amount = COALESCE(?, amount),
       description = COALESCE(?, description),
       vendor_id = COALESCE(?, vendor_id),
       category = COALESCE(?, category),
       expense_date = COALESCE(?, expense_date),
       approved_by = ?
     WHERE id = ?`
  ).run(status ?? null, amount ?? null, description ?? null, vendor_id ?? null, category ?? null, expense_date ?? null, approved_by, id);
  res.json({ expense: db.prepare("SELECT * FROM expenses WHERE id = ?").get(id) });
});

module.exports = router;
