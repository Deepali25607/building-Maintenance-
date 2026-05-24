const bcrypt = require("bcryptjs");
const db = require("./db");

function avatarFor(name, bg = "3b6cf6") {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=${bg}&color=fff&size=256&bold=true`;
}

function backfillDefaultersDemo() {
  const targets = [
    { email: "sneha@demo.com", monthsBack: 8 },
    { email: "karan@demo.com", monthsBack: 6 },
  ];
  const findFlat = db.prepare("SELECT f.* FROM flats f JOIN users u ON u.id = f.owner_id WHERE u.email = ?");
  const billExists = db.prepare("SELECT 1 FROM bills WHERE flat_id = ? AND period = ?");
  const insertBill = db.prepare(
    "INSERT INTO bills (flat_id, period, amount, penalty, due_date, status, paid_amount) VALUES (?,?,?,?,?,?,?)"
  );
  const today = new Date();
  for (const t of targets) {
    const flat = findFlat.get(t.email);
    if (!flat) continue;
    for (let i = 3; i < 3 + t.monthsBack; i++) {
      const m = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const period = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`;
      if (billExists.get(flat.id, period)) continue;
      const due = `${period}-10`;
      insertBill.run(flat.id, period, flat.monthly_rate, 100, due, "overdue", 0);
    }
  }
}

function backfillPayments() {
  const billsNeedingPayments = db
    .prepare(
      `SELECT b.id, b.paid_amount, b.period, f.owner_id
       FROM bills b JOIN flats f ON f.id = b.flat_id
       WHERE b.paid_amount > 0
         AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.bill_id = b.id)`
    )
    .all();
  if (!billsNeedingPayments.length) return;
  const insert = db.prepare(
    "INSERT INTO payments (bill_id, amount, method, reference, paid_at, recorded_by) VALUES (?,?,?,?,?,?)"
  );
  const methods = ["upi", "online", "bank_transfer"];
  for (const b of billsNeedingPayments) {
    const method = methods[b.id % methods.length];
    const paidAt = `${b.period}-08T10:30:00`;
    insert.run(b.id, b.paid_amount, method, `TXN${100000 + b.id}`, paidAt, b.owner_id || null);
  }
}

function backfillProfiles() {
  const profiles = [
    {
      email: "amit@demo.com", avatar: avatarFor("Amit Patel", "f59e0b"),
      bio: "Software engineer, lives with family. Loves cricket and weekend hikes.",
      move_in: "2022-03-12", phone: "9876512340",
      occupation: "Software Engineer at TechCorp",
      family: [
        { name: "Neha Patel", relation: "Spouse", age: 32 },
        { name: "Aarav Patel", relation: "Son", age: 6 },
      ],
      emergency: "Father — Vikram Patel — 9988776655",
      vehicle: "MH12 AB 1234 (Honda City, white)",
    },
    {
      email: "sneha@demo.com", avatar: avatarFor("Sneha Iyer", "ef4444"),
      bio: "Doctor at City Hospital. Has a friendly Labrador named Bruno.",
      move_in: "2023-08-04", phone: "9988123456",
      occupation: "Senior Physician, City Hospital",
      family: [
        { name: "Arjun Iyer", relation: "Spouse", age: 38 },
        { name: "Diya Iyer", relation: "Daughter", age: 10 },
      ],
      emergency: "Sister — Meera Iyer — 9123456789",
      vehicle: "MH12 CD 5678 (Hyundai Creta, grey)",
    },
    {
      email: "karan@demo.com", avatar: avatarFor("Karan Mehta", "10b981"),
      bio: "Chartered accountant. Long-time resident, helps with audit reviews.",
      move_in: "2019-11-20", phone: "9090909090",
      occupation: "Chartered Accountant, self-employed",
      family: [{ name: "Pooja Mehta", relation: "Spouse", age: 45 }],
      emergency: "Brother — Nikhil Mehta — 9876543210",
      vehicle: "MH12 EF 9090 (Maruti Swift, red)",
    },
    { email: "priya@demo.com", avatar: avatarFor("Priya S", "8b5cf6"), bio: "Committee secretary. Coordinates community events.", move_in: "2018-04-01" },
    { email: "rahul@demo.com", avatar: avatarFor("Rahul K", "06b6d4"), bio: "Treasurer. Manages collections and vendor payments.",   move_in: "2020-01-15" },
    { email: "ravi@demo.com",  avatar: avatarFor("Ravi P", "0ea5e9"),  bio: "On-site plumber. Available 8am–8pm.",                   move_in: null },
    { email: "sunil@demo.com", avatar: avatarFor("Sunil V", "f97316"), bio: "Electrician, handles common-area maintenance.",         move_in: null },
    { email: "admin@demo.com", avatar: avatarFor("Admin", "1f44b4"),   bio: "System administrator.",                                 move_in: null },
  ];
  const update = db.prepare(
    `UPDATE users SET
       avatar_url = COALESCE(avatar_url, ?),
       bio = COALESCE(bio, ?),
       move_in_date = COALESCE(move_in_date, ?),
       phone = COALESCE(phone, ?),
       occupation = COALESCE(occupation, ?),
       family_members = COALESCE(family_members, ?),
       emergency_contact = COALESCE(emergency_contact, ?),
       vehicle_info = COALESCE(vehicle_info, ?)
     WHERE email = ?`
  );
  for (const p of profiles) {
    update.run(
      p.avatar, p.bio, p.move_in, p.phone ?? null,
      p.occupation ?? null,
      p.family ? JSON.stringify(p.family) : null,
      p.emergency ?? null, p.vehicle ?? null,
      p.email
    );
  }
}

function seed() {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM users").get();
  if (existing.n > 0) {
    console.log("Database already has users — backfilling profiles and payment records.");
    backfillProfiles();
    backfillDefaultersDemo();
    backfillPayments();
    console.log("Backfill complete.");
    return;
  }

  const tx = db.transaction(() => {
    const ap = db
      .prepare("INSERT INTO apartments (name, address) VALUES (?,?)")
      .run("Greenwood Heights", "12 Park Lane, Pune");
    const apId = ap.lastInsertRowid;

    const hash = (pw) => bcrypt.hashSync(pw, 10);

    const users = [
      { name: "Super Admin", email: "admin@demo.com", role: "super_admin", pw: "admin123" },
      { name: "Priya (Committee)", email: "priya@demo.com", role: "committee", pw: "priya123" },
      { name: "Rahul (Treasurer)", email: "rahul@demo.com", role: "treasurer", pw: "rahul123" },
      { name: "Amit Resident", email: "amit@demo.com", role: "resident", pw: "amit123" },
      { name: "Sneha Resident", email: "sneha@demo.com", role: "resident", pw: "sneha123" },
      { name: "Karan Resident", email: "karan@demo.com", role: "resident", pw: "karan123" },
      { name: "Ravi Plumber", email: "ravi@demo.com", role: "maintenance", pw: "ravi123" },
      { name: "Sunil Electrician", email: "sunil@demo.com", role: "maintenance", pw: "sunil123" },
    ];
    const userIds = {};
    const insertUser = db.prepare(
      "INSERT INTO users (apartment_id, name, email, password_hash, role) VALUES (?,?,?,?,?)"
    );
    for (const u of users) {
      const info = insertUser.run(apId, u.name, u.email, hash(u.pw), u.role);
      userIds[u.email] = info.lastInsertRowid;
    }

    const flatsData = [
      { block: "A", flat_number: "101", floor: 1, area_sqft: 1100, rate: 3500, owner: "amit@demo.com" },
      { block: "A", flat_number: "102", floor: 1, area_sqft: 1100, rate: 3500, owner: "sneha@demo.com" },
      { block: "A", flat_number: "201", floor: 2, area_sqft: 1250, rate: 4000, owner: "karan@demo.com" },
      { block: "B", flat_number: "101", floor: 1, area_sqft: 1100, rate: 3500, owner: null },
      { block: "B", flat_number: "102", floor: 1, area_sqft: 1100, rate: 3500, owner: null },
      { block: "B", flat_number: "201", floor: 2, area_sqft: 1250, rate: 4000, owner: null },
    ];
    const insertFlat = db.prepare(
      "INSERT INTO flats (apartment_id, block, flat_number, floor, area_sqft, monthly_rate, owner_id) VALUES (?,?,?,?,?,?,?)"
    );
    const flatIds = {};
    for (const f of flatsData) {
      const info = insertFlat.run(apId, f.block, f.flat_number, f.floor, f.area_sqft, f.rate, f.owner ? userIds[f.owner] : null);
      flatIds[`${f.block}-${f.flat_number}`] = info.lastInsertRowid;
    }

    const vendors = [
      { name: "Sparkle Cleaning Co", service: "Cleaning" },
      { name: "ElevatorCare AMC", service: "Lift Maintenance" },
      { name: "PowerGen Diesel", service: "DG Maintenance" },
    ];
    const insertVendor = db.prepare("INSERT INTO vendors (apartment_id, name, service) VALUES (?,?,?)");
    const vendorIds = {};
    for (const v of vendors) {
      const info = insertVendor.run(apId, v.name, v.service);
      vendorIds[v.name] = info.lastInsertRowid;
    }

    const today = new Date();
    function ym(d) { return d.toISOString().slice(0, 7); }
    function ymd(d) { return d.toISOString().slice(0, 10); }
    const insertBill = db.prepare(
      "INSERT INTO bills (flat_id, period, amount, penalty, due_date, status, paid_amount) VALUES (?,?,?,?,?,?,?)"
    );
    for (let i = 2; i >= 0; i--) {
      const month = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const dueDate = new Date(month.getFullYear(), month.getMonth(), 10);
      const period = ym(month);
      for (const f of flatsData) {
        const fid = flatIds[`${f.block}-${f.flat_number}`];
        const isOldUnpaid = i > 0 && Math.random() < 0.3;
        const paid = i === 0 ? (Math.random() < 0.6 ? f.rate : 0) : (isOldUnpaid ? 0 : f.rate);
        const penalty = isOldUnpaid ? 100 : 0;
        const status = paid >= f.rate + penalty ? "paid" : (penalty > 0 ? "overdue" : "pending");
        insertBill.run(fid, period, f.rate, penalty, ymd(dueDate), status, paid);
      }
    }

    const expenses = [
      { category: "Cleaning Staff Salary", vendor: "Sparkle Cleaning Co", amount: 18000, days_ago: 5, status: "paid" },
      { category: "Security Guard Salary", vendor: null, amount: 24000, days_ago: 5, status: "paid" },
      { category: "Lift AMC", vendor: "ElevatorCare AMC", amount: 8500, days_ago: 15, status: "approved" },
      { category: "DG Maintenance", vendor: "PowerGen Diesel", amount: 5200, days_ago: 22, status: "pending_approval" },
      { category: "Plumbing Repairs", vendor: null, amount: 1200, days_ago: 3, status: "approved" },
    ];
    const insertExpense = db.prepare(
      `INSERT INTO expenses (apartment_id, category, vendor_id, amount, expense_date, description, status, submitted_by, approved_by)
       VALUES (?,?,?,?,?,?,?,?,?)`
    );
    for (const e of expenses) {
      const d = new Date(today.getTime() - e.days_ago * 86400000);
      insertExpense.run(
        apId, e.category, e.vendor ? vendorIds[e.vendor] : null, e.amount, ymd(d),
        `${e.category} expense`, e.status, userIds["rahul@demo.com"],
        e.status === "approved" || e.status === "paid" ? userIds["priya@demo.com"] : null
      );
    }

    const incidents = [
      { category: "Water Leakage", title: "Kitchen sink leaking", raised_by: "amit@demo.com", priority: "high", status: "in_progress", assigned_to: "ravi@demo.com" },
      { category: "Electrical Issue", title: "Common area light not working", raised_by: "sneha@demo.com", priority: "medium", status: "assigned", assigned_to: "sunil@demo.com" },
      { category: "Lift Issue", title: "Lift makes loud noise", raised_by: "karan@demo.com", priority: "urgent", status: "open" },
      { category: "Cleaning Issue", title: "Stairs not cleaned today", raised_by: "amit@demo.com", priority: "low", status: "resolved", assigned_to: "ravi@demo.com" },
    ];
    const insertIncident = db.prepare(
      `INSERT INTO incidents (apartment_id, flat_id, raised_by, assigned_to, category, title, description, priority, status, resolved_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    );
    for (const i of incidents) {
      const raiser = userIds[i.raised_by];
      const flat = db.prepare("SELECT id FROM flats WHERE owner_id = ?").get(raiser);
      insertIncident.run(
        apId, flat?.id || null, raiser, i.assigned_to ? userIds[i.assigned_to] : null,
        i.category, i.title, `${i.title} — please investigate`, i.priority, i.status,
        i.status === "resolved" ? new Date().toISOString() : null
      );
    }

    backfillProfiles();
    backfillDefaultersDemo();
    backfillPayments();

    const announcements = [
      { title: "Annual General Meeting on Sunday", body: "All residents are requested to attend the AGM at the community hall, 6pm Sunday.", pinned: 1 },
      { title: "Water tank cleaning", body: "Water supply will be off between 10am-2pm on the 15th for tank cleaning.", pinned: 0 },
    ];
    const insertAnn = db.prepare(
      "INSERT INTO announcements (apartment_id, title, body, pinned, author_id) VALUES (?,?,?,?,?)"
    );
    for (const a of announcements) {
      insertAnn.run(apId, a.title, a.body, a.pinned, userIds["priya@demo.com"]);
    }
  });
  tx();
  console.log("Seed complete. Demo logins:");
  console.log("  admin@demo.com / admin123   (super_admin)");
  console.log("  priya@demo.com / priya123   (committee)");
  console.log("  rahul@demo.com / rahul123   (treasurer)");
  console.log("  amit@demo.com  / amit123    (resident)");
  console.log("  ravi@demo.com  / ravi123    (maintenance)");
}

// Only auto-run when invoked as a CLI (e.g. `npm run seed`).
// When required as a module (auto-seed on boot), the caller decides when to run.
if (require.main === module) {
  seed();
}

module.exports = { seed };
