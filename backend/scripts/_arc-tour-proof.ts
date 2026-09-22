/**
 * v3.8.bei proof: the carrier welcome tour is recorded once, read by the
 * layout's query, and idempotent. Real router over HTTP, real database.
 * Rehearsal container only; outbound keys must be explicitly empty.
 *
 * Run:
 *   DATABASE_URL=postgres://...127.0.0.1... RESEND_API_KEY= OPENPHONE_API_KEY= npx tsx scripts/_arc-tour-proof.ts
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

const PORT = 55921;
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
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

  const stamp = Date.now();
  // An approved, activated, ENROLLED carrier — the wall reads totpEnabled and
  // the proof has no authenticator to present, so the flag is set directly.
  const cu = await prisma.user.create({
    data: { email: `tour-carrier-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Tour", lastName: "Co", role: "CARRIER", totpEnabled: true },
  });
  const carrier = await prisma.carrierProfile.create({
    data: { userId: cu.id, companyName: `Tour Co ${stamp}`, onboardingStatus: "APPROVED", status: "APPROVED", activatedAt: new Date() },
  });
  await prisma.carrierAgreement.create({
    data: { carrierId: carrier.id, templateName: "broker-carrier", version: "test", status: "SIGNED", signedAt: new Date(), signedByName: "Tour Co" },
  });
  const ctoken = jwt.sign({ userId: cu.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(cu.id, ctoken, "CARRIER");
  const ccookie = `srl_token_carrier=${ctoken}`;

  const admin = await prisma.user.create({
    data: { email: `tour-admin-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "D", role: "ADMIN" },
  });
  const atoken = jwt.sign({ userId: admin.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(admin.id, atoken, "ADMIN");
  const acookie = `srl_token_ae=${atoken}`;

  const status = async (cookie: string) => {
    const r = await fetch(`${BASE}/carrier-auth/activation-status`, { headers: { Cookie: cookie } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };
  const complete = async (cookie?: string) => {
    const r = await fetch(`${BASE}/carrier-auth/portal-tour/complete`, { method: "POST", headers: cookie ? { Cookie: cookie } : {} });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  console.log("[1] a fresh approved carrier has NOT seen the tour, and the layout's query says so explicitly");
  const s1 = await status(ccookie);
  ok("activation-status is 200 for the carrier", s1.status === 200, `status=${s1.status} ${JSON.stringify(s1.body).slice(0, 120)}`);
  ok("portalTourCompletedAt is an explicit null (not absent)", "portalTourCompletedAt" in s1.body && s1.body.portalTourCompletedAt === null, JSON.stringify(s1.body.portalTourCompletedAt));
  ok("and the carrier is past both gates the tour sits behind", s1.body.requiresTotpEnrollment === false && s1.body.requiresActivation === false);

  console.log("\n[2] completing records it, once");
  const c1 = await complete(ccookie);
  ok("first completion is 200 and not alreadyCompleted", c1.status === 200 && c1.body.alreadyCompleted === false, JSON.stringify(c1.body));
  const row1 = await prisma.carrierProfile.findUnique({ where: { id: carrier.id }, select: { portalTourCompletedAt: true } });
  ok("the column is stamped", !!row1?.portalTourCompletedAt);
  const s2 = await status(ccookie);
  ok("activation-status now reports the stamp", typeof s2.body.portalTourCompletedAt === "string");

  console.log("\n[3] a second completion keeps the FIRST stamp");
  await new Promise((r) => setTimeout(r, 20));
  const c2 = await complete(ccookie);
  const row2 = await prisma.carrierProfile.findUnique({ where: { id: carrier.id }, select: { portalTourCompletedAt: true } });
  ok("second completion is 200 and alreadyCompleted", c2.status === 200 && c2.body.alreadyCompleted === true, JSON.stringify(c2.body));
  ok("the stamp did not move", row1?.portalTourCompletedAt?.getTime() === row2?.portalTourCompletedAt?.getTime(),
     `${row1?.portalTourCompletedAt?.toISOString()} vs ${row2?.portalTourCompletedAt?.toISOString()}`);

  console.log("\n[4] only the carrier can record it");
  const c3 = await complete();
  ok("no session → 401", c3.status === 401, `status=${c3.status}`);
  const c4 = await complete(acookie);
  ok("an AE session → 403 (authorize CARRIER)", c4.status === 403, `status=${c4.status} ${JSON.stringify(c4.body).slice(0, 100)}`);
  const row3 = await prisma.carrierProfile.findUnique({ where: { id: carrier.id }, select: { portalTourCompletedAt: true } });
  ok("neither refused call touched the stamp", row1?.portalTourCompletedAt?.getTime() === row3?.portalTourCompletedAt?.getTime());

  console.log(`\n${pass}/${pass + fail} passed`);
  server.closeAllConnections?.();
  server.close();

  await prisma.carrierAgreement.deleteMany({ where: { carrierId: carrier.id } });
  await prisma.carrierProfile.delete({ where: { id: carrier.id } }).catch(() => {});
  await prisma.staffSession.deleteMany({ where: { userId: { in: [cu.id, admin.id] } } }).catch(() => {});
  await prisma.auditTrail.deleteMany({ where: { performedById: { in: [cu.id, admin.id] } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: [cu.id, admin.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
