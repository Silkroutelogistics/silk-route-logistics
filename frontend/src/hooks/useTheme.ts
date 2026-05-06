import { create } from "zustand";
import { api } from "@/lib/api";

/**
 * useTheme — light/dark mode toggle.
 *
 * v3.8.aab Sprint 24: theme engine simplified. Five alternative themes
 * (Midnight Express, Desert Route, Arctic Haul, Highway Green, Chrome
 * Steel) retired — canonical Silk Route Classic is the only supported
 * theme. Light/dark mode toggle preserved as the only useful UX
 * residue from the old theme system (AE staff working long hours
 * benefit from dark mode).
 *
 * Migration: existing users with `srl_theme` localStorage key are
 * gracefully ignored on read. New writes only persist `srl_mode`.
 *
 * Backend `/auth/preferences` `preferredTheme` field still accepted
 * server-side for forward compatibility; frontend stops writing to it
 * in Sprint 24. Field retirement is a separate data-hygiene sprint.
 */

interface ThemeState {
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
  applyAndSync: () => void;
  loadFromStorage: () => void;
}

function applyToDOM(darkMode: boolean) {
  const root = document.documentElement;
  root.setAttribute("data-mode", darkMode ? "dark" : "light");

  // v3.8.aab — clear any legacy theme attribute set by pre-Sprint-24
  // builds. Browsers cache attributes on document.documentElement
  // across navigations within the same SPA session, so the cleanup
  // belongs here (not just on load).
  if (root.hasAttribute("data-theme")) {
    root.removeAttribute("data-theme");
  }
}

export const useTheme = create<ThemeState>((set, get) => ({
  darkMode: false, // default light — user preference per Sprint 14 finding

  setDarkMode: (dark) => {
    set({ darkMode: dark });
    if (typeof window !== "undefined") applyToDOM(dark);
  },

  applyAndSync: () => {
    const { darkMode } = get();
    if (typeof window !== "undefined") {
      localStorage.setItem("srl_mode", darkMode ? "dark" : "light");
      applyToDOM(darkMode);
    }
    // Fire-and-forget backend sync. Field still accepted server-side
    // for forward compatibility (Sprint 24 stops writing preferredTheme).
    api.patch("/auth/preferences", { darkMode }).catch(() => {});
  },

  loadFromStorage: () => {
    if (typeof window === "undefined") return;
    const savedMode = localStorage.getItem("srl_mode") || "light";
    const darkMode = savedMode === "dark";
    set({ darkMode });
    applyToDOM(darkMode);

    // v3.8.aab — proactively clear legacy `srl_theme` localStorage key
    // from pre-Sprint-24 builds. Idempotent.
    if (localStorage.getItem("srl_theme") !== null) {
      localStorage.removeItem("srl_theme");
    }
  },
}));
