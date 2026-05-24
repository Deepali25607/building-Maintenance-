import axios from "axios";

// In dev, leave VITE_API_BASE_URL unset — Vite proxies "/api" to localhost:5000.
// In production, set VITE_API_BASE_URL to the deployed backend, e.g.
//   VITE_API_BASE_URL=https://building-maintenance-backend-dy07.onrender.com/api
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      if (!location.pathname.startsWith("/login")) location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
