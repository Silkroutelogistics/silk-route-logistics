"use client";

// v3.8.aom — SRL Driver Academy gamification bar (streak · XP · daily-goal ring).
// Client-only, reads localStorage on mount (no SSR hydration mismatch: first
// render is the zero state, a mount effect loads the real values). Motivational
// only — never gates training. Canonical §2.1 tokens.

import { useState, useEffect, useCallback } from "react";
import { Flame, Zap } from "lucide-react";
import { loadGamify, awardXp, DAILY_GOAL_XP, type GamifyState } from "@/lib/driverGamify";

const ZERO: GamifyState = { xp: 0, streak: 0, lastActive: "", today: "", todayXp: 0 };

export function useGamify() {
  const [s, setS] = useState<GamifyState>(ZERO);
  useEffect(() => { setS(loadGamify()); }, []);
  const award = useCallback((n: number) => setS(awardXp(n)), []);
  return { ...s, award };
}

const RING_C = 2 * Math.PI * 15; // r = 15

export function GamifyBar({ xp, streak, todayXp, className = "" }: { xp: number; streak: number; todayXp: number; className?: string }) {
  const goalPct = Math.min(100, (todayXp / DAILY_GOAL_XP) * 100);
  const goalMet = todayXp >= DAILY_GOAL_XP;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1 rounded-full border border-[#EFE6D3] bg-white px-2.5 py-1" title={`${streak}-day streak`}>
        <Flame size={14} className={streak > 0 ? "text-[#BA7517]" : "text-[#A7AEB8]"} />
        <span className="text-[12px] font-bold text-[#0A2540]">{streak}</span>
        <span className="hidden text-[10px] text-[#6B7685] sm:inline">day{streak === 1 ? "" : "s"}</span>
      </div>
      <div className="flex items-center gap-1 rounded-full border border-[#EFE6D3] bg-white px-2.5 py-1" title={`${xp} XP earned`}>
        <Zap size={14} className="text-[#C5A572]" />
        <span className="text-[12px] font-bold text-[#0A2540]">{xp}</span>
        <span className="hidden text-[10px] text-[#6B7685] sm:inline">XP</span>
      </div>
      <div className="flex items-center gap-1.5 rounded-full border border-[#EFE6D3] bg-white px-2.5 py-1" title={`Daily goal: ${todayXp} of ${DAILY_GOAL_XP} XP`}>
        <svg viewBox="0 0 36 36" className="h-4 w-4 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r="15" fill="none" stroke="#EFE6D3" strokeWidth="6" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={goalMet ? "#2F7A4F" : "#BA7517"} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(goalPct / 100) * RING_C} ${RING_C}`} />
        </svg>
        <span className="text-[10px] font-semibold text-[#6B7685]">{goalMet ? "Goal ✓" : `${todayXp}/${DAILY_GOAL_XP}`}</span>
      </div>
    </div>
  );
}
