import { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import Modal from "../components/Modal.jsx";

const STATUS_FLOW = ["open", "assigned", "in_progress", "resolved", "closed"];

// SLA standing → badge style + label. `sla` is the computed object from the API.
function SlaBadge({ sla }) {
  if (!sla || sla.state === "unknown") return <span className="text-xs text-slate-400">—</span>;
  const overdue = sla.hours_remaining != null && sla.hours_remaining < 0;
  const map = {
    on_track: ["bg-emerald-50 text-emerald-700 border-emerald-200", `On track · ${sla.hours_remaining}h left`],
    due_soon: ["bg-amber-50 text-amber-800 border-amber-200", `Due soon · ${sla.hours_remaining}h left`],
    breached: overdue
      ? ["bg-red-50 text-red-700 border-red-200", `Overdue ${Math.abs(sla.hours_remaining)}h`]
      : ["bg-red-50 text-red-700 border-red-200", "Breached"],
    met: ["bg-emerald-50 text-emerald-700 border-emerald-200", "Met"],
  };
  const [cls, label] = map[sla.state] || ["bg-slate-50 text-slate-600 border-slate-200", sla.state];
  return <span className={`text-[11px] px-2 py-0.5 rounded-full border whitespace-nowrap ${cls}`}>{label}</span>;
}

function EscalationBadge({ level }) {
  if (!level) return null;
  return <span className="text-[11px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 whitespace-nowrap">⏫ L{level}</span>;
}

export default function Incidents() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [summary, setSummary] = useState({ breached: 0, due_soon: 0, escalated: 0, total: 0 });
  const [breachedOnly, setBreachedOnly] = useState(false);
  const [categories, setCategories] = useState([]);
  const [slaConfig, setSlaConfig] = useState(null);
  const [staff, setStaff] = useState([]);
  const [newOpen, setNewOpen] = useState(false);
  const [slaOpen, setSlaOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  function load() {
    api.get(`/incidents${breachedOnly ? "?breached=1" : ""}`).then((r) => {
      setList(r.data.incidents);
      if (r.data.summary) setSummary(r.data.summary);
    });
  }

  useEffect(() => { load(); }, [breachedOnly]);

  useEffect(() => {
    api.get("/incidents/categories").then((r) => setCategories(r.data.categories));
    api.get("/incidents/sla/config").then((r) => setSlaConfig(r.data)).catch(() => {});
    if (["super_admin", "committee"].includes(user?.role)) {
      api.get("/users").then((r) => setStaff(r.data.users.filter((u) => u.role === "maintenance")));
    }
  }, [user?.role]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Incidents</h1>
          <p className="text-slate-500 text-sm">Raise, track, and resolve community issues within SLA.</p>
        </div>
        <div className="flex items-center gap-2">
          {slaConfig?.editable && (
            <button className="btn-secondary" onClick={() => setSlaOpen(true)}>⚙ SLA settings</button>
          )}
          <button className="btn-primary" onClick={() => setNewOpen(true)}>+ Raise incident</button>
        </div>
      </div>

      {(summary.breached > 0 || summary.due_soon > 0 || summary.escalated > 0) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          {summary.breached > 0 && (
            <button onClick={() => setBreachedOnly((v) => !v)}
              className={`px-3 py-1.5 rounded-full border ${breachedOnly ? "bg-red-600 text-white border-red-600" : "bg-red-50 border-red-200 text-red-700"}`}>
              🔴 {summary.breached} breaching SLA{breachedOnly ? " — showing only these" : ""}
            </button>
          )}
          {summary.due_soon > 0 && (
            <span className="px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">⏳ {summary.due_soon} due soon</span>
          )}
          {summary.escalated > 0 && (
            <span className="px-3 py-1.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700">⏫ {summary.escalated} escalated</span>
          )}
          {breachedOnly && (
            <button onClick={() => setBreachedOnly(false)} className="text-xs text-slate-500 hover:underline">Clear filter</button>
          )}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Title</th><th>Category</th><th>Priority</th><th>Status</th><th>SLA</th><th>Assigned to</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan="8" className="text-center text-slate-400 py-8">No incidents.</td></tr>}
            {list.map((i) => (
              <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetail(i)}>
                <td>#{i.id}</td>
                <td className="font-medium">
                  <div className="flex items-center gap-2">{i.title} <EscalationBadge level={i.escalation_level} /></div>
                </td>
                <td>{i.category}</td>
                <td><StatusBadge value={i.priority} /></td>
                <td><StatusBadge value={i.status} /></td>
                <td><SlaBadge sla={i.sla} /></td>
                <td className="text-slate-500">{i.assigned_to_name || "—"}</td>
                <td className="text-slate-500 text-xs">{i.created_at?.slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewIncident open={newOpen} onClose={() => setNewOpen(false)} categories={categories} slaConfig={slaConfig} onCreated={load} />
      <SlaSettings open={slaOpen} onClose={() => setSlaOpen(false)} config={slaConfig}
        onSaved={(matrix) => { setSlaConfig((c) => ({ ...c, sla_matrix: matrix })); load(); }} />
      <IncidentDetail incident={detail} onClose={() => setDetail(null)} staff={staff} onUpdated={load} />
    </div>
  );
}

const PRIORITY_META = [
  { key: "urgent", label: "Urgent", hint: "Critical — safety/security, total outage" },
  { key: "high", label: "High", hint: "Major disruption to many residents" },
  { key: "medium", label: "Medium", hint: "Normal issues" },
  { key: "low", label: "Low", hint: "Minor / cosmetic" },
];

function SlaSettings({ open, onClose, config, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (open && config?.sla_matrix) {
      setForm({ ...config.sla_matrix });
      setErr("");
    }
  }, [open, config]);

  async function save() {
    setErr("");
    for (const p of PRIORITY_META) {
      const v = Number(form[p.key]);
      if (!Number.isInteger(v) || v < 1 || v > 8760) {
        setErr(`${p.label} must be a whole number of hours between 1 and 8760.`);
        return;
      }
    }
    setBusy(true);
    try {
      const r = await api.put("/incidents/sla/config", { sla_matrix: form });
      onSaved?.(r.data.sla_matrix);
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  function resetDefaults() {
    if (config?.defaults) setForm({ ...config.defaults });
  }

  return (
    <Modal open={open} onClose={onClose} title="SLA settings"
      footer={<>
        <button className="btn-secondary text-xs" onClick={resetDefaults} disabled={busy}>Reset to defaults</button>
        <div className="flex-1" />
        <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Set the resolution deadline (in hours) for each priority. New incidents use these to compute
          their SLA. Existing incidents keep the SLA they were created with.
        </p>
        {PRIORITY_META.map((p) => (
          <div key={p.key} className="flex items-center gap-3">
            <div className="w-24">
              <StatusBadge value={p.key} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <input type="number" min="1" max="8760" className="input w-28 py-1.5"
                  value={form[p.key] ?? ""}
                  onChange={(e) => setForm({ ...form, [p.key]: e.target.value })} />
                <span className="text-xs text-muted">hours</span>
              </div>
              <div className="text-[11px] text-muted mt-0.5">{p.hint}</div>
            </div>
          </div>
        ))}
        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

function NewIncident({ open, onClose, categories, slaConfig, onCreated }) {
  const [form, setForm] = useState({ category: "Water Leakage", title: "", description: "", priority: "medium" });
  const [files, setFiles] = useState([]); // array of File objects (pending upload)
  const [previews, setPreviews] = useState([]); // matching object URLs
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");

  function resetAll() {
    setForm({ category: "Water Leakage", title: "", description: "", priority: "medium" });
    previews.forEach((u) => URL.revokeObjectURL(u));
    setFiles([]); setPreviews([]); setErr("");
  }

  function addFiles(e) {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    const remaining = 5 - files.length;
    const accepted = picked.slice(0, Math.max(0, remaining));
    const newPreviews = accepted.map((f) => URL.createObjectURL(f));
    setFiles([...files, ...accepted]);
    setPreviews([...previews, ...newPreviews]);
    e.target.value = "";
  }

  function removeFile(i) {
    URL.revokeObjectURL(previews[i]);
    setFiles(files.filter((_, idx) => idx !== i));
    setPreviews(previews.filter((_, idx) => idx !== i));
  }

  async function submit() {
    setErr("");
    setUploading(true);
    try {
      let attachments = [];
      if (files.length > 0) {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        const r = await api.post("/uploads/incident", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        attachments = r.data.urls;
      }
      await api.post("/incidents", { ...form, attachments });
      onCreated();
      onClose();
      resetAll();
    } catch (e) {
      setErr(e.response?.data?.error || "Failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Raise new incident"
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={uploading}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={uploading}>
          {uploading ? "Submitting…" : "Submit"}
        </button>
      </>}>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto px-1 -mx-1">
        <div>
          <label className="label">Category</label>
          <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Title</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Short summary" />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[100px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="label">Priority</label>
          <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="low">Low</option><option value="medium">Medium</option>
            <option value="high">High</option><option value="urgent">Urgent</option>
          </select>
          {slaConfig?.sla_matrix?.[form.priority] != null && (
            <p className="text-[11px] text-muted mt-1">
              Resolution target: <span className="font-medium">{slaConfig.sla_matrix[form.priority]}h</span> from now (SLA for {form.priority} priority).
            </p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label !mb-0">Photos (optional)</label>
            <span className="text-[11px] text-muted">{files.length}/5 selected · PNG/JPG/GIF/WEBP, ≤8MB each</span>
          </div>
          {previews.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-2">
              {previews.map((src, i) => (
                <div key={i} className="relative group rounded-md overflow-hidden border border-line">
                  <img src={src} alt="" className="w-full h-20 object-cover" />
                  <button type="button" onClick={() => removeFile(i)}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs leading-none"
                    title="Remove">×</button>
                </div>
              ))}
            </div>
          )}
          {files.length < 5 && (
            <label className="btn-secondary text-xs cursor-pointer w-fit">
              📷 Add photos
              <input type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden" onChange={addFiles} disabled={uploading} />
            </label>
          )}
          <p className="text-[11px] text-muted mt-1">
            Attach photos of the issue so maintenance staff can prepare. Up to 5 images.
          </p>
        </div>

        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

function IncidentDetail({ incident, onClose, staff, onUpdated }) {
  const { user, hasFeature } = useAuth();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [lightboxSrc, setLightboxSrc] = useState(null);

  useEffect(() => {
    if (!incident) return;
    api.get(`/incidents/${incident.id}/comments`).then((r) => setComments(r.data.comments));
  }, [incident?.id]);

  if (!incident) return null;
  const canManage = ["super_admin", "committee", "maintenance"].includes(user?.role);
  const attachments = incident.attachments || [];

  async function setStatus(status) {
    await api.patch(`/incidents/${incident.id}`, { status });
    onUpdated();
    onClose();
  }

  async function assign(toId) {
    await api.patch(`/incidents/${incident.id}`, { assigned_to: Number(toId) });
    onUpdated();
    onClose();
  }

  async function escalate() {
    try {
      await api.post(`/incidents/${incident.id}/escalate`, {});
      onUpdated();
      onClose();
    } catch (e) {
      alert(e.response?.data?.error || "Failed to escalate");
    }
  }

  async function addComment() {
    if (!body.trim()) return;
    await api.post(`/incidents/${incident.id}/comments`, { body });
    const r = await api.get(`/incidents/${incident.id}/comments`);
    setComments(r.data.comments);
    setBody("");
  }

  return (
    <Modal open={!!incident} onClose={onClose} title={`#${incident.id} — ${incident.title}`}
      footer={<button className="btn-secondary" onClick={onClose}>Close</button>}>
      <div className="space-y-4">
        <div className="flex gap-2 flex-wrap text-sm items-center">
          <StatusBadge value={incident.status} />
          <StatusBadge value={incident.priority} />
          <span className="badge bg-slate-100 text-slate-700">{incident.category}</span>
          <SlaBadge sla={incident.sla} />
          <EscalationBadge level={incident.escalation_level} />
        </div>

        {incident.sla?.due_at && (
          <div className={`rounded-md border px-3 py-2 text-xs ${
            incident.sla.state === "breached" ? "bg-red-50 border-red-200 text-red-800"
              : incident.sla.state === "due_soon" ? "bg-amber-50 border-amber-200 text-amber-800"
              : "bg-slate-50 border-slate-200 text-slate-600"}`}>
            <span className="font-semibold">SLA:</span> {incident.sla.sla_hours}h target ·
            {" "}due {incident.sla.due_at.slice(0, 16).replace("T", " ")} UTC
            {incident.sla.hours_remaining != null && (
              <> · {incident.sla.hours_remaining < 0
                ? `overdue by ${Math.abs(incident.sla.hours_remaining)}h`
                : `${incident.sla.hours_remaining}h remaining`}</>
            )}
            {incident.escalation_level > 0 && incident.escalated_at && (
              <> · escalated to L{incident.escalation_level} on {incident.escalated_at.slice(0, 16).replace("T", " ")} UTC</>
            )}
          </div>
        )}

        <p className="text-sm text-slate-600">{incident.description || "(no description)"}</p>

        {attachments.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
              Photos ({attachments.length})
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {attachments.map((url, i) => (
                <button key={i} type="button" onClick={() => setLightboxSrc(url)}
                  className="rounded-md overflow-hidden border border-line hover:opacity-90 transition">
                  <img src={url} alt={`attachment ${i + 1}`} className="w-full h-20 object-cover" />
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="text-xs text-slate-500">Raised by {incident.raised_by_name} on {incident.created_at?.slice(0, 16).replace("T", " ")}</div>

        {canManage && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <div className="text-xs font-semibold text-slate-600">Workflow</div>
            <div className="flex flex-wrap gap-2">
              {STATUS_FLOW.map((s) => (
                <button key={s} disabled={s === incident.status}
                  className={`text-xs px-2 py-1 rounded ${s === incident.status ? "bg-slate-200" : "bg-slate-50 hover:bg-slate-100"}`}
                  onClick={() => setStatus(s)}>{s.replace("_", " ")}</button>
              ))}
            </div>
            {["super_admin", "committee"].includes(user?.role) && (
              <div>
                <label className="label">Assign to maintenance staff</label>
                <select className="input" defaultValue={incident.assigned_to || ""} onChange={(e) => assign(e.target.value)}>
                  <option value="">— select —</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            )}
            {hasFeature("sla") && !["resolved", "closed"].includes(incident.status) && (
              <div className="flex items-center gap-2 pt-1">
                <button onClick={escalate} className="btn-secondary text-xs">
                  ⏫ Escalate{incident.escalation_level > 0 ? ` (currently L${incident.escalation_level})` : ""}
                </button>
                <span className="text-[11px] text-muted">Bumps to the next tier and raises priority.</span>
              </div>
            )}
          </div>
        )}

        <div className="border-t border-slate-100 pt-3">
          <div className="text-xs font-semibold text-slate-600 mb-2">Comments</div>
          <div className="space-y-2 max-h-48 overflow-auto">
            {comments.map((c) => (
              <div key={c.id} className="text-sm">
                <span className="font-medium">{c.author_name}</span>
                <span className="text-xs text-slate-400 ml-2">{c.created_at?.slice(0, 16).replace("T", " ")}</span>
                <div className="text-slate-600">{c.body}</div>
              </div>
            ))}
            {comments.length === 0 && <div className="text-xs text-slate-400">No comments yet.</div>}
          </div>
          <div className="mt-2 flex gap-2">
            <input className="input flex-1" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" />
            <button className="btn-primary" onClick={addComment}>Send</button>
          </div>
        </div>
      </div>

      {lightboxSrc && (
        <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}>
          <img src={lightboxSrc} alt="" className="max-h-full max-w-full rounded shadow-lg" />
          <button onClick={() => setLightboxSrc(null)}
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 text-slate-800 text-xl">×</button>
        </div>
      )}
    </Modal>
  );
}
