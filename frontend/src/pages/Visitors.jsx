import { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import Modal from "../components/Modal.jsx";

const STATUS = {
  pending:     { label: "Pending",   cls: "bg-amber-100 text-amber-800" },
  approved:    { label: "Approved",  cls: "bg-emerald-100 text-emerald-700" },
  denied:      { label: "Denied",    cls: "bg-red-100 text-red-700" },
  checked_in:  { label: "Inside",    cls: "bg-sky-100 text-sky-700" },
  checked_out: { label: "Left",      cls: "bg-slate-100 text-slate-600" },
  expired:     { label: "Expired",   cls: "bg-slate-100 text-slate-500" },
};

const PURPOSES = ["Guest", "Delivery", "Cab / Taxi", "Service / Maintenance", "Domestic help", "Other"];

const FILTERS = [
  { key: "", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "checked_in", label: "Inside" },
  { key: "denied", label: "Denied" },
];

function timeAgo(ts) {
  if (!ts) return "";
  const then = new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z").getTime();
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(then).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function Visitors() {
  const { user, can } = useAuth();
  const canCreate = can("visitors", "create");
  const canManage = can("visitors", "edit"); // gate/security staff

  const [visitors, setVisitors] = useState([]);
  const [counts, setCounts] = useState({});
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);

  function load() {
    setLoading(true);
    api.get("/visitors", { params: filter ? { status: filter } : {} })
      .then((r) => { setVisitors(r.data.visitors || []); setCounts(r.data.counts || {}); })
      .catch((e) => setErr(e.response?.data?.error || "Failed to load visitors"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(v, status) {
    setErr(""); setMsg("");
    try {
      await api.patch(`/visitors/${v.id}/status`, { status });
      load();
    } catch (e) {
      setErr(e.response?.data?.error || "Could not update visitor");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-5 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold font-display">Visitors</h1>
          <p className="text-muted text-sm">
            {canManage
              ? "Log visitors at the gate — the resident they're here to meet is notified to approve."
              : "Visitors here to meet you. You'll be notified to approve or deny each one."}
          </p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => setShowForm(true)}>+ Log visitor</button>
        )}
      </div>

      {msg && <div className="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{msg}</div>}
      {err && <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`text-sm rounded-full px-3 py-1.5 border ${
              filter === f.key ? "bg-brand-600 text-white border-brand-600" : "border-line hover:bg-surface-2"
            }`}>
            {f.label}
            {f.key && counts[f.key] ? <span className="ml-1 opacity-80">({counts[f.key]})</span> : null}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-muted text-center py-12">Loading visitors…</div>
      ) : visitors.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          No visitors{filter ? ` (${STATUS[filter]?.label.toLowerCase()})` : ""} yet.
        </div>
      ) : (
        <div className="space-y-3">
          {visitors.map((v) => (
            <VisitorCard key={v.id} v={v} user={user} canManage={canManage} onStatus={setStatus} />
          ))}
        </div>
      )}

      {showForm && (
        <VisitorForm
          canManage={canManage}
          onClose={() => setShowForm(false)}
          onCreated={(notified) => {
            setShowForm(false);
            setMsg(notified ? "Visitor logged — the resident has been notified." : "Visitor logged.");
            load();
          }}
        />
      )}
    </div>
  );
}

function VisitorCard({ v, user, canManage, onStatus }) {
  const st = STATUS[v.status] || STATUS.pending;
  const isHost = v.host_user_id && v.host_user_id === user?.id;
  const flatLabel = `${v.block ? v.block + "-" : ""}${v.flat_number || "—"}`;
  const canApprove = v.status === "pending" && (isHost || canManage);

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{v.name}</span>
            <span className={`badge ${st.cls}`}>{st.label}</span>
            {v.purpose && <span className="badge bg-slate-100 text-slate-600">{v.purpose}</span>}
          </div>
          <div className="text-xs text-muted mt-1 space-x-2">
            <span>🏢 Flat {flatLabel}</span>
            {v.host_name && <span>· 👤 {v.host_name}{isHost ? " (you)" : ""}</span>}
            {v.phone && <span>· 📞 {v.phone}</span>}
            {v.vehicle_no && <span>· 🚗 {v.vehicle_no}</span>}
          </div>
          <div className="text-[11px] text-muted mt-1">
            Logged {timeAgo(v.created_at)}{v.logged_by_name ? ` by ${v.logged_by_name}` : ""}
          </div>
        </div>

        <div className="flex gap-1.5 shrink-0 flex-wrap justify-end">
          {canApprove && (
            <>
              <button onClick={() => onStatus(v, "approved")} className="btn-primary text-xs">Approve</button>
              <button onClick={() => onStatus(v, "denied")} className="btn-secondary text-xs text-red-600">Deny</button>
            </>
          )}
          {canManage && (v.status === "pending" || v.status === "approved") && (
            <button onClick={() => onStatus(v, "checked_in")} className="btn-secondary text-xs">Check in</button>
          )}
          {canManage && v.status === "checked_in" && (
            <button onClick={() => onStatus(v, "checked_out")} className="btn-secondary text-xs">Check out</button>
          )}
        </div>
      </div>

      {v.notes && <div className="text-xs text-fg/70 mt-2 border-t border-line pt-2">📝 {v.notes}</div>}
    </div>
  );
}

function VisitorForm({ canManage, onClose, onCreated }) {
  const [flats, setFlats] = useState([]);
  const [form, setForm] = useState({
    flat_id: "", name: "", phone: "", purpose: "Guest", vehicle_no: "", expected_at: "", notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/visitors/flat-options")
      .then((r) => {
        const list = r.data.flats || [];
        setFlats(list);
        // Residents typically have a single flat — preselect it.
        if (list.length === 1) setForm((f) => ({ ...f, flat_id: String(list[0].id) }));
      })
      .catch(() => {});
  }, []);

  function update(patch) { setForm((f) => ({ ...f, ...patch })); }

  async function submit(e) {
    e.preventDefault();
    setErr("");
    if (!form.name.trim()) { setErr("Visitor name is required."); return; }
    if (!form.flat_id) { setErr("Please choose the flat the visitor is here to meet."); return; }
    setBusy(true);
    try {
      const r = await api.post("/visitors", {
        ...form,
        flat_id: Number(form.flat_id),
        expected_at: form.expected_at || undefined,
      });
      onCreated(r.data.host_notified);
    } catch (e) {
      setErr(e.response?.data?.error || "Could not log visitor");
    } finally {
      setBusy(false);
    }
  }

  const selectedFlat = flats.find((f) => String(f.id) === String(form.flat_id));

  return (
    <Modal open onClose={onClose} title="Log a visitor"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>{busy ? "Saving…" : "Log & notify resident"}</button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Flat to visit <span className="text-red-500">*</span></label>
          <select className="input" value={form.flat_id} onChange={(e) => update({ flat_id: e.target.value })} required>
            <option value="">Select a flat…</option>
            {flats.map((f) => (
              <option key={f.id} value={f.id}>
                Flat {f.label}{f.owner_name ? ` — ${f.owner_name}` : " (no resident)"}
              </option>
            ))}
          </select>
          {selectedFlat && !selectedFlat.owner_name && (
            <div className="text-[11px] text-amber-700 mt-1">This flat has no resident assigned — no one will be notified.</div>
          )}
          {selectedFlat?.owner_name && (
            <div className="text-[11px] text-muted mt-1">🔔 {selectedFlat.owner_name} will be notified to approve.</div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Visitor name <span className="text-red-500">*</span></label>
            <input className="input" value={form.name} maxLength={120} required
              onChange={(e) => update({ name: e.target.value })} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input className="input" value={form.phone} maxLength={20}
              onChange={(e) => update({ phone: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Purpose</label>
            <select className="input" value={form.purpose} onChange={(e) => update({ purpose: e.target.value })}>
              {PURPOSES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Vehicle no.</label>
            <input className="input" value={form.vehicle_no} maxLength={20}
              onChange={(e) => update({ vehicle_no: e.target.value })} />
          </div>
        </div>

        {canManage && (
          <div>
            <label className="label">Expected time <span className="text-slate-400">(optional)</span></label>
            <input className="input" type="datetime-local" value={form.expected_at}
              onChange={(e) => update({ expected_at: e.target.value })} />
          </div>
        )}

        <div>
          <label className="label">Notes <span className="text-slate-400">(optional)</span></label>
          <textarea className="input min-h-[60px]" value={form.notes} maxLength={500}
            onChange={(e) => update({ notes: e.target.value })} />
        </div>

        {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
      </form>
    </Modal>
  );
}
