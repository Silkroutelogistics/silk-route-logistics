/**
 * ARC 24 PHASE 1 — the ratified chameleon block, and its named human exit.
 *
 * §14 (ratified 2026-08-21): severe carrier-specific fraud signals may block a
 * tender; the block must always name its human exit.
 *
 * The block itself already existed — under a comment reading "SOFT WARNING",
 * while pushing to blocked_reasons. What did NOT exist was the exit. Reviewing
 * a match wrote ChameleonMatch.status and nothing else, so chameleonRiskLevel
 * stayed HIGH and the carrier stayed blocked forever. Worse, the next scan
 * looked the pair up with a filter that excluded DISMISSED, found nothing, and
 * RECREATED it as a fresh OPEN row — erasing the reviewer's decision.
 *
 * The load-bearing assertions here are therefore not "the block exists". They
 * are: the block NAMES the remedy, clearing actually RELEASES it, confirming
 * does NOT release it, and a rescan does NOT resurrect a cleared match.
 *
 * Presence is not function (§19 Sub-pattern 16): the review goes through the
 * real router over HTTP with a real admin session, and the tender decision
 * comes from the real complianceCheck, never a reproduction.
 *
 * SAFETY: rehearsal container only; both outbound keys explicitly EMPTY.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/5543[2-6]/.test(url)) {
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

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55824;
const BASE = `http://127.0.0.1:${PORT}/api`;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

async function main() {
  const { prisma } = await import("../src/config/database");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;
  const { complianceCheck } = await import("../src/services/complianceMonitorService");

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, "127.0.0.1", () => r(s)); });
  console.log(`app: real router mounted on :${PORT}\n`);

  const stamp = Date.now();
  const mk = async (tag: string, n: number) => {
    const u = await prisma.user.create({
      data: {
        email: `${tag}-${stamp}@arc24.invalid`, passwordHash: "x", firstName: "T24",
        lastName: tag, role: "CARRIER", company: `${tag} LLC`, phone: `+1269${String(stamp).slice(-7)}`,
      },
    });
    const cp = await prisma.carrierProfile.create({
      data: {
        userId: u.id, companyName: `${tag} LLC`,
        mcNumber: `MC-T24-${tag}-${stamp}`.slice(0, 30),
        dotNumber: `${String(stamp).slice(-6)}${n}`,
        onboardingStatus: "APPROVED", status: "APPROVED", cppTier: "SILVER",
        equipmentTypes: ["DRY_VAN"], operatingRegions: ["Midwest"],
      },
    });
    // A signed BCA, so the ONLY thing standing between this carrier and a
    // tender is the chameleon block we are testing.
    await prisma.carrierAgreement.create({
      data: {
        carrierId: cp.id, templateName: "broker-carrier", version: "arc24",
        status: "SIGNED", signedAt: new Date(), signedByName: "T24",
      },
    });
    return { user: u, profile: cp };
  };

  const subject = await mk("subj", 1);
  const other = await mk("othr", 2);
  const admin = await prisma.user.create({
    data: { email: `adm-${stamp}@arc24.invalid`, passwordHash: "x", firstName: "T24", lastName: "Adm", role: "ADMIN" },
  });

  // One match at risk 90 — above the >= 75 threshold, so HIGH on its own.
  const match = await prisma.chameleonMatch.create({
    data: { carrierId: subject.profile.id, matchedCarrierId: other.profile.id, matchType: "EIN", riskScore: 90, status: "OPEN" },
  });
  const { recomputeChameleonRiskLevel } = await import("../src/services/chameleonDetectionService");
  await recomputeChameleonRiskLevel(subject.profile.id);

  const cookie = `srl_token_ae=${jwt.sign({ userId: admin.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" })}`;
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const chameleonReasons = (v: { blocked_reasons?: string[] }) =>
    (v.blocked_reasons || []).filter((r) => r.toLowerCase().includes("chameleon"));

  // ── 1. the carrier is blocked ────────────────────────────────────────
  const lvl0 = (await prisma.carrierProfile.findUnique({ where: { id: subject.profile.id } }))!.chameleonRiskLevel;
  const v0 = await complianceCheck(subject.profile.id);
  check("a HIGH-risk carrier is blocked from tendering",
    lvl0 === "HIGH" && !v0.allowed && chameleonReasons(v0).length === 1,
    `riskLevel=${lvl0}, allowed=${v0.allowed}, chameleon blocks=${chameleonReasons(v0).length}`);

  // ── 2. THE BLOCK NAMES ITS EXIT — this is the §14 promise ────────────
  const msg = chameleonReasons(v0)[0] || "";
  check("THE BLOCK NAMES ITS HUMAN EXIT (the §14 promise)",
    /Security Signals card/i.test(msg) && /clear/i.test(msg),
    `"${msg}"`);

  // ── 3. a real tender is actually refused ─────────────────────────────
  const customer = await prisma.customer.create({
    data: { name: `T24 ${stamp}`, email: `cust-${stamp}@arc24.invalid`, phone: "2692206760" },
  });
  const mkLoad = async () => prisma.load.create({
    data: {
      loadNumber: `T24-${stamp}-${Math.floor(Math.random() * 1e6)}`, customerId: customer.id,
      posterId: admin.id, status: "POSTED", commodity: "ARC24", equipmentType: "DRY_VAN",
      originCity: "Detroit", originState: "MI", originZip: "48201",
      destCity: "Chicago", destState: "IL", destZip: "60601",
      pickupDate: new Date(Date.now() + 864e5), deliveryDate: new Date(Date.now() + 1728e5),
      customerRate: 2000, rate: 2000, carrierRate: 1700, weight: 20000,
    },
  });
  const tender = async () => {
    const load = await mkLoad();
    const r = await fetch(`${BASE}/loads/${load.id}/tender`, {
      method: "POST", headers: H,
      body: JSON.stringify({
        carrierId: subject.profile.id, offeredRate: 1700,
        expiresAt: new Date(Date.now() + 864e5).toISOString(),
      }),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  const t0 = await tender();
  check("the real tender endpoint refuses while the block stands",
    t0.status >= 400,
    `HTTP ${t0.status} — ${JSON.stringify(t0.body).slice(0, 150)}`);

  // ── 4. clearing it RELEASES the block ────────────────────────────────
  const rClear = await fetch(`${BASE}/carriers/chameleon-matches/${match.id}/review`, {
    method: "PUT", headers: H,
    body: JSON.stringify({ status: "DISMISSED", notes: "Shared registered-agent address; unrelated owners. Verified by phone." }),
  });
  const lvl1 = (await prisma.carrierProfile.findUnique({ where: { id: subject.profile.id } }))!.chameleonRiskLevel;
  const v1 = await complianceCheck(subject.profile.id);
  check("CLEARING THE MATCH RELEASES THE BLOCK — the exit is real, not advertised",
    rClear.status === 200 && lvl1 !== "HIGH" && chameleonReasons(v1).length === 0,
    `HTTP ${rClear.status}, riskLevel ${lvl0} -> ${lvl1}, chameleon blocks ${chameleonReasons(v0).length} -> ${chameleonReasons(v1).length}`);

  const t1 = await tender();
  check("and the tender now goes through",
    t1.status >= 200 && t1.status < 300,
    `HTTP ${t1.status}`);

  // ── 5. a rescan must not resurrect a cleared match ───────────────────
  const before = await prisma.chameleonMatch.count({ where: { carrierId: subject.profile.id } });
  const { checkChameleon } = await import("../src/services/chameleonDetectionService");
  await checkChameleon(subject.profile.id).catch(() => null);
  const after = await prisma.chameleonMatch.count({ where: { carrierId: subject.profile.id } });
  const lvl2 = (await prisma.carrierProfile.findUnique({ where: { id: subject.profile.id } }))!.chameleonRiskLevel;
  check("a rescan does NOT resurrect the cleared match, nor re-block",
    after === before && lvl2 !== "HIGH",
    `matches ${before} -> ${after}, riskLevel=${lvl2} (pre-fix the scan recreated it as OPEN and re-blocked)`);

  // ── 6. confirming is not resolving ───────────────────────────────────
  const m2 = await prisma.chameleonMatch.create({
    data: { carrierId: subject.profile.id, matchedCarrierId: other.profile.id, matchType: "PHONE", riskScore: 95, status: "OPEN" },
  });
  await recomputeChameleonRiskLevel(subject.profile.id);
  const rConfirm = await fetch(`${BASE}/carriers/chameleon-matches/${m2.id}/review`, {
    method: "PUT", headers: H,
    body: JSON.stringify({ status: "CONFIRMED_FRAUD", notes: "Same operator running a second authority. Confirmed." }),
  });
  const lvl3 = (await prisma.carrierProfile.findUnique({ where: { id: subject.profile.id } }))!.chameleonRiskLevel;
  const v3 = await complianceCheck(subject.profile.id);
  check("CONFIRMING keeps the block — a confirmation must not resolve anything",
    rConfirm.status === 200 && lvl3 === "HIGH" && chameleonReasons(v3).length === 1,
    `riskLevel=${lvl3}, chameleon blocks=${chameleonReasons(v3).length}`);

  // ── 7. the SECOND block must name its exit too ───────────────────────
  // Found by the Arc 24 fan-out: clearing a match removes a 20-point chameleon
  // deduction that is already baked into the persisted vetting score, so the
  // carrier can walk out of one block straight into another it was never told
  // about. Verified live before the fix: allowed=false, "Vetting score
  // CRITICAL: 35/100", with no remedy stated.
  await prisma.chameleonMatch.updateMany({ where: { carrierId: subject.profile.id }, data: { status: "DISMISSED" } });
  await recomputeChameleonRiskLevel(subject.profile.id);
  await prisma.carrierProfile.update({
    where: { id: subject.profile.id },
    data: { lastVettingScore: 35, lastVettedAt: new Date() },
  });
  const v4 = await complianceCheck(subject.profile.id);
  const scoreBlock = (v4.blocked_reasons || []).find((r) => /Vetting score CRITICAL/.test(r)) || "";
  check("the stale-score block that survives the clear NAMES ITS OWN EXIT",
    !!scoreBlock && /re-run vetting/i.test(scoreBlock),
    scoreBlock ? `"${scoreBlock}"` : "no score block fired — the case did not reproduce");

  // ── 8. tripwire ──────────────────────────────────────────────────────
  const mine = await prisma.chameleonMatch.count({ where: { carrierId: subject.profile.id } });
  check("the probe measured a real carrier with real matches",
    mine === 2,
    `${mine} matches seeded for this subject — the transitions above moved real rows`);

  server.close();
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0
    ? "BLOCK HOLDS AND ITS EXIT IS REAL — clearing releases, confirming does not, rescan does not resurrect"
    : `FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
