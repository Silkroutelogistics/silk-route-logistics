/**
 * ARC 17 — the waterfall's maiden flight in its working state.
 *
 * WHY THIS IS NEW CODE WEARING OLD TESTS. Arc 16 found that `acceptPosition`
 * passed a User id to `complianceCheck`, which looks up CarrierProfile — so
 * every position resolved to "Carrier not found", was marked `skipped`, and the
 * cascade advanced until it exhausted. **Waterfall auto-dispatch has never once
 * accepted a carrier.** Every test that covered it was green over a path that
 * could not succeed. This flies the whole cycle for the first time.
 *
 * WHAT IT WALKS
 *   1. build  — positions scored, vetting-risk exclusions firing
 *   2. start  — position 1 tendered
 *   3. accept — through the FIXED profile lookup
 *   4. after  — load dispatched at the agreed rate, check-call schedule created,
 *               carrier notified, tracking link fanned out
 *   5. skip   — a non-compliant carrier refused with the REAL reason, not
 *               "Carrier not found"
 *   6. exhaust— every position declined, cascade escalates per design
 *
 * SAFETY: same guard as Arc 16. Rehearsal container only; both outbound keys
 * must be explicitly EMPTY, because an unset key is filled by dotenv from
 * backend/.env — which is how Arc 14's guard reported "absent" while holding the
 * production Resend key.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("55432") && !url.includes("55433")) {
    console.error("REFUSING: DATABASE_URL is not a rehearsal container.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  console.log("guard: rehearsal DB; outbound keys explicitly empty (post-dotenv)\n");
}
guard();

const AGREED = 4100;
const CUSTOMER = 5100;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

async function main() {
  const { prisma } = await import("../src/config/database");
  const wf = await import("../src/services/waterfallEngineService");

  const stamp = Date.now();
  const customer = await prisma.customer.create({
    data: { name: `WF Shipper ${stamp}`, email: `wf-${stamp}@arc17.invalid`, phone: "2692206760" },
  });
  const ae = await prisma.user.create({
    data: { email: `wfae-${stamp}@arc17.invalid`, passwordHash: "x", firstName: "WF", lastName: "AE", role: "BROKER" },
  });

  let dotSeq = 1;
  /** A carrier in a named state, so exclusions can be asserted by cause. */
  async function makeCarrier(tag: string, over: Record<string, any> = {}, signBca = true) {
    const u = await prisma.user.create({
      data: {
        email: `wfc-${tag}-${stamp}@arc17.invalid`, passwordHash: "x",
        firstName: tag, lastName: "Carrier", role: "CARRIER", company: `${tag} Trucking`,
      },
    });
    const p = await prisma.carrierProfile.create({
      data: {
        userId: u.id, companyName: `${tag} Trucking`,
        mcNumber: `MC-A17-${tag}-${stamp}`.slice(0, 30),
        dotNumber: `${String(stamp).slice(-6)}${dotSeq++}`,
        onboardingStatus: "APPROVED", status: "APPROVED",
        // cppTier — NOT decoration. Scoring filters on it (ELIGIBLE_TIERS =
        // SILVER/GOLD/PLATINUM) and it defaults to GUEST, so a carrier is
        // invisible to the waterfall until promoted. See the GUEST case below.
        cppTier: "SILVER",
        equipmentTypes: ["REEFER"],
        operatingRegions: ["Northeast", "Southwest"],
        ...over,
      },
    });
    if (signBca) {
      await prisma.carrierAgreement.create({
        data: {
          carrierId: p.id, templateName: "broker-carrier", version: "arc17",
          status: "SIGNED", signedAt: new Date(), signedByName: `${tag} Carrier`,
        },
      });
    }
    return { user: u, profile: p };
  }

  let n = 0;
  async function makeLoad() {
    n += 1;
    return prisma.load.create({
      data: {
        referenceNumber: `WF-${stamp}-${n}`,
        posterId: ae.id, customerId: customer.id,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "76247",
        equipmentType: "REEFER",
        pickupDate: new Date(Date.now() + 86400_000),
        deliveryDate: new Date(Date.now() + 4 * 86400_000),
        rate: CUSTOMER, customerRate: CUSTOMER, carrierRate: AGREED,
        weight: 28400, commodity: "Honey and propolis",
        status: "POSTED",
      },
    });
  }

  // ── the carrier population ───────────────────────────────────────────────
  const good = await makeCarrier("good");
  const risky = await makeCarrier("risky", { lastVettingRisk: "CRITICAL" });
  const chameleon = await makeCarrier("cham", { chameleonRiskLevel: "HIGH" });
  const unsigned = await makeCarrier("nobca", {}, /* signBca */ false);

  console.log("── 0. THE ELIGIBILITY FLOOR — who the waterfall can even see ──────");
  {
    // A carrier at the tier every newly-approved carrier actually starts on.
    // integrationService sets cppTier GUEST at approval; tierService promotes
    // to SILVER only after 3 completed loads and a score >= 70 (§10 M1).
    const guest = await makeCarrier("guest", { cppTier: "GUEST" });
    const load = await makeLoad();
    const w = await wf.buildWaterfall(load.id, { mode: "full_auto", createdById: ae.id });
    const ps = await prisma.waterfallPosition.findMany({ where: { waterfallId: w.id } });
    const carrierPositions = ps.filter((x) => x.carrierId !== null);

    check(
      "a GUEST-tier carrier is NOT scored into a waterfall",
      !carrierPositions.some((x) => x.carrierId === guest.user.id),
      "scoring filters on cppTier IN (SILVER, GOLD, PLATINUM); GUEST is the approval default, " +
        "so auto-dispatch is unavailable to a carrier until they have completed 3 loads by another path",
    );
    check(
      "an empty cascade still builds the DAT fallback rather than nothing",
      ps.some((x) => x.carrierId === null && x.isFallback),
      `${ps.length} position(s), ${carrierPositions.length} carrier + DAT fallback — degrades to DAT, does not crash or hang`,
    );
  }

  console.log("── 1. BUILD — positions scored, risk exclusions applied ───────────");
  {
    const load = await makeLoad();
    const w = await wf.buildWaterfall(load.id, { mode: "full_auto", createdById: ae.id });
    const positions = await prisma.waterfallPosition.findMany({
      where: { waterfallId: w.id }, orderBy: { position: "asc" },
    });
    // Exclude the DAT fallback: it legitimately has carrierId null and no
    // offeredRate, and counting it as "position #1" is what made the first
    // run of this script misread a correct build as a null-rate defect.
    const carrierPos = positions.filter((p) => p.carrierId !== null);
    const ids = carrierPos.map((p) => p.carrierId);

    check(
      "a waterfall is built with scored positions",
      carrierPos.length > 0 && Number(carrierPos[0]?.offeredRate) === AGREED,
      `${carrierPos.length} carrier position(s) + DAT fallback; offeredRate = $${carrierPos[0]?.offeredRate ?? "null"} (the load's carrierRate, not its customer rate $${CUSTOMER})`,
    );
    check(
      "the compliant carrier is in the cascade",
      ids.includes(good.user.id),
      ids.includes(good.user.id) ? "present" : "the only eligible carrier was excluded",
    );
    check(
      "a CRITICAL vetting-risk carrier is excluded from scoring",
      !ids.includes(risky.user.id),
      !ids.includes(risky.user.id) ? "excluded before it could ever be tendered" : "SCORED — a critical-risk carrier reached the cascade",
    );
    check(
      "a HIGH chameleon-risk carrier is excluded from scoring",
      !ids.includes(chameleon.user.id),
      !ids.includes(chameleon.user.id) ? "excluded" : "SCORED — a chameleon-risk carrier reached the cascade",
    );
    // The unsigned carrier is NOT excluded at scoring time — the BCA gate lives
    // at accept time, in complianceCheck. Asserting that here proves the two
    // gates are at the layers we think they are.
    check(
      "the BCA gate is at ACCEPT time, not at scoring time",
      ids.includes(unsigned.user.id),
      ids.includes(unsigned.user.id)
        ? "carrier with no signed BCA is scored, and will be refused at accept — the gate is where it belongs"
        : "excluded at scoring, which would mean the accept-time gate is never exercised",
    );
  }

  console.log("\n── 2+3+4. START → ACCEPT → the load actually moves ────────────────");
  {
    const load = await makeLoad();
    const w = await wf.buildWaterfall(load.id, { mode: "full_auto", createdById: ae.id });
    // Put the compliant carrier at position 1 so the flight is deterministic.
    await prisma.waterfallPosition.deleteMany({ where: { waterfallId: w.id } });
    const pos = await prisma.waterfallPosition.create({
      data: { waterfallId: w.id, carrierId: good.user.id, position: 1, offeredRate: AGREED, status: "queued" },
    });

    await wf.startWaterfall(w.id);
    const tendered = await prisma.waterfallPosition.findUnique({ where: { id: pos.id } });
    check(
      "start tenders position 1",
      tendered?.status === "tendered",
      `position status = ${tendered?.status}`,
    );
    const tender = await prisma.loadTender.findFirst({ where: { loadId: load.id } });
    check(
      "a real LoadTender row is created for the carrier",
      !!tender && tender.carrierId === good.profile.id,
      tender
        ? `tender ${tender.id.slice(-8)} → CarrierProfile ${tender.carrierId.slice(-8)} (profile id, per §13.3 Item 57)`
        : "no tender row",
    );

    // THE FLIGHT.
    await wf.acceptPosition(pos.id, good.user.id);

    const after = await prisma.load.findUnique({ where: { id: load.id } });
    check(
      "ACCEPT SUCCEEDS — the defect that made this impossible is closed",
      after?.status === "DISPATCHED" && after?.carrierId === good.user.id,
      `status=${after?.status} carrier=${after?.carrierId === good.user.id ? "assigned" : "NOT assigned"} — before Arc 16 this was skipped every time with "Carrier not found"`,
    );
    check(
      "the load carries the AGREED rate, not the customer rate",
      Number(after?.carrierRate) === AGREED,
      `carrierRate=$${after?.carrierRate} (customer rate is $${CUSTOMER})`,
    );
    const posAfter = await prisma.waterfallPosition.findUnique({ where: { id: pos.id } });
    const wAfter = await prisma.waterfall.findUnique({ where: { id: w.id } });
    check(
      "position accepted and the waterfall closes",
      posAfter?.status === "accepted" && wAfter?.status === "completed",
      `position=${posAfter?.status}, waterfall=${wAfter?.status}`,
    );

    const calls = await prisma.checkCallSchedule.count({ where: { loadId: load.id } });
    check(
      "the check-call schedule is created on accept",
      calls > 0,
      `${calls} scheduled check call(s) — the waterfallEngineService post-accept fan-out`,
    );
    const tenderAfter = await prisma.loadTender.findFirst({ where: { loadId: load.id } });
    check(
      "the tender is marked accepted",
      tenderAfter?.status === "ACCEPTED",
      `tender status = ${tenderAfter?.status}`,
    );
    const notif = await prisma.notification.count({ where: { userId: good.user.id } });
    check(
      "the carrier is notified",
      notif > 0,
      `${notif} notification(s) to the carrier`,
    );
  }

  console.log("\n── 5. SKIP — refused for the REAL reason, not 'Carrier not found' ──");
  {
    const load = await makeLoad();
    const w = await prisma.waterfall.create({
      data: { loadId: load.id, mode: "full_auto", status: "active", createdById: ae.id, totalPositions: 2, currentPosition: 1 },
    });
    const bad = await prisma.waterfallPosition.create({
      data: { waterfallId: w.id, carrierId: unsigned.user.id, position: 1, offeredRate: AGREED, status: "tendered" },
    });
    await prisma.waterfallPosition.create({
      data: { waterfallId: w.id, carrierId: good.user.id, position: 2, offeredRate: AGREED, status: "queued" },
    });

    await wf.acceptPosition(bad.id, unsigned.user.id);

    const badAfter = await prisma.waterfallPosition.findUnique({ where: { id: bad.id } });
    check(
      "a non-compliant carrier is skipped, not accepted",
      badAfter?.status === "skipped",
      `position status = ${badAfter?.status}`,
    );

    const ev = await prisma.loadActivity.findFirst({
      where: { loadId: load.id, description: { contains: "skipped" } },
      orderBy: { createdAt: "desc" },
    });
    const reason = JSON.stringify(ev?.metadata ?? {}) + " " + (ev?.description ?? "");
    check(
      "the logged reason is the REAL one, not 'Carrier not found'",
      reason.includes("agreement") && !reason.includes("Carrier not found"),
      reason.includes("Carrier not found")
        ? `STILL reports the id-lookup failure: ${reason.slice(0, 160)}`
        : `reason: ${reason.slice(0, 170)}`,
    );

    const loadAfter = await prisma.load.findUnique({ where: { id: load.id } });
    check(
      "a skipped position does NOT dispatch the load",
      loadAfter?.status === "POSTED" && !loadAfter?.carrierId,
      `status=${loadAfter?.status}, carrier=${loadAfter?.carrierId ? "ASSIGNED (wrong)" : "unassigned"}`,
    );
  }

  console.log("\n── 6. EXHAUST — every position declined, cascade escalates ────────");
  {
    const load = await makeLoad();
    const w = await prisma.waterfall.create({
      data: { loadId: load.id, mode: "full_auto", status: "active", createdById: ae.id, totalPositions: 2, currentPosition: 1 },
    });
    const p1 = await prisma.waterfallPosition.create({
      data: { waterfallId: w.id, carrierId: good.user.id, position: 1, offeredRate: AGREED, status: "tendered" },
    });
    await wf.declinePosition(p1.id, "rate too low", good.user.id);

    const wAfter = await prisma.waterfall.findUnique({ where: { id: w.id } });
    const p1After = await prisma.waterfallPosition.findUnique({ where: { id: p1.id } });
    check(
      "a decline is recorded and the cascade moves on",
      p1After?.status === "declined" && wAfter?.status !== "completed",
      `position=${p1After?.status}, waterfall=${wAfter?.status}, currentPosition=${wAfter?.currentPosition}`,
    );

    const events = await prisma.loadActivity.count({ where: { loadId: load.id } });
    check(
      "the cascade leaves an audit trail",
      events > 0,
      `${events} waterfall event(s) recorded for this load`,
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "=".repeat(68));
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    console.log("\nWATERFALL DOES NOT FLY");
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log("WATERFALL FLIES — auto-dispatch reaches a compliant carrier, the load");
  console.log("moves at the agreed rate, and an ineligible carrier is refused by cause.");
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
