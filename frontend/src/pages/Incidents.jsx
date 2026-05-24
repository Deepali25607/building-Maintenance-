import { useEffect, useState } from "react";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import Modal from "../components/Modal.jsx";

const STATUS_FLOW = ["open", "assigned", "in_progress", "resolved", "closed"];

export default function Incidents() {
  const { user } = useAuth();
  const [list, setList] = useState([]);
  const [categories, setCategories] = useState([]);
  const [staff, setStaff] = useState([]);
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState(null);

  function load() {
    api.get("/incidents").then((r) => setList(r.data.incidents));
  }

  useEffect(() => {
    load();
    api.get("/incidents/categories").then((r) => setCategories(r.data.categories));
    if (["super_admin", "committee"].includes(user?.role)) {
      api.get("/users").then((r) => setStaff(r.data.users.filter((u) => u.role === "maintenance")));
    }
  }, [user?.role]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Incidents</h1>
          <p className="text-slate-500 text-sm">Raise, track, and resolve community issues.</p>
        </div>
        <button className="btn-primary" onClick={() => setNewOpen(true)}>+ Raise incident</button>
      </div>

      <div className="card overflow-hidden">
        <table className="table">
          <thead>
            <tr>
              <th>#</th><th>Title</th><th>Category</th><th>Priority</th><th>Status</th><th>Raised by</th><th>Assigned to</th><th>Created</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan="8" className="text-center text-slate-400 py-8">No incidents.</td></tr>}
            {list.map((i) => (
              <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setDetail(i)}>
                <td>#{i.id}</td>
                <td className="font-medium">{i.title}</td>
                <td>{i.category}</td>
                <td><StatusBadge value={i.priority} /></td>
                <td><StatusBadge value={i.status} /></td>
                <td className="text-slate-500">{i.raised_by_name}</td>
                <td className="text-slate-500">{i.assigned_to_name || "—"}</td>
                <td className="text-slate-500 text-xs">{i.created_at?.slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewIncident open={newOpen} onClose={() => setNewOpen(false)} categories={categories} onCreated={load} />
      <IncidentDetail incident={detail} onClose={() => setDetail(null)} staff={staff} onUpdated={load} />
    </div>
  );
}

function NewIncident({ open, onClose, categories, onCreated }) {
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
  const { user } = useAuth();
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
        <div className="flex gap-2 flex-wrap text-sm">
          <StatusBadge value={incident.status} />
          <StatusBadge value={incident.priority} />
          <span className="badge bg-slate-100 text-slate-700">{incident.category}</span>
        </div>
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
