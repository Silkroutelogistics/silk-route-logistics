// FMCSA authority grant dates from the Socrata L&I "AuthHist" dataset.
//
// This is the data source Item 182 Sprint 5 needed and never had. The QCMobile
// endpoint the platform already calls (`/carriers/{dot}/authority`) returns
// CURRENT STATUS only — no grant history — so getCarrierAuthority resolves null
// for every real carrier, which is why the authority-age ladder in
// complianceMonitorService is coded correctly and has never once fired
// (carrier-lifecycle audit F-1). Sprint 5 was rolled back in v3.8.akv for
// exactly this reason.
//
// Dataset: https://data.transportation.gov/resource/9mw4-x3tu.json
//   "AuthHist - All With History", free, no API key required.
//   Columns (verified live 2026-08-18 against /api/views/9mw4-x3tu.json):
//     docket_number         e.g. "MC1794414"
//     dot_number            ZERO-PADDED TO 8 e.g. "04526880"
//     sub_number
//     mod_col_1             OP_AUTH_TYPE, e.g. "MOTOR PROPERTY COMMON CARRIER"
//     original_action_desc  e.g. "GRANTED", "INVOLUNTARY REVOCATION"
//     orig_served_date      MM/DD/YYYY, TEXT not a date type
//     disp_action_desc      e.g. "REVOKED", "DISCONTINUED REVOCATION"
//     disp_decided_date / disp_served_date
//
// Three properties of this data that will bite anyone who assumes otherwise,
// all confirmed by live probe rather than read off documentation:
//
//  1. dot_number is zero-padded to 8 characters. Querying dot_number=4526880
//     returns [] while dot_number=04526880 returns the row. An unpadded
//     backfill would report "no data available" for every carrier and look
//     like the dataset was empty.
//  2. A carrier has MANY rows — one per operating-authority type, plus a row
//     per revocation/reinstatement event. INTEGRITY EXPRESS (DOT 01911857) has
//     a PROPERTY BROKER grant in 2007, a MOTOR PROPERTY CONTRACT CARRIER grant
//     in 2010, and two involuntary-revocation-then-discontinued pairs.
//  3. Dates are MM/DD/YYYY strings, so they sort lexicographically wrong.

import { log } from "../lib/logger";
import { prisma } from "../config/database";
import { AUTHORITY_AGE_GATE_LIVE_AT } from "./complianceMonitorService";

const SODA_BASE = "https://data.transportation.gov/resource/9mw4-x3tu.json";

export interface AuthHistRow {
  docket_number?: string;
  dot_number?: string;
  mod_col_1?: string;
  original_action_desc?: string;
  orig_served_date?: string;
  disp_action_desc?: string;
  disp_served_date?: string;
}

export interface AuthorityResolution {
  /** The date to write to CarrierProfile.authorityGrantedDate, or null if unresolvable. */
  grantedDate: Date | null;
  /** Which operating-authority type the winning row was for. */
  opAuthType: string | null;
  /** Docket the winning row came from — lets a human re-check it by hand. */
  docket: string | null;
  /** Disposition on the winning row, if any (e.g. "REVOKED"). Reported, never acted on here. */
  disposition: string | null;
  /** How the record was found: by MC docket, by padded DOT, or not at all. */
  matchedBy: "docket" | "dot" | "none";
  /** Every GRANTED row seen, for the report. */
  grantRowCount: number;
  /** Populated when the lookup itself failed rather than simply finding nothing. */
  error?: string;
}

/** "MC-1794414" / "1794414" / "mc 1794414" -> "MC1794414". Returns null if there are no digits. */
export function normalizeDocket(mcNumber: string | null | undefined): string | null {
  if (!mcNumber) return null;
  const digits = mcNumber.replace(/\D/g, "");
  if (!digits) return null;
  return `MC${digits}`;
}

/** "4526880" -> "04526880". The dataset stores DOT zero-padded to 8; an unpadded query silently returns nothing. */
export function padDot(dotNumber: string | null | undefined): string | null {
  if (!dotNumber) return null;
  const digits = dotNumber.replace(/\D/g, "");
  if (!digits) return null;
  return digits.padStart(8, "0");
}

/** MM/DD/YYYY -> UTC Date. Returns null on anything that is not that shape. */
export function parseServedDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, mm, dd, yyyy] = m;
  const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (Number.isNaN(d.getTime())) return null;
  // Guard against 02/31 style rollover producing a real but wrong date.
  if (d.getUTCMonth() !== Number(mm) - 1 || d.getUTCDate() !== Number(dd)) return null;
  return d;
}

/**
 * Choose the row that answers "when did this carrier first hold operating
 * authority?" from the pile of rows a docket returns.
 *
 * Preference order, and the reasoning for each step:
 *
 *  1. Only GRANTED rows. Revocation and reinstatement rows describe events on
 *     an authority, not its origin.
 *  2. Prefer MOTOR CARRIER authority types over broker/forwarder ones. The
 *     age gate exists to ask how long this party has been hauling, and a
 *     carrier who also holds a broker docket should be judged on the carrier
 *     authority. Falls back to any GRANTED row if no motor row exists, so a
 *     broker-only entity still resolves rather than reporting nothing.
 *  3. EARLIEST such grant. This deliberately matches the reinstatement caveat
 *     already recorded in the audit: age anchors on the original grant, not on
 *     the most recent reinstatement. A carrier revoked and later reinstated
 *     therefore reads as older than they operationally are — a known, written-
 *     down bias, and the separate FMCSA-status gate is what catches a carrier
 *     whose authority is not currently active.
 */
export function pickGrantRow(rows: AuthHistRow[]): AuthHistRow | null {
  const granted = rows.filter(
    (r) => (r.original_action_desc || "").toUpperCase().includes("GRANT") && parseServedDate(r.orig_served_date),
  );
  if (granted.length === 0) return null;

  const motor = granted.filter((r) => (r.mod_col_1 || "").toUpperCase().includes("MOTOR"));
  const pool = motor.length > 0 ? motor : granted;

  return pool.reduce((best, r) => {
    const a = parseServedDate(r.orig_served_date)!;
    const b = parseServedDate(best.orig_served_date)!;
    return a < b ? r : best;
  });
}

async function fetchRows(query: string, timeoutMs: number): Promise<AuthHistRow[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${SODA_BASE}?${query}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Socrata HTTP ${res.status}`);
    const body = (await res.json()) as AuthHistRow[];
    return Array.isArray(body) ? body : [];
  } finally {
    clearTimeout(t);
  }
}

/**
 * Resolve one carrier's authority grant date.
 *
 * Tries the MC docket first because it is the exact key the dataset is indexed
 * on and cannot collide; falls back to the zero-padded DOT. Never throws — a
 * lookup failure comes back as matchedBy "none" with `error` set, so a backfill
 * over hundreds of carriers cannot be killed by one bad response.
 */
export async function resolveAuthorityGrantDate(
  opts: { mcNumber?: string | null; dotNumber?: string | null; timeoutMs?: number },
): Promise<AuthorityResolution> {
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const empty: AuthorityResolution = {
    grantedDate: null,
    opAuthType: null,
    docket: null,
    disposition: null,
    matchedBy: "none",
    grantRowCount: 0,
  };

  const docket = normalizeDocket(opts.mcNumber);
  const dot = padDot(opts.dotNumber);
  if (!docket && !dot) return empty;

  const attempts: Array<{ by: "docket" | "dot"; query: string }> = [];
  if (docket) attempts.push({ by: "docket", query: `docket_number=${encodeURIComponent(docket)}` });
  if (dot) attempts.push({ by: "dot", query: `dot_number=${encodeURIComponent(dot)}` });

  for (const attempt of attempts) {
    try {
      const rows = await fetchRows(attempt.query, timeoutMs);
      if (rows.length === 0) continue;
      const win = pickGrantRow(rows);
      if (!win) continue;
      return {
        grantedDate: parseServedDate(win.orig_served_date),
        opAuthType: win.mod_col_1 ?? null,
        docket: win.docket_number ?? null,
        disposition: win.disp_action_desc ?? null,
        matchedBy: attempt.by,
        grantRowCount: rows.filter((r) => (r.original_action_desc || "").toUpperCase().includes("GRANT")).length,
      };
    } catch (err) {
      log.warn(
        { err, attempt: attempt.by, docket, dot },
        "[AuthHist] Socrata lookup failed for this attempt",
      );
      return { ...empty, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return empty;
}

export interface SweepResult {
  scanned: number;
  resolved: number;
  unresolved: number;
  errored: number;
}

/**
 * Weekly sweep: fill in authorityGrantedDate for carriers who registered after
 * the age gate went live and still have none.
 *
 * Deliberately scoped to post-gate registrations rather than every null row.
 * The pre-existing carrier base is a different problem with a different risk:
 * writing dates across it turns an inert gate live in bulk and can stop
 * dispatch for real carriers, which is why the backfill script defaults to a
 * dry run and produces a report for a human to read. This sweep only covers
 * carriers the gate was always meant to apply to — the steady-state repair for
 * the fact that registerCarrier's own populateAuthorityGrantedDate resolves
 * null for everyone (QCMobile has no grant history).
 *
 * Test accounts are excluded, matching the rest of the cron fleet. Only ever
 * fills a null, so an admin's manual setAuthorityGrantDate always wins.
 */
export async function resolveMissingAuthorityDates(maxPerRun = 50): Promise<SweepResult> {
  const result: SweepResult = { scanned: 0, resolved: 0, unresolved: 0, errored: 0 };

  const carriers = await prisma.carrierProfile.findMany({
    where: {
      authorityGrantedDate: null,
      isTestAccount: false,
      createdAt: { gte: AUTHORITY_AGE_GATE_LIVE_AT },
      OR: [{ dotNumber: { not: null } }, { mcNumber: { not: null } }],
    },
    select: { id: true, companyName: true, dotNumber: true, mcNumber: true },
    orderBy: { createdAt: "asc" },
    take: maxPerRun,
  });

  result.scanned = carriers.length;
  if (carriers.length === 0) return result;

  for (const c of carriers) {
    try {
      const r = await resolveAuthorityGrantDate({ mcNumber: c.mcNumber, dotNumber: c.dotNumber });
      if (r.error) {
        result.errored++;
      } else if (r.grantedDate) {
        const before = await prisma.carrierProfile.findUnique({
          where: { id: c.id },
          select: { authorityGrantedDate: true },
        });
        if (before?.authorityGrantedDate == null) {
          await prisma.carrierProfile.update({
            where: { id: c.id },
            data: { authorityGrantedDate: r.grantedDate },
          });
          log.info(
            { carrierId: c.id, company: c.companyName, granted: r.grantedDate.toISOString().slice(0, 10), docket: r.docket, opAuthType: r.opAuthType },
            "[AuthHist] Resolved authority grant date",
          );
        }
        result.resolved++;
      } else {
        result.unresolved++;
      }
    } catch (err) {
      result.errored++;
      log.error({ err, carrierId: c.id }, "[AuthHist] Sweep failed for carrier (non-fatal)");
    }
    // Polite pacing against a free, unauthenticated public dataset.
    await new Promise((r) => setTimeout(r, 250));
  }

  log.info({ result }, "[AuthHist] Weekly sweep complete");
  return result;
}
