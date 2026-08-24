/**
 * The Carrier Bench — who can actually haul, on which lanes, right now.
 *
 * The daily loop is source -> vet -> sign -> bench, and until now the last step
 * had no surface. A carrier was approved somewhere, an agreement was signed
 * somewhere else, and whether the result could be tendered a load was a
 * question only the tender endpoint could answer, one carrier at a time.
 *
 * TWO RULES SHAPE THIS FILE.
 *
 * It does not RE-DERIVE eligibility. complianceCheckMany is the same gate the
 * tender path runs, batched to three queries regardless of carrier count, so a
 * carrier the board calls ready is a carrier the tender endpoint will accept.
 * A dashboard that computes its own opinion of eligibility is a dashboard that
 * will eventually disagree with the thing that decides, and the disagreement
 * will be discovered by an AE promising a shipper a truck.
 *
 * It does not INVENT history. Three of the four counters are backed by real
 * timestamps (createdAt, approvedAt, signedAt). The number of carriers
 * tenderable right now has no such column — nothing records what it was last
 * Tuesday — so it is reported as a current-state count with NO delta rather
 * than a delta computed from a series that does not exist.
 */
import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { etStartOfWeek } from "../lib/financePeriods";
import {
  complianceCheckMany,
  AUTHORITY_AGE_GATE_LIVE_AT,
} from "./complianceMonitorService";
import { calendarMonthsBetween } from "./fmcsaService";

/**
 * The three authority tiers, plus the one the real world insists on.
 *
 * Item 182 ratifies THREE: under 12 months is an absolute block, 12 to 18 is
 * override-eligible, 18 and over is a silent allow. The four-tier variant was
 * retired and must not be reintroduced here.
 *
 * AGE_NOT_ON_FILE is not a fourth tier — it is the absence of the input the
 * three tiers are computed from, and it is the state EVERY carrier is in today.
 * The FMCSA QCMobile endpoint returns current status rather than grant history,
 * so authorityGrantedDate is null across the board and the Socrata backfill has
 * never been committed (Item 196). Folding that into "blocked" would render a
 * board saying every carrier is refused for being too young, when the truth is
 * that nobody has asked how old they are. The gate itself agrees: that branch
 * emits AUTHORITY_AGE_UNAVAILABLE, a warning, and does not block.
 */
export type AuthorityTier = "READY" | "OVERRIDE_ELIGIBLE" | "BLOCKED" | "AGE_NOT_ON_FILE";

export const AUTHORITY_TIER_LABEL: Record<AuthorityTier, string> = {
  READY: "18+ months",
  OVERRIDE_ELIGIBLE: "12-18 months",
  BLOCKED: "Under 12 months",
  AGE_NOT_ON_FILE: "Age not on file",
};

/** Item 182's thresholds, in one place, named. */
export const AUTHORITY_MIN_MONTHS = 12;
export const AUTHORITY_STANDARD_MONTHS = 18;

/**
 * Classify one carrier's authority age the way the gate does.
 *
 * Deliberately mirrors complianceMonitorService's band structure including the
 * grandfather clause: a carrier approved before the gate went live is never
 * blocked on age, whatever their grant date says, so the board must not paint
 * them red when the tender path would let them through.
 */
export function authorityTier(
  carrier: { authorityGrantedDate: Date | null; approvedAt: Date | null },
  now: Date = new Date(),
): AuthorityTier {
  const grandfathered =
    !!carrier.approvedAt && carrier.approvedAt < AUTHORITY_AGE_GATE_LIVE_AT;

  if (!carrier.authorityGrantedDate) {
    // Grandfathered or not, an unknown age is an unknown age. The gate warns
    // and allows; so does the board.
    return "AGE_NOT_ON_FILE";
  }
  if (grandfathered) return "READY";

  const months = calendarMonthsBetween(carrier.authorityGrantedDate, now);
  if (months < AUTHORITY_MIN_MONTHS) return "BLOCKED";
  if (months < AUTHORITY_STANDARD_MONTHS) return "OVERRIDE_ELIGIBLE";
  return "READY";
}

/**
 * The Sunday before last Sunday, in Eastern time.
 *
 * Built from etStartOfWeek rather than by subtracting seven days, because a
 * week is not always 168 hours: the DST transitions make it 167 or 169, and
 * subtracting a fixed span lands an hour off and silently moves a load between
 * weeks. Stepping one millisecond back from this week's start lands inside last
 * week whatever its length, and asking the library for THAT week's start gives
 * the right instant. One dialect, per slot 2.
 */
export function previousEtWeekStart(now: Date = new Date()): Date {
  const thisWeek = etStartOfWeek(now);
  return etStartOfWeek(new Date(thisWeek.getTime() - 1));
}

export interface WeeklyCounter {
  thisWeek: number;
  lastWeek: number;
  delta: number;
}

function counter(thisWeek: number, lastWeek: number): WeeklyCounter {
  return { thisWeek, lastWeek, delta: thisWeek - lastWeek };
}

export interface BenchTierCounts {
  READY: number;
  OVERRIDE_ELIGIBLE: number;
  BLOCKED: number;
  AGE_NOT_ON_FILE: number;
}

const zeroTiers = (): BenchTierCounts => ({
  READY: 0,
  OVERRIDE_ELIGIBLE: 0,
  BLOCKED: 0,
  AGE_NOT_ON_FILE: 0,
});

export interface BenchLaneRow {
  guideId: string;
  name: string;
  originState: string;
  destState: string;
  equipmentType: string;
  customerName: string | null;
  /** Carriers the shipper ranked on this lane who are also on the bench. */
  benched: number;
  /** …of whom the tender gate would accept today. */
  tenderable: number;
  tiers: BenchTierCounts;
}

export interface BenchCarrierRow {
  carrierId: string;
  companyName: string;
  mcNumber: string | null;
  tier: AuthorityTier;
  tenderable: boolean;
  /** Why not, verbatim from the gate. Never re-worded here. */
  blockedReasons: string[];
}

export interface BenchBoard {
  generatedAt: string;
  /** Tiers are Item 182's, not yet ratified with Sandy/BKN. */
  provisional: true;
  bench: {
    total: number;
    tenderable: number;
    tiers: BenchTierCounts;
    carriers: BenchCarrierRow[];
  };
  lanes: BenchLaneRow[];
  weekly: {
    sourced: WeeklyCounter;
    approved: WeeklyCounter;
    signed: WeeklyCounter;
    lanesOpened: WeeklyCounter;
  };
}

/**
 * Bench membership: approved, real, and still a carrier.
 *
 * Note this is DELIBERATELY not the full eligibility test — that is what
 * complianceCheckMany answers below, per carrier, and the two are reported
 * separately. "On the bench" is who we have; "tenderable" is who can haul
 * today. Conflating them would hide the carrier whose insurance lapsed
 * yesterday, which is precisely the carrier an AE needs to see.
 */
const BENCH_WHERE = {
  deletedAt: null,
  isTestAccount: false,
  onboardingStatus: "APPROVED",
} as const;

export async function buildBenchBoard(now: Date = new Date()): Promise<BenchBoard> {
  const weekStart = etStartOfWeek(now);
  const lastWeekStart = previousEtWeekStart(now);

  const benchCarriers = await prisma.carrierProfile.findMany({
    where: BENCH_WHERE,
    select: {
      id: true,
      companyName: true,
      mcNumber: true,
      authorityGrantedDate: true,
      approvedAt: true,
    },
    orderBy: { approvedAt: "desc" },
  });

  const ids = benchCarriers.map((c) => c.id);

  // The same gate the tender path runs. Three queries regardless of N.
  let verdicts = new Map<string, { allowed: boolean; blocked_reasons: string[] }>();
  try {
    verdicts = (await complianceCheckMany(ids)) as typeof verdicts;
  } catch (err) {
    // A gate failure must not blank the board — it must be visible as "we do
    // not know", which is what an empty verdict map produces below.
    log.warn({ err }, "[BenchBoard] compliance batch failed — tenderability unknown");
  }

  const tiers = zeroTiers();
  const carriers: BenchCarrierRow[] = benchCarriers.map((c) => {
    const tier = authorityTier(c, now);
    tiers[tier] += 1;
    const v = verdicts.get(c.id);
    return {
      carrierId: c.id,
      companyName: c.companyName ?? "(no company name on file)",
      mcNumber: c.mcNumber,
      tier,
      tenderable: v?.allowed ?? false,
      blockedReasons: v?.blocked_reasons ?? [],
    };
  });

  const tierById = new Map(carriers.map((c) => [c.carrierId, c]));

  // Lanes come from routing guides, which is what a lane IS here: a shipper
  // saying "this origin, this destination, this equipment, these carriers".
  const guides = await prisma.routingGuide.findMany({
    where: {
      isActive: true,
      deletedAt: null,
      OR: [{ expirationDate: null }, { expirationDate: { gte: now } }],
    },
    select: {
      id: true,
      name: true,
      originState: true,
      destState: true,
      equipmentType: true,
      customer: { select: { name: true } },
      entries: {
        where: { isActive: true },
        select: { carrierId: true },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  const lanes: BenchLaneRow[] = guides.map((g) => {
    const laneTiers = zeroTiers();
    let benched = 0;
    let tenderable = 0;
    for (const e of g.entries) {
      const row = tierById.get(e.carrierId);
      if (!row) continue; // ranked, but not on the bench
      benched += 1;
      laneTiers[row.tier] += 1;
      if (row.tenderable) tenderable += 1;
    }
    return {
      guideId: g.id,
      name: g.name,
      originState: g.originState,
      destState: g.destState,
      equipmentType: g.equipmentType,
      customerName: g.customer?.name ?? null,
      benched,
      tenderable,
      tiers: laneTiers,
    };
  });

  const [
    sourcedThis, sourcedLast,
    approvedThis, approvedLast,
    signedThis, signedLast,
    lanesThis, lanesLast,
  ] = await Promise.all([
    prisma.carrierProfile.count({ where: { isTestAccount: false, createdAt: { gte: weekStart } } }),
    prisma.carrierProfile.count({ where: { isTestAccount: false, createdAt: { gte: lastWeekStart, lt: weekStart } } }),
    prisma.carrierProfile.count({ where: { isTestAccount: false, approvedAt: { gte: weekStart } } }),
    prisma.carrierProfile.count({ where: { isTestAccount: false, approvedAt: { gte: lastWeekStart, lt: weekStart } } }),
    prisma.carrierAgreement.count({ where: { templateName: "broker-carrier", status: "SIGNED", signedAt: { gte: weekStart } } }),
    prisma.carrierAgreement.count({ where: { templateName: "broker-carrier", status: "SIGNED", signedAt: { gte: lastWeekStart, lt: weekStart } } }),
    prisma.routingGuide.count({ where: { deletedAt: null, createdAt: { gte: weekStart } } }),
    prisma.routingGuide.count({ where: { deletedAt: null, createdAt: { gte: lastWeekStart, lt: weekStart } } }),
  ]);

  return {
    generatedAt: now.toISOString(),
    provisional: true,
    bench: {
      total: carriers.length,
      tenderable: carriers.filter((c) => c.tenderable).length,
      tiers,
      carriers,
    },
    lanes,
    weekly: {
      sourced: counter(sourcedThis, sourcedLast),
      approved: counter(approvedThis, approvedLast),
      signed: counter(signedThis, signedLast),
      lanesOpened: counter(lanesThis, lanesLast),
    },
  };
}
