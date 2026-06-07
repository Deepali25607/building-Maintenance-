const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission } = require("../permissions");

// Accounting & Finance (BRD Module 8). Read-only financial reporting derived
// from existing data: income = recorded payments (real cash in, dated by
// paid_at); expense = approved/paid expenses (dated by expense_date). Gated by
// the same "reports" permission as the Reports page (treasurer/committee/admin).
const router = express.Router();
router.use(requireAuth);
router.use(requirePermission("reports", "view"));

const PAID_EXPENSE = "('approved','paid')";

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
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(toCsv(rows));
}

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ── Overview: P&L, cash flow, KPIs ────────────────────────────────────────
router.get("/overview", (req, res) => {
  const apId = req.user.apartment_id;
  // P&L window: defaults to all-time when not supplied.
  const from = req.query.from || "0000-01-01";
  const to = req.query.to || "9999-12-31";

  // Lifetime totals.
  const totalIncome = db.prepare(
    `SELECT COALESCE(SUM(p.amount),0) AS v
     FROM payments p JOIN bills b ON b.id = p.bill_id JOIN flats f ON f.id = b.flat_id
     WHERE f.apartment_id = ?`
  ).get(apId).v;
  const totalExpense = db.prepare(
    `SELECT COALESCE(SUM(amount),0) AS v FROM expenses
     WHERE apartment_id = ? AND status IN ${PAID_EXPENSE}`
  ).get(apId).v;

  // Monthly inflow/outflow across all history → merge → running balance.
  const incomeByMonth = db.prepare(
    `SELECT strftime('%Y-%m', p.paid_at) AS month, COALESCE(SUM(p.amount),0) AS inflow
     FROM payments p JOIN bills b ON b.id = p.bill_id JOIN flats f ON f.id = b.flat_id
     WHERE f.apartment_id = ? GROUP BY month`
  ).all(apId);
  const expenseByMonth = db.prepare(
    `SELECT strftime('%Y-%m', expense_date) AS month, COALESCE(SUM(amount),0) AS outflow
     FROM expenses WHERE apartment_id = ? AND status IN ${PAID_EXPENSE} GROUP BY month`
  ).all(apId);

  const monthMap = new Map();
  for (const r of incomeByMonth) if (r.month) monthMap.set(r.month, { month: r.month, inflow: r.inflow, outflow: 0 });
  for (const r of expenseByMonth) {
    if (!r.month) continue;
    const cur = monthMap.get(r.month) || { month: r.month, inflow: 0, outflow: 0 };
    cur.outflow = r.outflow;
    monthMap.set(r.month, cur);
  }
  const allMonths = Array.from(monthMap.values()).sort((a, b) => a.month.localeCompare(b.month));
  let running = 0;
  const withRunning = allMonths.map((m) => {
    const net = round2(m.inflow - m.outflow);
    running = round2(running + net);
    return { month: m.month, inflow: round2(m.inflow), outflow: round2(m.outflow), net, running };
  });
  const cashflow = withRunning.slice(-12); // last 12 months

  // KPI helper for a specific YYYY-MM.
  const monthFigure = (ym) => {
    const row = withRunning.find((m) => m.month === ym);
    return row ? { income: row.inflow, expense: row.outflow, net: row.net } : { income: 0, expense: 0, net: 0 };
  };
  const now = new Date();
  const thisYm = now.toISOString().slice(0, 7);
  const lastDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastYm = lastDate.toISOString().slice(0, 7);

  // P&L for the requested window.
  const pnlIncome = db.prepare(
    `SELECT COALESCE(SUM(p.amount),0) AS v
     FROM payments p JOIN bills b ON b.id = p.bill_id JOIN flats f ON f.id = b.flat_id
     WHERE f.apartment_id = ? AND date(p.paid_at) BETWEEN ? AND ?`
  ).get(apId, from, to).v;
  const expenseByCategory = db.prepare(
    `SELECT category, COALESCE(SUM(amount),0) AS total FROM expenses
     WHERE apartment_id = ? AND status IN ${PAID_EXPENSE} AND date(expense_date) BETWEEN ? AND ?
     GROUP BY category ORDER BY total DESC`
  ).all(apId, from, to);
  const incomeByMethod = db.prepare(
    `SELECT COALESCE(p.method,'other') AS method, COALESCE(SUM(p.amount),0) AS total
     FROM payments p JOIN bills b ON b.id = p.bill_id JOIN flats f ON f.id = b.flat_id
     WHERE f.apartment_id = ? AND date(p.paid_at) BETWEEN ? AND ?
     GROUP BY p.method ORDER BY total DESC`
  ).all(apId, from, to);
  const pnlExpense = expenseByCategory.reduce((s, r) => s + r.total, 0);

  // Outstanding receivables (billed + opening balance not yet collected) — an
  // accrual-side figure to complement the cash view.
  const receivables = db.prepare(
    `SELECT COALESCE(SUM(b.amount + b.penalty - b.paid_amount),0) AS v
     FROM bills b JOIN flats f ON f.id = b.flat_id WHERE f.apartment_id = ?`
  ).get(apId).v;
  const openingBalances = db.prepare(
    `SELECT COALESCE(SUM(opening_balance),0) AS v FROM flats WHERE apartment_id = ?`
  ).get(apId).v;

  res.json({
    totals: { income: round2(totalIncome), expense: round2(totalExpense), net: round2(totalIncome - totalExpense) },
    receivables: round2(receivables + openingBalances),
    this_month: monthFigure(thisYm),
    last_month: monthFigure(lastYm),
    pnl: {
      from, to,
      income: round2(pnlIncome),
      expense: round2(pnlExpense),
      surplus: round2(pnlIncome - pnlExpense),
      expense_by_category: expenseByCategory.map((r) => ({ category: r.category, total: round2(r.total) })),
      income_by_method: incomeByMethod.map((r) => ({ method: r.method, total: round2(r.total) })),
    },
    cashflow,
  });
});

// ── Ledger: unified chronological transactions with running balance ───────
router.get("/ledger", (req, res) => {
  const apId = req.user.apartment_id;
  const from = req.query.from || "0000-01-01";
  const to = req.query.to || "9999-12-31";
  const typeFilter = req.query.type; // 'income' | 'expense' | undefined

  const income = db.prepare(
    `SELECT p.id AS ref_id, date(p.paid_at) AS date, p.amount AS amount, COALESCE(p.method,'online') AS method,
            'Maintenance · ' || COALESCE(f.block || '-', '') || f.flat_number AS description,
            u.name AS party
     FROM payments p JOIN bills b ON b.id = p.bill_id JOIN flats f ON f.id = b.flat_id
     LEFT JOIN users u ON u.id = f.owner_id
     WHERE f.apartment_id = ? AND date(p.paid_at) BETWEEN ? AND ?`
  ).all(apId, from, to).map((r) => ({ ...r, type: "income" }));

  const expense = db.prepare(
    `SELECT e.id AS ref_id, date(e.expense_date) AS date, e.amount AS amount, e.status AS method,
            e.category || COALESCE(' · ' || e.description, '') AS description,
            v.name AS party
     FROM expenses e LEFT JOIN vendors v ON v.id = e.vendor_id
     WHERE e.apartment_id = ? AND e.status IN ${PAID_EXPENSE} AND date(e.expense_date) BETWEEN ? AND ?`
  ).all(apId, from, to).map((r) => ({ ...r, type: "expense" }));

  let txns = [...income, ...expense];

  // Opening balance = net of everything strictly before the window start, so the
  // running balance is continuous even when a date range is applied.
  let opening = 0;
  if (req.query.from) {
    const priorIncome = db.prepare(
      `SELECT COALESCE(SUM(p.amount),0) AS v FROM payments p JOIN bills b ON b.id=p.bill_id JOIN flats f ON f.id=b.flat_id
       WHERE f.apartment_id = ? AND date(p.paid_at) < ?`
    ).get(apId, from).v;
    const priorExpense = db.prepare(
      `SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE apartment_id = ? AND status IN ${PAID_EXPENSE} AND date(expense_date) < ?`
    ).get(apId, from).v;
    opening = round2(priorIncome - priorExpense);
  }

  // Accumulate running balance oldest → newest (stable tiebreak by type then id).
  txns.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type) || a.ref_id - b.ref_id);
  let bal = opening;
  for (const t of txns) {
    const signed = t.type === "income" ? t.amount : -t.amount;
    bal = round2(bal + signed);
    t.signed_amount = round2(signed);
    t.balance = bal;
  }

  let view = typeFilter === "income" || typeFilter === "expense"
    ? txns.filter((t) => t.type === typeFilter)
    : txns;
  // Newest first for display/export.
  view = view.slice().reverse();

  if (req.query.format === "csv") {
    const rows = view.map((t) => ({
      date: t.date, type: t.type, description: t.description, party: t.party || "",
      method: t.method, amount: t.signed_amount, running_balance: t.balance,
    }));
    return sendCsv(res, "ledger.csv", rows);
  }
  res.json({ opening_balance: opening, closing_balance: bal, count: view.length, transactions: view });
});

module.exports = router;
