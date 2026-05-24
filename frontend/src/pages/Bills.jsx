import { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import Modal from "../components/Modal.jsx";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function Bills() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [genOpen, setGenOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(null);

  function load() {
    api.get("/bills").then((r) => setBills(r.data.bills));
  }
  useEffect(load, []);

  const canGenerate = ["super_admin", "committee", "treasurer"].includes(user?.role);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Maintenance Bills</h1>
          <p className="text-slate-500 text-sm">Monthly collection, dues, and payment history.</p>
        </div>
        {canGenerate && (
          <button className="btn-primary" onClick={() => setGenOpen(true)}>+ Generate bills</button>
        )}
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Period</th>
              <th>Flat</th>
              <th>Owner</th>
              <th>Amount</th>
              <th>Penalty</th>
              <th>Paid</th>
              <th>Due</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bills.length === 0 && (
              <tr><td colSpan="9" className="text-center text-slate-400 py-8">No bills yet — generate the first month.</td></tr>
            )}
            {bills.map((b) => {
              const due = Math.max(0, b.amount + b.penalty - b.paid_amount);
              return (
                <tr key={b.id}>
                  <td>{b.period}</td>
                  <td>{b.block}-{b.flat_number}</td>
                  <td className="text-slate-500">{b.owner_name || "—"}</td>
                  <td>{fmt(b.amount)}</td>
                  <td>{b.penalty > 0 ? fmt(b.penalty) : "—"}</td>
                  <td>{fmt(b.paid_amount)}</td>
                  <td className="font-medium">{fmt(due)}</td>
                  <td><StatusBadge value={b.status} /></td>
                  <td className="text-right">
                    {due > 0 && (
                      <button className="btn-secondary text-xs" onClick={() => setPayOpen(b)}>Record payment</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <GenerateModal open={genOpen} onClose={() => setGenOpen(false)} onCreated={load} />
      <PaymentModal bill={payOpen} onClose={() => setPayOpen(null)} onPaid={load} />
    </div>
  );
}

function GenerateModal({ open, onClose, onCreated }) {
  const now = new Date();
  const defPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const defDue = `${defPeriod}-10`;
  const [period, setPeriod] = useState(defPeriod);
  const [dueDate, setDueDate] = useState(defDue);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api.post("/bills/generate", { period, due_date: dueDate });
      setMsg(`Generated ${r.data.created} bills for ${r.data.total_flats} flats.`);
      onCreated();
    } catch (e) {
      setMsg(e.response?.data?.error || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Generate maintenance bills"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Close</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Generating…" : "Generate"}</button>
      </>}>
      <div className="space-y-3">
        <div>
          <label className="label">Billing period (YYYY-MM)</label>
          <input className="input" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-05" />
        </div>
        <div>
          <label className="label">Due date</label>
          <input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <p className="text-xs text-slate-500">
          Generates bills for every flat using its configured monthly rate. Re-running for the same period is a no-op.
        </p>
        {msg && <div className="text-sm text-emerald-700">{msg}</div>}
      </div>
    </Modal>
  );
}

function PaymentModal({ bill, onClose, onPaid }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("online");
  const [reference, setReference] = useState("");
  const [err, setErr] = useState("");

  if (!bill) return null;
  const due = Math.max(0, bill.amount + bill.penalty - bill.paid_amount);

  async function submit() {
    setErr("");
    try {
      await api.post(`/bills/${bill.id}/pay`, { amount: Number(amount), method, reference });
      onPaid();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || "Failed");
    }
  }

  return (
    <Modal open={!!bill} onClose={onClose} title={`Pay bill — ${bill.period} (${bill.block}-${bill.flat_number})`}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Record payment</button>
      </>}>
      <div className="space-y-3">
        <div className="text-sm text-slate-600">Amount due: <span className="font-semibold">{fmt(due)}</span></div>
        <div>
          <label className="label">Amount</label>
          <input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(due)} />
        </div>
        <div>
          <label className="label">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="online">Online</option>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="cheque">Cheque</option>
            <option value="bank_transfer">Bank Transfer</option>
          </select>
        </div>
        <div>
          <label className="label">Reference / receipt no.</label>
          <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="TXN12345" />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
