"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

/**
 * Post-Sprint-53 (v3.8.aca) auth refresh banner. Per-portal cookie
 * isolation invalidates legacy `srl_token` sessions — users land here
 * once after deploy, see the notice, sign out + back in once.
 *
 * Auto-expires 24h after deploy (hardcoded EXPIRES_AT). After that the
 * banner is dead code; remove on next layout-touching commit.
 */
const STORAGE_KEY = "srl-auth-refresh-banner-dismissed";
const EXPIRES_AT = Date.parse("2026-05-18T22:00:00Z"); // 24h+ from Sprint 53 deploy

export function AuthRefreshBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (Date.now() >= EXPIRES_AT) return;
    if (localStorage.getItem(STORAGE_KEY)) return;
    setShow(true);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="bg-[#E2EAF2] border-b border-[#BECEDE] px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-[12px] text-[#0A2540]">
      <span className="flex-1 leading-snug">
        <strong className="font-semibold">Session refresh required</strong> — We&apos;ve upgraded our authentication system for stronger session isolation. If you experience any login issues, please sign out and sign back in once. Questions? <a href="mailto:operations@silkroutelogistics.ai" className="underline hover:text-[#BA7517]">operations@silkroutelogistics.ai</a>
      </span>
      <button onClick={dismiss} className="text-[#0A2540]/60 hover:text-[#0A2540] shrink-0" aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}
