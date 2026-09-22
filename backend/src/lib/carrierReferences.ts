/**
 * Carrier references — what stands between a carrier row and archive, and what
 * the archive takes with it.
 *
 * Lifecycle-gaps B5b (finding #23) first gave DELETE /carriers/:id a census:
 * it soft-deleted the profile with no look at what pointed at it, so a carrier
 * could vanish from every `deletedAt: null` fence while still on a load, still
 * owed a payable, still holding a live offer — and their portal login stayed
 * active. B5b's rule was the customer rule: refuse on ANY reference.
 *
 * THE RULE NOW (CLAUDE.md §14, "CARRIER ARCHIVE — RATIFIED 2026-09-19"): only
 * IN-FLIGHT WORK blocks an archive; history never does. In flight means a load
 * the carrier is assigned to (Load.carrierId) that can still reach
 * POD_RECEIVED — DELIVERED-pre-POD included, because the POD is still owed —
 * or a tender the carrier has ACCEPTED / RC_SENT / CONFIRMED on such a load.
 * Six classes of OPEN OFFER are WITHDRAWN inside the archive transaction
 * instead of refusing (open tender offers, queued or tendered waterfall
 * positions, pending bids, future dock schedules, active routing-guide
 * entries, open info requests). Payables and disputes neither block nor
 * change. Everything else — documents, executed agreements, drivers, scans,
 * matches, settled tenders, terminal loads — is history and is kept.
 *
 * So this module answers two questions in one read: what BLOCKS (the in-flight
 * signals, both of them, because they are written by different services and
 * the tender signal is what survives an assignment-column drift), and what the
 * transaction WITHDRAWS (the ids it needs to settle open offers and skip
 * positions). Every other class is still COUNTED — the 409 body names them
 * and the AE sees what the carrier leaves behind — but nothing outside the
 * in-flight set refuses.
 *
 * WHY ARCHIVE IS SOFT, still: (1) the login. CarrierProfile.user is
 * `onDelete: Restrict` on the User side and every sign-in writes an audit row
 * with a required FK to the user, so the login cannot be hard-deleted without
 * destroying audit history — it is deactivated instead. (2) The evidence.
 * Twenty-four relations point at CarrierProfile and most default to Restrict;
 * the Compass vetting report, the chameleon fingerprint, compliance scans are
 * the record of what SRL checked, and an archive that destroyed them would be
 * an archive nobody could later explain.
 *
 * ID SEMANTICS, because this is where carrier code has gone wrong before
 * (§13.3 Item 222.4): Load.carrierId, LoadBid.carrierId,
 * WaterfallPosition.carrierId, FallOffEvent.originalCarrierId,
 * CarrierPay.carrierId and PaymentDispute.carrierId hold the USER id;
 * LoadTender, CarrierAgreement, Document(entityType CARRIER), ChameleonMatch,
 * InfoRequest, ComplianceOverride, FraudReport, RoutingGuideEntry,
 * DockSchedule, Driver and QuickPayEnrollment hold the PROFILE id.
 * Settlement, EDITransaction and ExceptionAlert carry a bare carrierId whose
 * writer does not say; those are counted under BOTH ids — a count can only
 * over-report, and nothing here refuses on a count.
 */

import { LoadStatus, TenderStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { BINDING_TENDER_STATES, isInFlightStatus, type BlockingLoad } from "./carrierArchiveGuard";
import { HOLDS_LOAD, LIVE_STATES } from "./tenderLifecycle";

/** Waterfall positions the cascade has not settled: not yet reached, or reached and open. */
const OPEN_WATERFALL_POSITION_STATUSES = ["queued", "tendered"] as const;

export interface CarrierLoadRef {
  id: string;
  loadNumber: string | null;
  referenceNumber: string;
  status: string;
  /** Can still reach POD_RECEIVED (DELIVERED included): the carrier is still on it. */
  inFlight: boolean;
}

/** A tender that holds a load: ACCEPTED / RC_SENT / CONFIRMED, with the load it holds. */
export interface HoldingTenderRef {
  id: string;
  status: TenderStatus;
  load: { id: string; loadNumber: string | null; referenceNumber: string; status: LoadStatus; deletedAt: Date | null };
}

/** A cascade position the archive skips; `tendered` ones carry a live offer the archive also withdraws. */
export interface OpenWaterfallPositionRef {
  id: string;
  waterfallId: string;
  loadId: string;
  position: number;
  status: string;
}

export interface CarrierReferenceCensus {
  loads: CarrierLoadRef[];
  tenders: number;
  /** Not settled: an open offer or a committed haul. Counted; the split below is what decides. */
  liveTenders: number;
  /** OFFERED / COUNTERED: withdrawn inside the archive transaction. */
  withdrawableTenderIds: string[];
  /** ACCEPTED / RC_SENT / CONFIRMED with the load each holds; blocks while that load is in flight. */
  holdingTenders: HoldingTenderRef[];
  bids: number;
  waterfallPositions: number;
  /** queued / tendered positions the archive marks skipped. */
  openWaterfallPositions: OpenWaterfallPositionRef[];
  carrierPays: number;
  unpaidCarrierPays: number;
  settlements: number;
  disputes: number;
  agreements: number;
  documents: number;
  drivers: number;
  fallOffs: number;
  chameleonMatches: number;
  infoRequests: number;
  overrides: number;
  fraudReports: number;
  quickPayEnrollments: number;
  routingGuideEntries: number;
  dockSchedules: number;
  ediTransactions: number;
  exceptionAlerts: number;
}

export function carrierReferenceTotal(c: CarrierReferenceCensus): number {
  return (
    c.loads.length + c.tenders + c.bids + c.waterfallPositions + c.carrierPays + c.settlements + c.disputes +
    c.agreements + c.documents + c.drivers + c.fallOffs + c.chameleonMatches + c.infoRequests + c.overrides +
    c.fraudReports + c.quickPayEnrollments + c.routingGuideEntries + c.dockSchedules + c.ediTransactions +
    c.exceptionAlerts
  );
}

/**
 * The loads that BLOCK an archive, deduplicated across the two signals. The
 * assignment signal is recorded first; a holding tender on the same load adds
 * nothing, and a holding tender on a load the assignment column does not name
 * is recorded as `committed_tender` — the drift the second signal exists for.
 * A holding tender on a soft-deleted or terminal load is history.
 */
export function inFlightBlockers(c: CarrierReferenceCensus): BlockingLoad[] {
  const blocking = new Map<string, BlockingLoad>();
  for (const l of c.loads) {
    if (!l.inFlight) continue;
    blocking.set(l.id, {
      id: l.id,
      loadNumber: l.loadNumber,
      referenceNumber: l.referenceNumber,
      status: l.status as LoadStatus,
      via: "assignment",
    });
  }
  for (const t of c.holdingTenders) {
    const l = t.load;
    if (!l || l.deletedAt || !isInFlightStatus(l.status) || blocking.has(l.id)) continue;
    blocking.set(l.id, {
      id: l.id,
      loadNumber: l.loadNumber,
      referenceNumber: l.referenceNumber,
      status: l.status,
      via: "committed_tender",
    });
  }
  return [...blocking.values()];
}

/** One sentence naming what the carrier leaves behind, live things first. */
export function describeCarrierReferences(c: CarrierReferenceCensus): string {
  const parts: string[] = [];
  const n = (count: number, one: string, many: string, live?: { count: number; word: string }) => {
    if (!count) return "";
    const base = `${count} ${count === 1 ? one : many}`;
    return live && live.count ? `${base} (${live.count} ${live.word})` : base;
  };
  if (c.loads.length) {
    const inFlight = c.loads.filter((l) => l.inFlight).length;
    parts.push(n(c.loads.length, "load", "loads", { count: inFlight, word: "in flight" }));
  }
  for (const s of [
    n(c.tenders, "tender", "tenders", { count: c.liveTenders, word: "live" }),
    n(c.carrierPays, "carrier payable", "carrier payables", { count: c.unpaidCarrierPays, word: "unpaid" }),
    n(c.settlements, "settlement", "settlements"),
    n(c.disputes, "payment dispute", "payment disputes"),
    n(c.agreements, "signed agreement", "signed agreements"),
    n(c.documents, "document", "documents"),
    n(c.drivers, "roster driver", "roster drivers"),
    n(c.bids, "load-board bid", "load-board bids"),
    n(c.waterfallPositions, "waterfall position", "waterfall positions"),
    n(c.fallOffs, "fall-off record", "fall-off records"),
    n(c.chameleonMatches, "chameleon match", "chameleon matches"),
    n(c.infoRequests, "info request", "info requests"),
    n(c.overrides, "compliance override", "compliance overrides"),
    n(c.fraudReports, "fraud report", "fraud reports"),
    n(c.quickPayEnrollments, "Quick Pay enrolment", "Quick Pay enrolments"),
    n(c.routingGuideEntries, "routing-guide entry", "routing-guide entries"),
    n(c.dockSchedules, "dock schedule", "dock schedules"),
    n(c.ediTransactions, "EDI transaction", "EDI transactions"),
    n(c.exceptionAlerts, "exception alert", "exception alerts"),
  ]) {
    if (s) parts.push(s);
  }
  return parts.join(", ");
}

export async function censusCarrierReferences(profileId: string, userId: string): Promise<CarrierReferenceCensus> {
  const either = { in: [userId, profileId] };
  const [
    loadRows, tenders, bindingTenders, bids, waterfallPositions, openPositionRows, carrierPays, unpaidCarrierPays,
    settlements, disputes, agreements, documents, drivers, fallOffs, chameleonMatches, infoRequests, overrides,
    fraudReports, quickPayEnrollments, routingGuideEntries, dockSchedules, ediTransactions, exceptionAlerts,
  ] = await Promise.all([
    prisma.load.findMany({
      where: { carrierId: userId },
      select: { id: true, loadNumber: true, referenceNumber: true, status: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.loadTender.count({ where: { carrierId: profileId } }),
    // Every tender that still binds the carrier, with the load a hold is on:
    // the OFFERED / COUNTERED ones are withdrawn, the rest block or are history
    // depending on that load. One read serves both, so the two cannot disagree.
    prisma.loadTender.findMany({
      where: { carrierId: profileId, deletedAt: null, status: { in: BINDING_TENDER_STATES } },
      select: {
        id: true,
        status: true,
        load: { select: { id: true, loadNumber: true, referenceNumber: true, status: true, deletedAt: true } },
      },
    }),
    prisma.loadBid.count({ where: { carrierId: userId } }),
    prisma.waterfallPosition.count({ where: { carrierId: userId } }),
    prisma.waterfallPosition.findMany({
      where: { carrierId: userId, status: { in: [...OPEN_WATERFALL_POSITION_STATUSES] } },
      select: { id: true, waterfallId: true, position: true, status: true, waterfall: { select: { loadId: true } } },
    }),
    prisma.carrierPay.count({ where: { carrierId: userId } }),
    prisma.carrierPay.count({ where: { carrierId: userId, status: { notIn: ["PAID", "VOID"] as any } } }),
    prisma.settlement.count({ where: { carrierId: either } }),
    prisma.paymentDispute.count({ where: { carrierId: either } }),
    prisma.carrierAgreement.count({ where: { carrierId: profileId } }),
    prisma.document.count({ where: { entityType: "CARRIER", entityId: profileId } }),
    prisma.driver.count({ where: { carrierProfileId: profileId } }),
    prisma.fallOffEvent.count({ where: { originalCarrierId: userId } }),
    prisma.chameleonMatch.count({ where: { OR: [{ carrierId: profileId }, { matchedCarrierId: profileId }] } }),
    prisma.infoRequest.count({ where: { carrierId: profileId } }),
    prisma.complianceOverride.count({ where: { carrierId: profileId } }),
    prisma.fraudReport.count({ where: { carrierId: profileId } }),
    prisma.quickPayEnrollment.count({ where: { carrierProfileId: profileId } }),
    prisma.routingGuideEntry.count({ where: { carrierId: profileId } }),
    prisma.dockSchedule.count({ where: { carrierId: profileId } }),
    prisma.eDITransaction.count({ where: { carrierId: either } }),
    prisma.exceptionAlert.count({ where: { carrierId: either } }),
  ]);

  const withdrawableTenderIds: string[] = [];
  const holdingTenders: HoldingTenderRef[] = [];
  for (const t of bindingTenders) {
    if ((LIVE_STATES as TenderStatus[]).includes(t.status)) withdrawableTenderIds.push(t.id);
    else if ((HOLDS_LOAD as TenderStatus[]).includes(t.status) && t.load) {
      holdingTenders.push({ id: t.id, status: t.status, load: t.load });
    }
  }

  return {
    loads: loadRows.map((l) => ({
      id: l.id,
      loadNumber: l.loadNumber,
      referenceNumber: l.referenceNumber,
      status: l.status,
      inFlight: isInFlightStatus(l.status),
    })),
    tenders,
    liveTenders: bindingTenders.length,
    withdrawableTenderIds,
    holdingTenders,
    bids,
    waterfallPositions,
    openWaterfallPositions: openPositionRows.map((p) => ({
      id: p.id,
      waterfallId: p.waterfallId,
      loadId: p.waterfall.loadId,
      position: p.position,
      status: p.status,
    })),
    carrierPays, unpaidCarrierPays, settlements, disputes, agreements, documents, drivers, fallOffs,
    chameleonMatches, infoRequests, overrides, fraudReports, quickPayEnrollments, routingGuideEntries,
    dockSchedules, ediTransactions, exceptionAlerts,
  };
}
