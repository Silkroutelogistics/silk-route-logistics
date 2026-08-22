/**
 * ARC 25 PHASE 1 — the chameleon block gains a scoped override, and it behaves.
 *
 * Arc 24 ratified the block and built its human exit (review the matches). This
 * adds the release valve for the case where a load cannot wait for triage: a
 * checkCode-scoped ComplianceOverride, mirroring AUTHORITY_TOO_YOUNG exactly.
 *
 * What actually needs proving is not "the override works". It is:
 *   - the block returns when the override EXPIRES, because nothing about the
 *     carrier changed — an override that silently became permanent would be a
 *     waiver disguised as a delay;
 *   - a scoped override releases ONLY its own block, so overriding chameleon
 *     does not quietly also waive insurance or authority;
 *   - the message still names the review FIRST;
 *   - a typo'd checkCode is refused rather than minting a row that matches
 *     nothing, counts against the quota, and releases nothing.
 *
 * Also RECORDS, without changing, what a blanket override does today.
 *
 * SAFETY: rehearsal container only; both outbound keys explicitly EMPTY.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/5543[2-9]/.test(url)) { console.error("REFUSING: not a rehearsal container."); process.exit(1); }
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

const PORT = 55825;
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
  const { recomputeChameleonRiskLevel } = await import("../src/services/chameleonDetectionService");

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
        email: `${tag}-${stamp}@arc25.invalid`, passwordHash: "x", firstName: "T25",
        lastName: tag, role: "CARRIER", company: `${tag} LLC`, phone: `+1269${String(stamp).slice(-7)}`,
      },
    });
    const cp = await prisma.carrierProfile.create({
      data: {
        userId: u.id, companyName: `${tag} LLC`,
        mcNumber: `MC-T25-${tag}-${stamp}`.slice(0, 30), dotNumber: `${String(stamp).slice(-6)}${n}`,
        onboardingStatus: "APPROVED", status: "APPROVED", cppTier: "SILVER",
        equipmentTypes: ["DRY_VAN"], operatingRegions: ["Midwest"],
      },
    });
    await prisma.carrierAgreement.create({
      data: { carrierId: cp.id, templateName: "broker-carrier", version: "arc25", status: "SIGNED", signedAt: new Date(), signedByName: "T25" },
    });
    return cp;
  };

  const subject = await mk("subj", 1);
  const other = await mk("othr", 2);
  const admin = await prisma.user.create({
    data: { email: `adm-${stamp}@arc25.invalid`, passwordHash: "x", firstName: "T25", lastName: "Adm", role: "ADMIN" },
  });
  await prisma.chameleonMatch.create({
    data: { carrierId: subject.id, matchedCarrierId: other.id, matchType: "EIN", riskScore: 90, status: "OPEN" },
  });
  await recomputeChameleonRiskLevel(subject.id);

  const cookie = `srl_token_ae=${jwt.sign({ userId: admin.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" })}`;
  const H = { Cookie: cookie, "Content-Type": "application/json" };
  const cham = (v: { blocked_reasons?: string[] }) =>
    (v.blocked_reasons || []).filter((r) => r.toLowerCase().includes("chameleon"));

  // ── 1. blocked, with a machine-readable code ─────────────────────────
  const v0 = await complianceCheck(subject.id);
  const code0 = (v0.blocked_codes || []).find((c) => c.code === "CHAMELEON_UNREVIEWED");
  check("the block now carries a machine-readable, override-eligible code",
    !v0.allowed && !!code0 && code0.overridable === true,
    `allowed=${v0.allowed}, blocked_codes=${JSON.stringify(v0.blocked_codes)}`);

  // ── 2. the review is named FIRST, the override second ────────────────
  const msg = cham(v0)[0] || "";
  const iReview = msg.search(/Security Signals card/i);
  const iOverride = msg.search(/override/i);
  check("the message names the REVIEW before the override",
    iReview > -1 && iOverride > -1 && iReview < iOverride,
    `review at ${iReview}, override at ${iOverride} — "${msg.slice(0, 110)}..."`);

  // ── 3. a typo'd checkCode is refused, not silently minted ────────────
  const rTypo = await fetch(`${BASE}/compliance/carrier/${subject.id}/override-block`, {
    method: "POST", headers: H,
    body: JSON.stringify({ reason: "typo test, should be refused", checkCode: "CHAMELEON_UNREVIEW" }),
  });
  const typoBody: any = await rTypo.json().catch(() => ({}));
  check("a typo'd checkCode is refused rather than minting a dead override",
    rTypo.status === 400 && typoBody.code === "UNKNOWN_CHECK_CODE",
    `HTTP ${rTypo.status} ${typoBody.code || ""} — ${(typoBody.error || "").slice(0, 90)}`);

  // ── 4. the scoped override releases it ───────────────────────────────
  const rOv = await fetch(`${BASE}/compliance/carrier/${subject.id}/override-block`, {
    method: "POST", headers: H,
    body: JSON.stringify({ reason: "Load must move tonight; triage scheduled for tomorrow AM.", checkCode: "CHAMELEON_UNREVIEWED" }),
  });
  const v1 = await complianceCheck(subject.id);
  check("a scoped CHAMELEON_UNREVIEWED override releases the block",
    rOv.status < 300 && v1.allowed && cham(v1).length === 0,
    `HTTP ${rOv.status}, allowed=${v1.allowed}, chameleon blocks ${cham(v0).length} -> ${cham(v1).length}`);
  check("and it says so as a warning, not silently",
    (v1.warnings || []).some((w) => /CHAMELEON_OVERRIDE/.test(w)),
    `warnings: ${JSON.stringify(v1.warnings)}`);

  // ── 5. THE BLOCK RETURNS WHEN IT EXPIRES ─────────────────────────────
  // Nothing about the carrier changed, so a delay must not become a waiver.
  await prisma.complianceOverride.updateMany({
    where: { carrierId: subject.id, checkCode: "CHAMELEON_UNREVIEWED" },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });
  const v2 = await complianceCheck(subject.id);
  check("THE BLOCK RETURNS WHEN THE OVERRIDE EXPIRES — a delay, not a waiver",
    !v2.allowed && cham(v2).length === 1,
    `allowed=${v2.allowed}, chameleon blocks=${cham(v2).length}`);

  // ── 6. scoped means scoped ───────────────────────────────────────────
  // Add a second, unrelated block and confirm the chameleon override does not
  // touch it. An override that quietly widened would be the blanket override
  // wearing a checkCode.
  await prisma.carrierProfile.update({
    where: { id: subject.id },
    data: { insuranceExpiry: new Date(Date.now() - 864e5) },
  });
  await prisma.complianceOverride.updateMany({
    where: { carrierId: subject.id, checkCode: "CHAMELEON_UNREVIEWED" },
    data: { expiresAt: new Date(Date.now() + 3600_000) },
  });
  const v3 = await complianceCheck(subject.id);
  check("a scoped override releases ONLY its own block",
    cham(v3).length === 0 && (v3.blocked_reasons || []).some((r) => /Insurance has expired/.test(r)),
    `chameleon=${cham(v3).length}, other blocks still standing: ${JSON.stringify((v3.blocked_reasons || []).slice(0, 2))}`);

  // ── 7. RECORD what a blanket override does. Not a change — a finding. ─
  await prisma.complianceOverride.deleteMany({ where: { carrierId: subject.id } });
  await prisma.complianceOverride.create({
    data: {
      carrierId: subject.id, adminId: admin.id, checkCode: null,
      reason: "blanket semantics probe", expiresAt: new Date(Date.now() + 3600_000),
    },
  });
  const v4 = await complianceCheck(subject.id);
  check("RECORDED (not changed): a BLANKET override releases everything, incl. expired insurance",
    v4.allowed && (v4.blocked_reasons || []).length === 0,
    `allowed=${v4.allowed}, blocked_reasons=${JSON.stringify(v4.blocked_reasons)} — expired insurance is waived too`);

  // ── 8. tripwire ──────────────────────────────────────────────────────
  await prisma.complianceOverride.deleteMany({ where: { carrierId: subject.id } });
  const v5 = await complianceCheck(subject.id);
  check("the probe was measuring a genuinely blocked carrier throughout",
    !v5.allowed && cham(v5).length === 1,
    `with every override removed: allowed=${v5.allowed}, chameleon blocks=${cham(v5).length}`);

  server.close();
  await prisma.$disconnect();
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0 ? "SCOPED OVERRIDE BEHAVES — releases its own block, returns on expiry, refuses typos" : `FAILED (${failed})`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
