const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../permissions");

const router = express.Router();
router.use(requireAuth);
router.use(requirePermission("reports", "view"));

function toCsv(rows) {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

function sendCsv(res, filename, rows) {
  const csv = toCsv(rows);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

router.get("/collection", (req, res) => {
  const apId = req.user.apartment_id;
  const { period } = req.query;
  const rows = db
    .prepare(
      `SELECT b.period, f.block, f.flat_number, u.name AS owner, b.amount, b.penalty, b.paid_amount, b.status, b.due_date
       FROM bills b JOIN flats f ON f.id = b.flat_id LEFT JOIN users u ON u.id = f.owner_id
       WHERE f.apartment_id = ? ${period ? "AND b.period = ?" : ""}
       ORDER BY b.period DESC, f.block, f.flat_number`
    )
    .all(...(period ? [apId, period] : [apId]));
  if (req.query.format === "csv") return sendCsv(res, "collection.csv", rows);
  res.json({ rows });
});

router.get("/expenses", (req, res) => {
  const apId = req.user.apartment_id;
  const rows = db
    .prepare(
      `SELECT e.expense_date, e.category, v.name AS vendor, e.amount, e.status, e.description
       FROM expenses e LEFT JOIN vendors v ON v.id = e.vendor_id
       WHERE e.apartment_id = ?
       ORDER BY e.expense_date DESC`
    )
    .all(apId);
  if (req.query.format === "csv") return sendCsv(res, "expenses.csv", rows);
  res.json({ rows });
});

router.get("/income-vs-expense", (req, res) => {
  const apId = req.user.apartment_id;
  const income = db
    .prepare(
      `SELECT b.period AS month, COALESCE(SUM(b.paid_amount),0) AS income
       FROM bills b JOIN flats f ON f.id = b.flat_id
       WHERE f.apartment_id = ? GROUP BY b.period`
    )
    .all(apId);
  const expense = db
    .prepare(
      `SELECT substr(expense_date,1,7) AS month, COALESCE(SUM(amount),0) AS expense
       FROM expenses WHERE apartment_id = ? AND status IN ('approved','paid')
       GROUP BY month`
    )
    .all(apId);
  const map = new Map();
  for (const r of income) map.set(r.month, { month: r.month, income: r.income, expense: 0 });
  for (const r of expense) {
    const cur = map.get(r.month) || { month: r.month, income: 0, expense: 0 };
    cur.expense = r.expense;
    map.set(r.month, cur);
  }
  const rows = Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  if (req.query.format === "csv") return sendCsv(res, "income-vs-expense.csv", rows);
  res.json({ rows });
});

router.get("/incident-resolution", (req, res) => {
  const apId = req.user.apartment_id;
  const rows = db
    .prepare(
      `SELECT category, status, COUNT(*) AS count,
              AVG(CASE WHEN resolved_at IS NOT NULL
                  THEN (julianday(resolved_at) - julianday(created_at)) * 24
                  END) AS avg_resolution_hours
       FROM incidents WHERE apartment_id = ?
       GROUP BY category, status
       ORDER BY category`
    )
    .all(apId);
  if (req.query.format === "csv") return sendCsv(res, "incidents.csv", rows);
  res.json({ rows });
});

module.exports = router;
