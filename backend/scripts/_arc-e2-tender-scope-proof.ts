/**
 * E2 proof: the carrier's load reads carry that carrier's OWN tender rows and
 * nobody else's. Real router over HTTP, real database.
 *
 * A load that went to a waterfall carries several tenders: the winner's
 * (ACCEPTED → RC_SENT → CONFIRMED) and every sibling's (WITHDRAWN, reason
 * load_covered). The strip on My Loads reads the tender, so the row must be
 * there — and a sibling's row leaving the server would tell the winner who
 * else was offered their load. The unit guard holds the query's shape; this
 * holds what Postgres actually returns through the relation scope.
 *
 * Rehearsal container only; outbound keys must be explicitly EMPTY.
 *
 * Run:
 *   DATABASE_URL=postgres://...127.0.0.1... RESEND_API_KEY= QUO_API_KEY= OPENPHONE_API_KEY= \
 *   S3_BUCKET_NAME= AWS_ACCESS_KEY_ID= npx tsx scripts/_arc-e2-tender-scope-proof.ts
 */
function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "QUO_API_KEY", "OPENPHONE_API_KEY", "S3_BUCKET_NAME", "AWS_ACCESS_KEY_ID"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  console.log("guard: local DB; outbound + storage keys explicitly empty (post-dotenv)\n");
}
guard();

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55927;
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
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, "127.0.0.1", () => r(s)); });

  const stamp = Date.now();
  const mkCarrier = async (tag: string) => {
    const u = await prisma.user.create({
      data: { email: `e2-${tag}-${stamp}@srl.invalid`, passwordHash: "x", firstName: tag, lastName: "Co", role: "CARRIER", totpEnabled: true },
    });
    const p = await prisma.carrierProfile.create({
      data: { userId: u.id, companyName: `E2 ${tag} ${stamp}`, onboardingStatus: "APPROVED", status: "APPROVED", activatedAt: new Date() },
    });
    await prisma.carrierAgreement.create({
      data: { carrierId: p.id, templateName: "broker-carrier", version: "test", status: "SIGNED", signedAt: new Date(), signedByName: tag },
    });
    const tok = jwt.sign({ userId: u.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
    registerSession(u.id, tok, "CARRIER");
    return { u, p, cookie: `srl_token_carrier=${tok}` };
  };
  const ae = await prisma.user.create({
    data: { email: `e2-ae-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "ADMIN" },
  });
  const winner = await mkCarrier("winner");
  const sibling = await mkCarrier("sibling");

  // The load belongs to the winner; both carriers were tendered.
  const load = await prisma.load.create({
    data: {
      referenceNumber: `E2-${stamp}`, posterId: ae.id, status: "BOOKED", carrierId: winner.u.id,
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "76247",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 5100, customerRate: 5100, carrierRate: 4100,
    },
  });
  const tWin = await prisma.loadTender.create({
    data: { loadId: load.id, carrierId: winner.p.id, status: "RC_SENT", offeredRate: 4100, expiresAt: new Date(Date.now() + 864e5) },
  });
  const tSib = await prisma.loadTender.create({
    data: { loadId: load.id, carrierId: sibling.p.id, status: "WITHDRAWN", statusReason: "load_covered", offeredRate: 4100, expiresAt: new Date(Date.now() + 864e5) },
  });
  // A deleted row of the winner's own must not come back either.
  const tDel = await prisma.loadTender.create({
    data: { loadId: load.id, carrierId: winner.p.id, status: "EXPIRED", offeredRate: 4000, expiresAt: new Date(), deletedAt: new Date() },
  });

  const get = async (path: string, cookie: string) => {
    const r = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  };

  console.log("[1] my-loads as the winner");
  const l1 = await get("/carrier-loads/my-loads", winner.cookie);
  ok("200", l1.status === 200, `status=${l1.status} ${JSON.stringify(l1.body).slice(0, 120)}`);
  const row = (l1.body.loads ?? []).find((x: any) => x.id === load.id);
  ok("the load is in the list with a tenders array", Array.isArray(row?.tenders), JSON.stringify(row?.tenders));
  ok("exactly ONE tender: the winner's own, RC_SENT", row?.tenders?.length === 1 && row.tenders[0].id === tWin.id && row.tenders[0].status === "RC_SENT", JSON.stringify(row?.tenders));
  ok("the sibling's WITHDRAWN row is NOT on the wire", !JSON.stringify(l1.body).includes(tSib.id));
  ok("the winner's own deleted row is NOT on the wire", !JSON.stringify(l1.body).includes(tDel.id));

  console.log("\n[2] the detail read as the winner");
  const d1 = await get(`/carrier-loads/${load.id}`, winner.cookie);
  ok("200", d1.status === 200, `status=${d1.status}`);
  ok("same single own tender on the detail", d1.body.tenders?.length === 1 && d1.body.tenders[0].id === tWin.id, JSON.stringify(d1.body.tenders));
  ok("no sibling row", !JSON.stringify(d1.body).includes(tSib.id));

  console.log("\n[3] the sibling cannot read the load at all (it is not theirs and not POSTED)");
  const d2 = await get(`/carrier-loads/${load.id}`, sibling.cookie);
  ok("403", d2.status === 403, `status=${d2.status}`);
  const l2 = await get("/carrier-loads/my-loads", sibling.cookie);
  ok("and it is not in their list", !(l2.body.loads ?? []).some((x: any) => x.id === load.id));

  console.log("\n[4] outbound: nothing left the building");
  ok("Resend is not configured in this process", process.env.RESEND_API_KEY === "");

  console.log(`\n${pass}/${pass + fail} passed`);
  server.closeAllConnections?.();
  server.close();
  await new Promise((r) => setTimeout(r, 300));

  await prisma.loadTender.deleteMany({ where: { loadId: load.id } });
  await prisma.loadActivity.deleteMany({ where: { loadId: load.id } }).catch(() => {});
  await prisma.load.delete({ where: { id: load.id } });
  for (const c of [winner, sibling]) {
    await prisma.carrierAgreement.deleteMany({ where: { carrierId: c.p.id } });
    await prisma.carrierProfile.delete({ where: { id: c.p.id } });
  }
  await prisma.staffSession.deleteMany({ where: { userId: { in: [winner.u.id, sibling.u.id, ae.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
