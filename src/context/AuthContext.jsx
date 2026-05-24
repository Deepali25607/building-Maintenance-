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

  function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
  }

  function can(module, action) {
    if (!user) return false;
    if (user.role === "super_admin") return true;
    const perms = user.permissions || {};
    if (perms._all) return true;
    return !!perms?.[module]?.[action];
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, can, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
