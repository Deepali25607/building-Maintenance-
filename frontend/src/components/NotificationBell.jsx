import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client.js";

const TYPE_ICON = {
  bill_generated: "🧾",
  payment_received: "💰",
  complaint_raised: "🛠",
  complaint_resolved: "✅",
  announcement_published: "📣",
  visitor_arrival: "🚶",
  visitor_checked_in: "🚪",
  visitor_approved: "✅",
  visitor_denied: "🚫",
};

// created_at is SQLite UTC "YYYY-MM-DD HH:MM:SS" → relative time.
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

// `align` controls which way the dropdown opens so it stays on-screen:
//   "left"  → opens rightward (use when the bell sits near the left edge)
//   "right" → opens leftward  (use when the bell sits near the right edge)
export default function NotificationBell({ align = "right" }) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  function refreshCount() {
    api.get("/notifications/unread-count").then((r) => setUnread(r.data.unread_count)).catch(() => {});
  }

  // Poll the unread badge; cache stays warm at 45s.
  useEffect(() => {
    refreshCount();
    const t = setInterval(refreshCount, 45000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      api.get("/notifications?limit=20")
        .then((r) => { setItems(r.data.notifications); setUnread(r.data.unread_count); })
        .finally(() => setLoading(false));
    }
  }

  async function openItem(n) {
    if (!n.read) {
      await api.post(`/notifications/${n.id}/read`).catch(() => {});
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, read: 1 } : x)));
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) nav(n.link);
  }

  async function markAll() {
    await api.post("/notifications/read-all").catch(() => {});
    setItems((xs) => xs.map((x) => ({ ...x, read: 1 })));
    setUnread(0);
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={toggle}
        title="Notifications"
        className="relative w-8 h-8 rounded-full border border-line hover:bg-surface-2 flex items-center justify-center text-base shrink-0">
        🔔
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute ${align === "left" ? "left-0" : "right-0"} mt-2 w-80 max-w-[calc(100vw-1.5rem)] bg-surface border border-line rounded-lg shadow-lg z-50 overflow-hidden`}>
          <div className="flex items-center justify-between px-3 py-2 border-b border-line">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="text-xs text-brand-700 hover:underline">Mark all read</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="text-xs text-muted text-center py-8">Loading…</div>
            ) : items.length === 0 ? (
              <div className="text-xs text-muted text-center py-8">No notifications yet.</div>
            ) : (
              items.map((n) => (
                <button key={n.id} onClick={() => openItem(n)}
                  className={`w-full text-left px-3 py-2.5 border-b border-line/60 hover:bg-surface-2 flex gap-2.5 ${n.read ? "" : "bg-brand-50/40"}`}>
                  <span className="text-lg leading-none mt-0.5 shrink-0">{TYPE_ICON[n.type] || "🔔"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={`text-sm truncate ${n.read ? "text-fg/80" : "font-semibold"}`}>{n.title}</span>
                      {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 shrink-0" />}
                    </span>
                    {n.body && <span className="block text-xs text-muted line-clamp-2">{n.body}</span>}
                    <span className="block text-[10px] text-muted mt-0.5">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
