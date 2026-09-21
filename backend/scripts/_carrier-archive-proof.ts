/**
 * CARRIER-ARCHIVE RECUT — B6d, the arc's completion proof (2026-09-19).
 *
 * One carrier, holding everything §14 says an archive must withdraw, block on,
 * or leave alone — walked through archive and restore over the REAL router on
 * a REAL database, with a positive control before every negative assertion so
 * an absence is never vacuous.
 *
 * The carrier holds, at the moment of the first archive attempt:
 *   - a live OFFERED tender on a POSTED load       → withdraws (WITHDRAWN, carrier_archived)
 *   - a DELIVERED-pre-POD load they are assigned to → BLOCKS (409) until the POD lands
 *   - a pending bid                                 → rejected, by the archiving actor
 *   - a future SCHEDULED dock appointment           → CANCELLED, carrierId kept
 *   - an open info request                          → CANCELLED with the ARCHIVED reason
 *   - an unpaid payable                             → untouched
 *   - an executed Broker-Carrier Agreement          → still SIGNED
 *
 * Then: the login refuses 403; the compliance gate names CARRIER_ARCHIVED
 * (hard since B2a — see B2_LANDED); every one of the SEVEN list pickers
 * that offered the carrier before offers nothing after; the chameleon
 * fingerprint row is byte-identical to before the archive; and restore returns
 * the carrier at REVIEWING with the archive columns cleared, the login back,
 * and a fingerprint rebuilt from the row AS IT STANDS after the restore — the
 * phone is changed while the carrier is archived, so a rebuild that hashed the
 * archived row would be caught.
 *
 * SAFETY: local container only; RESEND, OPENPHONE and QUO keys must be
 * explicitly EMPTY (post-dotenv), never merely unset — dotenv fills an unset
 * key from backend/.env (§19 SP20). Run:
 *
 *   DATABASE_URL=postgresql://ci:ci@localhost:55448/ci DIRECT_URL=... \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= JWT_SECRET=... \
 *   npx tsx scripts/_carrier-archive-proof.ts
 */
function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  if (!process.env.JWT_SECRET) { console.error("REFUSING: JWT_SECRET unset."); process.exit(1); }
  console.log("guard: local DB; RESEND + OPENPHONE + QUO explicitly empty (post-dotenv)\n");
}
guard();

import crypto from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import type { Server } from "http";

/**
 * B2a LANDED 2026-09-20: the gate carries CARRIER_ARCHIVED and
 * CARRIER_NOT_APPROVED as absolutes, so the two gate checks below are hard.
 * This flag and okB2 stay because archiveGateProofParity.test.ts holds the
 * flag equal to "the gate pushes both codes" — flipping it back, or removing
 * either push, is one red test rather than two soft checks nobody reads.
 *
 * History, kept because the finding was this proof's:
 * B2 (the compliance gate's archive branch, blocked on
 * complianceMonitorService.ts) had not landed. Until it did, the two gate
 * checks below were reported as PENDING(B2) rather than FAIL and did not fail
 * the run.
 *
 * B2 carries TWO codes, and the second is THIS PROOF'S FINDING (first run,
 * 2026-09-19): the gate refuses only SUSPENDED and REJECTED by status, so
 * PENDING / REVIEWING / INFO_REQUESTED pass it — masked until now because an
 * unapproved carrier normally has no executed BCA. A RESTORED carrier is the
 * first population with an executed BCA AND a REVIEWING status, and the gate
 * ALLOWED it: the list pickers refuse a REVIEWING carrier, the gate did not,
 * and a by-id tender would go through. B2a added CARRIER_NOT_APPROVED
 * beside CARRIER_ARCHIVED.
 */
const B2_LANDED = true;

const PORT = 55934;
const API = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0, pendingB2 = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};
const okB2 = (n: string, c: boolean, d = "") => {
  if (B2_LANDED) return ok(n, c, d);
  if (c) { pass++; console.log(`  PASS  ${n}  (B2 has landed? flip B2_LANDED)`); }
  else { pendingB2++; console.log(`  PENDING(B2)  ${n}  -- EXPECTED RED until B2 lands${d ? ": " + d : ""}`); }
};
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
// blocked_codes is an array of { code, overridable, ... } — the pre-B2 assertions
// read it as string[] and could never have gone green (caught on the first
// post-B2a run: the gate refused with the right code and the check still failed).
const hasCode = (v: any, code: string) => (v.blocked_codes as any[]).some((c) => c && c.code === code);
const isOverridable = (v: any, code: string) => (v.blocked_codes as any[]).some((c) => c && c.code === code && c.overridable);

async function main() {
  const { prisma } = await import("../src/config/database");
  const { registerSession } = await import("../src/middleware/auth");
  const { BCA_VERSION } = await import("../src/data/agreements");
  const { buildFingerprint } = await import("../src/services/chameleonDetectionService");
  const { complianceCheck } = await import("../src/services/complianceMonitorService");
  const { matchCarriersForLoad } = await import("../src/services/smartMatchService");
  const { buildBenchBoard } = await import("../src/services/benchBoardService");
  const { getEligibleCarriers } = await import("../src/services/waterfallScoringService");
  const { advanceWaterfall } = await import("../src/services/waterfallEngineService");
  const { notifyMatchedCarriers } = await import("../src/services/carrierOutreachService");
  const { getRecommendationsForLoad } = await import("../src/services/smartRecommendationService");
  const { CLOSED_BY_STATUS_REASON } = await import("../src/services/infoRequestService");
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
  const tag = `B6D-${stamp}`;
  const PASSWORD = "Proof-Pass-1234!";

  // ── actors ────────────────────────────────────────────────────────
  const ae = await prisma.user.create({
    data: { email: `b6d-ae-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Archive", lastName: "Admin", role: "ADMIN", company: "SRL" },
  });
  const aeToken = jwt.sign({ userId: ae.id, nonce: stamp }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(ae.id, aeToken, "ADMIN");
  const cookie = `srl_token_ae=${aeToken}`;

  const carrierEmail = `b6d-carrier-${stamp}@srl.invalid`;
  const phoneBefore = `2695550${String(stamp).slice(-3)}`;
  const cu = await prisma.user.create({
    data: {
      email: carrierEmail, passwordHash: await bcrypt.hash(PASSWORD, 4), firstName: "Peace", lastName: "Transport",
      role: "CARRIER", isVerified: true, isActive: true, phone: phoneBefore,
    },
  });
  const carrier = await prisma.carrierProfile.create({
    data: {
      userId: cu.id, companyName: `Peace Transport ${stamp}`, mcNumber: `MC-${String(stamp).slice(-7)}`, dotNumber: String(stamp).slice(-7),
      onboardingStatus: "APPROVED", status: "APPROVED", approvedAt: new Date(), cppTier: "SILVER",
      equipmentTypes: ["Reefer"], operatingRegions: ["Northeast", "South Central"],
      insuranceExpiry: new Date(Date.now() + 365 * 864e5),
      authorityGrantedDate: new Date(Date.now() - 3 * 365 * 864e5),
      address: "12 Depot St", city: "Lebanon", state: "NH", zip: "03766",
      preferredLanes: {
        lastCapacityPost: { postedAt: new Date().toISOString(), currentCity: "Lebanon", currentState: "NH", availableDate: new Date().toISOString(), equipmentType: "Reefer", preferredDestStates: ["TX"], notes: tag },
      },
      isTestAccount: false,
    } as any,
  });
  await prisma.carrierAgreement.create({
    data: { carrierId: carrier.id, version: BCA_VERSION, templateName: "broker-carrier", status: "SIGNED", signedAt: new Date(), signedByName: "Stu Cook", signedByTitle: "President", contentHash: sha(tag) } as any,
  });

  const madeLoads: string[] = [];
  async function makeLoad(ref: string, status: string, carrierUserId: string | null) {
    const l = await prisma.load.create({
      data: {
        referenceNumber: `${tag}-${ref}`, posterId: ae.id, status: status as any, carrierId: carrierUserId,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(Date.now() + 2 * 864e5), deliveryDate: new Date(Date.now() + 4 * 864e5),
        equipmentType: "Reefer", rate: 4100, customerRate: 4100, carrierRate: 3500, customerId: null,
      } as any,
    });
    madeLoads.push(l.id);
    return l;
  }

  // ── the holdings ──────────────────────────────────────────────────
  const lOffer = await makeLoad("OFFER", "POSTED", null);
  const tender = await prisma.loadTender.create({
    data: { loadId: lOffer.id, carrierId: carrier.id, status: "OFFERED", offeredRate: 3500, expiresAt: new Date(Date.now() + 864e5) },
  });
  const lDeliv = await makeLoad("DELIV", "DELIVERED", cu.id);
  const lBid = await makeLoad("BID", "POSTED", null);
  const bid = await prisma.loadBid.create({ data: { loadId: lBid.id, carrierId: cu.id, bidRate: 3400, status: "pending" } });
  const dock = await prisma.dockSchedule.create({
    data: {
      facilityName: "North Lake DC", facilityCity: "North Lake", facilityState: "TX", appointmentDate: new Date(Date.now() + 3 * 864e5),
      timeSlotStart: "08:00", timeSlotEnd: "09:00", carrierId: carrier.id, createdById: ae.id, status: "SCHEDULED", loadId: lDeliv.id,
    },
  });
  const info = await prisma.infoRequest.create({
    data: { carrierId: carrier.id, createdById: ae.id, category: "COI_UPDATE", message: "Please send the renewed COI.", status: "OPEN" },
  });
  const pay = await prisma.carrierPay.create({
    data: { carrierId: cu.id, loadId: lDeliv.id, amount: 3500, netAmount: 3500, status: "PENDING" } as any,
  });
  const agreement = await prisma.carrierAgreement.findFirst({ where: { carrierId: carrier.id, templateName: "broker-carrier" } });
  const lOut1 = await makeLoad("OUT1", "POSTED", null);
  const lOut2 = await makeLoad("OUT2", "POSTED", null);

  await buildFingerprint(carrier.id);
  const fp0 = await prisma.carrierFingerprint.findUnique({ where: { carrierId: carrier.id } });

  const get = async (path: string) => {
    const r = await fetch(`${API}${path}`, { headers: { Cookie: cookie } });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
  };
  const send = async (method: string, path: string, body?: unknown, c: string | null = cookie) => {
    const r = await fetch(`${API}${path}`, {
      method, headers: { ...(c ? { Cookie: c } : {}), "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: r.status, json: (await r.json().catch(() => ({}))) as any };
  };
  const login = () => send("POST", "/carrier-auth/login", { email: carrierEmail, password: PASSWORD }, null);

  const ctx = {
    loadId: lOffer.id, equipmentType: "Reefer", originState: "NH", destState: "TX",
    pickupDate: lOffer.pickupDate, deliveryDate: lOffer.deliveryDate!, distance: 1900, customerRate: 4100, carrierRate: 3500, customerId: null,
  };
  /** The seven list pickers (B6a), asked the same way before and after. */
  async function pickers(outreachLoadId: string): Promise<Record<string, boolean>> {
    const all = await get("/carrier/all");
    const allIds: string[] = (all.json.carriers || []).map((c: any) => c.id);
    const smart = await matchCarriersForLoad(lOffer.id);
    const bench = await buildBenchBoard();
    const eligible = await getEligibleCarriers(ctx as any);
    const feed = await get("/carrier/capacity-feed");
    await notifyMatchedCarriers(outreachLoadId);
    const outreachRow = await prisma.notification.findFirst({ where: { userId: cu.id, title: "New Load Available", message: { contains: `${tag}-${outreachLoadId === lOut1.id ? "OUT1" : "OUT2"}` } } });
    const recs = await getRecommendationsForLoad(lOffer.id, 500);
    return {
      "getAllCarriers (/carrier/all)": allIds.includes(carrier.id),
      "smartMatchService.matchCarriersForLoad": smart.matches.some((m: any) => m.carrierId === carrier.id || m.userId === cu.id),
      "benchBoardService.buildBenchBoard": bench.bench.carriers.some((r: any) => r.carrierId === carrier.id),
      "waterfallScoringService.getEligibleCarriers": JSON.stringify(eligible).includes(carrier.id),
      "GET /carrier/capacity-feed": (feed.json.feed || []).some((f: any) => f.carrierId === cu.id),
      "carrierOutreachService.notifyMatchedCarriers": !!outreachRow,
      "smartRecommendationService.getRecommendationsForLoad": (recs as any[]).some((r) => r.carrierId === carrier.id),
    };
  }

  try {
    // ── [0] positive controls: the carrier is live, reachable, offered ──
    console.log("[0] controls — before any archive");
    const gate0 = await complianceCheck(carrier.id);
    ok("control: the compliance gate ALLOWS the carrier before the archive", gate0.allowed, JSON.stringify(gate0.blocked_reasons));
    const login0 = await login();
    ok("control: the carrier can log in before the archive (not 403)", login0.status !== 403 && login0.status < 500, `status ${login0.status} ${JSON.stringify(login0.json).slice(0, 120)}`);
    const before = await pickers(lOut1.id);
    for (const [name, present] of Object.entries(before)) ok(`control: ${name} offers the carrier before the archive`, present);
    ok("control: the fingerprint row exists with a phone hash", !!fp0?.phoneHash && !!fp0?.emailHash);

    // ── [1] the first attempt refuses: DELIVERED-pre-POD is in flight ──
    console.log("\n[1] archive attempt #1 — the DELIVERED-pre-POD load blocks");
    const a1 = await send("DELETE", `/carriers/${carrier.id}`, { reason: "CEASED_OPERATIONS", archiveNote: "Owner retired, trucks sold." });
    ok("409 CARRIER_HOLDS_LIVE_LOADS", a1.status === 409 && a1.json.error === "CARRIER_HOLDS_LIVE_LOADS", `status ${a1.status} ${JSON.stringify(a1.json).slice(0, 200)}`);
    ok("…and it names the DELIVERED load, not the OFFERED one", JSON.stringify(a1.json.blockingLoads ?? a1.json.remedy ?? {}).includes(lDeliv.referenceNumber) && !JSON.stringify(a1.json.blockingLoads ?? {}).includes(lOffer.referenceNumber), String(JSON.stringify(a1.json.blockingLoads)).slice(0, 200));
    const p1 = await prisma.carrierProfile.findUnique({ where: { id: carrier.id } });
    const t1 = await prisma.loadTender.findUnique({ where: { id: tender.id } });
    ok("…nothing was written: profile live, login live, offer still OFFERED", p1?.deletedAt === null && (await prisma.user.findUnique({ where: { id: cu.id } }))?.isActive === true && t1?.status === "OFFERED");

    // the POD lands; the load is no longer in flight
    await prisma.load.update({ where: { id: lDeliv.id }, data: { status: "POD_RECEIVED" } });

    // ── [2] archive #2 succeeds, and each holding lands where §14 says ──
    console.log("\n[2] archive attempt #2 — POD received; the archive goes through");
    const a2 = await send("DELETE", `/carriers/${carrier.id}`, { reason: "CEASED_OPERATIONS", archiveNote: "Owner retired, trucks sold." });
    ok("200 archived", a2.status === 200 && a2.json.details?.archived === true, `status ${a2.status} ${JSON.stringify(a2.json).slice(0, 200)}`);
    const archivedAt = new Date();
    const p2 = await prisma.carrierProfile.findUnique({ where: { id: carrier.id } });
    const u2 = await prisma.user.findUnique({ where: { id: cu.id } });
    ok("profile: deletedAt + deletedBy (the AE's email, the controller's convention) + reason + note on the row", !!p2?.deletedAt && p2.deletedBy === ae.email && p2.archiveReason === "CEASED_OPERATIONS" && p2.archiveNote === "Owner retired, trucks sold.", `${p2?.deletedBy} ${p2?.archiveReason}`);
    ok("login deactivated in the same act", u2?.isActive === false);
    const t2 = await prisma.loadTender.findUnique({ where: { id: tender.id } });
    ok("tender: WITHDRAWN with carrier_archived, never DECLINED, no respondedAt", t2?.status === "WITHDRAWN" && t2.statusReason === "carrier_archived" && t2.respondedAt === null, `${t2?.status} ${t2?.statusReason}`);
    const b2 = await prisma.loadBid.findUnique({ where: { id: bid.id } });
    ok("bid: rejected, reviewed by the archiving actor", b2?.status === "rejected" && b2.reviewedById === ae.id && !!b2.reviewedAt, `${b2?.status} ${b2?.reviewedById}`);
    const d2 = await prisma.dockSchedule.findUnique({ where: { id: dock.id } });
    ok("dock appointment: CANCELLED, carrierId kept as history", d2?.status === "CANCELLED" && d2.carrierId === carrier.id, `${d2?.status}`);
    const i2 = await prisma.infoRequest.findUnique({ where: { id: info.id } });
    ok("info request: CANCELLED with the ARCHIVED reason", i2?.status === "CANCELLED" && i2.cancelReason === CLOSED_BY_STATUS_REASON.ARCHIVED, `${i2?.status} ${i2?.cancelReason}`);
    const pay2 = await prisma.carrierPay.findUnique({ where: { id: pay.id } });
    ok("payable: untouched — still PENDING at the same amount", pay2?.status === "PENDING" && pay2.netAmount === 3500 && pay2.updatedAt.getTime() === pay.updatedAt.getTime(), `${pay2?.status} ${pay2?.netAmount}`);
    const ag2 = await prisma.carrierAgreement.findUnique({ where: { id: agreement!.id } });
    ok("BCA: still SIGNED, hash intact", ag2?.status === "SIGNED" && ag2.contentHash === sha(tag), `${ag2?.status}`);
    const lDeliv2 = await prisma.load.findUnique({ where: { id: lDeliv.id } });
    ok("the delivered load keeps its carrier and status — history is not rewritten", lDeliv2?.carrierId === cu.id && lDeliv2.status === "POD_RECEIVED");
    const rec = await prisma.auditTrail.findFirst({ where: { entityId: carrier.id, entityType: "CarrierProfile" }, orderBy: { performedAt: "desc" } });
    const cf = (rec?.changedFields ?? {}) as any;
    ok("one lifecycle row: CARRIER_ARCHIVED with reasonCode and the withdrawn counts", cf.actionDetail === "CARRIER_ARCHIVED" && cf.reasonCode === "CEASED_OPERATIONS" && cf.new?.withdrawn?.tenders === 1 && cf.new?.withdrawn?.bids === 1 && cf.new?.withdrawn?.dockSchedules === 1, JSON.stringify(cf).slice(0, 240));

    // ── [3] the carrier is out of the operation ──
    console.log("\n[3] after the archive — refused, gated, offered nowhere");
    const login3 = await login();
    ok("login refuses 403 'deactivated'", login3.status === 403 && /deactivated/i.test(login3.json.error || ""), `status ${login3.status} ${JSON.stringify(login3.json)}`);
    const gate3 = await complianceCheck(carrier.id);
    okB2("the compliance gate refuses with CARRIER_ARCHIVED", !gate3.allowed && hasCode(gate3, "CARRIER_ARCHIVED") && !isOverridable(gate3, "CARRIER_ARCHIVED"), `allowed=${gate3.allowed} codes=${JSON.stringify(gate3.blocked_codes)}`);
    const after = await pickers(lOut2.id);
    for (const [name, present] of Object.entries(after)) ok(`${name} offers NOTHING for the archived carrier`, !present);

    // ── [3b] the five bypasses Phase A found (carrier-archive B2b) ──
    // Each of these reached a tender or an assignment with NO gate before B2b.
    // Each now refuses through the chokepoint, by name, with the codes, and
    // leaves no row behind. They run against the ARCHIVED carrier so the code
    // they must name is CARRIER_ARCHIVED.
    console.log("\n[3b] the bypass paths — each refused through the chokepoint, by name, leaving nothing");
    const refusedBy = (r: any, code: string) =>
      r.status === 403 && r.json.error === "CARRIER_INELIGIBLE" && Array.isArray(r.json.blocked_codes) && r.json.blocked_codes.some((c: any) => c.code === code);

    // A — assign-match: the body's userId went straight into Load.carrierId
    const lA = await makeLoad("BYPASS-A", "POSTED", null);
    const rA = await send("POST", `/automation/assign-match/${lA.id}`, { userId: cu.id });
    ok("A assign-match: refused 403 CARRIER_INELIGIBLE naming CARRIER_ARCHIVED", refusedBy(rA, "CARRIER_ARCHIVED"), `status ${rA.status} ${JSON.stringify(rA.json).slice(0, 200)}`);
    ok("A assign-match: the load still has no carrier", (await prisma.load.findUnique({ where: { id: lA.id } }))?.carrierId === null);

    // B — fall-off-accept: any user id in the body, no gate
    const lB = await makeLoad("BYPASS-B", "POSTED", null);
    const evB = await prisma.fallOffEvent.create({ data: { loadId: lB.id, reason: "b6d bypass B", status: "ACTIVE" } as any });
    const rB = await send("POST", `/automation/fall-off-accept/${lB.id}`, { carrierUserId: cu.id });
    ok("B fall-off-accept: refused 403 CARRIER_INELIGIBLE naming CARRIER_ARCHIVED", refusedBy(rB, "CARRIER_ARCHIVED"), `status ${rB.status} ${JSON.stringify(rB.json).slice(0, 200)}`);
    const evB2 = await prisma.fallOffEvent.findUnique({ where: { id: evB.id } });
    ok("B fall-off-accept: no carrier written, the event stays ACTIVE", (await prisma.load.findUnique({ where: { id: lB.id } }))?.carrierId === null && evB2?.status === "ACTIVE");

    // C — broadcast: every body candidate got an offer
    const lC = await makeLoad("BYPASS-C", "POSTED", null);
    const rC = await send("POST", `/loads/${lC.id}/broadcast`, { candidates: [{ carrierId: carrier.id, carrierUserId: cu.id, companyName: "Peace Transport", offeredRate: 3500 }], expirationMinutes: 60 });
    const skippedC = rC.json.skipped ?? [];
    ok("C broadcast: launches with the archived carrier SKIPPED by name, CARRIER_ARCHIVED, tenderCount 0",
      rC.status === 201 && rC.json.tenderCount === 0 && skippedC.length === 1 && skippedC[0].carrierId === carrier.id && skippedC[0].blocked_codes.some((c: any) => c.code === "CARRIER_ARCHIVED"),
      `status ${rC.status} ${JSON.stringify(rC.json).slice(0, 220)}`);
    ok("C broadcast: no tender row and no history row for the skipped candidate", (await prisma.loadTender.count({ where: { loadId: lC.id } })) === 0 && (await prisma.loadActivity.count({ where: { loadId: lC.id, tenderId: { not: null } } })) === 0);

    // D (insert) — the manual position add wrote the body's carrierUserId ungated
    const lD = await makeLoad("BYPASS-D", "POSTED", null);
    const wfD = await prisma.waterfall.create({ data: { loadId: lD.id, mode: "manual", status: "active", totalPositions: 0, createdById: ae.id } as any });
    const rD = await send("POST", `/waterfalls/${wfD.id}/positions`, { carrierUserId: cu.id, offeredRate: 3500 });
    ok("D position add: refused 403 CARRIER_INELIGIBLE naming CARRIER_ARCHIVED", refusedBy(rD, "CARRIER_ARCHIVED"), `status ${rD.status} ${JSON.stringify(rD.json).slice(0, 200)}`);
    ok("D position add: no position row was inserted", (await prisma.waterfallPosition.count({ where: { waterfallId: wfD.id } })) === 0);

    // D (offer) — a queued row that got in anyway (stale, or from before the gate) is skipped at offer time, not tendered
    const stale = await prisma.waterfallPosition.create({ data: { waterfallId: wfD.id, carrierId: cu.id, position: 1, status: "queued", offeredRate: 3500 } as any });
    await prisma.waterfall.update({ where: { id: wfD.id }, data: { totalPositions: 1 } });
    await advanceWaterfall(wfD.id, 1);
    const stale2 = await prisma.waterfallPosition.findUnique({ where: { id: stale.id } });
    const evD = await prisma.loadActivity.findFirst({ where: { loadId: lD.id, eventType: "position_skipped" }, orderBy: { createdAt: "desc" } });
    ok("D offer: the cascade SKIPS the archived carrier's position and advances — no tender, no TENDERED flip",
      stale2?.status === "skipped" && (await prisma.loadTender.count({ where: { loadId: lD.id } })) === 0 && (await prisma.load.findUnique({ where: { id: lD.id } }))?.status !== "TENDERED",
      `position=${stale2?.status} tenders=${await prisma.loadTender.count({ where: { loadId: lD.id } })}`);
    ok("D offer: the skip event names compliance and CARRIER_ARCHIVED", !!evD && JSON.stringify(evD.metadata ?? {}).includes("CARRIER_ARCHIVED"), JSON.stringify(evD?.metadata ?? null).slice(0, 200));

    // E — instant-book stays dead, now by the gate's name rather than by FK
    const lE = await makeLoad("BYPASS-E", "POSTED", null);
    const rE = await send("POST", "/ai/instant-book", { loadId: lE.id, carrierId: carrier.id });
    ok("E instant-book: still refuses (profile id where a user id belongs), and writes nothing", rE.status !== 201 && (rE.json.success === false || rE.status >= 400) && (await prisma.load.findUnique({ where: { id: lE.id } }))?.carrierId === null, `status ${rE.status} ${JSON.stringify(rE.json).slice(0, 160)}`);
    const fp3 = await prisma.carrierFingerprint.findUnique({ where: { carrierId: carrier.id } });
    ok("fingerprint row unchanged by the archive (every hash and updatedAt identical)",
      !!fp3 && fp3.phoneHash === fp0!.phoneHash && fp3.emailHash === fp0!.emailHash && fp3.addressHash === fp0!.addressHash && fp3.dotHash === fp0!.dotHash && fp3.updatedAt.getTime() === fp0!.updatedAt.getTime());
    const all3 = await get("/carrier/all?include_deleted=true");
    const row3 = (all3.json.carriers || []).find((c: any) => c.id === carrier.id);
    ok("the AE list shows the archived row only on opt-in, with its reason", !!row3 && !!row3.deletedAt && row3.archiveReason === "CEASED_OPERATIONS", JSON.stringify(row3).slice(0, 160));

    // ── [4] restore: REVIEWING, columns cleared, fingerprint rebuilt from the row as it stands ──
    console.log("\n[4] restore");
    // identity drifts while archived — a rebuild that hashed the archived row would keep the old phone hash
    const phoneAfter = `2695551${String(stamp).slice(-3)}`;
    await prisma.user.update({ where: { id: cu.id }, data: { phone: phoneAfter } });
    const r4 = await send("PUT", `/carriers/${carrier.id}/restore`, {});
    ok("200 restored, at REVIEWING, fingerprintRebuilt: true", r4.status === 200 && r4.json.details?.onboardingStatus === "REVIEWING" && r4.json.details?.fingerprintRebuilt === true, `status ${r4.status} ${JSON.stringify(r4.json)}`);
    const p4 = await prisma.carrierProfile.findUnique({ where: { id: carrier.id } });
    const u4 = await prisma.user.findUnique({ where: { id: cu.id } });
    ok("profile: REVIEWING / REVIEW, all four archive columns cleared", p4?.onboardingStatus === "REVIEWING" && p4.status === "REVIEW" && p4.deletedAt === null && p4.deletedBy === null && p4.archiveReason === null && p4.archiveNote === null, `${p4?.onboardingStatus} ${p4?.status} ${p4?.archiveReason}`);
    ok("login reactivated", u4?.isActive === true);
    const fp4 = await prisma.carrierFingerprint.findUnique({ where: { carrierId: carrier.id } });
    ok("fingerprint rebuilt AFTER the restore: updatedAt advanced past the archive", !!fp4 && fp4.updatedAt.getTime() > archivedAt.getTime() && fp4.updatedAt.getTime() > fp0!.updatedAt.getTime());
    ok("…from the row as it stands: the phone hash follows the new phone, the email hash is unchanged", !!fp4 && fp4.phoneHash !== fp0!.phoneHash && fp4.emailHash === fp0!.emailHash, `${fp4?.phoneHash?.slice(0, 12)} vs ${fp0?.phoneHash?.slice(0, 12)}`);
    const rec4 = await prisma.auditTrail.findFirst({ where: { entityId: carrier.id, entityType: "CarrierProfile" }, orderBy: { performedAt: "desc" } });
    const cf4 = (rec4?.changedFields ?? {}) as any;
    ok("lifecycle row: CARRIER_RESTORED, previous APPROVED/CEASED_OPERATIONS → new REVIEWING, fingerprintRebuilt", cf4.actionDetail === "CARRIER_RESTORED" && cf4.previous?.onboardingStatus === "APPROVED" && cf4.previous?.archiveReason === "CEASED_OPERATIONS" && cf4.new?.onboardingStatus === "REVIEWING" && cf4.new?.fingerprintRebuilt === true, JSON.stringify(cf4).slice(0, 240));
    const login4 = await login();
    ok("login no longer refuses on deactivation", login4.status !== 403, `status ${login4.status}`);
    const gate4 = await complianceCheck(carrier.id);
    okB2("a restored carrier is NOT tenderable until a human approves it — the gate refuses at REVIEWING with CARRIER_NOT_APPROVED",
      !gate4.allowed && hasCode(gate4, "CARRIER_NOT_APPROVED") && !isOverridable(gate4, "CARRIER_NOT_APPROVED"), `allowed=${gate4.allowed} codes=${JSON.stringify(gate4.blocked_codes)} — the executed BCA survives the archive, so nothing else in the gate refuses a REVIEWING carrier`);
    const all4 = await get("/carrier/all");
    ok("the AE list shows the restored carrier again without opt-in", (all4.json.carriers || []).some((c: any) => c.id === carrier.id));
    const smart4 = await matchCarriersForLoad(lOffer.id);
    ok("…and the dispatch picker still does not offer it (REVIEWING is not APPROVED)", !smart4.matches.some((m: any) => m.carrierId === carrier.id));
    const restoreTwice = await send("PUT", `/carriers/${carrier.id}/restore`, {});
    ok("restoring a live carrier is 404, not a second restore", restoreTwice.status === 404);
  } finally {
    // ── cleanup, best effort, FK order ──
    const leftovers: string[] = [];
    const attempt = async (label: string, fn: () => Promise<unknown>) => { try { await fn(); } catch (e: any) { leftovers.push(`${label}: ${String(e?.message || e).slice(0, 80)}`); } };
    await attempt("notifications", () => prisma.notification.deleteMany({ where: { OR: [{ userId: cu.id }, { userId: ae.id }, { message: { contains: tag } }] } }));
    await attempt("chameleonMatches", () => prisma.chameleonMatch.deleteMany({ where: { OR: [{ carrierId: carrier.id }, { matchedCarrierId: carrier.id }] } }));
    await attempt("fingerprint", () => prisma.carrierFingerprint.deleteMany({ where: { carrierId: carrier.id } }));
    await attempt("loadActivity", () => prisma.loadActivity.deleteMany({ where: { loadId: { in: madeLoads } } }));
    await attempt("tenders", () => prisma.loadTender.deleteMany({ where: { loadId: { in: madeLoads } } }));
    await attempt("bids", () => prisma.loadBid.deleteMany({ where: { loadId: { in: madeLoads } } }));
    await attempt("carrierPay", () => prisma.carrierPay.deleteMany({ where: { loadId: { in: madeLoads } } }));
    await attempt("dock", () => prisma.dockSchedule.deleteMany({ where: { carrierId: carrier.id } }));
    await attempt("infoRequests", () => prisma.infoRequest.deleteMany({ where: { carrierId: carrier.id } }));
    await attempt("agreements", () => prisma.carrierAgreement.deleteMany({ where: { carrierId: carrier.id } }));
    await attempt("loads", () => prisma.load.deleteMany({ where: { id: { in: madeLoads } } }));
    await attempt("auditTrail", () => prisma.auditTrail.deleteMany({ where: { OR: [{ entityId: carrier.id }, { performedById: ae.id }] } }));
    await attempt("auditLog", () => (prisma as any).auditLog.deleteMany({ where: { userId: { in: [ae.id, cu.id] } } }));
    await attempt("profile", () => prisma.carrierProfile.delete({ where: { id: carrier.id } }));
    await attempt("users", () => prisma.user.deleteMany({ where: { id: { in: [cu.id, ae.id] } } }));
    if (leftovers.length) console.log(`\ncleanup leftovers (the E2E container is throwaway; listed, not hidden):\n  ${leftovers.join("\n  ")}`);
    else console.log("\ncleanup: every row this proof created is gone");
  }

  console.log(`\n${pass} passed, ${fail} failed${pendingB2 ? `, ${pendingB2} PENDING(B2)` : ""}`);
  server.close();
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
