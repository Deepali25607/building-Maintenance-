import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { defaulterLevel, BADGE_STYLES, LEVEL_LABEL } from "../utils/defaulter.js";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const PIE_COLORS = ["#3b6cf6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#64748b"];

export default function Dashboard() {
  const { user } = useAuth();
  const isResident = user?.role === "resident";
  return (
    <>
      {isResident && <PersonalSnapshot />}
      <AdminDashboard headingForResident={isResident} />
    </>
  );
}

function AnnouncementMarquee({ items }) {
  if (!items?.length) return null;
  // duplicate the list so the loop translateX(-50%) ends seamlessly at the original start
  const doubled = [...items, ...items];
  return (
    <div className="card mb-6 overflow-hidden border-brand-200 bg-gradient-to-r from-brand-50 to-white">
      <div className="flex items-stretch group">
        <div className="bg-brand-600 text-white px-3 py-2 text-xs font-bold uppercase tracking-wide flex items-center gap-1 shrink-0">
          📣 Live
        </div>
        <div className="flex-1 overflow-hidden relative">
          <div className="flex gap-8 animate-marquee whitespace-nowrap py-2 group-hover:[animation-play-state:paused]">
            {doubled.map((a, i) => (
              <MarqueeItem key={`${a.id}-${i}`} a={a} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function MarqueeItem({ a }) {
  const until = a.active_until;
  let suffix = "";
  if (until) {
    const today = new Date().toISOString().slice(0, 10);
    const daysLeft = Math.round((new Date(until) - new Date(today)) / 86400000);
    if (daysLeft === 0) suffix = " · ends today";
    else if (daysLeft === 1) suffix = " · 1 day left";
    else if (daysLeft > 0) suffix = ` · ${daysLeft} days left`;
  }
  return (
    <span className="inline-flex items-center gap-2 text-sm">
      {a.pinned && <span>📌</span>}
      <span className="font-semibold text-brand-700">{a.title}:</span>
      <span className="text-slate-700">{a.body}</span>
      {suffix && <span className="text-xs text-slate-500">{suffix}</span>}
    </span>
  );
}

function Stat({ label, value, hint, tone }) {
  const tones = {
    green: "text-emerald-600",
    red: "text-red-600",
    blue: "text-brand-600",
    slate: "text-slate-700",
  };
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${tones[tone] || ""}`}>{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}

function AdminDashboard({ headingForResident = false }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/dashboard/admin").then((r) => setData(r.data));
  }, []);
  if (!data) return <div className="text-slate-500">Loading…</div>;

  const heading = headingForResident ? "Community Status" : "Dashboard";
  const subtitle = headingForResident
    ? "Live community-wide updates: collections, expenses, defaulters, and open issues."
    : "Financial and operational overview.";

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">{heading}</h1>
      <p className="text-muted mb-6 text-sm">{subtitle}</p>

      <AnnouncementMarquee items={data.active_announcements} />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Stat label="Total Collection" value={fmt(data.collected)} tone="green" />
        <Stat label="Pending Dues" value={fmt(data.pending)} tone="red" />
        <Stat label="Total Expenses" value={fmt(data.expenses)} tone="slate" />
        <Stat label="Remaining Balance" value={fmt(data.balance)} tone={data.balance >= 0 ? "blue" : "red"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="card p-4">
          <h3 className="font-semibold mb-3">Collection vs Billed (last months)</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={[...data.collection_by_month].reverse()}>
                <XAxis dataKey="period" />
                <YAxis />
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend />
                <Bar dataKey="billed" fill="#cbd5e1" />
                <Bar dataKey="collected" fill="#3b6cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card p-4">
          <h3 className="font-semibold mb-3">Expenses by Category</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={data.expenses_by_category} dataKey="total" nameKey="category" outerRadius={80} label>
                  {data.expenses_by_category.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmt(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <Defaulters list={data.defaulters || []} />

      <div className="mt-6">
        <ActiveIncidents list={data.active_incidents || []} />
      </div>
    </div>
  );
}

function timeAgo(iso) {
  if (!iso) return "";
  const s = (Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function ageHours(iso) {
  if (!iso) return 0;
  return (Date.now() - new Date(iso.replace(" ", "T") + "Z").getTime()) / 3600000;
}

function ActiveIncidents({ list }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  if (list.length === 0) {
    return (
      <div>
        <h3 className="font-semibold mb-1 text-lg flex items-center gap-2">🛠 Active Incidents</h3>
        <div className="card p-6 text-center text-sm text-slate-500">
          No active incidents — all resolved and closed.
        </div>
      </div>
    );
  }
  const byStatus = list.reduce((acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; }, {});
  const byPriority = list.reduce((acc, i) => { acc[i.priority] = (acc[i.priority] || 0) + 1; return acc; }, {});

  const filtered = list.filter((i) =>
    (statusFilter === "all" || i.status === statusFilter) &&
    (priorityFilter === "all" || i.priority === priorityFilter)
  );

  const STATUS_TONES = { open: "amber", assigned: "blue", in_progress: "indigo", resolved: "emerald" };
  const PRIORITY_TONES = { urgent: "red", high: "orange", medium: "amber", low: "slate" };

  function toggleStatus(s) { setStatusFilter((cur) => (cur === s ? "all" : s)); }
  function togglePriority(p) { setPriorityFilter((cur) => (cur === p ? "all" : p)); }
  function clearAll() { setStatusFilter("all"); setPriorityFilter("all"); }

  const hasFilter = statusFilter !== "all" || priorityFilter !== "all";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2 text-lg">🛠 Active Incidents</h3>
          <p className="text-xs text-slate-500">
            {list.length} {list.length === 1 ? "incident" : "incidents"} still open — visible here until officially closed.
          </p>
        </div>
        <Link to="/incidents" className="text-xs text-brand-700 hover:underline">Manage incidents →</Link>
      </div>

      <div className="space-y-2 mb-3">
        <div className="flex gap-2 flex-wrap items-center text-xs">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mr-1">Status:</span>
          <FilterPill active={statusFilter === "all"} count={list.length} label="All" tone="slate" onClick={() => setStatusFilter("all")} />
          {["open", "assigned", "in_progress", "resolved"].map((s) => byStatus[s] ? (
            <FilterPill key={s} active={statusFilter === s} count={byStatus[s]}
              label={s.replace("_", " ")} tone={STATUS_TONES[s]} onClick={() => toggleStatus(s)} />
          ) : null)}
        </div>
        <div className="flex gap-2 flex-wrap items-center text-xs">
          <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold mr-1">Priority:</span>
          <FilterPill active={priorityFilter === "all"} count={list.length} label="All" tone="slate" onClick={() => setPriorityFilter("all")} />
          {["urgent", "high", "medium", "low"].map((p) => byPriority[p] ? (
            <FilterPill key={p} active={priorityFilter === p} count={byPriority[p]}
              label={p} tone={PRIORITY_TONES[p]} onClick={() => togglePriority(p)} />
          ) : null)}
          {hasFilter && (
            <button onClick={clearAll}
              className="text-xs text-slate-500 hover:text-slate-700 underline ml-1">clear filters</button>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-6 text-center text-sm text-slate-500">No incidents match the selected filters.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((i) => <IncidentTile key={i.id} i={i} />)}
        </div>
      )}
    </div>
  );
}

function IncidentTile({ i }) {
  const slaHours = i.sla_hours || 48;
  const age = ageHours(i.created_at);
  const overSla = i.status !== "resolved" && age > slaHours;

  const priorityAccent = i.priority === "urgent" ? "bg-red-500"
    : i.priority === "high" ? "bg-orange-500"
    : i.priority === "medium" ? "bg-amber-400"
    : "bg-slate-300";

  const tileBg = i.priority === "urgent" ? "bg-red-50 border-red-200"
    : overSla ? "bg-red-50 border-red-200"
    : "bg-white border-slate-200";

  const categoryIcon = {
    "Water Leakage": "💧",
    "Electrical Issue": "⚡",
    "Security Issue": "🔒",
    "Lift Issue": "🛗",
    "Parking Issue": "🅿️",
    "Cleaning Issue": "🧹",
  }[i.category] || "🛠";

  return (
    <Link to="/incidents"
      className={`relative block rounded-lg border shadow-sm overflow-hidden hover:shadow-md transition ${tileBg}`}>
      <div className={`absolute top-0 left-0 right-0 h-1 ${priorityAccent}`} />
      {overSla && (
        <div className="absolute top-2 right-2 badge bg-red-600 text-white text-[10px] font-bold">
          SLA breached
        </div>
      )}

      <div className="p-4 pt-5">
        <div className="flex items-start gap-2">
          <div className="text-2xl leading-none">{categoryIcon}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-slate-500">#{i.id} · {i.category}</div>
            <div className="font-semibold text-sm leading-tight mt-0.5 line-clamp-2">{i.title}</div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          <StatusBadge value={i.priority} />
          <StatusBadge value={i.status} />
        </div>

        <div className="mt-3 pt-3 border-t border-slate-100 text-xs space-y-1">
          <div className="flex justify-between">
            <span className="text-slate-500">Raised by</span>
            <span className="font-medium truncate ml-2">{i.raised_by_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Assigned</span>
            <span className={`font-medium truncate ml-2 ${i.assigned_to_name ? "" : "italic text-slate-400"}`}>
              {i.assigned_to_name || "unassigned"}
            </span>
          </div>
          {i.block && i.flat_number && (
            <div className="flex justify-between">
              <span className="text-slate-500">Flat</span>
              <span className="font-medium">{i.block}-{i.flat_number}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-slate-500">Age</span>
            <span className={`font-medium ${overSla ? "text-red-600" : ""}`}>{timeAgo(i.created_at)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Defaulters({ list }) {
  const [filter, setFilter] = useState("all");
  const severe = list.filter((d) => defaulterLevel(d.pending_months) === "severe");
  const warning = list.filter((d) => defaulterLevel(d.pending_months) === "warning");
  const mild = list.filter((d) => defaulterLevel(d.pending_months) === "mild");
  const totalDue = list.reduce((s, d) => s + d.amount_due, 0);

  const filtered = filter === "all"
    ? list
    : list.filter((d) => defaulterLevel(d.pending_months) === filter);

  function toggle(level) {
    setFilter((cur) => (cur === level ? "all" : level));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2 text-lg">
            <span className="text-red-600">⚠</span> Defaulters
          </h3>
          <p className="text-xs text-slate-500">
            {list.length === 0
              ? "No outstanding dues — everyone is up to date 🎉"
              : `${list.length} flat${list.length === 1 ? "" : "s"} with pending dues totalling ₹${totalDue.toLocaleString("en-IN")}`}
          </p>
        </div>
        <Link to="/flats" className="text-xs text-brand-700 hover:underline">View all flats →</Link>
      </div>

      {list.length > 0 && (
        <div className="flex gap-2 mb-3 text-xs flex-wrap items-center">
          <FilterPill active={filter === "all"} count={list.length} label="All" tone="slate" onClick={() => setFilter("all")} />
          <FilterPill active={filter === "severe"} count={severe.length} label="Severe (>6 mo)" tone="red" onClick={() => toggle("severe")} />
          <FilterPill active={filter === "warning"} count={warning.length} label="Warning (>3 mo)" tone="orange" onClick={() => toggle("warning")} />
          <FilterPill active={filter === "mild"} count={mild.length} label="1–3 mo" tone="amber" onClick={() => toggle("mild")} />
          {filter !== "all" && (
            <button onClick={() => setFilter("all")}
              className="text-xs text-slate-500 hover:text-slate-700 underline ml-1">clear filter</button>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <div className="card p-6 text-center text-sm text-slate-500">All dues collected — no defaulters.</div>
      ) : filtered.length === 0 ? (
        <div className="card p-6 text-center text-sm text-slate-500">No defaulters match this filter.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.slice(0, 9).map((d) => <DefaulterTile key={d.flat_id} d={d} />)}
          {filtered.length > 9 && (
            <Link to="/flats"
              className="flex items-center justify-center min-h-[120px] card hover:bg-slate-50 text-sm text-brand-700 hover:underline">
              + {filtered.length - 9} more →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function DefaulterTile({ d }) {
  const level = defaulterLevel(d.pending_months);
  const bgClass = level === "severe" ? "bg-red-50 border-red-300"
    : level === "warning" ? "bg-orange-50 border-orange-300"
    : "bg-amber-50 border-amber-300";
  const accentBar = level === "severe" ? "bg-red-500"
    : level === "warning" ? "bg-orange-500"
    : "bg-amber-400";

  return (
    <div className={`relative rounded-lg border shadow-sm overflow-hidden ${bgClass}`}>
      <div className={`absolute top-0 left-0 right-0 h-1 ${accentBar}`} />
      <div className={`absolute top-2 right-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${BADGE_STYLES[level]}`}>
        {LEVEL_LABEL[level]}
      </div>

      <div className="p-4 pt-5">
        <div className="flex items-center gap-3">
          {d.owner_avatar
            ? <img src={d.owner_avatar} className="w-12 h-12 rounded-full border-2 border-white shadow-sm" alt={d.owner_name} />
            : <div className="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center text-xl">🏠</div>}
          <div className="min-w-0">
            <div className="font-bold truncate">
              {d.owner_name || <span className="italic text-slate-500">vacant</span>}
            </div>
            <div className="text-xs text-slate-500">Flat {d.block}-{d.flat_number}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-slate-500 uppercase tracking-wide text-[10px]">Pending</div>
            <div className="font-bold text-lg leading-tight">
              {d.pending_months}<span className="text-xs font-normal text-slate-500"> {d.pending_months === 1 ? "month" : "months"}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-slate-500 uppercase tracking-wide text-[10px]">Amount due</div>
            <div className="font-bold text-lg leading-tight text-red-700">
              ₹{Number(d.amount_due).toLocaleString("en-IN")}
            </div>
          </div>
        </div>

        {d.oldest_period && (
          <div className="mt-3 pt-3 border-t border-white/60 text-[11px] text-slate-500">
            Outstanding since <span className="font-medium">{d.oldest_period}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterPill({ count, label, tone, active, onClick }) {
  const inactive = {
    red: "bg-red-100 text-red-700 border-red-200 hover:bg-red-200",
    orange: "bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200",
    amber: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200",
    slate: "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200",
    blue: "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200",
    indigo: "bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200",
    emerald: "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200",
  };
  const activeCls = {
    red: "bg-red-600 text-white border-red-700",
    orange: "bg-orange-600 text-white border-orange-700",
    amber: "bg-amber-500 text-white border-amber-600",
    slate: "bg-slate-700 text-white border-slate-800",
    blue: "bg-blue-600 text-white border-blue-700",
    indigo: "bg-indigo-600 text-white border-indigo-700",
    emerald: "bg-emerald-600 text-white border-emerald-700",
  };
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded border font-medium transition ${
        active ? activeCls[tone] : inactive[tone]
      } ${active ? "ring-2 ring-offset-1 ring-current" : ""}`}>
      <span className="font-bold">{count}</span> {label}
    </button>
  );
}

function PersonalSnapshot() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/dashboard/resident").catch(() => null).then((r) => setData(r?.data || null));
  }, []);
  if (!data) return null;

  const isResident = user?.role === "resident";
  const title = isResident ? "Welcome home" : `Welcome, ${user?.name?.split(" ")[0] || ""}`;
  const subtitle = data.flat
    ? `Flat ${data.flat.block}-${data.flat.flat_number}`
    : isResident
      ? "No flat assigned yet — contact committee."
      : "Personal snapshot";

  const showMyBills = isResident && data.bills?.length > 0;
  const showMyIncidents = data.incidents?.length > 0;

  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold mb-1">{title}</h1>
      <p className="text-muted mb-4 text-sm">{subtitle}</p>

      <div className={`grid grid-cols-1 ${isResident ? "md:grid-cols-3" : "md:grid-cols-2"} gap-4 mb-4`}>
        {isResident && (
          <Stat label="My Amount Due" value={fmt(data.due)} tone={data.due > 0 ? "red" : "green"} />
        )}
        <Stat label="My Open Incidents" value={data.incidents.length} tone={data.incidents.length > 0 ? "red" : "slate"} />
        <Stat label="Active Announcements" value={data.announcements.length} tone="blue" />
      </div>

      {(showMyBills || showMyIncidents) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {showMyIncidents && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">🛠 My Active Incidents</h3>
                <Link to="/incidents" className="text-xs text-brand-700 hover:underline">View all →</Link>
              </div>
              <div className="space-y-2">
                {data.incidents.slice(0, 5).map((i) => {
                  const border = i.priority === "urgent" ? "border-l-red-500"
                    : i.priority === "high" ? "border-l-orange-500"
                    : i.priority === "medium" ? "border-l-amber-400"
                    : "border-l-slate-300";
                  return (
                    <Link key={i.id} to="/incidents"
                      className={`block border border-line border-l-4 ${border} rounded-md px-3 py-2 hover:bg-surface-2`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm truncate">#{i.id} {i.title}</div>
                        <div className="flex gap-1 shrink-0">
                          <StatusBadge value={i.priority} />
                          <StatusBadge value={i.status} />
                        </div>
                      </div>
                      <div className="text-xs text-muted mt-0.5">
                        {i.category} · raised {timeAgo(i.created_at)}
                        {i.assigned_to_name ? ` · assigned to ${i.assigned_to_name}` : ""}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {showMyBills && (
            <div className="card p-4">
              <h3 className="font-semibold mb-3">My Recent Bills</h3>
              <table className="table">
                <thead><tr><th>Period</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead>
                <tbody>
                  {data.bills.slice(0, 6).map((b) => (
                    <tr key={b.id}>
                      <td>{b.period}</td>
                      <td>{fmt(b.amount + b.penalty)}</td>
                      <td>{fmt(b.paid_amount)}</td>
                      <td><StatusBadge value={b.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
