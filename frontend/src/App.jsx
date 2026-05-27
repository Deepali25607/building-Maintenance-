import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import Layout from "./components/Layout.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Platform from "./pages/Platform.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Bills from "./pages/Bills.jsx";
import Incidents from "./pages/Incidents.jsx";
import Expenses from "./pages/Expenses.jsx";
import Vendors from "./pages/Vendors.jsx";
import Flats from "./pages/Flats.jsx";
import Users from "./pages/Users.jsx";
import Announcements from "./pages/Announcements.jsx";
import Reports from "./pages/Reports.jsx";
import ThemePage from "./pages/Theme.jsx";
import Profile from "./pages/Profile.jsx";

function Shell() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout />;
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route element={<Shell />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/bills"        element={<ProtectedRoute need={["bills","view"]}><Bills /></ProtectedRoute>} />
          <Route path="/incidents"    element={<ProtectedRoute need={["incidents","view"]}><Incidents /></ProtectedRoute>} />
          <Route path="/expenses"     element={<ProtectedRoute need={["expenses","view"]}><Expenses /></ProtectedRoute>} />
          <Route path="/vendors"      element={<ProtectedRoute need={["vendors","view"]}><Vendors /></ProtectedRoute>} />
          <Route path="/flats"        element={<ProtectedRoute need={["flats","view"]}><Flats /></ProtectedRoute>} />
          <Route path="/users"        element={<ProtectedRoute need={["users","view"]}><Users /></ProtectedRoute>} />
          <Route path="/announcements" element={<ProtectedRoute need={["announcements","view"]}><Announcements /></ProtectedRoute>} />
          <Route path="/reports"      element={<ProtectedRoute need={["reports","view"]}><Reports /></ProtectedRoute>} />
          <Route path="/theme"        element={<ProtectedRoute need={["theme","view"]}><ThemePage /></ProtectedRoute>} />
          <Route path="/profile"      element={<Profile />} />
          <Route path="/platform"     element={<ProtectedRoute roles={["super_admin"]}><Platform /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </ThemeProvider>
    </AuthProvider>
  );
}
