"use client";

// v3.8.aom — SRL Driver Academy client-side gamification (localStorage only).
//
// XP / streak / daily-goal are MOTIVATIONAL and per-device. The authoritative
// pass/fail + certificate stay server-graded — this layer never gates training.
// Deliberately NO "lives"/"hearts": a driver is never locked out of safety
// training for a wrong answer. Wrong answers simply award no XP.

export interface GamifyState {
  xp: number;        // lifetime XP
  streak: number;    // consecutive active days
  lastActive: string; // YYYY-MM-DD of last XP-earning activity
  today: string;     // YYYY-MM-DD this state was last rolled to
  todayXp: number;   // XP earned today (resets each calendar day)
}

export const DAILY_GOAL_XP = 40;
const KEY = "srl_driver_gamify_v1";

function fresh(): GamifyState {
  return { xp: 0, streak: 0, lastActive: "", today: "", todayXp: 0 };
}

function dayStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr(): string {
  return dayStr(new Date());
}
// Whole-day difference between two YYYY-MM-DD strings (b - a), DST-safe via UTC.
function gapDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  if (!ay || !by) return 99;
  const ms = Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad);
  return Math.round(ms / 86_400_000);
}

export function loadGamify(): GamifyState {
  if (typeof window === "undefined") return fresh();
  let s: GamifyState;
  try { s = { ...fresh(), ...(JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<GamifyState>) }; }
  catch { s = fresh(); }
  const t = todayStr();
  if (s.today !== t) s = { ...s, today: t, todayXp: 0 };           // new calendar day → reset daily XP
  if (s.lastActive && gapDays(s.lastActive, t) > 1) s = { ...s, streak: 0 }; // missed a day → streak broken
  return s;
}

function persist(s: GamifyState) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode / quota */ }
}

// Award XP and roll the streak/daily counters. Returns the new state.
export function awardXp(n: number): GamifyState {
  const s = loadGamify();
  if (n <= 0) return s;
  const t = todayStr();
  let streak = s.streak;
  if (s.lastActive !== t) {
    // first activity today: +1 if yesterday was active, else (re)start at 1
    streak = s.lastActive && gapDays(s.lastActive, t) === 1 ? s.streak + 1 : 1;
  }
  const next: GamifyState = { xp: s.xp + n, streak, lastActive: t, today: t, todayXp: s.todayXp + n };
  persist(next);
  return next;
}
