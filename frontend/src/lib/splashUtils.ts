import type { SplashQuote } from "@/data/splashQuotes";

/** Day-of-year (1–366) */
export function dayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date.getTime() - start.getTime();
  return Math.floor(diff / 86_400_000);
}

/** Deterministic index that changes daily and differs per year */
export function getQuoteIndex(date: Date, poolSize: number): number {
  const year = date.getFullYear();
  return ((year * 367) + dayOfYear(date)) % poolSize;
}

/** Pick today's quote for a role category */
export function getTodaysQuote(
  allQuotes: SplashQuote[],
  role: "employee" | "carrier",
): SplashQuote {
  const pool = allQuotes.filter(
    (q) => q.audience === role || q.audience === "both",
  );
  const idx = getQuoteIndex(new Date(), pool.length);
  return pool[idx];
}
