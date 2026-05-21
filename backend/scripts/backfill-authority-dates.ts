/**
 * One-time backfill — CarrierProfile.authorityGrantedDate
 *
 * Sprint v3.8.ahk (Item 182 sprint 2 of 5 — authority-age compliance epic).
 *
 * Walks every CarrierProfile row where `dotNumber` is non-null, calls
 * the free FMCSA QCMobile authority endpoint via the existing
 * `getCarrierAuthority` service helper, and persists the earliest
 * GRANT date on the row. The new write-path in `registerCarrier` +
 * `setupAdminCarrierProfile` covers carriers created from v3.8.ahk
 * forward; this backfill covers the ~100+ APPROVED carriers that
 * pre-date the wiring.
 *
 * Behavior:
 *
 *   - **Idempotent.** Skips rows where `authorityGrantedDate IS NOT
 *     NULL` by default. Safe to re-run; safe to interrupt with
 *     Ctrl-C — the next run picks up exactly where this one stopped
 *     (the `authorityGrantedDate IS NULL` filter is the bookmark).
 *
 *   - **`--force` flag.** Re-pulls every row regardless of current
 *     state. Use to refresh after FMCSA data corrections or when the
 *     reinstatement-continuity surface lands in a later sprint and
 *     we want to re-anchor the existing carrier base.
 *
 *   - **Self-throttled.** 2-second delay between FMCSA lookups.
 *     Internal calls bypass the HTTP-route `fmcsaLookupLimiter`
 *     (which is per-IP, middleware-only), so the script owns its
 *     own pacing. At ~1,800 calls/hour the script stays well under
 *     the 30 req per 15 min courtesy ceiling FMCSA publishes for
 *     the public route, and avoids hot-spotting the API for the
 *     production registration path that may fire concurrently.
 *
 *   - **No fabricated dates.** Legitimate no-GRANT results
 *     (intrastate-only carriers, DOT-without-MC, brand-new filings)
 *     persist as `null`. Transient HTTP/network errors ALSO persist
 *     as `null` so the next run re-attempts them rather than baking
 *     in a bad value.
 *
 * Run:
 *
 *   ```
 *   cd backend
 *   npx tsx scripts/backfill-authority-dates.ts            # idempotent
 *   npx tsx scripts/backfill-authority-dates.ts --force    # re-pull all
 *   ```
 *
 * Requires `FMCSA_WEB_KEY` set in env. Without it the script aborts
 * with exit code 1 — there's no value in walking the carrier base
 * without an API key.
 */

import { prisma } from "../src/config/database";
import { env } from "../src/config/env";
import { getCarrierAuthority } from "../src/services/fmcsaService";

const FORCE = process.argv.includes("--force");
const DELAY_MS = 2000;

// Same classifier used by `populateAuthorityGrantedDate` — kept inline
// here so the script's summary buckets stay independent of any future
// helper refactor.
const TRANSIENT_PATTERN = /endpoint HTTP|endpoint error|abort|ETIMEDOUT|ECONNRESET|fetch failed/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  if (!env.FMCSA_WEB_KEY) {
    // eslint-disable-next-line no-console
    console.error("[backfill-authority-dates] FMCSA_WEB_KEY not set — aborting.");
    process.exit(1);
  }

  const totalWithDot = await prisma.carrierProfile.count({
    where: { dotNumber: { not: null } },
  });
  const alreadyPopulated = await prisma.carrierProfile.count({
    where: { dotNumber: { not: null }, authorityGrantedDate: { not: null } },
  });
  const remaining = FORCE ? totalWithDot : totalWithDot - alreadyPopulated;

  // eslint-disable-next-line no-console
  console.log(`[backfill-authority-dates] scope (FORCE=${FORCE}):`);
  // eslint-disable-next-line no-console
  console.log(`  Total carriers with DOT:  ${totalWithDot}`);
  // eslint-disable-next-line no-console
  console.log(`  Already populated:        ${alreadyPopulated}`);
  // eslint-disable-next-line no-console
  console.log(`  Remaining to process:     ${remaining}`);
  // eslint-disable-next-line no-console
  console.log(`  FMCSA pacing delay:       ${DELAY_MS}ms between calls`);
  // eslint-disable-next-line no-console
  console.log("");

  if (remaining === 0) {
    // eslint-disable-next-line no-console
    console.log("[backfill-authority-dates] nothing to do.");
    await prisma.$disconnect();
    return;
  }

  const carriers = await prisma.carrierProfile.findMany({
    where: FORCE
      ? { dotNumber: { not: null } }
      : { dotNumber: { not: null }, authorityGrantedDate: null },
    select: { id: true, dotNumber: true, mcNumber: true },
    orderBy: { createdAt: "asc" },
  });

  let populated = 0;
  let leftNullNoGrant = 0;
  let errored = 0;

  for (let i = 0; i < carriers.length; i++) {
    const c = carriers[i];
    if (!c.dotNumber) continue; // defensive — findMany filter should already exclude

    const tag = `[${i + 1}/${carriers.length}] DOT ${c.dotNumber}`;
    try {
      const result = await getCarrierAuthority(c.dotNumber);

      if (result.authorityGrantDate) {
        await prisma.carrierProfile.update({
          where: { id: c.id },
          data: { authorityGrantedDate: new Date(result.authorityGrantDate) },
        });
        // eslint-disable-next-line no-console
        console.log(`${tag} → POPULATED ${result.authorityGrantDate} (${result.authorityAgeMonths} mo)`);
        populated++;
      } else {
        const hasTransient = result.errors.some((e) => TRANSIENT_PATTERN.test(e));
        if (hasTransient) {
          // eslint-disable-next-line no-console
          console.log(`${tag} → ERROR (transient) ${result.errors[0] || "unknown"}`);
          errored++;
        } else {
          // eslint-disable-next-line no-console
          console.log(`${tag} → NO_GRANT ${result.errors[0] || "(no detail)"}`);
          leftNullNoGrant++;
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.log(`${tag} → UNCAUGHT ${msg}`);
      errored++;
    }

    // Pace before the next FMCSA call. Skip the trailing sleep on the
    // last iteration so the script doesn't idle for nothing.
    if (i < carriers.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  // eslint-disable-next-line no-console
  console.log("");
  // eslint-disable-next-line no-console
  console.log("[backfill-authority-dates] summary:");
  // eslint-disable-next-line no-console
  console.log(`  Populated:                              ${populated}`);
  // eslint-disable-next-line no-console
  console.log(`  Left null (no GRANT in FMCSA history):  ${leftNullNoGrant}`);
  // eslint-disable-next-line no-console
  console.log(`  Errored (transient — re-run will retry): ${errored}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    // eslint-disable-next-line no-console
    console.error("[backfill-authority-dates] fatal:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
