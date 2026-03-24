import { create } from "zustand";
import { api } from "@/lib/api";

export interface ThemeConfig {
  id: string;
  name: string;
  primary: string;
  sidebar: string;
  accent: string;
}

export const THEMES: ThemeConfig[] = [
  { id: "silk-route-classic", name: "Silk Route Classic", primary: "#C8963E", sidebar: "#0D1B2A", accent: "#D4A64E" },
  { id: "midnight-express", name: "Midnight Express", primary: "#818CF8", sidebar: "#312E81", accent: "#A5B4FC" },
  { id: "desert-route", name: "Desert Route", primary: "#C2703E", sidebar: "#78350F", accent: "#D4843E" },
  { id: "arctic-haul", name: "Arctic Haul", primary: "#0EA5E9", sidebar: "#0C4A6E", accent: "#38BDF8" },
  { id: "highway-green", name: "Highway Green", primary: "#16A34A", sidebar: "#14532D", accent: "#22C55E" },
  { id: "chrome-steel", name: "Chrome Steel", primary: "#71717A", sidebar: "#27272A", accent: "#A1A1AA" },
];

interface ThemeState {
  themeId: string;
  darkMode: boolean;
  setTheme: (id: string) => void;
  setDarkMode: (dark: boolean) => void;
  applyAndSync: () => void;
  loadFromStorage: () => void;
}

function applyToDOM(themeId: string, darkMode: boolean) {
  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const root = document.documentElement;

  root.setAttribute("data-theme", themeId);
  root.setAttribute("data-mode", darkMode ? "dark" : "light");

  // Set CSS custom properties for the active theme
  root.style.setProperty("--theme-primary", theme.primary);
  root.style.setProperty("--theme-sidebar", theme.sidebar);
  root.style.setProperty("--theme-accent", theme.accent);
  root.style.setProperty("--theme-gold", theme.primary);
}

export const useTheme = create<ThemeState>((set, get) => ({
  themeId: "silk-route-classic",
  darkMode: false, // default light — user preference

  setTheme: (id) => {
    set({ themeId: id });
    if (typeof window !== "undefined") applyToDOM(id, get().darkMode);
  },

  setDarkMode: (dark) => {
    set({ darkMode: dark });
    if (typeof window !== "undefined") applyToDOM(get().themeId, dark);
  },

  applyAndSync: () => {
    const { themeId, darkMode } = get();
    if (typeof window !== "undefined") {
      localStorage.setItem("srl_theme", themeId);
      localStorage.setItem("srl_mode", darkMode ? "dark" : "light");
      applyToDOM(themeId, darkMode);
    }
    // Fire-and-forget backend sync
    api.patch("/auth/preferences", { preferredTheme: themeId, darkMode }).catch(() => {});
  },

  loadFromStorage: () => {
    if (typeof window === "undefined") return;
    const savedTheme = localStorage.getItem("srl_theme") || "silk-route-classic";
    const savedMode = localStorage.getItem("srl_mode") || "light";
    const darkMode = savedMode === "dark";
    set({ themeId: savedTheme, darkMode });
    applyToDOM(savedTheme, darkMode);
  },
}));
