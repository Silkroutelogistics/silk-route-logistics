/**
 * Local-container proof for v3.8.bbv + v3.8.bbw: the production shape, then
 * one rescan.
 *
 * Production on 2026-09-17 held six live gmail.com carriers with DISTINCT
 * inboxes, every one carrying sha256("gmail.com") as its EMAIL fingerprint,
 * 26 OPEN EMAIL rows between them, and chameleonRiskLevel HIGH on five — the
 * domain-only rule's output. This seeds exactly that shape for four carriers
 * and runs the real runFullChameleonScan, which is also what the post-deploy
 * step calls (POST /carriers/chameleon/scan).
 *
 * Asserts: every stale OPEN row is DISMISSED as a system retirement, every
 * unjudged level is NONE and a judged row keeps its weight, one audit row per carrier retired, a human-judged row is
 * untouched, and no outbound was sent.
 *
 * Run (rehearsal container ONLY; the guard refuses anything else):
 *   DATABASE_URL=postgresql://ci:ci@localhost:55434/ci \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= npx tsx scripts/_arc-chameleon-retire-proof.ts
 */
function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url) || !/5543[2-9]|5544[0-9]/.test(url)) {
    console.error("REFUSING: DATABASE_URL is not a rehearsal container."); process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  console.log("guard: rehearsal DB; outbound keys explicitly empty (post-dotenv)\n");
}
guard();

import crypto from "crypto";

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}\n        ${detail}`);
}
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

async function main() {
  const { prisma } = await import("../src/config/database");
  const { runFullChameleonScan, RETIRED_BY_RESCAN_NOTE } = await import("../src/services/chameleonDetectionService");

  const stamp = Date.now();
  const tags = ["cjmaster", "aeroswift", "eaglefleet", "falcon"];
  const ids: string[] = [];
  for (let i = 0; i < tags.length; i++) {
    const u = await prisma.user.create({
      data: {
        email: `${tags[i]}.${stamp}@gmail.com`, passwordHash: "x",
        firstName: "R", lastName: tags[i], role: "CARRIER",
        company: `${tags[i]} Inc`, phone: `+1269700${String(stamp + i).slice(-4)}`,
      },
    });
    const p = await prisma.carrierProfile.create({
      data: {
        userId: u.id, companyName: `${tags[i].toUpperCase()} INC`,
        mcNumber: `MC-R-${tags[i]}-${stamp}`.slice(0, 30),
        dotNumber: `${String(stamp).slice(-6)}${i}`,
        onboardingStatus: "REVIEWING", status: "REVIEW",
        equipmentTypes: ["DRY_VAN"], operatingRegions: ["Midwest"],
        chameleonRiskLevel: "HIGH",
      },
    });
    ids.push(p.id);
    // The domain-only fingerprint, exactly as production stored it.
    await prisma.carrierFingerprint.create({ data: { carrierId: p.id, emailHash: sha("gmail.com") } });
  }
  // Every ordered pair carries a stale OPEN EMAIL row, as the old scan wrote.
  let staleCount = 0;
  for (const a of ids) for (const b of ids) if (a !== b) {
    await prisma.chameleonMatch.create({ data: { carrierId: a, matchedCarrierId: b, matchType: "EMAIL", riskScore: 25, status: "OPEN" } });
    staleCount++;
  }
  // One HUMAN judgment on the first carrier, which must survive the rescan.
  const judged = await prisma.chameleonMatch.create({
    data: { carrierId: ids[0], matchedCarrierId: ids[1], matchType: "ADDRESS", riskScore: 25, status: "REVIEWED", reviewedById: null, reviewNotes: "AE looked" },
  });

  const before = await prisma.chameleonMatch.count({ where: { carrierId: { in: ids }, status: "OPEN" } });
  const levelsBefore = (await prisma.carrierProfile.findMany({ where: { id: { in: ids } }, select: { chameleonRiskLevel: true } })).map((c) => c.chameleonRiskLevel);
  console.log(`seeded: ${ids.length} gmail carriers, ${before} OPEN EMAIL rows, levels ${levelsBefore.join(",")}\n`);

  const scan = await runFullChameleonScan();
  console.log(`\nscan: ${JSON.stringify(scan)}\n`);

  const openAfter = await prisma.chameleonMatch.count({ where: { carrierId: { in: ids }, status: "OPEN" } });
  check("OPEN EMAIL rows go to ZERO", openAfter === 0, `${before} -> ${openAfter}`);

  const retired = await prisma.chameleonMatch.findMany({ where: { carrierId: { in: ids }, matchType: "EMAIL" }, select: { status: true, reviewedById: true, reviewedAt: true, reviewNotes: true } });
  check("every stale row is DISMISSED as a SYSTEM retirement",
    retired.length === staleCount && retired.every((r) => r.status === "DISMISSED" && r.reviewedById === null && r.reviewedAt !== null && r.reviewNotes === RETIRED_BY_RESCAN_NOTE),
    `${retired.filter((r) => r.status === "DISMISSED").length}/${retired.length} DISMISSED, reviewedById null on ${retired.filter((r) => r.reviewedById === null).length}`);

  const fps = await prisma.carrierFingerprint.findMany({ where: { carrierId: { in: ids } }, select: { emailHash: true } });
  check("fingerprints were rebuilt under the inbox rule — no two share a hash",
    new Set(fps.map((f) => f.emailHash)).size === ids.length && !fps.some((f) => f.emailHash === sha("gmail.com")),
    `${new Set(fps.map((f) => f.emailHash)).size} distinct hashes across ${ids.length}; domain hash present: ${fps.some((f) => f.emailHash === sha("gmail.com"))}`);

  const after = await prisma.carrierProfile.findMany({ where: { id: { in: ids } }, select: { id: true, chameleonRiskLevel: true } });
  const levelOf = (id: string) => after.find((c) => c.id === id)!.chameleonRiskLevel;
  // ids[0] carries the human-judged REVIEWED row (score 25), which a rescan
  // must NOT erase — so its level is LOW, read from that standing row. The
  // other three had only domain-hash evidence and go to NONE. Both halves are
  // the same property: the scan writes what the standing rows say.
  check("the three carriers with only domain-hash evidence are written NONE",
    ids.slice(1).every((id) => levelOf(id) === "NONE"), `${levelsBefore.join(",")} -> ${ids.map(levelOf).join(",")}`);
  check("the carrier with a human-judged row keeps that row's weight (LOW), not the retired rows' (HIGH)",
    levelOf(ids[0]) === "LOW", `carrier[0]: HIGH -> ${levelOf(ids[0])}`);

  const j = await prisma.chameleonMatch.findUnique({ where: { id: judged.id } });
  check("the human-judged REVIEWED row is untouched", j?.status === "REVIEWED" && j.reviewNotes === "AE looked", `${j?.status}, note=${j?.reviewNotes}`);

  const audits = await prisma.systemLog.findMany({ where: { source: "chameleon-rescan-retire", createdAt: { gte: new Date(stamp) } } });
  const mine = audits.filter((a) => ids.includes((a.details as any)?.carrierId));
  const idsLogged = mine.reduce((n, a) => n + ((a.details as any)?.retiredMatchIds?.length ?? 0), 0);
  check("one audit row per carrier retired, carrying the retired ids", mine.length === ids.length && idsLogged === staleCount, `${mine.length} rows, ${idsLogged} ids logged of ${staleCount} retired`);

  check("the zero above is real, not an empty seed", before === staleCount && staleCount === ids.length * (ids.length - 1), `seeded ${staleCount} OPEN rows, ${before} observed before the scan`);

  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0 ? "RESCAN RETIRES THE DOMAIN-HASH ROWS AND WRITES NONE" : `FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
