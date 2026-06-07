import { useEffect, useMemo, useState } from "react";
import api from "../api/client.js";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const monthLabel = (ym) => {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleString("en-IN", { month: "short", year: "2-digit" });
};

function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthStart() { return todayStr().slice(0, 7) + "-01"; }
function fyStart() {
  const d = new Date();
  const y = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1; // India FY: Apr–Mar
  return `${y}-04-01`;
}

const PERIODS = [
  { id: "month", label: "This month" },
  { id: "fy", label: "This FY" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

export default function Accounting() {
  const [period, setPeriod] = useState("fy");
  const [custom, setCustom] = useState({ from: monthStart(), to: todayStr() });
  const [overview, setOverview] = useState(null);

  const range = useMemo(() => {
    if (period === "month") return { from: monthStart(), to: todayStr() };
    if (period === "fy") return { from: fyStart(), to: todayStr() };
    if (period === "custom") return { from: custom.from, to: custom.to };
    return {}; // all time
  }, [period, custom]);

  useEffect(() => {
    const qs = range.from ? `?from=${range.from}&to=${range.to}` : "";
    api.get(`/accounting/overview${qs}`).then((r) => setOverview(r.data)).catch(() => setOverview(null));
  }, [range.from, range.to]);

  if (!overview) return <div className="text-sm text-muted py-12 text-center">Loading finances…</div>;

  const { totals, receivables, this_month, last_month, pnl, cashflow } = overview;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display">Accounting &amp; Finance</h1>
        <p className="text-muted text-sm">Income, expenses, cash flow, and the transaction ledger for your community.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Total income" value={fmt(totals.income)} tone="green" sub="All payments received" />
        <Kpi label="Total expenses" value={fmt(totals.expense)} tone="red" sub="Approved &amp; paid" />
        <Kpi label="Cash position" value={fmt(totals.net)} tone={totals.net >= 0 ? "green" : "red"} sub="Income − expenses" />
        <Kpi label="Outstanding dues" value={fmt(receivables)} tone="amber" sub="Yet to be collected" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Profit & Loss */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h2 className="font-display text-lg font-semibold">Profit &amp; Loss</h2>
            <div className="flex gap-1 flex-wrap">
              {PERIODS.map((p) => (
                <button key={p.id} onClick={() => setPeriod(p.id)}
                  className={`text-xs px-2.5 py-1 rounded-md border ${period === p.id ? "bg-brand-600 text-white border-brand-600" : "bg-surface border-line hover:bg-surface-2"}`}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {period === "custom" && (
            <div className="flex items-center gap-2 mb-3 text-xs">
              <input type="date" className="input py-1" value={custom.from}
                onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
              <span className="text-muted">to</span>
              <input type="date" className="input py-1" value={custom.to}
                onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 mb-4">
            <Mini label="Income" value={fmt(pnl.income)} tone="green" />
            <Mini label="Expenses" value={fmt(pnl.expense)} tone="red" />
            <Mini label={pnl.surplus >= 0 ? "Surplus" : "Deficit"} value={fmt(pnl.surplus)} tone={pnl.surplus >= 0 ? "green" : "red"} />
          </div>

          <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Expenses by category</div>
          {pnl.expense_by_category.length === 0 ? (
            <div className="text-sm text-muted py-2">No expenses in this period.</div>
          ) : (
            <BarList items={pnl.expense_by_category.map((c) => ({ label: c.category, value: c.total }))} tone="red" />
          )}

          {pnl.income_by_method.length > 0 && (
            <>
              <div className="text-xs font-semibold text-muted uppercase tracking-wide mt-4 mb-2">Income by method</div>
              <BarList items={pnl.income_by_method.map((m) => ({ label: m.method, value: m.total }))} tone="green" />
            </>
          )}
        </div>

        {/* Cash flow */}
        <div className="card p-5">
          <h2 className="font-display text-lg font-semibold mb-1">Cash flow</h2>
          <p className="text-xs text-muted mb-3">Last 12 months · inflow vs outflow with running balance.</p>
          {cashflow.length === 0 ? (
            <div className="text-sm text-muted py-4">No cash movement yet.</div>
          ) : (
            <CashflowTable rows={cashflow} thisMonth={this_month} lastMonth={last_month} />
          )}
        </div>
      </div>

      <Ledger />
    </div>
  );
}

function Kpi({ label, value, sub, tone }) {
  const tones = { green: "text-emerald-600", red: "text-red-600", amber: "text-amber-600" };
  return (
    <div className="card p-4">
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`text-xl font-bold ${tones[tone] || "text-fg"}`}>{value}</div>
      <div className="text-[11px] text-muted mt-0.5">{sub}</div>
    </div>
  );
}

function Mini({ label, value, tone }) {
  const tones = { green: "text-emerald-600", red: "text-red-600" };
  return (
    <div className="rounded-md bg-surface-2/40 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className={`font-semibold ${tones[tone] || "text-fg"}`}>{value}</div>
    </div>
  );
}

function BarList({ items, tone }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const bar = tone === "red" ? "bg-red-400" : "bg-emerald-400";
  return (
    <div className="space-y-1.5">
      {items.map((i) => (
        <div key={i.label} className="text-xs">
          <div className="flex justify-between mb-0.5">
            <span className="capitalize text-fg/80">{String(i.label).replace(/_/g, " ")}</span>
            <span className="font-medium">{fmt(i.value)}</span>
          </div>
          <div className="h-1.5 rounded bg-surface-2 overflow-hidden">
            <div className={`h-full ${bar}`} style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CashflowTable({ rows, thisMonth, lastMonth }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(r.inflow, r.outflow)));
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <Mini label="This month net" value={fmt(thisMonth.net)} tone={thisMonth.net >= 0 ? "green" : "red"} />
        <Mini label="Last month net" value={fmt(lastMonth.net)} tone={lastMonth.net >= 0 ? "green" : "red"} />
      </div>
      <div className="space-y-1.5 max-h-72 overflow-y-auto">
        {rows.slice().reverse().map((r) => (
          <div key={r.month} className="text-xs">
            <div className="flex justify-between items-center mb-0.5">
              <span className="font-medium w-16">{monthLabel(r.month)}</span>
              <span className="text-emerald-600">+{fmt(r.inflow)}</span>
              <span className="text-red-600">−{fmt(r.outflow)}</span>
              <span className={`font-semibold w-24 text-right ${r.running >= 0 ? "text-fg" : "text-red-600"}`}>{fmt(r.running)}</span>
            </div>
            <div className="flex gap-px h-1.5">
              <div className="flex-1 flex justify-end bg-surface-2 rounded-l overflow-hidden">
                <div className="h-full bg-emerald-400" style={{ width: `${(r.inflow / max) * 100}%` }} />
              </div>
              <div className="flex-1 bg-surface-2 rounded-r overflow-hidden">
                <div className="h-full bg-red-400" style={{ width: `${(r.outflow / max) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[10px] text-muted mt-1">
        <span>← inflow</span><span>outflow →</span><span>running balance</span>
      </div>
    </div>
  );
}

function Ledger() {
  const [type, setType] = useState("all");
  const [range, setRange] = useState({ from: "", to: "" });
  const [data, setData] = useState(null);

  function qs(extra = {}) {
    const p = new URLSearchParams();
    if (type !== "all") p.set("type", type);
    if (range.from) p.set("from", range.from);
    if (range.to) p.set("to", range.to);
    Object.entries(extra).forEach(([k, v]) => p.set(k, v));
    const s = p.toString();
    return s ? `?${s}` : "";
  }

  useEffect(() => {
    api.get(`/accounting/ledger${qs()}`).then((r) => setData(r.data)).catch(() => setData(null));
  }, [type, range.from, range.to]);

  function downloadCsv() {
    const token = localStorage.getItem("token");
    fetch(`/api/accounting/ledger${qs({ format: "csv" })}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "ledger.csv"; a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="font-display text-lg font-semibold">Ledger</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1">
            {["all", "income", "expense"].map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`text-xs px-2.5 py-1 rounded-md border capitalize ${type === t ? "bg-brand-600 text-white border-brand-600" : "bg-surface border-line hover:bg-surface-2"}`}>
                {t}
              </button>
            ))}
          </div>
          <input type="date" className="input py-1 text-xs" value={range.from}
            onChange={(e) => setRange({ ...range, from: e.target.value })} title="From" />
          <input type="date" className="input py-1 text-xs" value={range.to}
            onChange={(e) => setRange({ ...range, to: e.target.value })} title="To" />
          <button className="btn-secondary text-xs" onClick={downloadCsv}>⬇ CSV</button>
        </div>
      </div>

      {data && (
        <div className="flex gap-4 text-xs text-muted mb-2">
          <span>{data.count} transactions</span>
          <span>Opening: <span className="font-medium text-fg">{fmt(data.opening_balance)}</span></span>
          <span>Closing: <span className={`font-medium ${data.closing_balance >= 0 ? "text-fg" : "text-red-600"}`}>{fmt(data.closing_balance)}</span></span>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="table">
          <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Party</th><th>Method</th><th className="text-right">Amount</th><th className="text-right">Balance</th></tr></thead>
          <tbody>
            {(!data || data.transactions.length === 0) && (
              <tr><td colSpan="7" className="text-center text-slate-400 py-8">No transactions.</td></tr>
            )}
            {data?.transactions.map((t) => (
              <tr key={`${t.type}-${t.ref_id}`}>
                <td className="text-xs whitespace-nowrap">{t.date}</td>
                <td>
                  <span className={`badge ${t.type === "income" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{t.type}</span>
                </td>
                <td>{t.description}</td>
                <td className="text-slate-500">{t.party || "—"}</td>
                <td className="text-slate-500 capitalize text-xs">{String(t.method).replace(/_/g, " ")}</td>
                <td className={`text-right font-medium whitespace-nowrap ${t.signed_amount >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {t.signed_amount >= 0 ? "+" : "−"}{fmt(Math.abs(t.signed_amount))}
                </td>
                <td className={`text-right whitespace-nowrap ${t.balance >= 0 ? "text-slate-700" : "text-red-600"}`}>{fmt(t.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
