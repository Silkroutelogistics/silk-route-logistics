/**
 * Commit-10a proof: the board and Track & Trace are complements, and Needs
 * Attention asks about tenders rather than guessing from the load.
 *
 * The partition assertion is the load-bearing one. Two hand-written status
 * lists OVERLAPPED BY SIX, so a load could appear on the Load Board and in
 * Track & Trace at the same time — two surfaces disagreeing about whether a
 * truck is booked. Derived from one predicate they are complementary by
 * construction, and this proves it over a set built to break it.
 *
 * Real router over HTTP, real database. Local container only; outbound keys
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

const PORT = 55921;
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { registerSession } = await import("../src/middleware/auth");
  const { settleTender } = await import("../src/services/tenderTransitionService");
  const { createTender } = await import("../src/services/tenderCreationService");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, "127.0.0.1", () => r(s)); });
  console.log(`app: real router mounted on :${PORT}\n`);

  const stamp = Date.now();
  const madeLoads: string[] = [];

  const admin = await prisma.user.create({
    data: { email: `bp-admin-${stamp}@srl.invalid`, passwordHash: "x", firstName: "B", lastName: "P", role: "ADMIN" },
  });
  const token = jwt.sign({ userId: admin.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(admin.id, token, "ADMIN");
  const cookie = `srl_token_ae=${token}`;

  let seq = 0;
  async function makeCarrier() {
    const n = ++seq;
    const u = await prisma.user.create({
      data: { email: `bp-c${n}-${stamp}@srl.invalid`, passwordHash: "x", firstName: `C${n}`, lastName: "Co", role: "CARRIER" },
    });
    const p = await prisma.carrierProfile.create({ data: { userId: u.id, companyName: `BP ${n} ${stamp}` } });
    return { user: u, profile: p };
  }
  async function makeLoad(ref: string, status = "POSTED") {
    const l = await prisma.load.create({
      data: {
        referenceNumber: `${ref}-${stamp}`, posterId: admin.id, status: status as never,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 4100, carrierRate: 4100,
      },
    });
    madeLoads.push(l.id);
    return l;
  }
  const get = async (path: string) => {
    const r = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
    return r.json() as Promise<{ loads?: Array<{ id: string }> } & Array<unknown>>;
  };

  // A set built to break the partition: one load in every interesting state.
  const c = await makeCarrier();
  const bare = await makeLoad("BP-BARE");                       // no tender at all
  const offeredLoad = await makeLoad("BP-OFFERED", "TENDERED");  // live offer, nobody holds it
  const heldLoad = await makeLoad("BP-HELD", "TENDERED");        // accepted
  const rcLoad = await makeLoad("BP-RC", "TENDERED");            // RC out, unsigned
  const settledLoad = await makeLoad("BP-SETTLED", "POSTED");    // every offer expired
  const directLoad = await makeLoad("BP-DIRECT", "BOOKED");      // carrier assigned, no tender

  await createTender({ loadId: offeredLoad.id, carrierProfileId: c.profile.id, offeredRate: 4100 });

  const heldT = await createTender({ loadId: heldLoad.id, carrierProfileId: c.profile.id, offeredRate: 4100 });
  await settleTender({ tenderId: heldT.id, to: "ACCEPTED", from: "OFFERED", actor: { id: c.user.id, type: "CARRIER" } });

  const rcT = await createTender({ loadId: rcLoad.id, carrierProfileId: c.profile.id, offeredRate: 4100 });
  await settleTender({ tenderId: rcT.id, to: "ACCEPTED", from: "OFFERED", actor: { id: c.user.id, type: "CARRIER" } });
  await settleTender({ tenderId: rcT.id, to: "RC_SENT", from: "ACCEPTED", actor: { id: admin.id, type: "USER" } });

  const deadT = await createTender({ loadId: settledLoad.id, carrierProfileId: c.profile.id, offeredRate: 4100 });
  await settleTender({ tenderId: deadT.id, to: "EXPIRED", from: "OFFERED", reason: "ttl_elapsed" });

  await prisma.load.update({ where: { id: directLoad.id }, data: { carrierId: c.user.id } });

  // ── 1. the partition ────────────────────────────────────────────────────────
  console.log("[1] the board and Track & Trace are exact complements");
  const board = await get("/loads?held=false&limit=500");
  const tnt = await get("/loads?held=true&limit=500");
  const boardIds = new Set((board.loads ?? []).map((l) => l.id));
  const tntIds = new Set((tnt.loads ?? []).map((l) => l.id));

  const mine = [bare.id, offeredLoad.id, heldLoad.id, rcLoad.id, settledLoad.id, directLoad.id];
  const overlap = mine.filter((id) => boardIds.has(id) && tntIds.has(id));
  const neither = mine.filter((id) => !boardIds.has(id) && !tntIds.has(id));
  ok("NO load is on both", overlap.length === 0, `overlap=${JSON.stringify(overlap)}`);
  ok("and none falls through the gap", neither.length === 0, `neither=${JSON.stringify(neither)}`);

  ok("a load with no tender is on the board", boardIds.has(bare.id));
  ok("a load with a LIVE offer is still on the board -- nobody holds it yet", boardIds.has(offeredLoad.id),
     "an offer is not a commitment; the load is still available to tender elsewhere");
  ok("a load whose offers all expired is back on the board", boardIds.has(settledLoad.id));
  ok("an ACCEPTED load is in Track & Trace", tntIds.has(heldLoad.id));
  ok("an RC_SENT load is in Track & Trace, not back on the board", tntIds.has(rcLoad.id),
     "the paperwork state says how far the terms got, not who has the truck");
  ok("a directly-assigned load with no tender is in Track & Trace", tntIds.has(directLoad.id),
     "reading only tenders would make trucks in transit invisible");

  // ── 2. release puts it back ─────────────────────────────────────────────────
  console.log("\n[2] releasing a carrier returns the load to the board");
  const { releaseCarrier } = await import("../src/services/carrierReleaseService");
  await prisma.load.update({ where: { id: heldLoad.id }, data: { carrierId: c.user.id } });
  await releaseCarrier({ loadId: heldLoad.id, reason: "carrier_fell_off", actorId: admin.id });
  const board2 = new Set(((await get("/loads?held=false&limit=500")).loads ?? []).map((l) => l.id));
  const tnt2 = new Set(((await get("/loads?held=true&limit=500")).loads ?? []).map((l) => l.id));
  ok("the released load is back on the board", board2.has(heldLoad.id));
  ok("and out of Track & Trace", !tnt2.has(heldLoad.id));

  // ── 3. needs attention ──────────────────────────────────────────────────────
  console.log("\n[3] Needs Attention asks about tenders, not about pickup dates");
  // Age the RC past the SLA.
  await prisma.loadTender.update({
    where: { id: rcT.id },
    data: { statusChangedAt: new Date(Date.now() - 9 * 3_600_000) },
  });
  const counterLoad = await makeLoad("BP-COUNTER", "TENDERED");
  const ct = await createTender({ loadId: counterLoad.id, carrierProfileId: c.profile.id, offeredRate: 4100 });
  await settleTender({ tenderId: ct.id, to: "COUNTERED", from: "OFFERED", counterRate: 4500, actor: { id: c.user.id, type: "CARRIER" } });

  const attn = (await get("/loads/needs-attention")) as unknown as Array<{ loadId: string; reasons: string[]; rcUnsignedHours?: number }>;
  const reasonsFor = (id: string) => attn.find((a) => a.loadId === id)?.reasons ?? [];

  ok("an expiry with nothing live behind it is flagged",
     reasonsFor(settledLoad.id).includes("EXPIRED_NO_LIVE_TENDER"));
  ok("an unsigned RC past its SLA is flagged",
     reasonsFor(rcLoad.id).includes("RC_UNSIGNED_PAST_SLA"), JSON.stringify(reasonsFor(rcLoad.id)));
  ok("with the hours it has been waiting",
     (attn.find((a) => a.loadId === rcLoad.id)?.rcUnsignedHours ?? 0) >= 9);
  ok("a release inside the last day is flagged", reasonsFor(heldLoad.id).includes("RECENTLY_RELEASED"));
  ok("a counter awaiting SRL is flagged", reasonsFor(counterLoad.id).includes("COUNTER_AWAITING_AE"));
  ok("a healthy live offer is NOT flagged", reasonsFor(offeredLoad.id).length === 0,
     "a queue that flags ordinary work is a queue nobody reads");
  ok("a bare posted load is NOT flagged", reasonsFor(bare.id).length === 0);

  // ── 4. statusChangedAt ──────────────────────────────────────────────────────
  console.log("\n[4] every move stamps when it happened");
  const fresh = await makeLoad("BP-STAMP", "TENDERED");
  const ft = await createTender({ loadId: fresh.id, carrierProfileId: c.profile.id, offeredRate: 4100 });
  const before = await prisma.loadTender.findUniqueOrThrow({ where: { id: ft.id } });
  await settleTender({ tenderId: ft.id, to: "WITHDRAWN", from: "OFFERED", reason: "ae_withdrew" });
  const afterRow = await prisma.loadTender.findUniqueOrThrow({ where: { id: ft.id } });
  ok("statusChangedAt is null before the first transition", before.statusChangedAt === null,
     "no backfill: a historical tender genuinely has no recorded moment, and a guess reads like a fact");
  ok("and stamped by the transition", afterRow.statusChangedAt !== null);

  console.log(`\n${pass}/${pass + fail} passed`);
  server.closeAllConnections?.();
  server.close();

  for (const id of madeLoads) {
    await prisma.loadActivity.deleteMany({ where: { loadId: id } });
    await prisma.rateConfirmation.deleteMany({ where: { loadId: id } });
    await prisma.fallOffEvent.deleteMany({ where: { loadId: id } });
    await prisma.loadTender.deleteMany({ where: { loadId: id } });
    await prisma.load.delete({ where: { id } }).catch(() => {});
  }
  await prisma.carrierProfile.deleteMany({ where: { companyName: { contains: `${stamp}` } } });
  await prisma.staffSession.deleteMany({ where: { userId: admin.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
