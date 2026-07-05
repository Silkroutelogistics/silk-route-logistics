// v3.8.aqh — Canonical carrier-facing agreement content (backend source of
// truth). The Broker-Carrier Agreement PDF (agreementPdfService) renders from
// this, and the carrier portal fetches it (GET /carrier-auth/agreement/:type)
// so the review pane, the onboarding click-through, and the executed PDF can
// never disagree. Signing records consent against `version`; per CLAUDE.md §16
// the attorney-final (Foster Swift) body swaps in here + bumps the version with
// no code change.
//
// Mirrors frontend/src/lib/carrierAgreements.ts (BCA_ARTICLES / BCA_VERSION) —
// which will be repointed to fetch this via the endpoint to remove the drift.

export interface LegalSection {
  heading: string;
  clauses: string[];
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

export const BCA_VERSION = "2026-06-27-v1";
export const QP_VERSION = "2026-05-24-v1";

export const BROKER_CARRIER_AGREEMENT: LegalAgreement = {
  templateName: "broker-carrier",
  title: "Broker-Carrier Agreement",
  subtitle: "Master Agreement · Governs All Tendered Loads",
  version: BCA_VERSION,
  effectiveNote: `Version ${BCA_VERSION} · Effective on execution`,
  preamble: [
    "This Broker-Carrier Agreement (the “Agreement”) is made and entered into between Silk Route Logistics Inc., a Michigan corporation and FMCSA-licensed property broker (USDOT 4526880, MC# 1794414) (“Broker”), and the motor carrier identified in the signature block below (“Carrier”).",
    "By electronically signing or accepting this Agreement, Carrier agrees to the terms and conditions below, which govern every load Broker tenders to Carrier. Each individual shipment is further governed by the rate confirmation issued for that load, which incorporates this Agreement by reference.",
  ],
  sections: [
    {
      heading: "1. Authority & Compliance",
      clauses: [
        "Carrier shall maintain valid operating authority (MC/DOT) issued by the FMCSA at all times during the term of this Agreement.",
        "Carrier shall comply with all applicable federal, state, provincial, and local laws, including FMCSA regulations, DOT requirements, FMCSA safety regulations (49 CFR Parts 382-399), and applicable Canadian provincial/territorial regulations.",
        "Carrier shall maintain a “Satisfactory” or better safety rating with the FMCSA. If Carrier’s rating is downgraded to “Conditional” or “Unsatisfactory,” Carrier shall notify Broker within 24 hours.",
        "Carrier is solely responsible for driver qualification, hours of service, drug and alcohol testing, equipment condition, and a valid Safety Fitness Certificate for Canadian interprovincial operations where applicable.",
      ],
    },
    {
      heading: "2. Insurance Requirements",
      clauses: [
        "Carrier shall maintain at minimum: (a) Commercial Auto Liability — $1,000,000 per occurrence; (b) Motor Cargo/Freight Insurance — $100,000 per occurrence; (c) General Liability — $1,000,000 per occurrence; and (d) Workers’ Compensation as required by applicable law.",
        "Carrier shall name Silk Route Logistics Inc. as an additional insured and certificate holder on all policies.",
        "Carrier shall provide certificates of insurance prior to hauling any loads and updated certificates upon renewal or policy change.",
        "Carrier shall provide Broker with 30 days’ written notice prior to cancellation, non-renewal, or material modification of any insurance policy.",
      ],
    },
    {
      heading: "3. Independent Contractor Relationship",
      clauses: [
        "Carrier is an independent contractor and not an employee, agent, or partner of Broker. Nothing in this Agreement creates an employer-employee relationship.",
        "Carrier retains full control over drivers, equipment, routes, and methods of transportation, subject to shipper requirements, and furnishes its own equipment, drivers, fuel, and labor.",
        "Carrier is solely responsible for all taxes, including self-employment tax, income tax withholding, and unemployment insurance for its employees and drivers.",
      ],
    },
    {
      heading: "4. Load Acceptance & Transportation",
      clauses: [
        "Carrier has the right to accept or reject any load tendered by Broker. Once accepted, Carrier is obligated to complete the transportation as agreed, and each load is governed by the rate confirmation issued for that load.",
        "Carrier shall not double-broker, co-broker, re-broker, assign, interline, or subcontract any load to a third party without Broker’s prior written consent.",
        "Carrier shall provide accurate and timely updates on load status, location, and any delays or exceptions.",
        "Carrier shall comply with ELD mandates and tracking requirements while transporting loads arranged by Broker.",
      ],
    },
    {
      heading: "5. Documentation & Payment",
      clauses: [
        "Carrier shall submit all required documentation, including a clean signed Bill of Lading (BOL), Proof of Delivery (POD), and lumper receipts, within 24 hours of delivery.",
        "Standard payment terms and per-load Quick Pay options are as established in the Caravan Partner Program (published at silkroutelogistics.ai/carriers), from receipt of complete and accurate documentation unless otherwise agreed in writing.",
        "Optional per-load Quick Pay is available without requiring a factoring contract; published fees apply per the Caravan Partner Program and the separate Caravan Quick Pay Agreement.",
        "Carrier shall submit a completed W-9 form prior to receiving any payment. Rates shall be as agreed in each individual rate confirmation / load tender.",
      ],
    },
    {
      heading: "6. Cargo Claims & Liability",
      clauses: [
        "Carrier assumes full liability for loss, damage, or delay to cargo from the time of pickup to delivery, pursuant to the Carmack Amendment (49 U.S.C. § 14706) for domestic shipments. Broker is a licensed property broker, not a motor carrier, and assumes no carrier liability for the freight.",
        "Carrier shall notify Broker immediately upon discovery of any cargo loss, damage, shortage, or delay, and shall cooperate fully in the investigation and processing of all cargo claims.",
        "Carrier shall indemnify and hold Broker harmless from any claims, damages, or liabilities arising from Carrier’s performance or failure to perform under this Agreement.",
      ],
    },
    {
      heading: "7. Caravan Partner Program & Performance Tracking",
      clauses: [
        "Carrier acknowledges that Broker measures performance through the published 7-factor Compass Score, including on-time pickup and delivery, tracking compliance, claims ratio, communication, document timeliness, and acceptance rate.",
        "Carrier’s placement and advancement within the Caravan Partner Program are performance-based per the criteria, advancement thresholds, and program economics published at silkroutelogistics.ai/carriers, which Carrier acknowledges as the authoritative reference for program structure; thresholds are calibrated to current operating volume and may be revisited.",
        "Broker reserves the right to modify program criteria with 30 days’ notice.",
      ],
    },
    {
      heading: "8. Confidentiality & Non-Solicitation",
      clauses: [
        "Carrier shall not disclose Broker’s customer identities, rates, lane data, or business practices to any third party.",
        "Carrier shall not solicit or conduct business directly with any shipper or customer introduced through Broker for twelve (12) months after the last load transported, with liquidated damages of fifteen percent (15%) of the gross revenue on any improperly solicited shipment.",
      ],
    },
    {
      heading: "9. Term & Termination",
      clauses: [
        "This Agreement is continuous until terminated by either party on 30 days’ written notice. Broker may terminate immediately if Carrier’s operating authority is revoked, insurance lapses, or Carrier breaches any material term.",
        "Termination does not relieve Carrier of obligations for loads already in transit or payment obligations already incurred. Obligations that by their nature survive termination — confidentiality, non-solicitation, indemnity, accrued payment, and cargo liability — survive.",
      ],
    },
    {
      heading: "10. Governing Law & Dispute Resolution",
      clauses: [
        "This Agreement is governed by federal transportation law (49 U.S.C. § 14101(b)) and, to the extent not preempted, the laws of the State of Michigan.",
        "Any dispute arising under this Agreement shall first be subject to mediation. If mediation fails, disputes shall be resolved by binding arbitration with venue in Kalamazoo County, Michigan. The prevailing party shall be entitled to recover reasonable attorney’s fees and costs.",
      ],
    },
    {
      heading: "11. Data Privacy & Consent",
      clauses: [
        "Carrier consents to Broker collecting, storing, and processing Carrier’s business information, FMCSA data, insurance records, and performance data for operational purposes, handled in accordance with Broker’s Privacy Policy and applicable data protection laws.",
        "Carrier consents to automated FMCSA compliance monitoring, safety scoring, and OFAC screening, and to receiving operational, tendering, and tracking communications related to its loads.",
      ],
    },
  ],
};

export function getAgreement(templateName: string): LegalAgreement | null {
  if (templateName === "broker-carrier" || templateName === "bca") return BROKER_CARRIER_AGREEMENT;
  return null;
}
