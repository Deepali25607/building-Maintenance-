import { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import api from "../api/client.js";
import { useAuth } from "./AuthContext.jsx";

const ThemeContext = createContext(null);
const MODE_KEY = "ui_mode"; // "light" | "dark"
const SYS_MEDIA = "(prefers-color-scheme: dark)";

function getInitialMode() {
  const stored = localStorage.getItem(MODE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia(SYS_MEDIA).matches ? "dark" : "light";
}

function applyTokens(tokens) {
  if (!tokens) return;
  const root = document.documentElement;
  for (const [k, v] of Object.entries(tokens)) {
    root.style.setProperty(`--${k}`, v);
  }
}

function setDarkClass(on) {
  document.documentElement.classList.toggle("dark", !!on);
}

export function ThemeProvider({ children }) {
  const { user } = useAuth();
  const [theme, setTheme] = useState(null);
  const [presets, setPresets] = useState([]);
  const [mode, setMode] = useState(getInitialMode);
  const themeRef = useRef(null);

  useEffect(() => { themeRef.current = theme; }, [theme]);

  // Re-apply tokens whenever mode or theme changes
  function paint(currentTheme, currentMode) {
    if (!currentTheme) {
      setDarkClass(currentMode === "dark");
      return;
    }
    const tokens = currentMode === "dark" ? currentTheme.dark_tokens : currentTheme.light_tokens;
    applyTokens(tokens);
    setDarkClass(currentMode === "dark");
  }

  // On mode change: persist + re-paint with current theme
  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
    paint(themeRef.current, mode);
  }, [mode]);

  // Paint mode on initial mount even before theme arrives
  useEffect(() => { setDarkClass(mode === "dark"); }, []);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const [t, p] = await Promise.all([
        api.get("/theme"),
        api.get("/theme/presets"),
      ]);
      setTheme(t.data.theme);
      setPresets(p.data.presets);
      paint(t.data.theme, mode);
    } catch (e) {
      // silent — falls back to CSS defaults
    }
  }, [user, mode]);

  useEffect(() => { refresh(); }, [refresh]);

  async function setThemeByKey(key, custom = null) {
    const { data } = await api.put("/theme", { key, custom });
    setTheme(data.theme);
    paint(data.theme, mode);
    return data.theme;
  }

  function previewTokens(preset) {
    // preset has light_tokens + dark_tokens; pick matching mode
    const tokens = mode === "dark" ? preset.dark_tokens : preset.light_tokens;
    applyTokens(tokens);
  }
  function restore() {
    if (theme) paint(theme, mode);
  }

  function toggleMode() {
    setMode((m) => (m === "dark" ? "light" : "dark"));
  }
  function setModeExplicit(next) {
    if (next === "light" || next === "dark") setMode(next);
  }

  return (
    <ThemeContext.Provider value={{
      theme, presets, mode,
      refresh, setThemeByKey, previewTokens, restore,
      toggleMode, setMode: setModeExplicit,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
