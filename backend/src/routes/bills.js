const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");
const { requirePermission, canAccessApartment, isPlatformAdmin } = require("../permissions");
const { notify } = require("../notifications");

const router = express.Router();
router.use(requireAuth);

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

function recomputeStatus(bill) {
  const today = new Date().toISOString().slice(0, 10);
  const totalDue = bill.amount + bill.penalty;
  if (bill.paid_amount >= totalDue) return "paid";
  if (bill.paid_amount > 0) return "partial";
  if (bill.due_date < today) return "overdue";
  return "pending";
}

router.get("/", requirePermission("bills", "view"), (req, res) => {
  const apId = req.user.apartment_id;
  const { period, flat_id, status } = req.query;
  const where = ["f.apartment_id = ?"];
  const params = [apId];
  if (period) { where.push("b.period = ?"); params.push(period); }
  if (flat_id) { where.push("b.flat_id = ?"); params.push(Number(flat_id)); }
  if (status) { where.push("b.status = ?"); params.push(status); }
  if (req.user.role === "resident") {
    where.push("f.owner_id = ?");
    params.push(req.user.id);
  }
  const bills = db
    .prepare(
      `SELECT b.*, f.flat_number, f.block, u.name AS owner_name
       FROM bills b
       JOIN flats f ON f.id = b.flat_id
       LEFT JOIN users u ON u.id = f.owner_id
       WHERE ${where.join(" AND ")}
       ORDER BY b.period DESC, f.block, f.flat_number`
    )
    .all(...params);
  res.json({ bills });
});

router.post("/generate", requirePermission("bills", "create"), (req, res) => {
  const { period, due_date, penalty_after_days = 7, penalty_amount = 100 } = req.body || {};
  if (!period || !due_date) return res.status(400).json({ error: "period (YYYY-MM) and due_date required" });
  const apId = req.user.apartment_id;
  const flats = db.prepare("SELECT * FROM flats WHERE apartment_id = ?").all(apId);
  const today = new Date().toISOString().slice(0, 10);
  const overdueDate = new Date(due_date);
  overdueDate.setDate(overdueDate.getDate() + penalty_after_days);
  const isOverdue = today > overdueDate.toISOString().slice(0, 10);

  const insert = db.prepare(
    `INSERT OR IGNORE INTO bills (flat_id, period, amount, penalty, due_date, status)
     VALUES (?,?,?,?,?,?)`
  );
  let created = 0;
  const notifyOwnerIds = [];
  const tx = db.transaction(() => {
    for (const f of flats) {
      const status = isOverdue ? "overdue" : "pending";
      const penalty = isOverdue ? penalty_amount : 0;
      const info = insert.run(f.id, period, f.monthly_rate, penalty, due_date, status);
      if (info.changes > 0) { created += 1; if (f.owner_id) notifyOwnerIds.push(f.owner_id); }
    }
  });
  tx();
  // Notify only owners who got a freshly-generated bill (INSERT OR IGNORE skips re-runs).
  notify({
    apartmentId: apId, userIds: notifyOwnerIds, type: "bill_generated",
    title: "New maintenance bill",
    body: `Your maintenance bill for ${period} is ready. Due ${due_date}.`,
    link: "/bills",
  });
  res.json({ created, total_flats: flats.length, period });
});

router.post("/:id/pay", (req, res) => {
  const id = Number(req.params.id);
  const { amount, method = "online", reference } = req.body || {};
  if (!amount || amount <= 0) return res.status(400).json({ error: "amount required" });
  const bill = db
    .prepare("SELECT b.*, f.apartment_id, f.owner_id FROM bills b JOIN flats f ON f.id = b.flat_id WHERE b.id = ?")
    .get(id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (req.user.role === "resident" && bill.owner_id !== req.user.id) {
    return res.status(403).json({ error: "Not your bill" });
  }
  if (!canAccessApartment(req.user, bill.apartment_id)) {
    return res.status(403).json({ error: "Cross-organization access denied" });
  }

  const tx = db.transaction(() => {
    db.prepare(
      "INSERT INTO payments (bill_id, amount, method, reference, recorded_by) VALUES (?,?,?,?,?)"
    ).run(id, amount, method, reference || null, req.user.id);
    const newPaid = bill.paid_amount + amount;
    const updated = { ...bill, paid_amount: newPaid };
    const status = recomputeStatus(updated);
    db.prepare("UPDATE bills SET paid_amount = ?, status = ? WHERE id = ?").run(newPaid, status, id);
  });
  tx();
  // Receipt notification to the flat owner (in-app + any external channels).
  if (bill.owner_id) {
    notify({
      apartmentId: bill.apartment_id, userIds: [bill.owner_id], type: "payment_received",
      title: "Payment received",
      body: `${inr(amount)} recorded for ${bill.period}${reference ? ` (ref ${reference})` : ""}.`,
      link: "/bills",
    });
  }
  const refreshed = db.prepare("SELECT * FROM bills WHERE id = ?").get(id);
  res.json({ bill: refreshed });
});

router.get("/:id/payments", (req, res) => {
  const id = Number(req.params.id);
  // Resolve the bill's apartment via its flat before exposing payments.
  const bill = db.prepare(
    "SELECT f.apartment_id, f.owner_id FROM bills b JOIN flats f ON f.id = b.flat_id WHERE b.id = ?"
  ).get(id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  if (!canAccessApartment(req.user, bill.apartment_id)) {
    return res.status(403).json({ error: "Cross-organization access denied" });
  }
  // Residents can only see payment history of their own bills.
  if (req.user.role === "resident" && bill.owner_id !== req.user.id) {
    return res.status(403).json({ error: "Not your bill" });
  }
  const payments = db
    .prepare("SELECT p.*, u.name AS recorded_by_name FROM payments p LEFT JOIN users u ON u.id = p.recorded_by WHERE p.bill_id = ? ORDER BY p.paid_at DESC")
    .all(id);
  res.json({ payments });
});

module.exports = router;
