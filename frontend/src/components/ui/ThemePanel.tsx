"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Settings, X, Sun, Moon, Check } from "lucide-react";
import { useTheme, THEMES } from "@/hooks/useTheme";

export function ThemeGearButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 w-full transition"
        title="Theme Settings"
      >
        <Settings className="w-4 h-4" /> Theme
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <ThemePanel onClose={() => setOpen(false)} />,
        document.body
      )}
    </>
  );
}

function ThemePanel({ onClose }: { onClose: () => void }) {
  const { themeId, darkMode, setTheme, setDarkMode, applyAndSync } = useTheme();
  const [previewTheme, setPreviewTheme] = useState(themeId);
  const [previewDark, setPreviewDark] = useState(darkMode);

  const handleThemeClick = (id: string) => {
    setPreviewTheme(id);
    setTheme(id); // Live preview
  };

  const handleDarkToggle = () => {
    const newDark = !previewDark;
    setPreviewDark(newDark);
    setDarkMode(newDark); // Live preview
  };

  const handleApply = () => {
    applyAndSync(); // Persist to localStorage + backend
    onClose();
  };

  const handleCancel = () => {
    // Revert to saved
    const saved = localStorage.getItem("srl_theme") || "silk-route-classic";
    const savedDark = localStorage.getItem("srl_mode") === "dark";
    setTheme(saved);
    setDarkMode(savedDark);
    onClose();
  };

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-[9998]" onClick={handleCancel} />

      {/* Panel */}
      <div className="fixed top-0 right-0 w-80 h-full bg-[#0F1117] border-l border-white/10 shadow-2xl z-[9999] flex flex-col animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h3 className="text-base font-semibold text-white">Theme Settings</h3>
          <button onClick={handleCancel} className="p-1 text-slate-400 hover:text-white rounded transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dark mode toggle */}
        <div className="px-5 py-4 border-b border-white/10">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Appearance</p>
          <button
            onClick={handleDarkToggle}
            className="flex items-center justify-between w-full px-4 py-3 rounded-lg bg-white/5 hover:bg-white/10 transition"
          >
            <span className="text-sm text-white font-medium">Dark Mode</span>
            <div className="flex items-center gap-2">
              {previewDark ? <Moon className="w-4 h-4 text-gold" /> : <Sun className="w-4 h-4 text-yellow-400" />}
              <div className={`w-10 h-5 rounded-full transition relative ${previewDark ? "bg-gold" : "bg-white/20"}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-all ${previewDark ? "left-5" : "left-0.5"}`} />
              </div>
            </div>
          </button>
        </div>

        {/* Theme grid */}
        <div className="px-5 py-4 flex-1 overflow-y-auto">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Theme</p>
          <div className="grid grid-cols-2 gap-3">
            {THEMES.map((t) => {
              const active = t.id === previewTheme;
              return (
                <button
                  key={t.id}
                  onClick={() => handleThemeClick(t.id)}
                  className={`relative rounded-xl border-2 p-3 text-center transition hover:-translate-y-0.5 ${
                    active ? "border-gold shadow-lg shadow-gold/10" : "border-white/10 hover:border-white/30"
                  }`}
                >
                  {/* Color swatch */}
                  <div className="flex gap-1 h-6 rounded-lg overflow-hidden mb-2">
                    <span className="flex-1" style={{ background: t.sidebar }} />
                    <span className="flex-1" style={{ background: t.primary }} />
                    <span className="flex-1" style={{ background: t.accent }} />
                  </div>
                  <p className="text-[11px] font-semibold text-white">{t.name}</p>

                  {/* Active check */}
                  {active && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-gold flex items-center justify-center">
                      <Check className="w-3 h-3 text-navy" strokeWidth={3} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Apply button */}
        <div className="px-5 py-4 border-t border-white/10">
          <button
            onClick={handleApply}
            className="w-full py-3 rounded-lg font-semibold text-sm transition"
            style={{ background: `var(--theme-primary, #C8963E)`, color: "#0F1117" }}
          >
            Apply Theme
          </button>
        </div>
      </div>
    </>
  );
}
