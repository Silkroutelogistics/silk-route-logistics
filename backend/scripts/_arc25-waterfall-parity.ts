/**
 * ARC 25 PHASE 2 — one gate, both paths.
 *
 * The waterfall used to read chameleonRiskLevel and lastVettingRisk straight
 * off the row and consult no override at all. So an AE could override a carrier
 * and hand-tender them, and that same carrier would still never appear in
 * auto-dispatch — two answers to "may this carrier haul", disagreeing silently
 * and only for the path with no human in it.
 *
 * Proves: an overridden carrier is scored, an unoverridden HIGH one is not, the
 * exclusion is logged with the GATE's reason, and the batched cost is bounded.
 *
 * SAFETY: rehearsal container only; outbound keys explicitly EMPTY.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  if (!/5543[2-9]/.test(process.env.DATABASE_URL || "")) { console.error("REFUSING: not a rehearsal container."); process.exit(1); }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    if (process.env[k] !== "") { console.error(`REFUSING: ${k} must be explicitly empty.`); process.exit(1); }
  }
  console.log("guard: rehearsal DB; outbound keys explicitly empty\n");
}
guard();

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

async function main() {
  const { prisma } = await import("../src/config/database");
  const { getEligibleCarriers } = await import("../src/services/waterfallScoringService");
  const { complianceCheckMany } = await import("../src/services/complianceMonitorService");

  const stamp = Date.now();
  const mk = async (tag: string, i: number) => {
    const u = await prisma.user.create({
      data: {
        email: `p-${tag}-${stamp}@arc25.invalid`, passwordHash: "x", firstName: "P",
        lastName: tag, role: "CARRIER", company: `P ${tag}`, phone: `+1269${String(stamp).slice(-5)}${String(i).padStart(2, "0")}`,
      },
    });
    const cp = await prisma.carrierProfile.create({
      data: {
        userId: u.id, companyName: `P ${tag}`,
        mcNumber: `MC-P-${tag}-${stamp}`.slice(0, 30), dotNumber: `${String(stamp).slice(-5)}${String(900 + i)}`,
        onboardingStatus: "APPROVED", status: "APPROVED", cppTier: "SILVER",
        equipmentTypes: ["DRY_VAN"], operatingRegions: ["Midwest"],
        insuranceExpiry: new Date(Date.now() + 365 * 864e5),
        lastVettingScore: 85, lastVettingRisk: "LOW",
      },
    });
    await prisma.carrierAgreement.create({
      data: { carrierId: cp.id, templateName: "broker-carrier", version: "arc25", status: "SIGNED", signedAt: new Date(), signedByName: "P" },
    });
    return cp;
  };

  const clean = await mk("clean", 1);
  const blocked = await mk("blocked", 2);
  const overridden = await mk("overridden", 3);
  const admin = await prisma.user.create({
    data: { email: `padm-${stamp}@arc25.invalid`, passwordHash: "x", firstName: "P", lastName: "Adm", role: "ADMIN" },
  });

  // Two carriers at HIGH chameleon; one of them holds a scoped override.
  for (const cp of [blocked, overridden]) {
    await prisma.carrierProfile.update({ where: { id: cp.id }, data: { chameleonRiskLevel: "HIGH" } });
  }
  await prisma.complianceOverride.create({
    data: {
      carrierId: overridden.id, adminId: admin.id, checkCode: "CHAMELEON_UNREVIEWED",
      reason: "Load must move; triage booked for tomorrow.", expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  const ctx = {
    equipmentType: "DRY_VAN", originState: "MI", destState: "IL",
    originCity: "Detroit", destCity: "Chicago", weight: 20000,
  } as any;

  const eligible = await getEligibleCarriers(ctx);
  const ids = new Set(eligible.map((c: { id: string }) => c.id));

  check("a clean carrier is scored",
    ids.has(clean.id), `clean present: ${ids.has(clean.id)} (of ${ids.size} eligible)`);

  check("an unoverridden HIGH-chameleon carrier is STILL excluded",
    !ids.has(blocked.id), `blocked present: ${ids.has(blocked.id)}`);

  check("AN OVERRIDDEN CARRIER NOW APPEARS — the two paths finally agree",
    ids.has(overridden.id),
    `overridden present: ${ids.has(overridden.id)} — before this it never appeared, whatever the AE did`);

  // The exclusion reason must be the gate's, not a column guess.
  const verdicts = await complianceCheckMany([blocked.id]);
  const reason = (verdicts.get(blocked.id)?.blocked_reasons || [])[0] || "";
  check("the exclusion carries the GATE's reason, naming the remedy",
    /Security Signals card/i.test(reason),
    `"${reason.slice(0, 120)}"`);

  // Selection policy retained: HIGH vetting risk is not a compliance block,
  // and dropping it would have loosened auto-dispatch.
  const risky = await mk("risky", 4);
  await prisma.carrierProfile.update({ where: { id: risky.id }, data: { lastVettingRisk: "HIGH", lastVettingScore: 50 } });
  const eligible2 = await getEligibleCarriers(ctx);
  const v = await complianceCheckMany([risky.id]);
  check("HIGH vetting risk still excluded from AUTO-dispatch though the gate only warns",
    !new Set(eligible2.map((c: { id: string }) => c.id)).has(risky.id) && v.get(risky.id)?.allowed === true,
    `excluded from waterfall: true, gate allows: ${v.get(risky.id)?.allowed} — a selection policy, not a compliance block`);

  // ── the batched cost, measured ───────────────────────────────────────
  const bulk: string[] = [];
  for (let i = 0; i < 100; i++) bulk.push((await mk(`b${i}`, 100 + i)).id);
  const t0 = process.hrtime.bigint();
  await complianceCheckMany(bulk);
  const batchedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`\n  batched verdict for 100 carriers: ${batchedMs.toFixed(0)} ms`);
  console.log(`  serial equivalent measured earlier: 5329 ms`);
  check("the batched gate is not material at 100 candidates",
    batchedMs < 1500,
    `${batchedMs.toFixed(0)} ms for 100 — vs 5329 ms serial, a ${(5329 / Math.max(batchedMs, 1)).toFixed(1)}x reduction`);

  check("the probe measured a real candidate set",
    eligible.length >= 2, `${eligible.length} carriers survived the structural filter`);

  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0 ? "ONE GATE, BOTH PATHS — overrides honored in auto-dispatch, cost bounded" : `FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
