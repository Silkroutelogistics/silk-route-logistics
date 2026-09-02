// v3.8.aqh — Canonical carrier-facing agreement content (backend source of
// truth). The agreement PDFs (agreementPdfService) render from this, and the
// carrier portal fetches it (GET /carrier-auth/agreement/:type) so the review
// pane, the onboarding click-through, and the executed PDF can never disagree.
// Signing records consent against `version`; per CLAUDE.md §16 the
// attorney-final (Foster Swift) body swaps in here + bumps the version with
// no code change.
//
// Two agreements live here and they are NOT peers:
//   BROKER_CARRIER_AGREEMENT    master — governs every tendered load
//   CARAVAN_QUICK_PAY_AGREEMENT supplement — governs one optional election,
//                               incorporates the BCA, BCA controls on conflict
// Counsel architecture (Dirk Beckwith / Foster Swift, confirmed 2026-06):
// covenants live in the BCA; other instruments reference it. Anything added to
// the QP that duplicates a BCA covenant is a future contradiction on paper a
// carrier has signed — reference it instead.
//
// THIS FILE IS THE ONLY COPY. The frontend mirrors it held — BCA_ARTICLES and
// BCA_VERSION in frontend/src/lib/carrierAgreements.ts (deleted v3.8.aqj), the
// QP_VERSION mirror there (deleted v3.8.asa), and the onboarding page's own
// hardcoded BCA_VERSION fallback (deleted v3.8.asb) — are all gone, and every
// surface fetches GET /carrier-auth/agreement/:type. The header sentence that
// stood here said this file "mirrors" that one and that it "will be repointed",
// both of which stopped being true a while before anyone read it again. Do not
// reintroduce a frontend copy of either the body or a version.

/**
 * A small two-or-more column table inside a clause body -- Schedule A's tier
 * payment terms are the first. Kept structured rather than flattened into
 * prose because these are the figures a carrier is agreeing to: turning
 * `| Silver | Net-30 |` into a sentence is a rewrite of a signed instrument,
 * and doing it silently is worse than not supporting tables at all.
 */
export interface LegalTable {
  headers: string[];
  rows: string[][];
}

export interface LegalSection {
  heading: string;
  clauses: string[];
  /** Drawn after the clauses, and covered by the content hash like everything else. */
  table?: LegalTable;
}

export interface LegalAgreement {
  templateName: string;
  title: string;
  subtitle: string;
  version: string;
  effectiveNote: string;
  preamble: string[];
  sections: LegalSection[];
}

// v3.8.asc — the paperwork deadline in §5 is interpolated from here.
// NOTE ON VERSIONS: BCA_VERSION is deliberately NOT bumped for that change. The
// interpolation renders byte-identically to the literal it replaced, so the text
// a carrier signs is unchanged; bumping would 409 every open tab and invalidate
// nothing meaningful. Bump when the WORDS change, not when their source does.
import { PAPERWORK_DUE_HOURS } from "../lib/accessorialPolicy";
import {
  BCA_F10_VERSION, BCA_F10_TITLE, BCA_F10_SUBTITLE, BCA_F10_EFFECTIVE_NOTE,
  BCA_F10_PREAMBLE, BCA_F10_SECTIONS,
} from "./brokerCarrierAgreement.generated";
import { BROKER_CARRIER_AGREEMENT_2026_06_27_V1 } from "./archive/brokerCarrierAgreement.2026-06-27-v1";

export const BCA_VERSION = BCA_F10_VERSION;

// v3.8.art — QP_VERSION bumped 2026-05-24-v1 → 2026-08-15-v1. The prior string
// was set when NO Quick Pay body existed anywhere in the repo: the activation
// screen showed a ~90-word summary ending "The full Caravan Quick Pay Agreement
// governs" and stamped a SIGNED CarrierAgreement row against a document neither
// party could produce. CARAVAN_QUICK_PAY_AGREEMENT below is that document's
// first actual content, so it gets a version reflecting that.
//
// v3.8.asa — bumped 2026-08-15-v1 → 2026-08-16-v1. Section 3 now states HOW an
// election is made (on the load's rate confirmation) rather than implying a
// per-load control in the portal that does not exist, and says plainly that
// enabling Quick Pay after a load has been hauled does not re-price it. The
// substance did not shrink; the mechanism is now described accurately.
//
// v3.8.asb — bumped 2026-08-16-v1 → 2026-08-16-v2. Two clauses promised more
// than the platform does, so they were narrowed to what it actually does:
//   §3  claimed the rate confirmation "states the Quick Pay speed elected and
//       the fee percentage applied". It does not. pdfService renders
//       fd.carrierPaymentTier and the tier's whole fee ladder; the elected
//       speed and Load.quickPayFeePercent are printed nowhere. Worse, the
//       manual RC path never sends carrierPaymentTier at all, so a load
//       carrying a real elected fee prints "QUICK PAY: Standard" over a panel
//       inviting the carrier to enrol. The clause now describes the recording
//       that does happen (on the load, at RC issuance), states the
//       three-condition gate that stops a silent fee, and points the carrier
//       at the settlement itemisation for verification — all of which are
//       code-true.
//       TO RESTORE THE STRONGER §3 WORDING, the rate confirmation must print
//       (a) the elected speed — Standard, 7-day or Same-day — and (b) the
//       applied fee percentage, i.e. Load.quickPayFeePercent, not the tier
//       ladder. That needs two things pdfService cannot do alone: the manual
//       RC path has to send carrierPaymentTier and quickPayFeePercent in
//       formData, and pdfService has to render them. Until both land, do not
//       re-assert that the rate confirmation states the election.
//   §4  said Carrier "may elect same-day Quick Pay at any tier, on any load",
//       implying a per-load carrier control. There is none — same-day is
//       recorded by Broker on the rate confirmation, the same defect class
//       v3.8.asa corrected in §3. Pricing is unchanged and still the locked
//       §8 ladder; only the mechanism is now described accurately.
//
// SINGLE SOURCE — the frontend mirror of this constant was DELETED in v3.8.asa.
// The activation pane fetches GET /carrier-auth/agreement/quick-pay, renders
// that body, and POSTs back the version served with it. v3.8.asb makes the
// backend REJECT a posted version that is not this constant (409) instead of
// stamping whatever the client sent, so a signature row can only ever name a
// body reproducible from this file. Do not reintroduce a frontend copy.
// v3.8.asb — bumped 2026-08-16-v2 → 2026-08-16-v3. §8 clause 1 contradicted
// §5 clause 4 inside the same signed document, on the same fact, with opposite
// money outcomes:
//   §5  "If documentation is incomplete or inaccurate, the timing clock has not
//        started... the load REMAINS ELIGIBLE for Quick Pay on the same terms."
//   §8  "A load is NOT ELIGIBLE for Quick Pay while documentation is incomplete
//        or inaccurate... Standard tier payment terms continue to apply."
// One says the carrier pays the fee and waits for the clock to start; the other
// says the carrier pays nothing and reverts to Net-30. A carrier reading their
// own agreement could not tell which. The billing path follows §5 — the fee is
// applied at delivery and the due date is stamped when the POD lands — so §8
// was the false half and was narrowed to match.
//
// The same clause also stated the open-claim and authority/insurance conditions
// as an AUTOMATIC state ("a load is not eligible"). Nothing checks either one:
// neither charge path queries PaymentDispute or runs complianceCheck. Stated as
// automatic, a carrier with an open claim could reasonably expect standard
// terms at no fee and be charged anyway. They are now stated as what they
// actually are — a right Broker may exercise, exercised through the §6 review
// and decline path, with the §6 outcome (standard terms, no fee) named. If
// either condition is ever enforced automatically, this clause can go back to
// stating it as a state.
//
// PILOT — bumped 2026-08-16-v3 → 2026-08-16-v4. Quick Pay is now a LIMITED
// PILOT: available by request, subject to Broker's approval, and withdrawable
// by Broker on notice. Ratified 2026-08-16 (CLAUDE.md §21).
//
// The document had to move because the mechanism moved. Pre-pilot, a carrier
// turned Quick Pay on themselves — POST /quickpay-election flipped
// quickPayEnabled in one call — and §3 said so twice ("Carrier may enable or
// disable Quick Pay on Carrier's account at any time through the carrier
// portal"). Under the pilot the carrier REQUESTS and Broker approves or
// declines, so leaving that sentence would have described a control the
// carrier no longer has, on the same surface the last three bumps existed to
// stop describing controls that do not exist.
//
// WHAT CHANGED — availability only:
//   preamble  a third paragraph, first thing a reader meets: limited pilot,
//             by request, subject to approval, withdrawable on notice, and
//             standard tier terms are unaffected and always free.
//   §3 cl.1   admission stated: request → Broker approves or declines →
//             per-load election. Replaces "enabling Quick Pay on Carrier's
//             account", which is no longer a thing the carrier does.
//   §3 cl.2   NEW. A declined request is not a default, carries no penalty,
//             and does not touch tier, Compass Score, or load eligibility.
//             Mirrors the §6 language for a declined per-load request so the
//             two decline paths cannot be read as different in consequence.
//   §3 cl.8   "may enable or disable" → may stop at any time; re-admission
//             needs a new request. The stop half was true and stayed.
//   §10 cl.2  NEW. Broker may withdraw Carrier from the pilot, or end the
//             pilot, on notice. Loads already funded are untouched and loads
//             not yet funded revert to standard terms at no fee.
//
// WHAT DID NOT CHANGE — economics. §4 fee schedule (3/2/1 by tier, +2%
// universal same-day premium), §5 documentation trigger and payment timing,
// §6 approval limits ($2,000/$4,000/$6,000 per load; $15,000/$40,000/$80,000
// per month), §7 fee application, §8 and §9 are byte-identical. A pilot
// changes who can get in, never what it costs. Do not weaken them here on the
// theory that a pilot is provisional.
//
// TWO DECLINE PATHS, DELIBERATELY DISTINCT. §3 cl.2 is admission to the pilot
// (Broker declines the carrier). §6 cl.3 is a single load over an approval
// ceiling (Broker declines that load). Both end at standard tier terms at no
// fee. Keep them separate — collapsing them loses the fact that a carrier in
// the pilot can still have one load declined.
//
// SIGNATURES ALREADY TAKEN AGAINST v3 REMAIN VALID AND KEEP PAYING. Every
// gate that can deduct a fee looks for a SIGNED quick-pay CarrierAgreement
// WITHOUT filtering on version (carrierPayments.ts, integrationService,
// accountingController), so a carrier who signed v3 is not un-signed by this
// bump and no funded load re-prices. The 409 guard on /quickpay-election
// compares the POSTED version to this constant, so a stale open tab is
// rejected rather than stamped — which is the intended behaviour and the
// reason the constant is the only version anywhere.
export const QP_VERSION = "2026-08-16-v4";

// v3.8.ayn — the body is the Foundation Edition, generated from
// docs/legal/bca-content-F10.md. It is composed here rather than pasted so
// there is exactly one copy of the text: the generated module is the only
// place it lives, and a parity test fails if that module stops matching the
// markdown it came from.
//
// The previous body is NOT gone. Two carriers executed it, so it is archived
// at archive/brokerCarrierAgreement.2026-06-27-v1.ts and still resolves
// through getAgreement("broker-carrier", "2026-06-27-v1") -- see v3.8.aym.
export const BROKER_CARRIER_AGREEMENT: LegalAgreement = {
  templateName: "broker-carrier",
  title: BCA_F10_TITLE,
  subtitle: BCA_F10_SUBTITLE,
  version: BCA_VERSION,
  effectiveNote: BCA_F10_EFFECTIVE_NOTE,
  preamble: BCA_F10_PREAMBLE,
  sections: BCA_F10_SECTIONS,
};

// v3.8.art — Caravan Quick Pay Agreement.
//
// SUPPLEMENT, NOT A SECOND MASTER AGREEMENT. The BCA is the foundation and
// controls on conflict. This document deliberately does NOT restate BCA
// covenants (insurance minimums, Carmack allocation, re-brokering prohibition,
// non-solicitation, governing law) — Section 1 incorporates them by reference
// instead. A restatement is how the two instruments drift into contradiction,
// which is the exact defect class this document exists to avoid.
//
// It covers only what the BCA does not: what Quick Pay is and is not, that the
// election is per-load and optional, the fee ladder, how the fee is applied,
// the documentation trigger, approval limits, and what happens on a rejected or
// disputed invoice.
//
// PENDING MICHIGAN COMMERCIAL-ATTORNEY REVIEW (CLAUDE.md §16 first-carrier
// blocker #2, Foster Swift / Dirk Beckwith). This is the operative body a
// carrier signs today — it is NOT attorney-final. Per the file-header swap-in
// pattern, replace the body here and bump QP_VERSION when counsel returns; the
// signing mechanism records consent against whatever version is current, no
// code change needed. The pending status is deliberately recorded HERE and in
// the version string, NOT as a disclaimer inside the carrier-facing clause
// text — a document that disclaims its own effect is worse than none.
//
// Every economic figure below is the LOCKED CLAUDE.md §8 ladder and matches
// caravanService TIER_CONFIG (quickPayFee7Day / quickPayFeeSameDay /
// quickPayAutoLimit / quickPayMonthlyLimit). Do not derive or round.
//
// WHAT THE BILLING PATH ACTUALLY DOES (v3.8.asa). These clauses are promises
// about money, so each one has a counterpart in code. If you change a clause,
// change its counterpart in the same commit, and vice versa:
//   §3 pilot admission     → QuickPayEnrollment. The row IS the standing:
//                            PENDING on request, APPROVED / DECLINED on the
//                            AE decision, WITHDRAWN when either side stops it.
//                            CarrierProfile.quickPayEnabled is a denormalised
//                            mirror of "has an APPROVED enrolment", written
//                            only in the same transaction as a transition, and
//                            it stays the read-gate every charge path already
//                            checks. Do not write the flag from anywhere else,
//                            or the mirror and the lifecycle drift and the
//                            money path follows the wrong one.
//   §3 per-load election   → integrationService.createCarrierPayOnDelivery
//                            prices from Load.quickPayFeePercent, frozen when
//                            the rate confirmation was issued. The account
//                            flag gates future elections and the withdrawal
//                            right; it cannot re-price a hauled load.
//   §4 fee by tier         → lib/quickPayPricing. THE one fee resolver. It
//                            previously pointed at quickPaySafetyService, which
//                            had zero importers, so the map named dead code
//                            while a live retired-tier table (PARTNER at 1.5%)
//                            went on charging carriers. quickPaySafetyService
//                            has been deleted. CarrierProfile.quickPayFeeRate
//                            is NOT a fee resolver.
//   §4 same-day at 5/4/3   → integrationService.resolveQuickPaySpeed
//   §4 lumper carve-out    → integrationService.sumAtCostReimbursements,
//                            applied on both charge paths (delivery pricing and
//                            the carrier's own Quick Pay request)
//   §5 documentation       → integrationService.documentationReceivedAt gates
//      trigger               the clock; a settlement created before the POD
//                            arrives carries no due date until
//                            onPODUploaded stamps it. §5 governs documentation
//                            timing ALONE — §8 used to contradict it on the
//                            same fact and was narrowed in v3.8.asb.
//   §8 ineligibility       → NOT ENFORCED, and the clause says so. Neither
//                            charge path queries PaymentDispute for an open
//                            claim or runs complianceCheck for authority and
//                            insurance standing. §8 states these as a right
//                            Broker may exercise through the §6 review, not as
//                            an automatic state, because automatic is what the
//                            code does not do. Enforcing them means a claim
//                            check and a compliance check on all three charge
//                            paths; do that BEFORE restating them as automatic.
//   §5 same/next bus. day  → integrationService.sameDayQuickPayDueDate,
//                            using the §6 published hours (Mon-Fri 7-19 ET)
//   §6 auto-approve        → lib/quickPayPricing.quickPayAutoApprovePerLoad and
//      ceilings              .quickPayMonthlyLimit. §6 says a request over
//                            EITHER ceiling "is not refused", so both ceilings
//                            queue an ApprovalQueue review on both paths
//                            (integrationService.createCarrierPayOnDelivery and
//                            routes/carrierPayments). The monthly ceiling used
//                            to 422 at the carrier's request site, which was a
//                            refusal on a clause that says requests are not
//                            refused, and disagreed with the delivery path.
//   §3 three-condition     → EVERY path that can deduct a Quick Pay fee checks
//   gate (never charge       all three: a fee recorded on the load, a SIGNED
//   under an unsigned        quick-pay CarrierAgreement, and quickPayEnabled.
//   instrument)              Three paths can charge —
//                              integrationService.createCarrierPayOnDelivery
//                              routes/carrierPayments (carrier's own request)
//                              accountingController.resolveElectedQuickPayFee
//                                (AE prepare / edit a settlement)
//                            The third was gateless until v3.8.asb: it derived
//                            a fee from a request-supplied PaymentTier string,
//                            so editing a settlement's tier label deducted a
//                            fee from a carrier who had signed nothing. If a
//                            FOURTH charge path is ever added, it checks the
//                            same three conditions or the clause becomes false
//                            again.
export const CARAVAN_QUICK_PAY_AGREEMENT: LegalAgreement = {
  templateName: "quick-pay",
  title: "Caravan Quick Pay Agreement",
  // The pilot belongs in the subtitle because the subtitle is the second line
  // of the PDF and of the portal review pane — a reader meets it before any
  // clause. Availability is the first thing that has to be true.
  subtitle: "Supplement to the Broker-Carrier Agreement · Limited Pilot, By Request · Optional Per-Load Election",
  version: QP_VERSION,
  effectiveNote: `Version ${QP_VERSION} · Effective on execution`,
  preamble: [
    "This Caravan Quick Pay Agreement (the “Quick Pay Agreement”) is made and entered into between Silk Route Logistics Inc., a Michigan corporation and FMCSA-licensed property broker (USDOT 4526880, MC# 1794414) (“Broker”), and the motor carrier identified in the signature block below (“Carrier”).",
    "This Quick Pay Agreement supplements, and does not replace, the Broker-Carrier Agreement between the parties (the “Broker-Carrier Agreement”). It governs one thing: Carrier’s optional election to be paid earlier than Carrier’s standard tier payment terms on a load Broker has tendered. Carrier is never required to elect Quick Pay, and declining it has no effect on Carrier’s eligibility to haul, on load tendering, or on Carrier’s standing in the Caravan Partner Program.",
    "Quick Pay is currently offered as a limited pilot. Carrier requests it, Broker approves or declines the request, and Broker may withdraw Carrier from the pilot, or end the pilot, on notice to Carrier. Signing this Quick Pay Agreement is a request to join the pilot; it does not by itself admit Carrier to it. Carrier’s standard tier payment terms are unaffected by any of this and are always available at no fee: Net-30 at Silver, Net-21 at Gold, Net-14 at Platinum. The fee schedule in Section 4 and the approval limits in Section 6 apply to Carrier on the same published terms as every other participant for as long as Carrier is in the pilot.",
  ],
  sections: [
    {
      heading: "1. Relationship to the Broker-Carrier Agreement",
      clauses: [
        "The Broker-Carrier Agreement is incorporated into this Quick Pay Agreement by reference in its entirety and remains in full force. This Quick Pay Agreement adds an optional payment-timing election and changes nothing else.",
        "In the event of any conflict or inconsistency between this Quick Pay Agreement and the Broker-Carrier Agreement, the Broker-Carrier Agreement controls.",
        "Sections 1 (Authority & Compliance), 2 (Insurance Requirements), 4 (Load Acceptance & Transportation, including the prohibition on double-brokering, re-brokering, and assignment), 6 (Cargo Claims & Liability, including the allocation of Carmack liability to Carrier), 8 (Confidentiality & Non-Solicitation), 10 (Governing Law & Dispute Resolution), and 11 (Data Privacy & Consent) of the Broker-Carrier Agreement apply to this Quick Pay Agreement without modification and are not restated here.",
        "Each individual load remains governed by the rate confirmation issued for that load, which incorporates the Broker-Carrier Agreement by reference.",
      ],
    },
    {
      heading: "2. What Quick Pay Is, and What It Is Not",
      clauses: [
        "Quick Pay is an accelerated payment option. When Carrier elects it on a load, Broker pays Carrier for that load sooner than Carrier’s standard tier payment terms would require, and Carrier accepts a fee for the earlier payment.",
        "Quick Pay is a payment-timing election only. It is not a purchase of receivables, not a sale or assignment of any account, not factoring, and not a loan or advance secured by Carrier’s accounts. Broker does not acquire, and Carrier does not assign, transfer, or encumber, any account, receivable, or payment right by reason of a Quick Pay election.",
        "No factoring contract, notice of assignment, or third-party funding relationship is required to use Quick Pay. Carrier may use Quick Pay whether or not Carrier factors any other receivables, subject to Section 8 below.",
        "Quick Pay does not change what Broker owes Carrier for the load. It changes only when that amount is paid and applies the fee stated in Section 4.",
      ],
    },
    {
      heading: "3. Admission to the Pilot, and Election Per Load",
      clauses: [
        "Admission to the Quick Pay pilot comes first, and it comes by request. Carrier requests Quick Pay, Broker approves or declines the request, and Broker notifies Carrier of the decision. Approval makes the option available to Carrier; it does not apply Quick Pay to every load automatically. Quick Pay is then elected on a per-load basis.",
        "If Broker declines Carrier’s request to join the pilot, Carrier is paid on Carrier’s standard tier payment terms at no fee, exactly as before the request. A declined request is not a default, carries no penalty, does not affect Carrier’s tier, Compass Score, or load eligibility, and does not prevent Carrier from requesting again later.",
        "The Quick Pay speed for a load, and the fee percentage that goes with it, are recorded on that load when Broker issues the rate confirmation for it. The percentage recorded at that moment is the fee for that load and does not change afterward.",
        "Broker will not deduct a Quick Pay fee on a load unless all three of the following are true: a Quick Pay fee is recorded on that load, this Quick Pay Agreement is signed, and Quick Pay is enabled on Carrier’s account. If any one of them is not true, the load is paid on Carrier’s standard tier payment terms at no fee.",
        "The fee that applies is the published percentage in Section 4 for Carrier’s tier and the speed recorded, so the amount is determinable from Section 4 before the load is hauled. The settlement for the load itemizes the percentage applied and the dollar amount deducted, as stated in Section 7, so Carrier can verify the fee charged against Section 4. Carrier may ask Broker at any time which Quick Pay speed, if any, is recorded on a load, and Broker will state it.",
        "If Carrier does not elect Quick Pay on a load, that load is paid on Carrier’s standard tier payment terms at no fee: Net-30 at Silver, Net-21 at Gold, Net-14 at Platinum, in each case running from the trigger stated in Section 5.",
        "Carrier may stop using Quick Pay at any time through the carrier portal, without cause and without notice. Stopping does not affect loads already funded under Quick Pay and does not affect Carrier’s tier, Compass Score, or load eligibility. Carrier cannot switch Quick Pay back on unilaterally while it remains a pilot; re-admission takes a new request under the first clause of this Section.",
        "An election is irrevocable for the load once Broker has funded that load under Quick Pay. Carrier withdraws an election by stopping Quick Pay in the carrier portal, which withdraws it on every load Broker has not yet funded; each of those loads then reverts to standard tier terms at no fee.",
        "Enabling Quick Pay after a load has been hauled does not apply Quick Pay to that load, and does not change what Broker owes on it. A load is priced by the Quick Pay speed recorded on that load when its rate confirmation was issued, and by nothing else.",
      ],
    },
    {
      heading: "4. Quick Pay Fee Schedule",
      clauses: [
        "Silver tier: standard pay is Net-30 at no fee. The 7-day Quick Pay fee is three percent (3%) of the load payment. The same-day Quick Pay fee is five percent (5%).",
        "Gold tier: standard pay is Net-21 at no fee. The 7-day Quick Pay fee is two percent (2%) of the load payment. The same-day Quick Pay fee is four percent (4%).",
        "Platinum tier: standard pay is Net-14 at no fee. The 7-day Quick Pay fee is one percent (1%) of the load payment. The same-day Quick Pay fee is three percent (3%).",
        "Same-day Quick Pay is a universal premium of two percent (2%) added to Carrier’s 7-day tier fee. It is available at every tier and on any load, and is not restricted by tier or by Carrier’s standing in the Caravan Partner Program. Carrier requests same-day Quick Pay by contacting Broker at operations@silkroutelogistics.ai; like every Quick Pay speed, it is recorded on the load when Broker issues the rate confirmation for that load.",
        "The applicable fee is determined by Carrier’s Caravan Partner Program tier as of the date the Quick Pay speed is recorded on the load, which is when Broker issues the rate confirmation for it. A later tier advancement applies to loads recorded after the advancement; it does not retroactively re-price a load already recorded or funded.",
        "The fee is calculated on the gross amount payable to Carrier for that load as stated in the rate confirmation, including line haul, fuel surcharge, and approved accessorials. Reimbursements advanced by Carrier and repaid at cost against an original receipt, including lumper fees, are paid in full and are not subject to the Quick Pay fee.",
      ],
    },
    {
      heading: "5. Documentation Trigger and Payment Timing",
      clauses: [
        "All Quick Pay timing runs from Broker’s receipt of complete and accurate documentation for the load, the same trigger stated in Section 5 of the Broker-Carrier Agreement. Documentation is complete when Broker has received the items required by that section, including a clean signed Bill of Lading, Proof of Delivery, and any lumper or accessorial receipts.",
        "7-day Quick Pay is paid within seven (7) calendar days of that trigger.",
        "Same-day Quick Pay is paid on the same business day when complete and accurate documentation is received during Broker’s published business hours, and on the next business day when it is received outside them.",
        "If documentation is incomplete or inaccurate, the timing clock has not started. Broker will identify what is missing. The clock starts when the deficiency is cured, and the load remains eligible for Quick Pay on the same terms.",
      ],
    },
    {
      heading: "6. Approval Limits",
      clauses: [
        "Quick Pay is auto-approved up to a per-load amount and a rolling calendar-month total by tier: Silver, two thousand dollars ($2,000) per load and fifteen thousand dollars ($15,000) per month; Gold, four thousand dollars ($4,000) per load and forty thousand dollars ($40,000) per month; Platinum, six thousand dollars ($6,000) per load and eighty thousand dollars ($80,000) per month.",
        "A request above either limit is not refused. It is routed to Broker for manual review, and Broker will approve or decline it and notify Carrier.",
        "If Broker declines a Quick Pay request for any reason, the load is paid on Carrier’s standard tier terms at no fee. A declined request is not a default, carries no penalty, and does not affect Carrier’s tier or Compass Score.",
        "Broker may adjust these limits on thirty (30) days’ written notice. An adjustment applies to loads elected after the notice period and does not affect loads already elected or funded.",
      ],
    },
    {
      heading: "7. How the Fee Is Applied",
      clauses: [
        "The Quick Pay fee is deducted from the payment for that load. Carrier receives the net amount. Broker does not invoice the fee separately and does not carry it forward as a balance owed.",
        "The settlement or remittance for each Quick Pay load itemizes the gross amount payable, the Quick Pay fee percentage and dollar amount, and the net amount paid, so the deduction is verifiable on its face.",
        "The fee is earned by Broker when the load is funded under Quick Pay.",
      ],
    },
    {
      heading: "8. Rejected, Disputed, and Adjusted Invoices",
      clauses: [
        "Broker may decline to fund a load under Quick Pay while a cargo claim, shortage, overage, or damage exception is open on that load, or while Carrier’s operating authority or insurance is not in good standing under Sections 1 and 2 of the Broker-Carrier Agreement. A load Broker declines to fund is paid on Carrier’s standard tier payment terms at no fee, as stated in Section 6. Incomplete or inaccurate documentation does not make a load ineligible; it holds the timing clock under Section 5, and the load remains eligible for Quick Pay on the same terms once the deficiency is cured.",
        "Payment under Quick Pay is not a waiver of Broker’s right to audit the load, to verify documentation, or to assert a claim, deduction, or set-off that arises or is discovered after funding.",
        "If a load is later short-paid, disputed, adjusted, or reversed by the customer, that alone does not unwind a Quick Pay payment already made to Carrier. Any amount Carrier owes Broker as a result is handled under Section 9.",
        "If Carrier has assigned, or later assigns, the receivable for a load to a factor or other third party, that load is not eligible for Quick Pay. Carrier shall notify Broker before electing Quick Pay on any load subject to an existing notice of assignment.",
      ],
    },
    {
      heading: "9. Set-Off and Recoupment",
      clauses: [
        "Broker may set off and recoup against amounts otherwise payable to Carrier, including amounts payable on other or future loads, any of the following: cargo loss, damage, or shortage claims for which Carrier is liable under Section 6 of the Broker-Carrier Agreement; customer chargebacks attributable to Carrier’s performance; overpayments, duplicate payments, and payments made in error; advances and reimbursements not supported by an original receipt; and fines, penalties, or third-party costs Broker incurs as a result of Carrier’s acts or omissions.",
        "Broker will notify Carrier in writing of any set-off, identifying the load, the amount, and the basis for it.",
        "This right of set-off is in addition to, and does not limit, any other remedy available to Broker under the Broker-Carrier Agreement or at law.",
      ],
    },
    {
      heading: "10. Term and Termination",
      clauses: [
        "This Quick Pay Agreement takes effect on execution and continues until terminated.",
        "Either party may stop offering or electing Quick Pay at any time, effective prospectively, by written notice or by stopping Quick Pay in the carrier portal. No cause or notice period is required.",
        "Quick Pay is a limited pilot. Broker may withdraw Carrier from the pilot, or end the pilot entirely, on notice to Carrier. Withdrawal is effective prospectively: it does not affect any load Broker has already funded under Quick Pay, and it does not change what Broker owes on any load. Loads Broker has not yet funded revert to Carrier’s standard tier payment terms at no fee. Withdrawal from the pilot is not a default by Carrier, carries no penalty, and does not affect Carrier’s tier, Compass Score, load eligibility, or the Broker-Carrier Agreement.",
        "Termination of this Quick Pay Agreement does not affect loads already funded under Quick Pay, does not affect Broker’s obligation to pay for loads on standard tier terms, and does not terminate the Broker-Carrier Agreement.",
        "This Quick Pay Agreement terminates automatically if the Broker-Carrier Agreement terminates. Sections 8 and 9 survive termination as to any load funded under Quick Pay.",
      ],
    },
  ],
};

/**
 * Superseded bodies, kept because signatures were taken against them.
 *
 * Only one CURRENT body per agreement lives in the code. Replacing one without
 * archiving it leaves every stored contentHash taken against the outgoing text
 * un-recomputable -- the executed PDF survives, but the ability to demonstrate
 * that the hash corresponds to what was signed does not. Archiving is cheap
 * before a swap and impossible after.
 *
 * Keyed by the version string stored on the CarrierAgreement row.
 */
const ARCHIVED: Record<string, Record<string, LegalAgreement>> = {
  "broker-carrier": {
    "2026-06-27-v1": BROKER_CARRIER_AGREEMENT_2026_06_27_V1,
  },
};

/**
 * Resolve an agreement body. With no version, the CURRENT body -- which is what
 * every signing path wants. With a version, the body as it stood at that
 * version, so a stored hash can be re-derived years later.
 *
 * An unknown version falls back to the current body rather than returning null:
 * callers that pass a version are asking "resolve this if you can", and every
 * pre-archive row carries a version no archive entry will ever exist for.
 */
export function getAgreement(templateName: string, version?: string): LegalAgreement | null {
  if (templateName === "broker-carrier" || templateName === "bca") {
    if (version) {
      const archived = ARCHIVED["broker-carrier"]?.[version];
      if (archived) return archived;
    }
    return BROKER_CARRIER_AGREEMENT;
  }
  // Aliases mirror the CarrierAgreement.templateName written by the
  // /quickpay-election signing path ("quick-pay") plus the shorthands the
  // portal and support tooling use.
  if (templateName === "quick-pay" || templateName === "quickpay" || templateName === "qp") {
    return CARAVAN_QUICK_PAY_AGREEMENT;
  }
  return null;
}
