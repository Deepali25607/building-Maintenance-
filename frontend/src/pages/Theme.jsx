import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../api/client.js";

export default function ThemePage() {
  const { user, can, refreshUser } = useAuth();
  const { theme, presets, mode, setMode, setThemeByKey, previewTokens, restore } = useTheme();
  const [savingKey, setSavingKey] = useState(null);
  const [previewKey, setPreviewKey] = useState(null);
  const [msg, setMsg] = useState("");

  // Theme picker (apply preset/custom) — gated by theme.edit permission
  const canEditTheme = can("theme", "edit");
  // Name/tagline/background — the community (org) admin manages these. The
  // platform operator no longer belongs to a community, so it's not them.
  const canEditBranding = canEditTheme;

  useEffect(() => () => restore(), []); // restore on unmount

  async function apply(key) {
    setSavingKey(key);
    setMsg("");
    try {
      const t = await setThemeByKey(key);
      setMsg(`Theme set to "${t.name}".`);
      setPreviewKey(null);
    } catch (e) {
      setMsg(e.response?.data?.error || "Failed to apply theme");
    } finally {
      setSavingKey(null);
    }
  }

  function hoverPreview(p) {
    if (!canEditTheme) return;
    setPreviewKey(p.key);
    previewTokens(p);
  }
  function endPreview() {
    setPreviewKey(null);
    restore();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-display">Branding & Theme</h1>
        <p className="text-muted text-sm">
          Customize the apartment name, tagline, and look. {canEditTheme ? "Changes apply for the whole community." : "Only users with theme permissions can change the look."}
        </p>
      </div>

      {canEditBranding && user?.apartment && (
        <BrandingEditor apartmentId={user.apartment.id}
          orgCode={user.apartment.org_code}
          initial={{ name: user.apartment.name, tagline: user.apartment.tagline, background_url: user.apartment.background_url }}
          onSaved={refreshUser} />
      )}

      {theme && (
        <div className="card p-4 mb-6 flex items-center gap-4 flex-wrap">
          <div className="flex gap-1">
            {theme.swatches?.map((c, i) => (
              <div key={i} className="w-8 h-8 rounded-md shadow-sm border border-white/60"
                style={{ background: c }} />
            ))}
          </div>
          <div className="flex-1 min-w-[180px]">
            <div className="text-xs text-muted uppercase tracking-wide">Current theme</div>
            <div className="font-display text-xl font-semibold">{theme.name}</div>
            <div className="text-xs text-muted italic">{theme.tagline}</div>
          </div>

          <div>
            <div className="text-xs text-muted uppercase tracking-wide mb-1">Display mode</div>
            <div className="inline-flex rounded-md overflow-hidden border border-line">
              <button onClick={() => setMode("light")}
                className={`px-3 py-1.5 text-xs font-medium ${mode === "light" ? "bg-brand-600 text-white" : "bg-surface hover:bg-surface-2"}`}>
                ☀️ Light
              </button>
              <button onClick={() => setMode("dark")}
                className={`px-3 py-1.5 text-xs font-medium ${mode === "dark" ? "bg-brand-600 text-white" : "bg-surface hover:bg-surface-2"}`}>
                🌙 Dark
              </button>
            </div>
            <div className="text-[10px] text-muted mt-1">Personal preference — saved locally.</div>
          </div>
        </div>
      )}

      {msg && <div className="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm">{msg}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {presets.map((p) => {
          const isCurrent = theme?.key === p.key;
          const isPreviewing = previewKey === p.key;
          return (
            <div key={p.key}
              onMouseEnter={() => canEditTheme && hoverPreview(p)}
              onMouseLeave={() => canEditTheme && endPreview()}
              className={`card overflow-hidden cursor-default transition ${
                isCurrent ? "ring-2 ring-brand-500" : isPreviewing ? "ring-2 ring-amber-400" : ""
              }`}>
              <div className="h-20 relative" style={{
                background: `linear-gradient(135deg, ${p.swatches[0]} 0%, ${p.swatches[1]} 60%, ${p.swatches[2]} 100%)`,
              }}>
                {isCurrent && (
                  <div className="absolute top-2 right-2 badge bg-white/90 text-slate-800 text-[10px] font-bold uppercase tracking-wide">
                    ✓ Active
                  </div>
                )}
              </div>
              <div className="p-4">
                <div className="font-display text-lg font-semibold">{p.name}</div>
                <div className="text-xs text-slate-500 italic mb-2">{p.tagline}</div>
                <div className="text-xs text-slate-600 leading-relaxed">{p.description}</div>

                <div className="flex gap-1 mt-3">
                  {p.swatches.map((c, i) => (
                    <div key={i} className="w-6 h-6 rounded border border-white/60 shadow-sm" style={{ background: c }} />
                  ))}
                </div>

                {canEditTheme && (
                  <button
                    disabled={savingKey === p.key || isCurrent}
                    onClick={() => apply(p.key)}
                    className={`btn-primary text-xs mt-4 w-full justify-center ${
                      isCurrent ? "opacity-60 cursor-default" : ""
                    }`}>
                    {savingKey === p.key ? "Applying…" : isCurrent ? "Currently applied" : "Apply theme"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {canEditTheme && (
        <p className="text-xs text-muted mt-6 text-center">
          Hover any theme to preview it live. Move away to revert. Click "Apply" to make it permanent for everyone.
        </p>
      )}
    </div>
  );
}

function BrandingEditor({ apartmentId, orgCode, initial, onSaved }) {
  const { hasFeature } = useAuth();
  const canWhiteLabel = hasFeature("white_label");
  const [name, setName] = useState(initial.name || "");
  const [tagline, setTagline] = useState(initial.tagline || "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const [bg, setBg] = useState(initial.background_url || "");
  const [bgBusy, setBgBusy] = useState(false);
  const [bgErr, setBgErr] = useState("");

  // Background changes save immediately so the whole app updates on the spot.
  async function pickBackground(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgBusy(true); setBgErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await api.post("/uploads/background", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await api.patch(`/apartments/${apartmentId}`, { background_url: up.data.url });
      setBg(up.data.url);
      await onSaved?.();
    } catch (e2) {
      setBgErr(e2.response?.data?.error || "Upload failed");
    } finally {
      setBgBusy(false);
      e.target.value = "";
    }
  }

  async function removeBackground() {
    setBgBusy(true); setBgErr("");
    try {
      await api.patch(`/apartments/${apartmentId}`, { background_url: "" });
      setBg("");
      await onSaved?.();
    } catch (e2) {
      setBgErr(e2.response?.data?.error || "Failed to remove");
    } finally {
      setBgBusy(false);
    }
  }

  const dirty = name !== (initial.name || "") || tagline !== (initial.tagline || "");

  async function save() {
    setBusy(true);
    setMsg("");
    setErr("");
    try {
      await api.patch(`/apartments/${apartmentId}`, {
        name: name.trim() || undefined,
        tagline: tagline,
      });
      await onSaved?.();
      setMsg("Branding updated.");
    } catch (e) {
      setErr(e.response?.data?.error || "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  function revert() {
    setName(initial.name || "");
    setTagline(initial.tagline || "");
    setMsg(""); setErr("");
  }

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">Community branding</div>
          <h2 className="font-display text-xl font-semibold">Apartment identity</h2>
          {orgCode && (
            <div className="text-[11px] text-muted mt-1">
              Organization ID:{" "}
              <span className="font-mono text-slate-700">{orgCode}</span>
              <span className="text-muted"> · permanent, cannot be changed</span>
            </div>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-accent">{tagline || "—"}</div>
          <div className="font-display text-2xl font-semibold text-brand-700 leading-tight">{name || "Untitled"}</div>
          <div className="text-[10px] text-muted mt-0.5">Live preview</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Apartment name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Greenwood Heights" maxLength={80} />
        </div>
        <div>
          <label className="label">Tagline</label>
          <input className="input" value={tagline} onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. Premium Residences" maxLength={80} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button className="btn-primary" disabled={!dirty || busy || !name.trim()} onClick={save}>
          {busy ? "Saving…" : "Save branding"}
        </button>
        {dirty && (
          <button className="btn-secondary text-xs" onClick={revert} disabled={busy}>Revert</button>
        )}
        {msg && <span className="text-xs text-emerald-700">{msg}</span>}
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>

      <p className="text-[11px] text-muted mt-2">
        The name appears in the sidebar header, the login screen, and across resident emails. The tagline is the small accent line above the name.
      </p>

      <div className="mt-5 pt-4 border-t border-line">
        <div className="text-xs uppercase tracking-wide text-muted">Appearance</div>
        <h3 className="font-display text-base font-semibold mb-2">
          App background image
          {!canWhiteLabel && <span className="ml-2 align-middle text-[11px]">🔒</span>}
        </h3>
        {!canWhiteLabel ? (
          <p className="text-[12px] text-muted max-w-md">
            White-label branding (a custom app background) isn’t included in your current plan.
            {" "}<a href="/contact" className="text-brand-700 hover:underline">Contact us to upgrade</a>.
          </p>
        ) : (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="w-44 h-24 rounded-md border border-line overflow-hidden bg-surface-2 flex items-center justify-center text-xs text-muted shrink-0">
            {bg ? <img src={bg} alt="background preview" className="w-full h-full object-cover" /> : "No image"}
          </div>
          <div className="min-w-0">
            <label className="btn-secondary text-xs cursor-pointer">
              {bgBusy ? "Uploading…" : (bg ? "Change image" : "Upload image")}
              <input type="file" accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden" onChange={pickBackground} disabled={bgBusy} />
            </label>
            {bg && (
              <button type="button" onClick={removeBackground} disabled={bgBusy}
                className="ml-2 text-xs text-muted hover:text-red-600 hover:underline">
                Remove
              </button>
            )}
            <p className="text-[11px] text-muted mt-1 max-w-sm">
              Displayed across the whole app for everyone in your community, with a subtle theme overlay
              so text stays readable in light and dark mode. PNG/JPG/GIF/WEBP, up to 10MB.
            </p>
            {bgErr && <p className="text-[11px] text-red-600 mt-1">{bgErr}</p>}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
