const express = require("express");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

router.get("/admin", (req, res) => {
  const apId = req.user.apartment_id;
  const collection = db
    .prepare(
      `SELECT
         COALESCE(SUM(b.paid_amount),0) AS collected,
         COALESCE(SUM(b.amount + b.penalty - b.paid_amount),0) AS pending_bills
       FROM bills b JOIN flats f ON f.id = b.flat_id
       WHERE f.apartment_id = ?`
    )
    .get(apId);
  const openingTotal = db
    .prepare(
      `SELECT COALESCE(SUM(opening_balance),0) AS total
       FROM flats WHERE apartment_id = ?`
    )
    .get(apId);
  const pending = collection.pending_bills + (openingTotal.total || 0);
  const expenseTotal = db
    .prepare("SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE apartment_id = ? AND status IN ('approved','paid')")
    .get(apId);
  const incidentCounts = db
    .prepare(
      `SELECT status, COUNT(*) AS n FROM incidents WHERE apartment_id = ? GROUP BY status`
    )
    .all(apId);
  const activeIncidents = db
    .prepare(
      `SELECT i.id, i.title, i.category, i.priority, i.status, i.created_at, i.resolved_at, i.sla_hours,
              i.flat_id, f.block, f.flat_number,
              ru.name AS raised_by_name, ru.avatar_url AS raised_by_avatar,
              au.name AS assigned_to_name, au.avatar_url AS assigned_to_avatar
       FROM incidents i
       LEFT JOIN flats f ON f.id = i.flat_id
       LEFT JOIN users ru ON ru.id = i.raised_by
       LEFT JOIN users au ON au.id = i.assigned_to
       WHERE i.apartment_id = ? AND i.status != 'closed'
       ORDER BY
         CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         CASE i.status WHEN 'open' THEN 0 WHEN 'assigned' THEN 1 WHEN 'in_progress' THEN 2 ELSE 3 END,
         i.created_at ASC`
    )
    .all(apId);
  const expenseByCategory = db
    .prepare(
      `SELECT category, COALESCE(SUM(amount),0) AS total
       FROM expenses WHERE apartment_id = ? AND status IN ('approved','paid')
       GROUP BY category ORDER BY total DESC`
    )
    .all(apId);
  const collectionByMonth = db
    .prepare(
      `SELECT b.period, COALESCE(SUM(b.paid_amount),0) AS collected, COALESCE(SUM(b.amount + b.penalty),0) AS billed
       FROM bills b JOIN flats f ON f.id = b.flat_id
       WHERE f.apartment_id = ?
       GROUP BY b.period ORDER BY b.period DESC LIMIT 12`
    )
    .all(apId);
  const today = new Date().toISOString().slice(0, 10);
  const activeAnnouncements = db
    .prepare(
      `SELECT id, title, body, pinned, active_until, created_at
       FROM announcements
       WHERE apartment_id = ?
         AND completed = 0
         AND (active_until IS NULL OR active_until >= ?)
       ORDER BY pinned DESC, created_at DESC`
    )
    .all(apId, today);

  const defaulters = db
    .prepare(
      `SELECT
         f.id AS flat_id, f.block, f.flat_number, f.monthly_rate, f.opening_balance,
         u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
         u.phone AS owner_phone, u.avatar_url AS owner_avatar,
         COALESCE(SUM(CASE WHEN (b.amount + b.penalty - b.paid_amount) > 0 THEN 1 ELSE 0 END),0) AS pending_months,
         COALESCE(SUM(CASE WHEN (b.amount + b.penalty - b.paid_amount) > 0
                           THEN b.amount + b.penalty - b.paid_amount ELSE 0 END),0)
           + COALESCE(f.opening_balance,0) AS amount_due,
         MIN(CASE WHEN (b.amount + b.penalty - b.paid_amount) > 0 THEN b.period END) AS oldest_period
       FROM flats f
       LEFT JOIN bills b ON b.flat_id = f.id
       LEFT JOIN users u ON u.id = f.owner_id
       WHERE f.apartment_id = ?
       GROUP BY f.id
       HAVING amount_due > 0
       ORDER BY pending_months DESC, amount_due DESC`
    )
    .all(apId);

  res.json({
    collected: collection.collected,
    pending,
    pending_bills: collection.pending_bills,
    opening_balance_total: openingTotal.total || 0,
    expenses: expenseTotal.total,
    balance: (collection.collected || 0) - (expenseTotal.total || 0),
    incidents_by_status: incidentCounts,
    active_incidents: activeIncidents,
    expenses_by_category: expenseByCategory,
    collection_by_month: collectionByMonth,
    defaulters,
    active_announcements: activeAnnouncements,
  });
});

router.get("/resident", (req, res) => {
  const myFlat = db.prepare("SELECT * FROM flats WHERE owner_id = ?").get(req.user.id);
  const myBills = myFlat
    ? db
        .prepare("SELECT * FROM bills WHERE flat_id = ? ORDER BY period DESC LIMIT 12")
        .all(myFlat.id)
    : [];
  const dueAmount = myBills.reduce((sum, b) => sum + Math.max(0, b.amount + b.penalty - b.paid_amount), 0);
  const myIncidents = db
    .prepare(
      `SELECT i.*, au.name AS assigned_to_name
       FROM incidents i
       LEFT JOIN users au ON au.id = i.assigned_to
       WHERE i.raised_by = ? AND i.status != 'closed'
       ORDER BY
         CASE i.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         i.created_at DESC`
    )
    .all(req.user.id);
  const today = new Date().toISOString().slice(0, 10);
  const announcements = db
    .prepare(
      `SELECT * FROM announcements
       WHERE apartment_id = ?
         AND completed = 0
         AND (active_until IS NULL OR active_until >= ?)
       ORDER BY pinned DESC, created_at DESC LIMIT 5`
    )
    .all(req.user.apartment_id, today);
  res.json({ flat: myFlat || null, bills: myBills, due: dueAmount, incidents: myIncidents, announcements });
});

module.exports = router;
