/**
 * ARC 25 PHASE 2 — measure what moving the waterfall onto complianceCheck costs.
 *
 * The brief says: measure against a realistic waterfall size, state the number,
 * and batch WITHIN the verdict logic if it is material — never fork back to
 * column reads. This is the measurement, run before deciding the shape.
 *
 * Column reads are free: the candidate findMany already selects the fields, so
 * the current filter is pure in-memory predicate work. complianceCheck is 3
 * queries typical / 6 worst per carrier, no caching, and waterfall scoring runs
 * on a user-facing request path.
 *
 * SAFETY: rehearsal container only; outbound keys explicitly EMPTY.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/5543[2-9]/.test(url)) { console.error("REFUSING: not a rehearsal container."); process.exit(1); }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    if (process.env[k] !== "") { console.error(`REFUSING: ${k} must be explicitly empty.`); process.exit(1); }
  }
  console.log("guard: rehearsal DB; outbound keys explicitly empty\n");
}
guard();

async function main() {
  const { prisma } = await import("../src/config/database");
  const { complianceCheck } = await import("../src/services/complianceMonitorService");

  const SIZES = [10, 25, 50, 100];
  const MAX = Math.max(...SIZES);
  const stamp = Date.now();

  console.log(`seeding ${MAX} SILVER, APPROVED, insured carriers with signed BCAs...`);
  const ids: string[] = [];
  for (let i = 0; i < MAX; i++) {
    const u = await prisma.user.create({
      data: {
        email: `wf-${stamp}-${i}@arc25.invalid`, passwordHash: "x", firstName: "WF",
        lastName: `C${i}`, role: "CARRIER", company: `WF ${i}`, phone: `+1269${String(stamp).slice(-5)}${String(i).padStart(2, "0")}`,
      },
    });
    const cp = await prisma.carrierProfile.create({
      data: {
        userId: u.id, companyName: `WF ${i}`,
        mcNumber: `MC-WF-${stamp}-${i}`.slice(0, 30), dotNumber: `${String(stamp).slice(-5)}${String(i).padStart(3, "0")}`,
        onboardingStatus: "APPROVED", status: "APPROVED", cppTier: "SILVER",
        equipmentTypes: ["DRY_VAN"], operatingRegions: ["Midwest"],
        insuranceExpiry: new Date(Date.now() + 365 * 864e5),
        lastVettingScore: 85, lastVettingRisk: "LOW",
      },
    });
    await prisma.carrierAgreement.create({
      data: { carrierId: cp.id, templateName: "broker-carrier", version: "arc25", status: "SIGNED", signedAt: new Date(), signedByName: "WF" },
    });
    ids.push(cp.id);
  }
  console.log(`seeded ${ids.length}\n`);

  // Warm the connection so the first measurement is not paying for setup.
  await complianceCheck(ids[0]);

  console.log("  N     column-read filter     per-carrier complianceCheck     delta");
  console.log("  ───   ────────────────────   ───────────────────────────    ──────");
  const rows: Array<{ n: number; colMs: number; gateMs: number }> = [];
  for (const n of SIZES) {
    const subset = ids.slice(0, n);

    // Column-read equivalent: one findMany selecting the fields, then the
    // in-memory predicate the waterfall runs today.
    const t0 = process.hrtime.bigint();
    const rowsCol = await prisma.carrierProfile.findMany({
      where: { id: { in: subset } },
      select: { id: true, chameleonRiskLevel: true, lastVettingRisk: true, insuranceExpiry: true },
    });
    rowsCol.filter((c) => {
      if (c.lastVettingRisk === "CRITICAL" || c.lastVettingRisk === "HIGH") return false;
      if (c.chameleonRiskLevel && ["HIGH", "CRITICAL"].includes(c.chameleonRiskLevel)) return false;
      return true;
    });
    const colMs = Number(process.hrtime.bigint() - t0) / 1e6;

    // Serial per-candidate complianceCheck, which is what a naive migration
    // would do and what waterfallTenderService already does at :50.
    const t1 = process.hrtime.bigint();
    for (const id of subset) await complianceCheck(id);
    const gateMs = Number(process.hrtime.bigint() - t1) / 1e6;

    rows.push({ n, colMs, gateMs });
    console.log(
      `  ${String(n).padEnd(5)} ${colMs.toFixed(1).padStart(10)} ms        ` +
        `${gateMs.toFixed(1).padStart(12)} ms        +${(gateMs - colMs).toFixed(0)} ms`,
    );
  }

  const worst = rows[rows.length - 1];
  const perCarrier = worst.gateMs / worst.n;
  console.log(`\n  per-carrier gate cost: ${perCarrier.toFixed(1)} ms`);
  console.log(`  at N=${worst.n} the migration adds ${(worst.gateMs - worst.colMs).toFixed(0)} ms to a request an AE is waiting on`);
  console.log(
    `\n  VERDICT: ${worst.gateMs - worst.colMs > 250
      ? "MATERIAL — batch inside the verdict logic rather than calling per carrier"
      : "not material at this size — a serial per-candidate call is acceptable"}`,
  );

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
