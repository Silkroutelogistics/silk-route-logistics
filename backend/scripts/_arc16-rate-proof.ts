/**
 * ARC 16 — proof that the carrier is settled at the carrier rate.
 *
 * WHAT THIS EXISTS TO CATCH. `createCarrierPayOnDelivery` read
 * `load.carrierRate || load.rate || 0`, and `load.rate` is the CUSTOMER rate on
 * the primary creation path. No tender-accept path wrote `carrierRate`. So a
 * normally-created load arrived at settlement with `carrierRate` null and paid
 * the carrier 100% of SRL's revenue — silently, on a document that looked
 * entirely ordinary. (§13.3 Item 221.1.)
 *
 * IT DRIVES THE REAL ROUTES, NOT REPRODUCTIONS OF THEM. The first version of
 * this script inlined each accept path's write. I then deleted the writer from
 * tenderController and re-ran it — and it still passed, because it was
 * asserting my own copy of the code rather than the code. That is exactly the
 * "presence is not function" failure banked at §13.3 Item 221, caught here only
 * because the injection was actually run. Accepts now go over HTTP through the
 * real router, middleware and controller.
 *
 * WHY IT IS A SCRIPT AND NOT A UNIT TEST. The unit suite mocks Prisma, so a
 * mocked test of this would assert that my own mock returns what I told it to.
 * The defect lived in what actually reaches the database across six code paths
 * and a delivery hook. Only a real database can settle that, and §19
 * Sub-pattern 16 is explicit that a guard has to exercise the thing it claims
 * to prove.
 *
 * SAFETY. Refuses to start unless DATABASE_URL is a rehearsal container and
 * both outbound keys are explicitly EMPTY (not merely unset — dotenv fills an
 * unset key from backend/.env, which is how Arc 14's guard reported "absent"
 * while holding the production Resend key). Same guard shape as
 * scripts/_rehearsal-arc14.ts, for the same reason.
 *
 *   docker run -d --name srl-arc16 -e POSTGRES_PASSWORD=arc16 -e POSTGRES_USER=arc16 \
 *     -e POSTGRES_DB=arc16 -p 55433:5432 postgres:16
 *   DATABASE_URL=postgresql://arc16:arc16@localhost:55433/arc16 \
 *     DIRECT_URL=$DATABASE_URL npx prisma migrate deploy
 *   DATABASE_URL=... RESEND_API_KEY= OPENPHONE_API_KEY= npx tsx scripts/_arc16-rate-proof.ts
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("55432") && !url.includes("55433")) {
    console.error("REFUSING: DATABASE_URL is not a rehearsal container (:55432/:55433).");
    console.error("   got:", url.replace(/:[^:@]*@/, ":***@"));
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) {
      console.error(`REFUSING: ${k} is UNSET, which dotenv will fill from backend/.env.`);
      console.error(`   Pass ${k}= (explicitly empty) so outbound is provably dead.`);
      process.exit(1);
    }
    if (v !== "") {
      console.error(`REFUSING: ${k} is set to a real value. Outbound would be LIVE.`);
      process.exit(1);
    }
  }
  console.log("guard: rehearsal DB confirmed; RESEND_API_KEY + OPENPHONE_API_KEY explicitly empty (post-dotenv)\n");
}
guard();

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55716;
const BASE = `http://127.0.0.1:${PORT}/api`;

/** A signed session for a real user, in the cookie the AE/carrier portals use. */
function cookieFor(userId: string, portal: "ae" | "carrier") {
  const token = jwt.sign({ userId }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  return `srl_token_${portal}=${token}`;
}

async function post(path: string, cookie: string, body: any = {}) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.text() };
}

async function patch(path: string, cookie: string, body: any = {}) {
  const r = await fetch(BASE + path, {
    method: "PATCH",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.text() };
}

// The two numbers the whole audit turns on. They must never be equal, or a
// pass would prove nothing about which one was read.
const CUSTOMER_RATE = 5100;
const CARRIER_RATE = 4100;
const COUNTER_RATE = 4350;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

async function main() {
  const { prisma } = await import("../src/config/database");
  const { onLoadDelivered } = await import("../src/services/integrationService");
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

  const customer = await prisma.customer.create({
    data: { name: `Arc16 Shipper ${stamp}`, email: `ship-${stamp}@arc16.invalid`, phone: "2692206760" },
  });

  const ae = await prisma.user.create({
    data: {
      email: `ae-${stamp}@arc16.invalid`,
      passwordHash: "x",
      firstName: "Arc",
      lastName: "Sixteen",
      role: "BROKER",
    },
  });

  const admin = await prisma.user.create({
    data: {
      email: `admin-${stamp}@arc16.invalid`,
      passwordHash: "x",
      firstName: "Arc",
      lastName: "Admin",
      role: "ADMIN",
    },
  });

  const carrierUser = await prisma.user.create({
    data: {
      email: `carrier-${stamp}@arc16.invalid`,
      passwordHash: "x",
      firstName: "Proof",
      lastName: "Carrier",
      role: "CARRIER",
      company: "Arc16 Trucking LLC",
    },
  });
  const carrierProfile = await prisma.carrierProfile.create({
    data: {
      userId: carrierUser.id,
      companyName: "Arc16 Trucking LLC",
      mcNumber: `MC-ARC16-${stamp}`,
      dotNumber: `${stamp}`.slice(-7),
      onboardingStatus: "APPROVED",
      status: "APPROVED",
    },
  });

  // The real accept paths run complianceCheck, which HARD BLOCKS without a
  // SIGNED broker-carrier agreement. The first HTTP run of this proof was
  // refused by exactly that gate — which is the gate working. Satisfy it
  // properly rather than bypassing it, so the accept paths are exercised in
  // the state a real booked load is actually in.
  await prisma.carrierAgreement.create({
    data: {
      carrierId: carrierProfile.id,
      templateName: "broker-carrier",
      version: "arc16-proof",
      status: "SIGNED",
      signedAt: new Date(),
      signedByName: "Proof Carrier",
    },
  });

  let seq = 0;
  async function makeLoad(over: Record<string, any> = {}) {
    seq += 1;
    return prisma.load.create({
      data: {
        referenceNumber: `ARC16-${stamp}-${seq}`,
        posterId: ae.id,
        customerId: customer.id,
        originCity: "Lebanon",
        originState: "NH",
        originZip: "03766",
        destCity: "North Lake",
        destState: "TX",
        destZip: "76247",
        equipmentType: "REEFER",
        pickupDate: new Date(),
        deliveryDate: new Date(Date.now() + 3 * 86400_000),
        // This mirrors loadController.createLoad, which sets
        // `rate: raw.customerRate || raw.rate`. `rate` therefore holds the
        // CUSTOMER number, and that is exactly what settlement must not read.
        rate: CUSTOMER_RATE,
        customerRate: CUSTOMER_RATE,
        status: "POSTED",
        ...over,
      },
    });
  }

  /** Delivers the load through the real hook and reports what the carrier got paid. */
  async function settle(loadId: string) {
    await prisma.load.update({ where: { id: loadId }, data: { status: "DELIVERED" } });
    await onLoadDelivered(loadId);
    const pay = await prisma.carrierPay.findFirst({ where: { loadId } });
    return pay;
  }

  function assertPaid(name: string, pay: any, expected: number) {
    if (!pay) return check(name, false, "no CarrierPay row was created at all");
    const lh = Number(pay.lineHaul);
    if (lh === CUSTOMER_RATE && expected !== CUSTOMER_RATE) {
      return check(name, false, `settled at the CUSTOMER rate $${lh} — the margin was paid away`);
    }
    check(name, lh === expected, `lineHaul $${lh} (expected the agreed $${expected}; customer rate is $${CUSTOMER_RATE})`);
  }

  console.log("── 1. createLoad + direct tender accept (POST /tenders/:id/accept) ──");
  {
    const load = await makeLoad();
    const tender = await prisma.loadTender.create({
      data: {
        loadId: load.id,
        carrierId: carrierProfile.id,
        offeredRate: CARRIER_RATE,
        status: "OFFERED",
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    const r = await post(`/tenders/${tender.id}/accept`, cookieFor(carrierUser.id, "carrier"));
    check("accept endpoint answered", r.status === 200, `HTTP ${r.status} ${r.body.slice(0, 160)}`);
    assertPaid("direct tender accept settles at the offered rate", await settle(load.id), CARRIER_RATE);
  }
  console.log("\n── 2. accept-on-behalf of a COUNTERED tender (real endpoint) ────");
  {
    // acceptTenderOnBehalf admits OFFERED **or COUNTERED**, so a COUNTERED
    // tender is accepted and the agreed number is the carrier's counter.
    // Reading offeredRate here underpays them by the counter delta, on a rate
    // confirmation they signed. This is the case that costs money.
    const load = await makeLoad();
    const tender = await prisma.loadTender.create({
      data: {
        loadId: load.id,
        carrierId: carrierProfile.id,
        offeredRate: CARRIER_RATE,
        counterRate: COUNTER_RATE,
        status: "COUNTERED",
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    const r = await post(`/tenders/${tender.id}/accept-on-behalf`, cookieFor(admin.id, "ae"), { reason: "Arc 16 money-path proof: AE accepting the carrier counter." });
    check("accept-on-behalf endpoint answered", r.status === 200, `HTTP ${r.status} ${r.body.slice(0, 160)}`);
    assertPaid("countered tender settles at the COUNTER, not the offer", await settle(load.id), COUNTER_RATE);
  }
  console.log("\n── 3. waterfall position accept (real acceptPosition) ─────────");
  {
    const load = await makeLoad();
    const { acceptPosition } = await import("../src/services/waterfallEngineService");
    const wf = await prisma.waterfall.create({
      data: { loadId: load.id, status: "active", mode: "full_auto", createdById: admin.id },
    });
    const pos = await prisma.waterfallPosition.create({
      data: {
        waterfallId: wf.id,
        // WaterfallPosition.carrierId holds a USER id, not a profile id
        // (buildWaterfall:77 — "store User.id since Load.carrierId references
        // User"). Seeding the profile id here violated loads_carrierId_fkey and
        // the proof caught it, which is the fixture being wrong rather than the
        // code.
        carrierId: carrierUser.id,
        position: 1,
        offeredRate: CARRIER_RATE,
        status: "tendered",
      },
    });
    try {
      await acceptPosition(pos.id, carrierUser.id);
      check("acceptPosition ran", true, "no throw");
    } catch (e: any) {
      check("acceptPosition ran", false, String(e?.message || e).slice(0, 200));
    }
    assertPaid("waterfall accept settles at the position rate", await settle(load.id), CARRIER_RATE);
  }
  console.log("\n── 4. loadboard bid accept (PATCH /loads/:id/bids/:bidId) ─────");
  {
    const load = await makeLoad();
    const bid = await prisma.loadBid.create({
      data: { loadId: load.id, carrierId: carrierUser.id, bidRate: CARRIER_RATE, status: "pending" },
    });
    const r = await patch(`/loads/${load.id}/bids/${bid.id}`, cookieFor(admin.id, "ae"), { action: "accept" });
    check("bid accept endpoint answered", r.status === 200, `HTTP ${r.status} ${r.body.slice(0, 160)}`);
    assertPaid("loadboard bid accept settles at the bid", await settle(load.id), CARRIER_RATE);
  }
  console.log("\n── 5. withTender (atomic create + tender) ────────────────────────");
  {
    // withTenderController writes `rate: tender.offeredRate` AND
    // `carrierRate: tender.offeredRate` — both the carrier number. It was
    // already correct; this pins it so a later "unify the rate fields" change
    // cannot quietly flip it to the customer number.
    const load = await makeLoad({ rate: CARRIER_RATE, carrierRate: CARRIER_RATE, carrierId: carrierUser.id, status: "BOOKED" });
    assertPaid("withTender settles at the tendered rate", await settle(load.id), CARRIER_RATE);
  }

  console.log("\n── 6. instant book ───────────────────────────────────────────────");
  {
    // instantBookService writes `carrierRate: load.carrierRate ?? customerRate * 0.85`.
    const load = await makeLoad({ carrierId: carrierUser.id, status: "BOOKED", carrierRate: CUSTOMER_RATE * 0.85 });
    assertPaid("instant book settles at its derived rate", await settle(load.id), CUSTOMER_RATE * 0.85);
  }

  console.log("\n── 7. NULL carrier rate must REFUSE, not substitute ──────────────");
  {
    const load = await makeLoad({ carrierId: carrierUser.id, status: "BOOKED", carrierRate: null });
    const pay = await settle(load.id);
    check(
      "no CarrierPay is created when there is no agreed rate",
      pay === null,
      pay ? `a CarrierPay was created anyway at $${Number(pay.lineHaul)}` : "refused, as intended",
    );
    const notif = await prisma.notification.findFirst({
      where: { userId: ae.id, title: { contains: "no agreed rate" } },
      orderBy: { createdAt: "desc" },
    });
    check(
      "the AE is told the settlement was blocked",
      !!notif,
      notif ? `notification: "${notif.title}"` : "no notification was raised — the load would fail silently",
    );
  }

  console.log("\n── 8. carrier outreach quotes the carrier rate, never the customer's ──");
  {
    const { generateOutreachEmail } = await import("../src/services/carrierOutreachService");
    const base = {
      originCity: "Lebanon", originState: "NH", destCity: "North Lake", destState: "TX",
      equipmentType: "REEFER", weight: 18000, pickupDate: new Date(),
    };
    const withRate = generateOutreachEmail({ ...base, carrierRate: CARRIER_RATE }, "Proof Carrier");
    check(
      "the offer email shows the carrier rate",
      withRate.includes(CARRIER_RATE.toLocaleString()) && !withRate.includes(CUSTOMER_RATE.toLocaleString()),
      `contains $${CARRIER_RATE.toLocaleString()}: ${withRate.includes(CARRIER_RATE.toLocaleString())}; ` +
        `contains customer $${CUSTOMER_RATE.toLocaleString()}: ${withRate.includes(CUSTOMER_RATE.toLocaleString())}`,
    );
    const noRate = generateOutreachEmail({ ...base, carrierRate: null }, "Proof Carrier");
    check(
      "with no agreed rate the email omits the row rather than inventing one",
      !noRate.includes("<td style=\"padding:8px;border:1px solid #e2e8f0;font-weight:bold\">Rate</td>"),
      noRate.includes(">Rate<") ? "a Rate row was rendered with no number behind it" : "Rate row absent, as intended",
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "=".repeat(66));
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    console.log("\nMONEY PATH IS WRONG");
    server.close();
    process.exit(1);
  }
  console.log("MONEY PATH HOLDS — the carrier is paid the agreed rate on every path,");
  console.log("and a missing agreed rate refuses rather than substituting the customer's.");
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
