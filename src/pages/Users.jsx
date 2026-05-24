import { useEffect, useState } from "react";
import api from "../api/client.js";
import Modal from "../components/Modal.jsx";
import { useAuth } from "../context/AuthContext.jsx";

const ROLES = ["super_admin", "committee", "treasurer", "resident", "maintenance"];

export default function Users() {
  const { can, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [openNew, setOpenNew] = useState(false);
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
          <button className="btn-primary" onClick={() => setOpenNew(true)}>+ Add user</button>
        )}
      </div>

      <div className="card overflow-hidden">
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
