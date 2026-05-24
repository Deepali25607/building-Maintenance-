import { useEffect, useState } from "react";
import api from "../api/client.js";

const REPORTS = [
  { id: "collection", label: "Monthly Collection Report" },
  { id: "expenses", label: "Expense Report" },
  { id: "income-vs-expense", label: "Income vs Expense" },
  { id: "incident-resolution", label: "Incident Resolution" },
];

const fmt = (v) => typeof v === "number" ? v.toLocaleString("en-IN") : v;

export default function Reports() {
  const [selected, setSelected] = useState("collection");
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);

  useEffect(() => {
    api.get(`/reports/${selected}`).then((r) => {
      setRows(r.data.rows);
      setHeaders(r.data.rows[0] ? Object.keys(r.data.rows[0]) : []);
    });
  }, [selected]);

  function downloadCsv() {
    const token = localStorage.getItem("token");
    fetch(`/api/reports/${selected}?format=csv`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${selected}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-slate-500 text-sm">Financial and operational reports — export to CSV.</p>
        </div>
        <button className="btn-primary" onClick={downloadCsv}>Download CSV</button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {REPORTS.map((r) => (
          <button key={r.id}
            onClick={() => setSelected(r.id)}
            className={`btn ${selected === r.id ? "bg-brand-600 text-white" : "bg-white border border-slate-200 hover:bg-slate-50"}`}>
            {r.label}
          </button>
        ))}
      </div>

      <div className="card overflow-auto">
        <table className="table">
          <thead><tr>{headers.map((h) => <th key={h}>{h.replace(/_/g, " ")}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={headers.length || 1} className="text-center text-slate-400 py-8">No data.</td></tr>}
            {rows.map((row, i) => (
              <tr key={i}>{headers.map((h) => <td key={h}>{fmt(row[h])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
