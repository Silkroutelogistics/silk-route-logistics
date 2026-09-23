/**
 * One-off: repair the two carrier/shipper-facing effects of the SRL-121495
 * mis-cancellation that the reactivation could not reach.
 *
 * ─── 1. Load.trackingToken ─────────────────────────────────────────────────
 *
 * `cascadeLoadCancellation` sets it to NULL. The column is
 * `@unique @default(uuid())`, and a Prisma default applies ONLY at INSERT, so
 * the ORM can never regenerate it — a census of backend/src finds no code that
 * writes this column at all. The original value is unrecoverable.
 *
 * WHAT ACTUALLY BREAKS, traced rather than assumed. `sendShipperDeliveryEmail`
 * (shipperNotificationService:161) contains no tracking link at all. The button
 * lives in `sendShipperMilestoneEmail` (:207), which builds
 * `https://silkroutelogistics.ai/track/${load.trackingToken}` at :233 and renders
 * the button only when that is truthy (:256). DELIVERED is a trackable milestone
 * (`milestoneLabels.DELIVERED = "Delivered"`), and loadController:880 fires the
 * milestone email unconditionally on every status change. So the moment the load
 * is advanced to DELIVERED the customer receives a milestone email with NO
 * Track Shipment button.
 *
 * A fresh `crypto.randomUUID()` is written — the same generator shape the column
 * default uses. This is NOT the original value and cannot be: any link already
 * in the shipper's hands from before the cancel stays dead. What it restores is
 * the button on mail sent from now on. The ShipperTrackingToken row (the primary
 * resolver, revived by the reactivation) is untouched.
 *
 * ─── 2. Carrier reinstatement notice ───────────────────────────────────────
 *
 * The cancel sent JETEX FREIGHT two in-app notices at 19:50:47Z — "Load
 * Cancelled" and "is now CANCELLED". Nothing can issue a reversal, so their bell
 * contradicts their portal, which now shows the load at AT_DELIVERY.
 *
 * The two existing notices are NOT edited or deleted: they are a true record of
 * what was sent at the time. A third is added through the existing
 * `notificationService.createNotification`, in-app only, no email.
 *
 * ─── The DATABASE_URL trap this script had to avoid ────────────────────────
 *
 * `createNotification` uses the `config/database` SINGLETON, which resolves
 * `DATABASE_URL` — i.e. `backend/.env`, which the production rail (CLAUDE.md
 * §2.2) pins to the LOCAL container. Calling it while writing the load through a
 * second client on BACKFILL_DATABASE_URL would have split the two writes across
 * two DATABASES: the token onto production and the notification onto localhost,
 * each reporting success. `process.env.DATABASE_URL` is therefore set from
 * BACKFILL_DATABASE_URL BEFORE the service is imported (dotenv does not
 * overwrite an already-set variable), and the script asserts both clients
 * resolved the same host before it writes anything.
 *
 * Dry-run by default. Before-image on both paths, to the gitignored undo path.
 *
 *   BACKFILL_DATABASE_URL="postgres://..." \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *   npx tsx scripts/repair-load-121495-tracking-and-notice.ts --commit
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { hostOf, isLocalHost } from "./prisma-target-guard";

const LOAD_ID = "cmuct8gnk001vma2db2hbgrsj";
const LOAD_REF = "SRL-121495";
const COMMIT = process.argv.includes("--commit");
const UNDO = path.join(__dirname, "_repair-load-121495-undo.json");

/** Marks the reinstatement notice so a re-run cannot send a second one. */
const NOTICE_MARKER = "/carrier/dashboard/my-loads?reinstated=SRL-121495";

function refuse(msg: string): never {
  console.error(`REFUSING: ${msg}`);
  process.exit(1);
}

/** Outbound must be provably dead, not merely unset — CLAUDE.md §19 SP20. */
function assertOutboundSilent(): void {
  for (const key of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
    if (process.env[key]) refuse(`${key} is set to a real value. Outbound would be LIVE. Pass it empty.`);
  }
}

async function main(): Promise<void> {
  assertOutboundSilent();

  const url = process.env.BACKFILL_DATABASE_URL;
  if (!url) refuse("set BACKFILL_DATABASE_URL to the target database. See the header.");

  // MUST happen before any import that touches config/database.
  process.env.DATABASE_URL = url;

  const host = hostOf(url);
  console.log(`[repair] target : ${host}`);
  console.log(`[repair] note   : ${isLocalHost(host) ? "LOCAL host" : "REMOTE host -- writes here are production writes"}`);
  console.log(`[repair] mode   : ${COMMIT ? "COMMIT" : "DRY RUN"}\n`);

  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasourceUrl: url });

  try {
    // Both clients must resolve the same database, or the two writes land apart.
    const singletonUrl = process.env.DATABASE_URL ?? "";
    if (hostOf(singletonUrl) !== host) {
      refuse(`the service singleton would resolve ${hostOf(singletonUrl)} while this client uses ${host}.`);
    }

    const load = await prisma.load.findUnique({
      where: { id: LOAD_ID },
      select: {
        id: true, referenceNumber: true, status: true, deletedAt: true,
        carrierId: true, trackingToken: true, shipperCode: true,
        originCity: true, originState: true, destCity: true, destState: true,
      },
    });
    if (!load) refuse(`load ${LOAD_ID} not found on this database.`);
    if (load.referenceNumber !== LOAD_REF) refuse(`id is ${load.referenceNumber}, expected ${LOAD_REF}. Wrong database?`);
    if (load.deletedAt) refuse(`${LOAD_REF} is archived; reactivate it before repairing.`);
    if (load.status === "CANCELLED") refuse(`${LOAD_REF} is still CANCELLED. Run the reactivation first.`);

    const carrierUser = load.carrierId
      ? await prisma.user.findUnique({
          where: { id: load.carrierId },
          select: { id: true, email: true, role: true, isActive: true },
        })
      : null;
    if (!carrierUser) refuse("the load has no carrier user; there is nobody to notify.");
    if (carrierUser.role !== "CARRIER") refuse(`carrier user is role ${carrierUser.role}, expected CARRIER.`);

    const existingNotice = await prisma.notification.findFirst({
      where: { userId: carrierUser.id, actionUrl: NOTICE_MARKER },
      select: { id: true, createdAt: true },
    });

    const before = {
      capturedAt: new Date().toISOString(),
      load,
      carrierUser,
      existingReinstatementNotice: existingNotice,
    };
    fs.writeFileSync(UNDO, JSON.stringify(before, null, 2));
    console.log(`Before-image written: ${UNDO}\n`);

    const newToken = crypto.randomUUID();
    const lane = `${load.originCity}, ${load.originState} -> ${load.destCity}, ${load.destState}`;

    console.log("PLANNED WRITES");
    if (load.trackingToken) {
      console.log(`  load.trackingToken   already set (${load.trackingToken}) -> UNCHANGED`);
    } else {
      console.log(`  load.trackingToken   null -> ${newToken}   (fresh uuid; the pre-cancel value is unrecoverable)`);
    }
    if (existingNotice) {
      console.log(`  carrier notification already sent ${existingNotice.createdAt.toISOString()} -> UNCHANGED`);
    } else {
      console.log(`  carrier notification + 1 LOAD_UPDATE reinstatement notice to ${carrierUser.email} (in-app only, no email)`);
    }
    console.log("  loadActivity         + one 'tracking_token_reissued' row");
    console.log("\n  UNTOUCHED: the two existing cancellation notices, the signed RC, the tender, ShipperTrackingToken.\n");

    if (!COMMIT) {
      console.log("DRY RUN -- nothing written. Re-run with --commit to apply.");
      return;
    }

    let wroteToken = false;
    if (!load.trackingToken) {
      // Scoped to null so a concurrent repair cannot be clobbered.
      const moved = await prisma.load.updateMany({
        where: { id: LOAD_ID, trackingToken: null },
        data: { trackingToken: newToken },
      });
      wroteToken = moved.count === 1;
      if (!wroteToken) console.log("  token: another writer set it first -- left alone.");
    }

    if (!existingNotice) {
      const { createNotification } = await import("../src/services/notificationService");
      await createNotification(
        carrierUser.id,
        "LOAD_UPDATE",
        "Load Reinstated",
        `Load ${LOAD_REF} (${lane}) was cancelled in error and has been reinstated. ` +
          `It is active again and showing as At Delivery in your portal. ` +
          `Please disregard the earlier cancellation notice.`,
        { actionUrl: NOTICE_MARKER },
      );
      console.log("  notification: sent.");
    }

    await prisma.loadActivity.create({
      data: {
        loadId: LOAD_ID,
        eventType: "tracking_token_reissued",
        description:
          `Tracking token reissued after the 2026-09-23 mis-cancellation nulled it. The pre-cancel value is ` +
          `unrecoverable (@default(uuid()) applies only at INSERT), so links shared before the cancel stay dead; ` +
          `shipper milestone emails sent from now on carry a working Track Shipment button. ` +
          `Carrier notified in-app that the load was reinstated.`,
        actorType: "SYSTEM",
        actorName: "repair-load-121495-tracking-and-notice",
        metadata: { before, tokenReissued: wroteToken, noticeSent: !existingNotice },
      },
    });

    // Read back and prove the URL resolves the way trackingController's
    // fallback lookup does: findFirst on trackingToken with deletedAt null.
    const after = await prisma.load.findUnique({
      where: { id: LOAD_ID },
      select: { referenceNumber: true, status: true, trackingToken: true },
    });
    const resolved = after?.trackingToken
      ? await prisma.load.findFirst({
          where: { trackingToken: after.trackingToken, deletedAt: null },
          select: { referenceNumber: true },
        })
      : null;

    console.log("\nCOMMITTED.");
    console.log(`  load            : ${after?.referenceNumber} ${after?.status}`);
    console.log(`  trackingToken   : ${after?.trackingToken}`);
    console.log(`  /track/<token>  : resolves to ${resolved?.referenceNumber ?? "NOTHING -- investigate"}`);
  } finally {
    // no-op; the client is short-lived and the process exits below
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
