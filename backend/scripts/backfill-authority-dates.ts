// Backfill CarrierProfile.authorityGrantedDate from the FMCSA Socrata L&I
// AuthHist dataset. Arc 2 Item 4 — the fast-follow banked under §13.3 Item 182
// that unblocks the authority-age gate (carrier-lifecycle audit F-1).
//
//   npx tsx scripts/backfill-authority-dates.ts              # DRY RUN (default)
//   npx tsx scripts/backfill-authority-dates.ts --commit     # actually writes
//   npx tsx scripts/backfill-authority-dates.ts --limit 25   # cap the scan
//
// DRY RUN IS THE DEFAULT AND IS NOT A COURTESY. Writing authorityGrantedDate
// turns a currently-inert compliance gate live: complianceMonitorService hard-
// blocks tendering below 12 months and requires a scoped override between 12
// and 18. Populating this column across the carrier base can therefore stop
// dispatch for real carriers the moment it lands. The dry run produces a report
// naming, per carrier, exactly what the gate WOULD do — that report is meant to
// be read by a human before anyone passes --commit.

import { prisma } from "../src/config/database";
import { resolveAuthorityGrantDate } from "../src/services/authorityHistoryService";
import { calendarMonthsBetween } from "../src/services/fmcsaService";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const COMMIT = process.argv.includes("--commit");
const limitArg = process.argv.indexOf("--limit");
const LIMIT = limitArg !== -1 ? Number(process.argv[limitArg + 1]) : undefined;

/** Socrata is free and unauthenticated; this keeps us a polite neighbour rather than a scraper. */
const DELAY_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** What the live gate in complianceMonitorService would do with this age. */
function gateVerdict(months: number | null): string {
  if (months === null) return "unresolved — gate stays on the warn-only path";
  if (months < 12) return `**HARD BLOCK** (${months}mo, no override possible)`;
  if (months < 18) return `override-eligible (${months}mo, needs scoped AUTHORITY_TOO_YOUNG override)`;
  return `allowed (${months}mo)`;
}

async function main() {
  const started = new Date();
  console.log(`[backfill] mode: ${COMMIT ? "COMMIT (will write)" : "DRY RUN (no writes)"}`);

  const carriers = await prisma.carrierProfile.findMany({
    where: { authorityGrantedDate: null },
    select: {
      id: true,
      companyName: true,
      dotNumber: true,
      mcNumber: true,
      onboardingStatus: true,
      isTestAccount: true,
      approvedAt: true,
    },
    orderBy: { createdAt: "asc" },
    ...(LIMIT ? { take: LIMIT } : {}),
  });

  console.log(`[backfill] ${carriers.length} carrier(s) with a null authorityGrantedDate`);

  const rows: string[] = [];
  let resolved = 0;
  let unresolved = 0;
  let errored = 0;
  let written = 0;
  const verdictTally: Record<string, number> = { block: 0, override: 0, allowed: 0, unresolved: 0 };

  for (const c of carriers) {
    const r = await resolveAuthorityGrantDate({ mcNumber: c.mcNumber, dotNumber: c.dotNumber });
    const months = r.grantedDate ? calendarMonthsBetween(r.grantedDate, started) : null;
    const verdict = gateVerdict(months);

    if (r.error) errored++;
    if (r.grantedDate) {
      resolved++;
      if (months !== null && months < 12) verdictTally.block++;
      else if (months !== null && months < 18) verdictTally.override++;
      else verdictTally.allowed++;
    } else {
      unresolved++;
      verdictTally.unresolved++;
    }

    rows.push(
      `| ${c.companyName || c.id} | ${c.dotNumber || "—"} | ${c.mcNumber || "—"} | ${c.onboardingStatus}${c.isTestAccount ? " (TEST)" : ""} | ` +
        `${r.grantedDate ? r.grantedDate.toISOString().slice(0, 10) : "—"} | ${r.opAuthType || "—"} | ${r.docket || "—"} | ` +
        `${r.matchedBy} | ${r.disposition || "—"} | ${verdict} |`,
    );

    if (COMMIT && r.grantedDate) {
      const before = await prisma.carrierProfile.findUnique({
        where: { id: c.id },
        select: { authorityGrantedDate: true },
      });
      // Only ever fills a null. Never overwrites a value an admin set by hand
      // through setAuthorityGrantDate (v3.8.aio), which is the manual-correction
      // path and outranks a bulk import.
      if (before?.authorityGrantedDate == null) {
        await prisma.carrierProfile.update({
          where: { id: c.id },
          data: { authorityGrantedDate: r.grantedDate },
        });
        written++;
        console.log(
          `[backfill][WRITE] ${c.companyName} (${c.dotNumber || c.mcNumber}) ` +
            `before=null after=${r.grantedDate.toISOString().slice(0, 10)} src=${r.docket}/${r.opAuthType}`,
        );
      } else {
        console.log(`[backfill][SKIP] ${c.companyName} — already set to ${before.authorityGrantedDate.toISOString().slice(0, 10)}`);
      }
    }

    await sleep(DELAY_MS);
  }

  const stamp = started.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const reportDir = path.join(__dirname, "..", "..", "docs", "audits");
  mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `authority-backfill-report-${stamp}.md`);

  const report = [
    `# Authority grant-date backfill — ${COMMIT ? "COMMIT" : "DRY RUN"}`,
    ``,
    `**Run:** ${started.toISOString()}`,
    `**Source:** FMCSA Socrata L&I \`AuthHist - All With History\` (dataset \`9mw4-x3tu\`), free and unauthenticated.`,
    `**Scanned:** ${carriers.length} carrier(s) with a null \`authorityGrantedDate\`${LIMIT ? ` (capped at --limit ${LIMIT})` : ""}.`,
    ``,
    `| Result | Count |`,
    `|---|---:|`,
    `| Resolved a grant date | ${resolved} |`,
    `| No record found | ${unresolved} |`,
    `| Lookup errored | ${errored} |`,
    COMMIT ? `| **Written to DB** | **${written}** |` : `| Written to DB | 0 (dry run) |`,
    ``,
    `## What the live gate would do with these dates`,
    ``,
    `Populating this column is what makes the authority-age ladder in \`complianceMonitorService\` fire for the first time. Read this before committing.`,
    ``,
    `| Gate outcome | Carriers |`,
    `|---|---:|`,
    `| **Hard block (under 12 months)** | **${verdictTally.block}** |`,
    `| Override-eligible (12–18 months) | ${verdictTally.override} |`,
    `| Allowed (18+ months) | ${verdictTally.allowed} |`,
    `| Unresolved — stays warn-only | ${verdictTally.unresolved} |`,
    ``,
    verdictTally.block > 0
      ? `> ${verdictTally.block} carrier(s) would be **blocked from tendering** the moment this is committed. Confirm that is intended before running with \`--commit\`.`
      : `> No carrier in this scan would be hard-blocked by committing these dates.`,
    ``,
    `## Per-carrier detail`,
    ``,
    `| Carrier | DOT | MC | Status | Resolved grant | Auth type | Docket | Matched by | Disposition | Gate verdict |`,
    `|---|---|---|---|---|---|---|---|---|---|`,
    ...rows,
    ``,
    `## Method`,
    ``,
    `Per carrier: query the dataset by MC docket first (exact index key, cannot collide), fall back to the DOT zero-padded to 8 characters. Among the returned rows keep only \`GRANTED\` ones, prefer \`MOTOR\` operating-authority types over broker/forwarder, and take the **earliest** such grant.`,
    ``,
    `Earliest is deliberate and matches the reinstatement caveat already recorded in the carrier-lifecycle audit: age anchors on the original grant, not the most recent reinstatement, so a revoked-then-reinstated carrier reads as older than they operationally are. The separate FMCSA-status gate is what catches an authority that is not currently active — the \`Disposition\` column above surfaces those rows so a human can see them.`,
    ``,
    `\`--commit\` only ever fills a null. It will not overwrite a date an admin set by hand via \`setAuthorityGrantDate\` (v3.8.aio); the manual-correction path outranks a bulk import.`,
    ``,
  ].join("\n");

  writeFileSync(reportPath, report, "utf8");
  console.log(`[backfill] report: ${reportPath}`);
  console.log(
    `[backfill] resolved=${resolved} unresolved=${unresolved} errored=${errored} written=${written} ` +
      `| gate: block=${verdictTally.block} override=${verdictTally.override} allowed=${verdictTally.allowed}`,
  );
  if (!COMMIT) console.log("[backfill] DRY RUN — nothing was written. Re-run with --commit to apply.");

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("[backfill] FAILED:", e);
  await prisma.$disconnect();
  process.exit(1);
});
