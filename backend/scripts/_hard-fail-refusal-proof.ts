/**
 * Commit-9a proof: a HARD_FAIL block refuses the tender, and leaves nothing.
 *
 * Three things have to be true together, and only the first is obvious. The
 * request must 4xx; no LoadTender row may exist afterwards; and no LoadActivity
 * row may exist either. The third is the one worth proving — `createTenderRow`
 * writes a tender and its opening transition, so a gate that let the write
 * start and failed midway would leave a history row for a tender nobody has.
 *
 * Also proves the sixth absolute end to end: expired insurance blocks, a
 * BLANKET override does not release it, and the override endpoint refuses to
 * mint one scoped to it. Marking it un-waivable in the gate while the endpoint
 * still minted would be the half-mirrored state §14 names as the failure.
 *
 * Real router over HTTP, real database. Rehearsal container only; outbound keys
 * must be explicitly empty.
 */
function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  console.log("guard: local DB; outbound keys explicitly empty (post-dotenv)\n");
}
guard();

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55919;
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { complianceCheck } = await import("../src/services/complianceMonitorService");
  const { registerSession } = await import("../src/middleware/auth");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((resolve) => {
    const srv = app.listen(PORT, "127.0.0.1", () => resolve(srv));
  });
  console.log(`app: real router mounted on :${PORT}\n`);

  const stamp = Date.now();
  const madeLoads: string[] = [];

  const admin = await prisma.user.create({
    data: { email: `hf-admin-${stamp}@srl.invalid`, passwordHash: "x", firstName: "H", lastName: "F", role: "ADMIN" },
  });
  const token = jwt.sign({ userId: admin.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(admin.id, token, "ADMIN");
  const cookie = `srl_token_ae=${token}`;

  // A carrier that is compliant in every way except that its cover lapsed.
  const cu = await prisma.user.create({
    data: { email: `hf-carrier-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Lapsed", lastName: "Co", role: "CARRIER" },
  });
  const carrier = await prisma.carrierProfile.create({
    data: {
      userId: cu.id, companyName: `HF Lapsed ${stamp}`,
      onboardingStatus: "APPROVED", status: "APPROVED",
      insuranceExpiry: new Date(Date.now() - 30 * 86_400_000),
    },
  });
  await prisma.carrierAgreement.create({
    data: {
      carrierId: carrier.id, templateName: "broker-carrier", version: "test",
      status: "SIGNED", signedAt: new Date(), signedByName: "Lapsed Co",
    },
  });

  const load = await prisma.load.create({
    data: {
      referenceNumber: `HF-${stamp}`, posterId: admin.id, status: "POSTED",
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "75568",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 4100, carrierRate: 4100,
    },
  });
  madeLoads.push(load.id);

  // ── 1. the gate ─────────────────────────────────────────────────────────────
  console.log("[1] expired insurance is an absolute, not a judgement call");
  const v1 = await complianceCheck(carrier.id);
  ok("the carrier is blocked", v1.allowed === false);
  const code = v1.blocked_codes.find((c) => c.code === "INSURANCE_EXPIRED");
  ok("a machine-readable code is returned", !!code, JSON.stringify(v1.blocked_codes));
  ok("and it says it is not overridable", code?.overridable === false);

  // ── 2. refusal leaves nothing behind ────────────────────────────────────────
  console.log("\n[2] the tender is refused, and nothing is written");
  const res = await fetch(`${BASE}/loads/${load.id}/tender`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ carrierId: carrier.id, offeredRate: 4100, expiresAt: new Date(Date.now() + 7.2e6).toISOString() }),
  });
  const body = await res.json().catch(() => ({}));
  ok("the request is refused with a 4xx", res.status >= 400 && res.status < 500, `status=${res.status}`);
  ok("the refusal names the code, not just prose",
     Array.isArray(body.blocked_codes) && body.blocked_codes.some((c: { code: string }) => c.code === "INSURANCE_EXPIRED"),
     JSON.stringify(body).slice(0, 200));
  ok("NO tender row exists", (await prisma.loadTender.count({ where: { loadId: load.id } })) === 0);
  ok("NO history row exists either",
     (await prisma.loadActivity.count({ where: { loadId: load.id } })) === 0,
     "createTender writes a tender AND its opening transition — a gate that let the write start would leave an orphan");
  ok("and the load did not advance to TENDERED",
     (await prisma.load.findUniqueOrThrow({ where: { id: load.id } })).status === "POSTED");

  // ── 3. a blanket override does not release it ───────────────────────────────
  console.log("\n[3] a blanket override releases judgement calls, not facts");
  await prisma.complianceOverride.create({
    data: {
      carrierId: carrier.id, reason: "proof: blanket override should not reach an absolute",
      adminId: admin.id, expiresAt: new Date(Date.now() + 86_400_000), checkCode: null,
    },
  });
  const v3 = await complianceCheck(carrier.id);
  ok("still blocked under a live blanket override", v3.allowed === false);
  ok("the code still comes back so the UI knows why",
     v3.blocked_codes.some((c) => c.code === "INSURANCE_EXPIRED"));
  ok("and the reason is KEPT rather than moved to released",
     v3.blocked_reasons.some((r) => /Insurance has expired/.test(r)) &&
       !v3.released.some((r) => /Insurance has expired/.test(r)));

  const res3 = await fetch(`${BASE}/loads/${load.id}/tender`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ carrierId: carrier.id, offeredRate: 4100, expiresAt: new Date(Date.now() + 7.2e6).toISOString() }),
  });
  ok("the tender is still refused with the override in force", res3.status >= 400 && res3.status < 500, `status=${res3.status}`);
  ok("and still nothing was written", (await prisma.loadTender.count({ where: { loadId: load.id } })) === 0);

  // ── 4. the endpoint refuses to mint one ─────────────────────────────────────
  console.log("\n[4] the endpoint will not mint an override scoped to it");
  const res4 = await fetch(`${BASE}/compliance/carrier/${carrier.id}/override-block`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "proof: this must be refused outright", checkCode: "INSURANCE_EXPIRED" }),
  });
  const b4 = await res4.json().catch(() => ({}));
  // 409 HARD_FLOOR_NOT_OVERRIDABLE specifically, not merely "some 4xx".
  // Dropping it from NEVER_OVERRIDABLE still produces a refusal -- 400
  // UNKNOWN_CHECK_CODE, because it is not a scoped code either -- so a loose
  // assertion here passes while the mirror is half gone. Verified: the loose
  // version stayed 17/17 under exactly that injection.
  ok("minting a scoped INSURANCE_EXPIRED override is refused as a hard floor",
     res4.status === 409 && b4.code === "HARD_FLOOR_NOT_OVERRIDABLE",
     `status=${res4.status} code=${b4.code}`);
  ok("and the refusal says the remedy is to change the fact",
     typeof b4.error === "string" && /fact held by another party/.test(b4.error),
     JSON.stringify(b4).slice(0, 160));

  // ── 5. the grace period is untouched ────────────────────────────────────────
  console.log("\n[5] a granted grace period is still a warning, not a block");
  await prisma.carrierProfile.update({
    where: { id: carrier.id },
    data: { insuranceGracePeriodEnd: new Date(Date.now() + 7 * 86_400_000) },
  });
  const v5 = await complianceCheck(carrier.id);
  ok("a live grace period does NOT block", !v5.blocked_reasons.some((r) => /Insurance has expired/.test(r)),
     "the grace period is SRL granting time deliberately, with an end date — not an AE waving a lapse through");
  ok("it warns instead", v5.warnings.some((w) => /grace period active/.test(w)));

  // 6. an override that DOES release is recorded on the tender
  console.log("\n[6] a tender created under an override says so, on the tender");
  await prisma.carrierProfile.update({
    where: { id: carrier.id },
    // Clear the absolute and leave a WAIVABLE block standing: a critical
    // vetting score is a judgement call, which is exactly what an override is
    // for. Without one there is nothing to release and the case proves nothing.
    data: {
      insuranceExpiry: new Date(Date.now() + 365 * 86_400_000),
      insuranceGracePeriodEnd: null,
      lastVettingScore: 30,
      lastVettedAt: new Date(),
    },
  });
  const v6 = await complianceCheck(carrier.id);
  ok("with the absolute cleared, the blanket override now releases something",
     v6.allowed === true && !!v6.appliedOverrideId,
     `allowed=${v6.allowed} released=${JSON.stringify(v6.released)} id=${v6.appliedOverrideId}`);

  const res6 = await fetch(`${BASE}/loads/${load.id}/tender`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ carrierId: carrier.id, offeredRate: 4100, expiresAt: new Date(Date.now() + 7.2e6).toISOString() }),
  });
  ok("the tender is created", res6.status === 201, `status=${res6.status}`);
  const t6 = await prisma.loadTender.findFirst({ where: { loadId: load.id } });
  ok("and it records WHICH override let it happen",
     !!t6?.complianceOverrideId && t6.complianceOverrideId === v6.appliedOverrideId,
     `tender.complianceOverrideId=${t6?.complianceOverrideId}`);
  const hist6 = await prisma.loadActivity.findMany({ where: { tenderId: t6!.id } });
  // Compared against a NON-NULL id on purpose. The first version compared
  // against v6.appliedOverrideId directly, and when that was null the
  // assertion matched a metadata field that was also null -- passing while
  // proving nothing.
  ok("the history says so too, at the moment it happened",
     !!v6.appliedOverrideId &&
       hist6.some((a) => ((a.metadata ?? {}) as Record<string, unknown>).complianceOverrideId === v6.appliedOverrideId));

  console.log("\n[7] an ordinary compliant tender records NO override");
  await prisma.complianceOverride.deleteMany({ where: { carrierId: carrier.id } });
  await prisma.carrierProfile.update({ where: { id: carrier.id }, data: { lastVettingScore: 90 } });
  const load7 = await prisma.load.create({
    data: {
      referenceNumber: `HF7-${stamp}`, posterId: admin.id, status: "POSTED",
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "75568",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 4100, carrierRate: 4100,
    },
  });
  madeLoads.push(load7.id);
  const res7 = await fetch(`${BASE}/loads/${load7.id}/tender`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ carrierId: carrier.id, offeredRate: 4100, expiresAt: new Date(Date.now() + 7.2e6).toISOString() }),
  });
  ok("a clean tender is created", res7.status === 201, `status=${res7.status}`);
  const t7 = await prisma.loadTender.findFirst({ where: { loadId: load7.id } });
  ok("and records NO override -- null must mean nothing was waived",
     t7?.complianceOverrideId === null,
     "an override recorded on an ordinary tender would make an audit read a waiver into a clean one");

  console.log(`\n${pass}/${pass + fail} passed`);
  // closeAllConnections as well as close: an idle keep-alive socket holds the
  // event loop open and the script hangs after its last assertion, which reads
  // exactly like a test that never finished.
  server.closeAllConnections?.();
  server.close();

  // cleanup
  for (const id of madeLoads) {
    await prisma.loadActivity.deleteMany({ where: { loadId: id } });
    await prisma.loadTender.deleteMany({ where: { loadId: id } });
    await prisma.load.delete({ where: { id } }).catch(() => {});
  }
  await prisma.complianceOverride.deleteMany({ where: { carrierId: carrier.id } });
  await prisma.carrierAgreement.deleteMany({ where: { carrierId: carrier.id } });
  await prisma.carrierProfile.delete({ where: { id: carrier.id } }).catch(() => {});
  await prisma.staffSession.deleteMany({ where: { userId: admin.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
