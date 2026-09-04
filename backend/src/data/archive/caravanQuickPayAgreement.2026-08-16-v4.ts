// ARCHIVED AGREEMENT BODY -- DO NOT EDIT.
//
// The Caravan Quick Pay Agreement exactly as it stood at version 2026-08-16-v4.
//
// WHY IT IS KEPT. One carrier executed this text -- AEROSWIFT LLC (MC-1692309)
// on 2026-09-01, signed by Stu Cook, President -- and that row stores a
// contentHash computed over it. Only one body per agreement lives in the
// running code, so replacing it with v5 would have left that hash
// un-recomputable: you could no longer demonstrate that the stored hash
// corresponds to the text they signed. The executed PDF survives regardless;
// what this preserves is the ability to re-derive the evidence.
//
// It is NOT a test account. Verified read-only against production before the
// swap: isTestAccount false, contentHash present, documentUrl present.
//
// Version and effectiveNote are LITERALS here, deliberately. They must not
// follow QP_VERSION when it moves -- following it would change the hash and
// defeat the only reason this file exists.
//
// Resolvable via getAgreement("quick-pay", "2026-08-16-v4").
// Guarded by __tests__/unit/data/agreementArchive.test.ts, which re-derives
// AEROSWIFT's stored hash from THIS body.
import type { LegalAgreement } from "../agreements";

export const CARAVAN_QUICK_PAY_AGREEMENT_2026_08_16_V4: LegalAgreement = {
  templateName: "quick-pay",
  title: "Caravan Quick Pay Agreement",
  // The pilot belongs in the subtitle because the subtitle is the second line
  // of the PDF and of the portal review pane — a reader meets it before any
  // clause. Availability is the first thing that has to be true.
  subtitle: "Supplement to the Broker-Carrier Agreement · Limited Pilot, By Request · Optional Per-Load Election",
  version: "2026-08-16-v4",
  effectiveNote: "Version 2026-08-16-v4 · Effective on execution",
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
