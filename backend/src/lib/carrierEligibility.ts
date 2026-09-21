/**
 * The gate the two chokepoints ask before they write.
 *
 * Carrier-archive recut B2b (2026-09-21). `createTender` is the single
 * LoadTender writer and `assignCarrier` the single Load.carrierId writer, and
 * until this commit NEITHER asked anything about the carrier — the gate was the
 * caller's or nobody's. Phase A (docs/audits/carrier-archive-b2-phaseA.md §1)
 * found five live paths on which it was nobody's: assign-match, fall-off-accept,
 * broadcast, the manual waterfall position add, and updateLoad's carrierId
 * branch. A tender or an assignment could reach an archived, unapproved or
 * otherwise blocked carrier by any of them while every gated path refused it.
 *
 * Putting the question INSIDE the chokepoints is what makes it un-skippable: a
 * sixth entry surface added tomorrow inherits the refusal without having to
 * remember it, and a caller that already asked (tenderController, loadBids,
 * acceptPosition) asks twice — 53 ms at the moment of one write, which is
 * cheap against a load on the wrong truck.
 *
 * ONE VERDICT, NOT A COPY. Both helpers call `complianceCheck` — the same
 * function the tender endpoint, the waterfall and the override modal read. A
 * parallel filter here would drift from the gate the moment either changed,
 * which is the §13.3 Item 234 lesson in miniature.
 *
 * THE ID-SPACE HAZARD is handled here, not left to the FK. Load.carrierId is a
 * User.id; LoadTender.carrierId is a CarrierProfile.id (see the header of
 * carrierAssignmentService). `assertEligibleByUserId` resolves the profile by
 * `userId` and refuses when there is none — which is exactly how a User with
 * no profile (an AE's id, a shipper's, a mistyped id) reaches Load.carrierId
 * today through updateLoad, and how instant-book's profile-id-as-user-id stays
 * dead: refused by name here rather than by an FK violation two writes later.
 */
import { prisma } from "../config/database";
import { complianceCheck, BlockedCode } from "../services/complianceMonitorService";

export type ComplianceVerdict = Awaited<ReturnType<typeof complianceCheck>>;

/**
 * Thrown by the chokepoints. `status` and `code` follow the SEQUENTIAL_TENDER_CONFLICT
 * convention in tenderCreationService so a route can surface it the same way; the
 * verdict rides along so the refusal can name its codes and its human exit.
 */
export class CarrierIneligibleError extends Error {
  readonly status = 403;
  readonly code = "CARRIER_INELIGIBLE";
  constructor(
    readonly carrierProfileId: string | null,
    readonly blocked_reasons: string[],
    readonly blocked_codes: BlockedCode[],
    readonly chokepoint: "createTender" | "assignCarrier",
  ) {
    super(
      blocked_reasons.length
        ? `Carrier is not eligible (${chokepoint}): ${blocked_reasons.join(" | ")}`
        : `Carrier is not eligible (${chokepoint}): no carrier profile for that id`,
    );
    this.name = "CarrierIneligibleError";
  }
  /** The body a route returns for this refusal. */
  toBody() {
    return {
      error: this.code,
      message: this.message,
      carrierProfileId: this.carrierProfileId,
      blocked_reasons: this.blocked_reasons,
      blocked_codes: this.blocked_codes,
    };
  }
}

/**
 * instanceof only. A duck-typed `code === "CARRIER_INELIGIBLE"` check would let
 * the type guard admit an object without toBody() and the verdict fields, and
 * a route that then called them would throw inside its own catch.
 */
export function isCarrierIneligible(err: unknown): err is CarrierIneligibleError {
  return err instanceof CarrierIneligibleError;
}

/** Refuse unless the CarrierProfile with this id passes the gate. Returns the verdict. */
export async function assertEligibleByProfileId(
  carrierProfileId: string,
  chokepoint: "createTender" | "assignCarrier",
): Promise<ComplianceVerdict> {
  const verdict = await complianceCheck(carrierProfileId);
  if (!verdict.allowed) {
    throw new CarrierIneligibleError(carrierProfileId, verdict.blocked_reasons, verdict.blocked_codes, chokepoint);
  }
  return verdict;
}

/**
 * Refuse unless the User with this id has a CarrierProfile that passes the gate.
 * Returns the profile id and the verdict. No profile is a refusal, not a pass:
 * the only writers that ever reached this path with a profile-less user were
 * the bypasses Phase A found.
 */
export async function assertEligibleByUserId(
  carrierUserId: string,
  chokepoint: "createTender" | "assignCarrier",
): Promise<{ carrierProfileId: string; verdict: ComplianceVerdict }> {
  const profile = await prisma.carrierProfile.findFirst({ where: { userId: carrierUserId }, select: { id: true } });
  if (!profile) throw new CarrierIneligibleError(null, [], [], chokepoint);
  const verdict = await assertEligibleByProfileId(profile.id, chokepoint);
  return { carrierProfileId: profile.id, verdict };
}
