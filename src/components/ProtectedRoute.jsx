import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

/**
 * Two ways to gate a route:
 *   <ProtectedRoute need={["expenses","view"]}> ...  — permission-based (preferred)
 *   <ProtectedRoute roles={["super_admin"]}>    ...  — strict role-based (use sparingly)
 *
 * If both are provided, the user must satisfy both.
 */
export default function ProtectedRoute({ children, roles, need }) {
  const { user, can } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  if (need && !can(need[0], need[1])) return <Navigate to="/" replace />;
  return children;
}
