import { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import Modal from "../components/Modal.jsx";
import { VendorForm } from "./Vendors.jsx";

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

export default function Expenses() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [openNew, setOpenNew] = useState(false);

  function load() {
    api.get("/expenses").then((r) => setList(r.data.expenses));
  }
  function loadVendors() {
    return api.get("/vendors").then((r) => { setVendors(r.data.vendors); return r.data.vendors; });
  }
  useEffect(() => {
    load();
    api.get("/expenses/categories").then((r) => setCategories(r.data.categories));
    loadVendors();
  }, []);

  const canApprove = ["super_admin", "committee"].includes(user?.role);

  async function setStatus(id, status) {
    await api.patch(`/expenses/${id}`, { status });
    load();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-slate-500 text-sm">Track community expenses, approvals, and vendors.</p>
        </div>
        <button className="btn-primary" onClick={() => setOpenNew(true)}>+ Add expense</button>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>Date</th><th>Category</th><th>Vendor</th><th>Amount</th><th>Status</th><th>Submitted by</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan="7" className="text-center text-slate-400 py-8">No expenses recorded.</td></tr>}
            {list.map((e) => (
              <tr key={e.id}>
                <td>{e.expense_date}</td>
                <td>{e.category}</td>
                <td className="text-slate-500">{e.vendor_name || "—"}</td>
                <td className="font-medium">{fmt(e.amount)}</td>
                <td><StatusBadge value={e.status} /></td>
                <td className="text-slate-500 text-xs">{e.submitted_by_name || "—"}</td>
                <td className="text-right">
                  {canApprove && e.status === "pending_approval" && (
                    <div className="flex gap-1 justify-end">
                      <button className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200" onClick={() => setStatus(e.id, "approved")}>Approve</button>
                      <button className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200" onClick={() => setStatus(e.id, "rejected")}>Reject</button>
                    </div>
                  )}
                  {canApprove && e.status === "approved" && (
                    <button className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200" onClick={() => setStatus(e.id, "paid")}>Mark paid</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewExpense open={openNew} onClose={() => setOpenNew(false)} categories={categories} vendors={vendors} onCreated={load} reloadVendors={loadVendors} />
    </div>
  );
}

function NewExpense({ open, onClose, categories, vendors, onCreated, reloadVendors }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ category: "", vendor_id: "", amount: "", expense_date: today, description: "" });
  const [err, setErr] = useState("");
  const [vendorFormOpen, setVendorFormOpen] = useState(false);

  async function submit() {
    setErr("");
    try {
      await api.post("/expenses", {
        ...form,
        amount: Number(form.amount),
        vendor_id: form.vendor_id || null,
      });
      onCreated();
      onClose();
      setForm({ category: "", vendor_id: "", amount: "", expense_date: today, description: "" });
    } catch (e) {
      setErr(e.response?.data?.error || "Failed");
    }
  }

  async function handleVendorCreated(newVendor) {
    await reloadVendors();
    if (newVendor?.id) setForm((f) => ({ ...f, vendor_id: String(newVendor.id) }));
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title="Add expense"
        footer={<>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Submit</button>
        </>}>
        <div className="space-y-3">
          <div>
            <label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">— select —</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label !mb-0">Vendor (optional)</label>
              <button type="button" onClick={() => setVendorFormOpen(true)}
                className="text-xs font-medium text-brand-700 hover:underline">
                + New vendor
              </button>
            </div>
            <select className="input" value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}>
              <option value="">— none —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}{v.service ? ` — ${v.service}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Amount</label>
              <input className="input" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="label">Date</label>
              <input className="input" type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Description</label>
            <textarea className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
      </Modal>

      <VendorForm
        open={vendorFormOpen}
        onClose={() => setVendorFormOpen(false)}
        onCreated={handleVendorCreated}
      />
    </>
  );
}
