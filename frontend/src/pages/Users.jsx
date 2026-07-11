import { useEffect, useState } from "react";
import api from "../api/client.js";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const ROLES = ["super_admin", "committee", "treasurer", "resident", "maintenance"];

export default function Users() {
  const { can, hasFeature, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [openNew, setOpenNew] = useState(false);
  const [openImport, setOpenImport] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [permTarget, setPermTarget] = useState(null);
  const [meta, setMeta] = useState(null);

  function load() {
    api.get("/users").then((r) => setUsers(r.data.users));
  }
  useEffect(() => {
    load();
    api.get("/users/permissions/meta").then((r) => setMeta(r.data)).catch(() => {});
  }, []);

  async function toggleActive(u) {
    await api.patch(`/users/${u.id}`, { active: u.active ? 0 : 1 });
    load();
  }

  const canEditUsers = can("users", "edit");
  const canCreateUsers = can("users", "create");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-slate-500 text-sm">Residents, committee, treasurer, and maintenance staff.</p>
        </div>
        {canCreateUsers && (
          <div className="flex gap-2">
            {hasFeature("bulk_import") && (
              <button className="btn-secondary" onClick={() => setOpenImport(true)}>⬆ Import residents</button>
            )}
            <button className="btn-primary" onClick={() => setOpenNew(true)}>+ Add user</button>
          </div>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Permissions</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="font-medium">{u.name}</td>
                <td>{u.email}</td>
                <td className="text-slate-500">{u.phone || "—"}</td>
                <td><span className="badge bg-slate-100 text-slate-700">{u.role}</span></td>
                <td>
                  {u.role === "super_admin" ? (
                    <span className="badge bg-brand-100 text-brand-700">all access</span>
                  ) : u.permissions ? (
                    <span className="badge bg-purple-100 text-purple-700">custom</span>
                  ) : (
                    <span className="badge bg-slate-100 text-slate-600">role defaults</span>
                  )}
                </td>
                <td>{u.active ? <span className="badge bg-emerald-100 text-emerald-700">active</span> : <span className="badge bg-slate-200 text-slate-600">disabled</span>}</td>
                <td className="text-right space-x-1 whitespace-nowrap">
                  {canEditUsers && (
                    <button className="btn-secondary text-xs" onClick={() => setEditTarget(u)}>✏️ Edit</button>
                  )}
                  {canEditUsers && u.role !== "super_admin" && (
                    <button className="btn-secondary text-xs" onClick={() => setPermTarget(u)}>🔑 Permissions</button>
                  )}
                  {canEditUsers && currentUser?.id !== u.id && (
                    <button className="btn-secondary text-xs" onClick={() => toggleActive(u)}>{u.active ? "Disable" : "Enable"}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <NewUser open={openNew} onClose={() => setOpenNew(false)} onCreated={load} meta={meta} />
      <BulkImport open={openImport} onClose={() => setOpenImport(false)} onImported={load} />
      <EditUser
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={load}
        canChangeRole={currentUser?.role === "super_admin"}
        isSelf={editTarget?.id === currentUser?.id}
      />
      <PermissionsModal user={permTarget} meta={meta} onClose={() => setPermTarget(null)} onSaved={load} />
    </div>
  );
}

function EditUser({ target, onClose, onSaved, canChangeRole, isSelf }) {
  const [form, setForm] = useState({ name: "", phone: "", role: "resident", active: 1 });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!target) return;
    setForm({
      name: target.name || "",
      phone: target.phone || "",
      role: target.role,
      active: target.active ?? 1,
    });
    setErr("");
  }, [target]);

  if (!target) return null;

  async function submit() {
    setErr("");
    setBusy(true);
    try {
      const payload = { name: form.name, phone: form.phone };
      if (canChangeRole && !isSelf) {
        payload.role = form.role;
        payload.active = form.active ? 1 : 0;
      }
      await api.patch(`/users/${target.id}`, payload);
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!target} onClose={onClose}
      title={`Edit user — ${target.name}`}
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </button>
      </>}>
      <div className="space-y-3">
        <div>
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" value={target.email} disabled />
          <p className="text-[11px] text-slate-400 mt-1">Email is the login identifier and can't be changed here.</p>
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.role}
            disabled={!canChangeRole || isSelf}
            onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
          {!canChangeRole && (
            <p className="text-[11px] text-slate-400 mt-1">Only super admin can change roles.</p>
          )}
          {isSelf && (
            <p className="text-[11px] text-amber-700 mt-1">You can't change your own role.</p>
          )}
        </div>
        {canChangeRole && !isSelf && (
          <label className="flex items-center gap-2 text-sm pt-1">
            <input type="checkbox" checked={!!form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked ? 1 : 0 })} />
            Active (user can sign in)
          </label>
        )}
        <p className="text-xs text-slate-500 pt-1 border-t border-slate-100">
          For profile fields (photo, occupation, family, vehicle), open the resident's flat → "✏️ Edit profile".
        </p>
        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

// ─── Bulk import ──────────────────────────────────────────────────────────

// Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes ("")
// and commas/newlines inside quotes. Returns an array of string arrays.
function parseCsv(text) {
  const rows = [];
  let field = "", record = [], inQuotes = false, i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ",") { record.push(field); field = ""; i++; continue; }
    if (c === "\r") { i++; continue; }
    if (c === "\n") { record.push(field); rows.push(record); record = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length || record.length) { record.push(field); rows.push(record); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const HEADER_ALIASES = {
  name: "name", "full name": "name",
  email: "email", "email id": "email", "e-mail": "email",
  phone: "phone", mobile: "phone", contact: "phone", "contact number": "phone",
  role: "role",
  flat: "flat_number", "flat no": "flat_number", "flat number": "flat_number", flat_number: "flat_number", unit: "flat_number",
  block: "block", wing: "block",
  monthly_rate: "monthly_rate", "monthly rate": "monthly_rate", rate: "monthly_rate", maintenance: "monthly_rate",
  password: "password",
};

const TEMPLATE = `name,email,phone,role,block,flat_number,monthly_rate
Asha Rao,asha.rao@example.com,9876500001,resident,A,101,3500
Vikram Shah,vikram.shah@example.com,9876500002,resident,A,102,3500
Neha Gupta,neha.gupta@example.com,,resident,B,201,4000`;

function csvToRows(text) {
  const grid = parseCsv(text);
  if (grid.length < 2) return { rows: [], headerError: grid.length === 1 ? "Add at least one data row below the header." : "" };
  const headers = grid[0].map((h) => HEADER_ALIASES[h.trim().toLowerCase()] || null);
  if (!headers.includes("name") || !headers.includes("email")) {
    return { rows: [], headerError: "Header row must include at least 'name' and 'email' columns." };
  }
  const rows = grid.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((key, idx) => { if (key) obj[key] = (cells[idx] ?? "").trim(); });
    return obj;
  });
  return { rows, headerError: "" };
}

function BulkImport({ open, onClose, onImported }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const { rows, headerError } = open ? csvToRows(text) : { rows: [], headerError: "" };

  function reset() { setText(""); setResult(null); setErr(""); }

  async function submit() {
    setErr(""); setBusy(true);
    try {
      const r = await api.post("/users/bulk-import", { rows });
      setResult(r.data);
      onImported?.();
    } catch (e) {
      setErr(e.response?.data?.error || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function copyCredentials() {
    const created = (result?.results || []).filter((r) => r.status === "created" && r.temp_password);
    const text = created.map((r) => `${r.email}\t${r.temp_password}`).join("\n");
    navigator.clipboard?.writeText(text);
  }

  return (
    <Modal open={open} onClose={() => { onClose(); reset(); }} title="Bulk import residents"
      footer={result ? (
        <>
          <button className="btn-secondary" onClick={() => setResult(null)}>Import more</button>
          <div className="flex-1" />
          <button className="btn-primary" onClick={() => { onClose(); reset(); }}>Done</button>
        </>
      ) : (
        <>
          <button className="btn-secondary" onClick={() => { onClose(); reset(); }} disabled={busy}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={busy || rows.length === 0}>
            {busy ? "Importing…" : `Import ${rows.length || ""} resident${rows.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}>
      {result ? (
        <div className="space-y-3 max-h-[70vh] overflow-y-auto px-1 -mx-1">
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <ResultStat label="Created" value={result.summary.created} tone="green" />
            <ResultStat label="Skipped" value={result.summary.skipped} tone="amber" />
            <ResultStat label="Failed" value={result.summary.failed} tone={result.summary.failed ? "red" : undefined} />
          </div>
          <div className="text-xs text-muted text-center">
            {result.summary.flats_created} flats created · {result.summary.flats_linked} flats linked
          </div>
          {result.results.some((r) => r.status === "created" && r.temp_password) && (
            <button className="btn-secondary text-xs w-full justify-center" onClick={copyCredentials}>
              📋 Copy new logins (email + temp password)
            </button>
          )}
          <div className="rounded-md border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr><th className="text-left px-2 py-1.5">#</th><th className="text-left px-2 py-1.5">Email</th>
                  <th className="text-left px-2 py-1.5">Status</th><th className="text-left px-2 py-1.5">Temp password</th>
                  <th className="text-left px-2 py-1.5">Note</th></tr>
              </thead>
              <tbody>
                {result.results.map((r) => (
                  <tr key={r.row} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{r.row}</td>
                    <td className="px-2 py-1.5">{r.email || "—"}</td>
                    <td className="px-2 py-1.5">
                      <span className={`badge ${r.status === "created" ? "bg-emerald-100 text-emerald-700" : r.status === "skipped" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>{r.status}</span>
                    </td>
                    <td className="px-2 py-1.5 font-mono">{r.temp_password || "—"}</td>
                    <td className="px-2 py-1.5 text-slate-500">{r.message || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Paste a CSV with a header row. Required columns: <span className="font-mono">name</span>, <span className="font-mono">email</span>.
            Optional: <span className="font-mono">phone, role, block, flat_number, monthly_rate, password</span>.
          </p>
          <ul className="text-[11px] text-muted list-disc pl-4 space-y-0.5">
            <li>Role defaults to <span className="font-mono">resident</span> (admins can't be bulk-created).</li>
            <li>Leave <span className="font-mono">password</span> blank to auto-generate a temp password per resident.</li>
            <li>If <span className="font-mono">flat_number</span> is given, the flat is created (or linked if it already exists, when vacant).</li>
          </ul>
          <button className="text-xs text-brand-700 hover:underline" onClick={() => setText(TEMPLATE)}>Load sample template</button>
          <textarea className="input min-h-[160px] font-mono text-xs" value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="name,email,phone,role,block,flat_number,monthly_rate&#10;Asha Rao,asha@example.com,9876500001,resident,A,101,3500" />
          {headerError ? (
            <div className="text-sm text-amber-700">{headerError}</div>
          ) : (
            <div className="text-xs text-muted">{rows.length} row{rows.length === 1 ? "" : "s"} ready to import.</div>
          )}
          {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
      )}
    </Modal>
  );
}

function ResultStat({ label, value, tone }) {
  const tones = { green: "text-emerald-600", amber: "text-amber-600", red: "text-red-600" };
  return (
    <div className="rounded-md bg-slate-50 px-2 py-2">
      <div className={`text-xl font-bold ${tones[tone] || "text-slate-700"}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

function buildBlankMatrix(modules, actions) {
  const out = {};
  for (const m of modules) {
    out[m] = {};
    for (const a of actions) out[m][a] = false;
  }
  return out;
}

function NewUser({ open, onClose, onCreated, meta }) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "committee" });
  const [customizePerms, setCustomizePerms] = useState(false);
  const [perms, setPerms] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!meta) return;
    setPerms(buildBlankMatrix(meta.modules, meta.actions));
  }, [meta, open]);

  function toggle(m, a) {
    setPerms({ ...perms, [m]: { ...perms[m], [a]: !perms[m][a] } });
  }

  async function submit() {
    setErr("");
    try {
      const r = await api.post("/users", form);
      const newId = r.data.user.id;
      if (customizePerms && perms && form.role !== "super_admin") {
        await api.put(`/users/${newId}/permissions`, { permissions: perms });
      }
      onCreated();
      onClose();
      setForm({ name: "", email: "", phone: "", password: "", role: "committee" });
      setCustomizePerms(false);
    } catch (e) {
      setErr(e.response?.data?.error || "Failed");
    }
  }

  const showPermsBlock = customizePerms && perms && form.role !== "super_admin";

  return (
    <Modal open={open} onClose={onClose} title="Add user"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={submit}>Create</button>
      </>}>
      <div className="space-y-3 max-h-[70vh] overflow-y-auto px-1 -mx-1">
        <div>
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div>
          <label className="label">Role</label>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>

        {form.role !== "super_admin" && meta && (
          <label className="flex items-center gap-2 text-sm pt-2 border-t border-slate-100">
            <input type="checkbox" checked={customizePerms} onChange={(e) => setCustomizePerms(e.target.checked)} />
            Customize module permissions <span className="text-slate-400">(otherwise uses {form.role} defaults)</span>
          </label>
        )}

        {showPermsBlock && (
          <PermissionMatrix
            modules={meta.modules}
            actions={meta.actions}
            value={perms}
            onToggle={toggle}
          />
        )}

        {err && <div className="text-sm text-red-600">{err}</div>}
      </div>
    </Modal>
  );
}

function PermissionsModal({ user, meta, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [perms, setPerms] = useState(null);
  const [isCustom, setIsCustom] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!user || !meta) return;
    api.get(`/users/${user.id}/permissions`).then((r) => {
      setData(r.data);
      setIsCustom(r.data.is_custom);
      const base = r.data.permissions || r.data.role_default || {};
      // Materialize to full matrix so checkboxes render predictably
      const full = buildBlankMatrix(meta.modules, meta.actions);
      if (base._all) {
        for (const m of meta.modules) for (const a of meta.actions) full[m][a] = true;
      } else {
        for (const m of meta.modules) for (const a of meta.actions) full[m][a] = !!base?.[m]?.[a];
      }
      setPerms(full);
      setErr("");
    });
  }, [user, meta]);

  if (!user) return null;

  function toggle(m, a) {
    setPerms({ ...perms, [m]: { ...perms[m], [a]: !perms[m][a] } });
    setIsCustom(true);
  }

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await api.put(`/users/${user.id}/permissions`, { permissions: perms });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!confirm("Reset to role defaults? Custom permissions will be cleared.")) return;
    setBusy(true);
    try {
      await api.put(`/users/${user.id}/permissions`, { permissions: null });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e.response?.data?.error || "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!user} onClose={onClose}
      title={`Permissions — ${user.name} (${user.role})`}
      footer={<>
        <button className="btn-secondary" onClick={reset} disabled={busy || !isCustom}>Reset to role defaults</button>
        <div className="flex-1" />
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </>}>
      {!perms || !meta ? (
        <div className="text-slate-400 text-sm py-6 text-center">Loading…</div>
      ) : (
        <div className="space-y-3 max-h-[65vh] overflow-y-auto px-1 -mx-1">
          <div className="text-xs text-slate-500">
            Toggle per-module access. Currently using{" "}
            <span className="font-semibold">{isCustom ? "custom" : `${user.role} defaults`}</span>.
          </div>
          <PermissionMatrix
            modules={meta.modules}
            actions={meta.actions}
            value={perms}
            onToggle={toggle}
          />
          {err && <div className="text-sm text-red-600">{err}</div>}
        </div>
      )}
    </Modal>
  );
}

function PermissionMatrix({ modules, actions, value, onToggle }) {
  return (
    <div className="rounded-md border border-slate-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50">
            <th className="text-left px-3 py-2 text-xs uppercase tracking-wide text-slate-600">Module</th>
            {actions.map((a) => (
              <th key={a} className="px-3 py-2 text-center text-xs uppercase tracking-wide text-slate-600">{a}</th>
            ))}
            <th className="px-3 py-2 text-right text-xs uppercase tracking-wide text-slate-600">All</th>
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => {
            const allOn = actions.every((a) => value[m]?.[a]);
            return (
              <tr key={m} className="border-t border-slate-100">
                <td className="px-3 py-2 font-medium capitalize">{m}</td>
                {actions.map((a) => (
                  <td key={a} className="px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!value[m]?.[a]}
                      onChange={() => onToggle(m, a)}
                    />
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <button type="button"
                    onClick={() => actions.forEach((a) => { if (!!value[m]?.[a] === allOn) onToggle(m, a); })}
                    className="text-xs text-brand-700 hover:underline">
                    {allOn ? "clear" : "all"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
