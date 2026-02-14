"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { getAutoTheme, type ThemeId } from "@/lib/theme";

type ThemeMode = ThemeId | "auto";

interface ThemeContextValue {
  theme: ThemeId;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "day",
  mode: "auto",
  setMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "randonneur-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>("auto");
  const [theme, setTheme] = useState<ThemeId>("day");
  const [mounted, setMounted] = useState(false);

  // Initialize from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved !== "auto") {
      setModeState(saved as ThemeMode);
      setTheme(saved as ThemeId);
    } else {
      setModeState("auto");
      setTheme(getAutoTheme());
    }
    setMounted(true);
  }, []);

  // Auto-update theme every minute when in auto mode
  useEffect(() => {
    if (mode !== "auto") return;
    const update = () => setTheme(getAutoTheme());
    update();
    const interval = setInterval(update, 60_000);
    return () => clearInterval(interval);
  }, [mode]);

  // Apply data-theme attribute
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme, mounted]);

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
    if (newMode === "auto") {
      setTheme(getAutoTheme());
    } else {
      setTheme(newMode);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
