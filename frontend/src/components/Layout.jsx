import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";

const ROLE_LABELS = {
  super_admin: "Super Admin",
  committee: "Committee",
  treasurer: "Treasurer",
  resident: "Resident",
  maintenance: "Maintenance Staff",
};

const NAV = [
  { to: "/", label: "Dashboard", icon: "📊" }, // always visible
  { to: "/bills", label: "Maintenance Bills", icon: "💳", need: ["bills", "view"] },
  { to: "/incidents", label: "Incidents", icon: "🛠", need: ["incidents", "view"] },
  { to: "/expenses", label: "Expenses", icon: "💸", need: ["expenses", "view"] },
  { to: "/vendors", label: "Vendors", icon: "🤝", need: ["vendors", "view"] },
  { to: "/flats", label: "Flats", icon: "🏢", need: ["flats", "view"] },
  { to: "/users", label: "Users", icon: "👥", need: ["users", "view"] },
  { to: "/announcements", label: "Announcements", icon: "📣", need: ["announcements", "view"] },
  { to: "/reports", label: "Reports", icon: "📈", need: ["reports", "view"] },
  { to: "/theme", label: "Theme", icon: "🎨", need: ["theme", "view"] },
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
    if (i.need) return can(i.need[0], i.need[1]);
    return true;
  });
  const viewingOrgId = typeof window !== "undefined" ? window.localStorage.getItem("viewing_org_id") : null;

  // Mobile drawer state — desktop ignores this and keeps sidebar always-on.
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    <aside className="w-60 bg-surface border-r border-line flex flex-col h-full">
      <div className="px-5 py-5 border-b border-line flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-xl font-semibold text-brand-700 leading-tight truncate">
            {user?.apartment?.name || "Apartment Community"}
          </div>
          <div className="text-[10px] uppercase tracking-[0.2em] text-accent mt-0.5 truncate">
            {user?.apartment?.tagline || "Resident Portal"}
          </div>
        </div>
        <button onClick={toggleMode}
          title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="w-8 h-8 rounded-full border border-line hover:bg-surface-2 flex items-center justify-center text-base shrink-0">
          {mode === "dark" ? "☀️" : "🌙"}
        </button>
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
        <button onClick={() => { logout(); nav("/login"); }} className="btn-secondary w-full justify-center text-xs">Sign out</button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-full">
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
        className={`md:hidden fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ${
          drawerOpen ? "translate-x-0" : "-translate-x-full"
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
          <button onClick={toggleMode}
            title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="w-9 h-9 rounded-full border border-line hover:bg-surface-2 flex items-center justify-center text-base shrink-0">
            {mode === "dark" ? "☀️" : "🌙"}
          </button>
        </header>

        {viewingOrgId && isPlatformAdmin && (
          <div className="bg-amber-50 border-b border-amber-300 px-3 sm:px-6 py-2 flex items-center justify-between gap-3 text-sm">
            <div className="text-amber-900 truncate">
              <span className="font-semibold">🛰️ Viewing as organization #{viewingOrgId}</span>
              <span className="hidden sm:inline ml-2 text-amber-700">— all queries are scoped to this tenant.</span>
            </div>
            <button
              onClick={() => { window.localStorage.removeItem("viewing_org_id"); window.location.reload(); }}
              className="text-xs text-amber-900 hover:underline whitespace-nowrap"
            >
              Exit view-as
            </button>
          </div>
        )}
        <div className="max-w-6xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
