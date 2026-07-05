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
    "By electronically signing this Agreement, Carrier agrees to the terms below, which govern every load Broker tenders to Carrier. Each individual shipment is further governed by the rate confirmation issued for that load, which incorporates this Agreement by reference.",
  ],
  sections: [
    {
      heading: "1. Authority & Compliance",
      clauses: [
        "Carrier holds and maintains active FMCSA operating authority and all required filings, and complies with all applicable FMCSA, DOT, and state regulations at all times. Carrier is solely responsible for driver qualification, hours of service, drug and alcohol testing, and equipment condition.",
      ],
    },
    {
      heading: "2. Insurance",
      clauses: [
        "Carrier maintains, at minimum, $1,000,000 auto liability, $100,000 cargo, and $1,000,000 general liability, naming Silk Route Logistics as certificate holder with 30 days’ written notice of cancellation. Coverage is continuous for the term of this Agreement.",
      ],
    },
    {
      heading: "3. Independent Contractor",
      clauses: [
        "Carrier is an independent contractor, not an agent, employee, partner, or joint venturer of Broker. Carrier controls the means and manner of transportation and furnishes its own equipment, drivers, fuel, and labor.",
      ],
    },
    {
      heading: "4. Load Acceptance & Transportation",
      clauses: [
        "Each load is governed by the rate confirmation issued for that load; acceptance of a rate confirmation forms a binding agreement for that shipment. Carrier shall not re-broker, co-broker, assign, interline, or subcontract any load without Broker’s prior written consent.",
      ],
    },
    {
      heading: "5. Documentation & Payment",
      clauses: [
        "Carrier submits a clean, signed bill of lading and proof of delivery to invoice. Broker pays Carrier per the rate confirmation and the Caravan Partner Program pay terms. Quick Pay is optional and governed by the separate Caravan Quick Pay Agreement.",
      ],
    },
    {
      heading: "6. Cargo Claims & Liability",
      clauses: [
        "Carrier assumes full Carmack Amendment liability (49 U.S.C. § 14706) for loss, damage, or delay to cargo from receipt through delivery. Broker is a licensed property broker, not a motor carrier, and assumes no carrier liability for the freight.",
      ],
    },
    {
      heading: "7. Performance & Compass Score",
      clauses: [
        "Broker measures on-time pickup and delivery, tracking compliance, claims ratio, communication, document timeliness, and acceptance through the published 7-factor Compass Score. Performance governs Caravan Partner Program tier advancement.",
      ],
    },
    {
      heading: "8. Confidentiality & Non-Solicitation",
      clauses: [
        "Carrier keeps Broker shipper identities, rates, and lane data confidential and will not solicit or back-solicit Broker’s customers for twelve (12) months after the last Broker load, with liquidated damages of fifteen percent (15%) of the gross revenue on any improperly solicited shipment.",
      ],
    },
    {
      heading: "9. Term & Termination",
      clauses: [
        "This Agreement is continuous until terminated by either party on written notice. Obligations that by their nature survive termination — confidentiality, non-solicitation, indemnity, accrued payment, and cargo liability — survive.",
      ],
    },
    {
      heading: "10. Governing Law & Dispute Resolution",
      clauses: [
        "This Agreement is governed by the laws of the State of Michigan and applicable federal transportation law. Disputes are resolved by binding arbitration in Kalamazoo County, Michigan.",
      ],
    },
    {
      heading: "11. Data Privacy & Consent",
      clauses: [
        "Carrier consents to Broker verifying its FMCSA authority, insurance, and safety record, and to receiving operational, tendering, and tracking communications related to its loads.",
      ],
    },
  ],
};

export function getAgreement(templateName: string): LegalAgreement | null {
  if (templateName === "broker-carrier" || templateName === "bca") return BROKER_CARRIER_AGREEMENT;
  return null;
}
