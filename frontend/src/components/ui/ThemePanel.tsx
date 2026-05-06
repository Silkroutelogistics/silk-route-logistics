"use client";

/**
 * v3.8.aab Sprint 24: theme system simplification.
 *
 * Pre-Sprint-24: 6-theme picker (Silk Route Classic / Midnight Express
 * / Desert Route / Arctic Haul / Highway Green / Chrome Steel) with
 * slide-in panel + Apply Theme button + Dark Mode toggle. ~139 LOC.
 *
 * Post-Sprint-24: simple sun/moon icon button that flips dark mode on
 * click. ~30 LOC. Theme variants retired; canonical Silk Route Classic
 * is the only supported theme. Mode toggle remains useful for AE staff
 * working long hours.
 *
 * Component name `ThemeGearButton` retained as alias to avoid churning
 * import sites in Sidebar.tsx + any other consumers. New canonical name
 * is `ModeToggleButton`. Both export the same component.
 */

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/useTheme";

export function ModeToggleButton() {
  const { darkMode, setDarkMode, applyAndSync } = useTheme();

  const handleToggle = () => {
    setDarkMode(!darkMode);
    // Persist immediately (no separate Apply step like the legacy
    // ThemePanel). One-click toggle — preview-and-confirm flow was
    // overkill for a binary state.
    setTimeout(() => applyAndSync(), 0);
  };

  return (
    <button
      onClick={handleToggle}
      className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 w-full transition"
      title={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    >
      {darkMode ? <Moon className="w-4 h-4 text-[#C5A572]" /> : <Sun className="w-4 h-4 text-yellow-400" />}
      <span>{darkMode ? "Dark Mode" : "Light Mode"}</span>
    </button>
  );
}

// Alias retained for back-compat with existing import sites.
export const ThemeGearButton = ModeToggleButton;
