import { createContext, useContext, useEffect, useState } from "react";
import api from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem("user");
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token && !user) {
      api.get("/auth/me").then((r) => {
        setUser(r.data.user);
        localStorage.setItem("user", JSON.stringify(r.data.user));
      }).catch(() => {});
    }
  }, []);

  async function login(email, password) {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  }

  async function refreshUser() {
    const { data } = await api.get("/auth/me");
    localStorage.setItem("user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }

  // Called by the org-signup flow after the backend returns { token, user }.
  // Persists both so the new admin lands authenticated, skipping login.
  function setAfterSignup(token, freshUser) {
    localStorage.setItem("token", token);
    localStorage.setItem("user", JSON.stringify(freshUser));
    setUser(freshUser);
  }

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("viewing_org_id"); // drop any platform-admin impersonation
    setUser(null);
  }

  function can(module, action) {
    if (!user) return false;
    // Platform operator (super_admin) has no tenant-data permissions — mirrors
    // the backend. Their access is the Platform admin area only.
    const perms = user.permissions || {};
    if (perms._all) return true;
    return !!perms?.[module]?.[action];
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, can, refreshUser, setAfterSignup }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
