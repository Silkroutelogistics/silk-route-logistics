"use client";

// v3.8.aom — SRL Driver Academy skill-path map. A connected node-path of the
// course categories (Duolingo-style "units"): each node is a progress ring with
// the passed/total count; the first not-yet-complete category is the "you are
// here" highlight; tapping a node jumps to that section below. Canonical tokens.

import { CheckCircle2 } from "lucide-react";

export interface PathNode { name: string; passed: number; total: number; current: boolean; anchor: string }

const RING_C = 2 * Math.PI * 18; // r = 18

export function SkillPath({ nodes }: { nodes: PathNode[] }) {
  if (nodes.length === 0) return null;
  const jump = (anchor: string) => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex min-w-max items-start">
        {nodes.map((n, i) => {
          const done = n.total > 0 && n.passed >= n.total;
          const pct = n.total ? n.passed / n.total : 0;
          return (
            <div key={n.name} className="flex items-start">
              <button onClick={() => jump(n.anchor)} className="flex w-[90px] shrink-0 flex-col items-center gap-1.5" aria-label={`${n.name}: ${n.passed} of ${n.total} complete`}>
                <span className={`relative inline-flex ${n.current ? "rounded-full ring-2 ring-[#BA7517] ring-offset-2" : ""}`}>
                  <svg viewBox="0 0 44 44" className="h-12 w-12 -rotate-90" aria-hidden>
                    <circle cx="22" cy="22" r="18" fill="none" stroke="#EFE6D3" strokeWidth="4" />
                    <circle cx="22" cy="22" r="18" fill="none" stroke={done ? "#2F7A4F" : "#BA7517"} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${pct * RING_C} ${RING_C}`} />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center">
                    {done ? <CheckCircle2 size={18} className="text-[#2F7A4F]" />
                      : <span className="text-[11px] font-bold text-[#0A2540]">{n.passed}/{n.total}</span>}
                  </span>
                </span>
                <span className="line-clamp-2 px-0.5 text-center text-[9.5px] font-medium leading-tight text-[#3A4A5F]">{n.name}</span>
              </button>
              {i < nodes.length - 1 && <span className="mt-[22px] h-[3px] w-5 shrink-0 rounded-full bg-[#EFE6D3]" aria-hidden />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
