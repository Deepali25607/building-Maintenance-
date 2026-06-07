import { useEffect, useState } from "react";
import api from "../api/client.js";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function Towers() {
  const { can } = useAuth();
  const canCreate = can("towers", "create");
  const canEdit = can("towers", "edit");
  const canDelete = can("towers", "delete");

  const [towers, setTowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // { mode, tower? }
  const [deleting, setDeleting] = useState(null);
  const [err, setErr] = useState("");

  function load() {
    setLoading(true);
    api.get("/towers")
      .then((r) => setTowers(r.data.towers || []))
      .catch((e) => setErr(e.response?.data?.error || "Failed to load"))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  async function confirmDelete() {
    if (!deleting) return;
    setErr("");
    try {
      await api.delete(`/towers/${deleting.id}`);
      setDeleting(null);
      load();
    } catch (e) {
      setErr(e.response?.data?.error || "Delete failed");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold font-display">Towers</h1>
          <p className="text-muted text-sm">
            The building structure of your community — Organization → Tower → Floor → Flat.
          </p>
        </div>
        {canCreate && (
          <button className="btn-primary" onClick={() => setForm({ mode: "create" })}>+ Add tower</button>
        )}
      </div>

      {err && <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">{err}</div>}

      {loading ? (
        <div className="text-sm text-muted text-center py-12">Loading towers…</div>
      ) : towers.length === 0 ? (
        <div className="card p-8 text-center text-sm text-muted">
          No towers yet. {canCreate ? "Add your first tower to start organizing flats." : ""}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {towers.map((t) => (
            <TowerCard key={t.id} tower={t}
              onEdit={canEdit ? () => setForm({ mode: "edit", tower: t }) : null}
              onDelete={canDelete ? () => setDeleting(t) : null}
            />
          ))}
        </div>
      )}

      <TowerFormModal state={form} onClose={() => setForm(null)} onSaved={load} />

      <Modal open={!!deleting} onClose={() => setDeleting(null)}
        title={`Delete "${deleting?.name}"?`}
        footer={<>
          <button className="btn-secondary" onClick={() => setDeleting(null)}>Cancel</button>
          <button className="btn-danger" onClick={confirmDelete}>Yes, delete</button>
        </>}>
        <div className="text-sm space-y-2">
          <p>This removes the tower from your structure.</p>
          {deleting?.flat_count > 0 && (
            <div className="p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800">
              {deleting.flat_count} flat{deleting.flat_count === 1 ? "" : "s"} currently assigned to this tower
              will be <span className="font-semibold">detached</span> (not deleted) — they'll simply have no tower.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function TowerCard({ tower, onEdit, onDelete }) {
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="font-display text-xl font-semibold text-brand-700 truncate">🏗️ {tower.name}</div>
            {tower.code && (
              <span className="badge bg-slate-100 text-slate-600 font-mono text-[10px] shrink-0">{tower.code}</span>
            )}
          </div>
          {tower.notes && <div className="text-xs text-muted mt-1 line-clamp-2">{tower.notes}</div>}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Flats" value={tower.flat_count ?? 0} />
        <Stat label="Floors" value={tower.total_floors ?? "—"} />
        <Stat label="Floors used" value={tower.floors_in_use ?? 0} />
      </div>

      {(onEdit || onDelete) && (
        <div className="mt-4 pt-3 border-t border-line flex flex-wrap gap-2">
          {onEdit && <button onClick={onEdit} className="btn-secondary text-xs">✏️ Edit</button>}
          {onDelete && <button onClick={onDelete} className="btn-secondary text-xs text-red-600">🗑 Delete</button>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md bg-surface-2/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
      <div className="font-semibold text-fg">{value}</div>
    </div>
  );
}

function TowerFormModal({ state, onClose, onSaved }) {
  const mode = state?.mode;
  const existing = state?.tower;
  const [form, setForm] = useState({ name: "", code: "", total_floors: "", notes: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!state) return;
    setErr("");
    if (mode === "edit" && existing) {
      setForm({
        name: existing.name || "",
        code: existing.code || "",
        total_floors: existing.total_floors ?? "",
        notes: existing.notes || "",
      });
    } else {
      setForm({ name: "", code: "", total_floors: "", notes: "" });
    }
  }, [state]);

  async function submit() {
    setErr("");
    if (!form.name.trim()) { setErr("Tower name is required"); return; }
    setBusy(true);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      total_floors: form.total_floors === "" ? null : Number(form.total_floors),
      notes: form.notes.trim() || null,
    };
    try {
      if (mode === "edit") {
        await api.patch(`/towers/${existing.id}`, payload);
      } else {
        await api.post("/towers", payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;

  return (
    <Modal open={!!state} onClose={onClose}
      title={mode === "edit" ? `Edit ${existing?.name}` : "Add tower"}
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={submit}>
          {busy ? "Saving…" : mode === "edit" ? "Save changes" : "Create tower"}
        </button>
      </>}>
      <div className="space-y-3">
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="label">Tower name *</label>
            <input className="input" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Tower A / Block 1" maxLength={80} />
          </div>
          <div>
            <label className="label">Short code</label>
            <input className="input" value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="TA" maxLength={12} />
          </div>
        </div>
        <div>
          <label className="label">Total floors</label>
          <input className="input" type="number" min="0" value={form.total_floors}
            onChange={(e) => setForm({ ...form, total_floors: e.target.value })}
            placeholder="e.g. 12" />
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[60px]" value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Anything notable about this tower (wing, amenities, etc.)" />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}
