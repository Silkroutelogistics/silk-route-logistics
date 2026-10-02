"use client";

import { useEffect } from "react";

/**
 * carrier-portal-upgrade M5 — one button hierarchy for the carrier portal, from
 * SRL tokens (gold #BA7517 on cream #FBF7F0, navy #0A2540 ink).
 *
 * primary: the one action a section exists for. secondary: a real action that is
 * not the point of the section. ghost: navigation-like or low-stakes actions.
 * Every variant carries a 44px minimum target, a visible focus ring, pressed and
 * disabled states, and a 150ms transition that honours prefers-reduced-motion.
 */
const BASE =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-md px-4 text-[13px] font-semibold " +
  "cursor-pointer transition-[background-color,box-shadow,transform] duration-150 motion-reduce:transition-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBF7F0] " +
  "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 disabled:active:translate-y-0";

export const BTN = {
  // Dark gold, not #BA7517: white on #BA7517 is ~3.7:1 and fails AA at this
  // size; white on #854F0B (the canonical dark gold) is ~6.7:1.
  primary: `${BASE} bg-[#854F0B] text-white hover:bg-[#6B3F08] disabled:hover:bg-[#854F0B]`,
  secondary: `${BASE} border border-[#C5A572] bg-white text-[#0A2540] hover:bg-[#FAEEDA] disabled:hover:bg-white`,
  ghost: `${BASE} text-[#0A2540] hover:bg-[#F5EEE0] disabled:hover:bg-transparent`,
} as const;

/** Muted body text that holds AA (4.5:1) on cream, unlike Tailwind gray-400/500. */
export const TEXT_MUTED = "text-[#5B6B7D]";

/**
 * Warn before leaving a form with unsaved input (M5). The browser shows its own
 * wording; the page only says whether there is something to lose.
 */
export function useUnsavedChangesWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}
