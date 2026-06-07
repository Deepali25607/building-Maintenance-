import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import NotificationBell from "./NotificationBell.jsx";
import ChatbotWidget from "./ChatbotWidget.jsx";

const ROLE_LABELS = {
  super_admin: "Super Admin",
  committee: "Committee",
  treasurer: "Treasurer",
  resident: "Resident",
  maintenance: "Maintenance Staff",
};

const NAV = [
  { to: "/", label: "Dashboard", icon: "📊", hideForPlatform: true }, // org dashboard — not for the platform operator
  { to: "/bills", label: "Maintenance Bills", icon: "💳", need: ["bills", "view"] },
  { to: "/incidents", label: "Incidents", icon: "🛠", need: ["incidents", "view"] },
  { to: "/expenses", label: "Expenses", icon: "💸", need: ["expenses", "view"] },
  { to: "/vendors", label: "Vendors", icon: "🤝", need: ["vendors", "view"] },
  { to: "/visitors", label: "Visitors", icon: "🚶", need: ["visitors", "view"] },
  { to: "/towers", label: "Towers", icon: "🏗️", need: ["towers", "view"] },
  { to: "/flats", label: "Flats", icon: "🏢", need: ["flats", "view"] },
  { to: "/users", label: "Users", icon: "👥", need: ["users", "view"] },
  { to: "/announcements", label: "Announcements", icon: "📣", need: ["announcements", "view"] },
  { to: "/accounting", label: "Accounting", icon: "💰", need: ["reports", "view"] },
  { to: "/reports", label: "Reports", icon: "📈", need: ["reports", "view"] },
  { to: "/theme", label: "Theme", icon: "🎨", need: ["theme", "view"] },
  { to: "/contact", label: "Help & Contact", icon: "💬", need: ["contact", "view"] }, // reach the platform team
  { to: "/profile", label: "My Profile", icon: "👤" }, // always visible — self-service
  { to: "/platform", label: "Platform", icon: "🛰️", platformOnly: true }, // super_admin only
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const { mode, toggleMode } = useTheme();
  const nav = useNavigate();
  const location = useLocation();
  const isPlatformAdmin = user?.role === "super_admin";
  const items = NAV.filter((i) => {
    if (i.platformOnly) return isPlatformAdmin;
    if (i.hideForPlatform && isPlatformAdmin) return false;
    if (i.need) return can(i.need[0], i.need[1]);
    return true;
  });

  // Mobile drawer state — desktop ignores this and keeps sidebar always-on.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sidebar side preference (left/right) — personal, saved locally like the theme.
  const [side, setSide] = useState(() =>
    (typeof window !== "undefined" && localStorage.getItem("sidebar_side") === "right") ? "right" : "left"
  );
  const isRight = side === "right";
  function flipSide() {
    setSide((cur) => {
      const next = cur === "left" ? "right" : "left";
      localStorage.setItem("sidebar_side", next);
      return next;
    });
  }

  // Auto-close the drawer whenever route changes (tapping a nav link).
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  // Lock body scroll while the drawer is open on mobile.
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [drawerOpen]);

  const sidebar = (
    <aside className={`w-60 bg-surface ${isRight ? "border-l" : "border-r"} border-line flex flex-col h-full`}>
      <div className="px-5 py-5 border-b border-line flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-xl font-semibold text-brand-700 leading-tight truncate">
            {user?.apartment?.name || "Apartment Community"}
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-accent mt-0.5 truncate">
            {user?.apartment?.tagline || "Resident Portal"}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <NotificationBell align={isRight ? "right" : "left"} />
          <button onClick={toggleMode}
            title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="w-8 h-8 rounded-full border border-line hover:bg-surface-2 flex items-center justify-center text-base shrink-0">
            {mode === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
        {items.map((i) => (
          <NavLink
            key={i.to}
            to={i.to}
            end={i.to === "/"}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded text-sm ${
                isActive ? "bg-brand-50 text-brand-700 font-medium" : "text-fg/80 hover:bg-surface-2"
              }`
            }
          >
            <span>{i.icon}</span> <span>{i.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-line">
        <div className="text-sm font-medium truncate">{user?.name}</div>
        <div className="text-xs text-muted mb-2">{ROLE_LABELS[user?.role] || user?.role}</div>
        <button onClick={flipSide}
          title="Move the sidebar to the other side"
          className="btn-secondary w-full justify-center text-xs mb-2">
          {isRight ? "← Move sidebar to left" : "Move sidebar to right →"}
        </button>
        <button onClick={() => { logout(); nav("/login"); }} className="btn-secondary w-full justify-center text-xs">Sign out</button>
      </div>
    </aside>
  );

  // Optional org-wide background image. A theme-coloured scrim is laid over it so
  // page text stays readable in both light and dark mode. Opaque panels (sidebar,
  // cards) sit on top; the image shows through the transparent content gaps.
  const bgUrl = user?.apartment?.background_url;

  return (
    <div className={`flex h-full ${isRight ? "md:flex-row-reverse" : ""}`}>
      {bgUrl && (
        <div
          className="fixed inset-0 -z-10 bg-center bg-cover"
          style={{ backgroundImage: `linear-gradient(rgb(var(--page-bg) / 0.80), rgb(var(--page-bg) / 0.80)), url("${bgUrl}")` }}
          aria-hidden="true"
        />
      )}
      {/* Desktop: persistent sidebar */}
      <div className="hidden md:flex md:h-full">{sidebar}</div>

      {/* Mobile: drawer + backdrop */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-40"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={`md:hidden fixed inset-y-0 ${isRight ? "right-0" : "left-0"} z-50 transform transition-transform duration-200 ${
          drawerOpen ? "translate-x-0" : isRight ? "translate-x-full" : "-translate-x-full"
        }`}
      >
        {sidebar}
      </div>

      <main className="flex-1 overflow-auto">
        {/* Mobile top bar with hamburger — hidden on md+ */}
        <header className="md:hidden sticky top-0 z-30 bg-surface border-b border-line flex items-center gap-3 px-3 py-2">
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="w-10 h-10 rounded-md border border-line hover:bg-surface-2 flex items-center justify-center text-lg"
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <div className="font-display text-base font-semibold text-brand-700 leading-tight truncate">
              {user?.apartment?.name || "Apartment Community"}
            </div>
          </div>
          <NotificationBell />
          <button onClick={toggleMode}
            title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="w-9 h-9 rounded-full border border-line hover:bg-surface-2 flex items-center justify-center text-base shrink-0">
            {mode === "dark" ? "☀️" : "🌙"}
          </button>
        </header>

        {user?.role === "org_admin" && user?.apartment?.plan === "trial" && (
          <div className={`px-3 sm:px-6 py-2 text-sm border-b flex items-center justify-between gap-3 ${
            user.apartment.trial_expired
              ? "bg-red-50 border-red-300 text-red-800"
              : "bg-amber-50 border-amber-300 text-amber-900"}`}>
            <span>
              {user.apartment.trial_expired
                ? "⚠ Your free trial has ended — subscribe to a plan to keep full access."
                : `✨ Free trial — ${user.apartment.trial_days_left} day${user.apartment.trial_days_left === 1 ? "" : "s"} left.`}
            </span>
          </div>
        )}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
          <Outlet />
        </div>
      </main>

      {/* Always-available support assistant for organization admins. */}
      {user?.role === "org_admin" && <ChatbotWidget />}
    </div>
  );
}
