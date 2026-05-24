# Apartment Community & Maintenance Management System

Full-stack MVP per the BRD: monthly maintenance collection, incident tracking, expense management, role-based dashboards, announcements, and reports.

## Stack

- **Backend** — Node.js + Express, SQLite (`better-sqlite3`), JWT auth, bcrypt
- **Frontend** — React 19 + Vite + Tailwind CSS + react-router + recharts

## Running locally

Open two terminals.

### 1. Backend (port 5000)

```powershell
cd backend
npm run seed     # one-time: creates SQLite DB at backend/data/app.db with demo data
npm run dev      # starts API on http://localhost:5000
```

### 2. Frontend (port 5173)

```powershell
cd frontend
npm run dev      # starts UI on http://localhost:5173, proxies /api to backend
```

Open http://localhost:5173 — click any demo account button on the login screen.

## Demo accounts

| Role           | Email             | Password   |
| -------------- | ----------------- | ---------- |
| Super Admin    | admin@demo.com    | admin123   |
| Committee      | priya@demo.com    | priya123   |
| Treasurer      | rahul@demo.com    | rahul123   |
| Resident       | amit@demo.com     | amit123    |
| Maintenance    | ravi@demo.com     | ravi123    |

## What's implemented

### Backend (`backend/src/`)
- **Auth** — `/api/auth/login`, `/register`, `/me` — JWT + bcrypt
- **RBAC** — `requireAuth` and `requireRole` middleware; role-aware queries
- **User management** — list/create/update users, enable/disable
- **Apartments & Flats** — block, flat number, area, monthly rate, owner assignment
- **Bills** — bulk monthly generation, payment recording, partial/overdue/paid status auto-computed
- **Payments** — full payment trail per bill
- **Incidents** — categories (Water/Electrical/Security/Lift/Parking/Cleaning), priority, status workflow (open → assigned → in_progress → resolved → closed), comments, SLA tracking field
- **Expenses** — categories (Security/Cleaning Salaries, DG, Lift AMC, Repairs, Misc), approval workflow (pending → approved → paid / rejected), vendor link
- **Vendors** — apartment-scoped vendor directory
- **Announcements** — pinned/unpinned community posts
- **Dashboard** — admin view (collection, dues, expenses, balance, incidents-by-status, expenses-by-category, monthly trend); resident view (my dues, my incidents, recent bills, announcements)
- **Reports** — collection, expenses, income vs expense, incident resolution — all exportable as CSV

### Frontend (`frontend/src/`)
- Login screen with one-click demo accounts
- Sidebar layout, role-aware navigation
- Pages: Dashboard (admin charts + resident view), Bills (generate + record payment), Incidents (raise + workflow + comments), Expenses (add + approve/pay), Flats, Users, Announcements, Reports (CSV export)
- Tailwind UI tokens for buttons, inputs, status badges, cards

## Database

SQLite file at `backend/data/app.db`. Tables: `apartments`, `users`, `flats`, `bills`, `payments`, `incidents`, `incident_comments`, `vendors`, `expenses`, `announcements`, `audit_logs`. Schema is migrated automatically on first run; delete the file and re-run `npm run seed` to reset.

## Migrating to PostgreSQL

The BRD lists PostgreSQL/MongoDB as the target database. To swap:
1. Replace `better-sqlite3` with `pg`.
2. Convert `INTEGER PRIMARY KEY AUTOINCREMENT` → `SERIAL PRIMARY KEY`, `datetime('now')` → `now()`.
3. Wrap all sync `db.prepare(...).get/all/run` calls in `await pool.query(...)`.

## Not yet built (intentional MVP cuts)

These are stubbed at the API/data layer where applicable, but not surfaced in the UI:

- File/image uploads on incidents (Multer is installed; route hook can be added on `POST /api/incidents`)
- Real payment gateway integration (the `/pay` endpoint accepts method + reference, which is enough to drop in Razorpay/Stripe webhooks)
- Push/email notifications
- Mobile app (React Native) — backend API is mobile-ready
- PDF/Excel export (CSV is implemented; add `pdfkit` or `exceljs` if needed)
- Audit log writes on every mutation (table exists, currently unused)
