/**
 * Commit-10d proof: a carrier can see what happened to every load they were
 * offered — and only their own.
 *
 * The portal showed only LIVE offers, so a load lost to a faster carrier simply
 * vanished from the carrier's view. That is the surface the DECLINED/WITHDRAWN
 * split was built for: SRL pulling an offer because somebody else got there
 * first is not the carrier refusing work, and §9 scores acceptance rate at 10%
 * of Compass, so the distinction is money to them.
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

const PORT = 55925;
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { registerSession } = await import("../src/middleware/auth");
  const { createTender } = await import("../src/services/tenderCreationService");
  const { settleTender } = await import("../src/services/tenderTransitionService");
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

  const ae = await prisma.user.create({
    data: { email: `ch-ae-${stamp}@srl.invalid`, passwordHash: "x", firstName: "C", lastName: "H", role: "BROKER" },
  });

  async function makeCarrier(tag: string) {
    const u = await prisma.user.create({
      // totpEnabled because the Arc 15 wall gates every carrier mount on it.
      // The fixture enrols rather than bypassing: a proof that walks around the
      // 2FA wall is not walking the path a real carrier walks.
      data: {
        email: `ch-${tag}-${stamp}@srl.invalid`, passwordHash: "x",
        firstName: tag, lastName: "Co", role: "CARRIER", totpEnabled: true,
      },
    });
    const p = await prisma.carrierProfile.create({ data: { userId: u.id, companyName: `CH ${tag} ${stamp}` } });
    return { user: u, profile: p };
  }
  async function makeLoad(ref: string) {
    const l = await prisma.load.create({
      data: {
        referenceNumber: `${ref}-${stamp}`, posterId: ae.id, status: "TENDERED",
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 4100, carrierRate: 4100,
      },
    });
    madeLoads.push(l.id);
    return l;
  }

  const mine = await makeCarrier("mine");
  const other = await makeCarrier("other");

  // Every outcome, on its own load.
  const outcomes: Array<{ ref: string; to: string; reason?: string; decline?: string }> = [
    { ref: "CH-COVERED", to: "WITHDRAWN", reason: "load_covered" },
    { ref: "CH-DECLINED", to: "DECLINED", decline: "Rate too low" },
    { ref: "CH-EXPIRED", to: "EXPIRED", reason: "ttl_elapsed" },
    { ref: "CH-RELEASED", to: "RELEASED", reason: "srl_error" },
    { ref: "CH-ACCEPTED", to: "ACCEPTED" },
  ];
  const made: Record<string, string> = {};
  for (const o of outcomes) {
    const l = await makeLoad(o.ref);
    const t = await createTender({ loadId: l.id, carrierProfileId: mine.profile.id, offeredRate: 4100 });
    made[o.ref] = t.id;
    if (o.to === "DECLINED") {
      await settleTender({
        tenderId: t.id, to: "DECLINED", from: "OFFERED",
        declineReason: o.decline, respondedAt: new Date(),
        actor: { id: mine.user.id, type: "CARRIER" },
      });
    } else if (o.to === "ACCEPTED") {
      await settleTender({ tenderId: t.id, to: "ACCEPTED", from: "OFFERED", actor: { id: mine.user.id, type: "CARRIER" } });
    } else {
      await settleTender({ tenderId: t.id, to: o.to as never, from: "OFFERED", reason: o.reason });
    }
  }

  // A live offer to somebody else, on its own load.
  const otherLoad = await makeLoad("CH-OTHER");
  const otherTender = await createTender({ loadId: otherLoad.id, carrierProfileId: other.profile.id, offeredRate: 4100 });

  // A soft-deleted tender: the cancelled-load path hides these.
  const goneLoad = await makeLoad("CH-GONE");
  const goneTender = await createTender({ loadId: goneLoad.id, carrierProfileId: mine.profile.id, offeredRate: 4100 });
  await prisma.loadTender.update({ where: { id: goneTender.id }, data: { deletedAt: new Date() } });

  const tok = jwt.sign({ userId: mine.user.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(mine.user.id, tok, "CARRIER");
  const res = await fetch(`${BASE}/carrier-tenders/history`, {
    headers: { Cookie: `srl_token_carrier=${tok}` },
  });
  const body = await res.json() as { tenders: Array<{ id: string; status: string; statusReason: string | null; declineReason: string | null; tenderRate: number | null; at: string | null }> };

  console.log("[1] the carrier sees what became of every offer");
  ok("the endpoint answers", res.status === 200, `status=${res.status}`);
  const ids = new Set((body.tenders ?? []).map((t) => t.id));
  for (const o of outcomes) {
    ok(`${o.to} is in their history`, ids.has(made[o.ref]));
  }

  console.log("\n[2] and only their own");
  ok("another carrier's tender is absent", !ids.has(otherTender.id),
     "a history that leaks other carriers' offers tells them who they are bidding against");
  ok("a soft-deleted tender is absent", !ids.has(goneTender.id),
     "the cancelled-load path soft-deletes; a load that no longer exists is not history a carrier needs");

  console.log("\n[3] the row carries what the wording helper needs");
  const covered = body.tenders.find((t) => t.id === made["CH-COVERED"]);
  ok("a covered offer carries its coded reason", covered?.statusReason === "load_covered",
     "without it the label falls back to 'Offer withdrawn', which is the harm the split exists to prevent");
  const declined = body.tenders.find((t) => t.id === made["CH-DECLINED"]);
  ok("their own decline carries the reason they gave", declined?.declineReason === "Rate too low");
  const released = body.tenders.find((t) => t.id === made["CH-RELEASED"]);
  ok("a release carries its reason code", released?.statusReason === "srl_error",
     "srl_error records no fall-off; the carrier should be able to see it was not theirs");
  ok("every row has a rate and a date", body.tenders.every((t) => t.tenderRate !== null && t.at !== null));

  console.log(`\n${pass}/${pass + fail} passed`);
  server.closeAllConnections?.();
  server.close();

  for (const id of madeLoads) {
    await prisma.loadActivity.deleteMany({ where: { loadId: id } });
    await prisma.loadTender.deleteMany({ where: { loadId: id } });
    await prisma.load.delete({ where: { id } }).catch(() => {});
  }
  await prisma.carrierProfile.deleteMany({ where: { companyName: { contains: `${stamp}` } } });
  await prisma.staffSession.deleteMany({ where: { userId: { in: [ae.id, mine.user.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
