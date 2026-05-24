import { useEffect, useState } from "react";
import api from "../api/client.js";
import Modal from "../components/Modal.jsx";

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [openNew, setOpenNew] = useState(false);

  function load() {
    api.get("/vendors").then((r) => setVendors(r.data.vendors));
  }
  useEffect(load, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Vendors</h1>
          <p className="text-slate-500 text-sm">Service providers used when recording expenses.</p>
        </div>
        <button className="btn-primary" onClick={() => setOpenNew(true)}>+ Add vendor</button>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead><tr><th>Name</th><th>Service</th><th>Phone</th><th>Email</th></tr></thead>
          <tbody>
            {vendors.length === 0 && (
              <tr><td colSpan="4" className="text-center text-slate-400 py-8">No vendors yet — add your first one.</td></tr>
            )}
            {vendors.map((v) => (
              <tr key={v.id}>
                <td className="font-medium">{v.name}</td>
                <td>{v.service || "—"}</td>
                <td className="text-slate-500">{v.phone || "—"}</td>
                <td className="text-slate-500">{v.email || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <VendorForm open={openNew} onClose={() => setOpenNew(false)} onCreated={load} />
    </div>
  );
}

export function VendorForm({ open, onClose, onCreated, initial }) {
  const [form, setForm] = useState({ name: "", service: "", phone: "", email: "", ...initial });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setBusy(true);
    try {
      const r = await api.post("/vendors", form);
      onCreated?.(r.data.vendor);
      onClose();
      setForm({ name: "", service: "", phone: "", email: "" });
    } catch (e) {
      setErr(e.response?.data?.error || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add vendor"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Save vendor"}</button>
      </>}>
      <div className="space-y-3">
        <div>
          <label className="label">Name *</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sparkle Cleaning Co" />
        </div>
        <div>
          <label className="label">Service</label>
          <input className="input" value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder="Cleaning, Lift AMC, Plumbing…" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
