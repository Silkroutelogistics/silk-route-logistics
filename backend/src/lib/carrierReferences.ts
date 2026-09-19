/**
 * Carrier references — what stands between a carrier row and archive.
 *
 * Lifecycle-gaps B5b (finding #23; the customer rule of B5a, decision 4 of
 * 2026-09-18, applied to carriers). DELETE /carriers/:id soft-deleted the
 * profile with no look at what pointed at it: a carrier could vanish from
 * every `deletedAt: null` fence while still on a load, still owed a payable,
 * still holding a live offer — and their portal login stayed active.
 *
 * THE RULE, the same one customers follow: archive only when NOTHING
 * references the carrier; anything else is refused with the references NAMED
 * and the next action stated. The end state for a carrier with history is
 * SUSPENDED (POST /compliance/carrier/:id/suspend, reason required), which
 * blocks every tender and keeps every record — the carrier analogue of
 * customer inactivation. A carrier with no history is a registration that went
 * nowhere; that row is archived and its login deactivated, and restore undoes
 * both.
 *
 * WHERE THIS DIVERGES FROM THE CUSTOMER RULE, AND WHY. A zero-reference
 * customer is hard-deleted; a zero-reference carrier is archived (soft). Two
 * reasons, both structural: (1) the login. CarrierProfile.user is
 * `onDelete: Restrict` on the User side and every sign-in writes an audit row
 * with a required FK to the user, so the login cannot be hard-deleted without
 * destroying audit history — it is deactivated instead, and a headless CARRIER
 * login is what a hard-deleted profile would leave behind. (2) The evidence.
 * Twenty-four relations point at CarrierProfile and most default to Restrict;
 * the rows a registration accrues before it ever hauls — the Compass vetting
 * report, the chameleon fingerprint, compliance scans — are the record of what
 * SRL checked, and a hard delete would have to destroy each of them by hand.
 *
 * ID SEMANTICS, because this is where carrier code has gone wrong before
 * (§13.3 Item 222.4): Load.carrierId, LoadBid.carrierId,
 * WaterfallPosition.carrierId, FallOffEvent.originalCarrierId,
 * CarrierPay.carrierId and PaymentDispute.carrierId hold the USER id;
 * LoadTender, CarrierAgreement, Document(entityType CARRIER), ChameleonMatch,
 * InfoRequest, ComplianceOverride, FraudReport, RoutingGuideEntry,
 * DockSchedule, Driver and QuickPayEnrollment hold the PROFILE id.
 * Settlement, EDITransaction and ExceptionAlert carry a bare carrierId whose
 * writer does not say; those are counted under BOTH ids, which can only
 * over-refuse — the safe direction for a delete.
 */

import { prisma } from "../config/database";

/** A load the carrier is still on. Terminal statuses are history. */
const TERMINAL_LOAD_STATUSES = ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "CANCELLED", "TONU"];
/** Tender states that are not settled — an offer or a commitment still standing. */
const LIVE_TENDER_STATUSES = ["OFFERED", "COUNTERED", "ACCEPTED", "RC_SENT", "CONFIRMED"];

export interface CarrierLoadRef {
  id: string;
  referenceNumber: string;
  status: string;
  /** Not in a terminal status: release the carrier from it before anything else. */
  inFlight: boolean;
}

export interface CarrierReferenceCensus {
  loads: CarrierLoadRef[];
  tenders: number;
  liveTenders: number;
  bids: number;
  waterfallPositions: number;
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

/** One sentence naming what blocks, live things first. */
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
    loadRows, tenders, liveTenders, bids, waterfallPositions, carrierPays, unpaidCarrierPays, settlements, disputes,
    agreements, documents, drivers, fallOffs, chameleonMatches, infoRequests, overrides, fraudReports,
    quickPayEnrollments, routingGuideEntries, dockSchedules, ediTransactions, exceptionAlerts,
  ] = await Promise.all([
    prisma.load.findMany({ where: { carrierId: userId }, select: { id: true, referenceNumber: true, status: true }, orderBy: { createdAt: "desc" } }),
    prisma.loadTender.count({ where: { carrierId: profileId } }),
    prisma.loadTender.count({ where: { carrierId: profileId, status: { in: LIVE_TENDER_STATUSES as any } } }),
    prisma.loadBid.count({ where: { carrierId: userId } }),
    prisma.waterfallPosition.count({ where: { carrierId: userId } }),
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

  return {
    loads: loadRows.map((l) => ({
      id: l.id,
      referenceNumber: l.referenceNumber,
      status: l.status,
      inFlight: !TERMINAL_LOAD_STATUSES.includes(l.status),
    })),
    tenders, liveTenders, bids, waterfallPositions, carrierPays, unpaidCarrierPays, settlements, disputes,
    agreements, documents, drivers, fallOffs, chameleonMatches, infoRequests, overrides, fraudReports,
    quickPayEnrollments, routingGuideEntries, dockSchedules, ediTransactions, exceptionAlerts,
  };
}
