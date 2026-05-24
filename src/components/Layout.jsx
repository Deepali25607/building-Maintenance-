import { NavLink, Outlet, useNavigate } from "react-router-dom";
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
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const { mode, toggleMode } = useTheme();
  const nav = useNavigate();
  const items = NAV.filter((i) => !i.need || can(i.need[0], i.need[1]));

  return (
    <div className="flex h-full">
      <aside className="w-60 bg-surface border-r border-line flex flex-col">
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
        <nav className="flex-1 px-2 py-3 space-y-0.5">
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
          <div className="text-sm font-medium">{user?.name}</div>
          <div className="text-xs text-muted mb-2">{ROLE_LABELS[user?.role] || user?.role}</div>
          <button onClick={() => { logout(); nav("/login"); }} className="btn-secondary w-full justify-center text-xs">Sign out</button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
