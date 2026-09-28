/**
 * The agreement a carrier reads before signing says what the signed copy says
 * (2026-09-26): their name in the opening paragraph, and the tables.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { render, screen, within } from "@testing-library/react";
import { AgreementBody, type AgreementBodyContent } from "./AgreementBody";
import { CARRIER_PARTY_BLANK } from "@shared/constants/agreementParty";

const AGREEMENT: AgreementBodyContent = {
  preamble: ['THIS AGREEMENT is made by and between {{CARRIER}} ("CARRIER") and Silk Route Logistics Inc.'],
  sections: [
    {
      heading: "Schedule A · Caravan Partner Program: current tier terms",
      clauses: ["BROKER may update this Schedule on thirty (30) days' written notice."],
      table: {
        headers: ["Tier", "Standard payment terms"],
        rows: [["Silver", "Net-30"], ["Gold", "Net-21"]],
      },
    },
    { heading: "Notes to Schedule A", clauses: ["1. Standard tier payment is free of charge."] },
  ],
};

describe("AgreementBody", () => {
  it("names the carrier in the opening paragraph", () => {
    render(<AgreementBody agreement={AGREEMENT} carrierName="Blue Falcon Brokerage LLC" />);
    expect(screen.getByText(/by and between Blue Falcon Brokerage LLC \("CARRIER"\)/)).toBeTruthy();
    expect(screen.queryByText(/\{\{CARRIER\}\}/)).toBeNull();
  });

  it("prints the blank line when there is no name yet, never the placeholder", () => {
    render(<AgreementBody agreement={AGREEMENT} carrierName="   " />);
    const body = screen.getByTestId("agreement-body").textContent ?? "";
    expect(body).toContain(CARRIER_PARTY_BLANK);
    expect(body).not.toContain("{{CARRIER}}");
  });

  it("draws the tables the carrier is agreeing to", () => {
    render(<AgreementBody agreement={AGREEMENT} carrierName="X LLC" />);
    const table = screen.getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Tier" })).toBeTruthy();
    expect(within(table).getByText("Net-21")).toBeTruthy();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
  });

  it("draws the clauses as a list (v3.8.bma)", () => {
    // Two clauses in the fixture, one per section.
    render(<AgreementBody agreement={AGREEMENT} carrierName="X LLC" />);
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "BROKER may update this Schedule on thirty (30) days' written notice.",
      "1. Standard tier payment is free of charge.",
    ]);
    for (const list of screen.getAllByRole("list")) {
      expect(list.className).not.toContain("list-disc");
      // Safari drops a list's role when list-style is none, and jsdom does not
      // model that, so getByRole passes either way. The explicit attribute is
      // what keeps VoiceOver announcing it; hold the attribute itself.
      expect(list.getAttribute("role")).toBe("list");
    }
  });

  it("every pane that shows an agreement renders it through this component", () => {
    // Panes drawing their own clauses is how two of them came to drop the
    // tables and the name. One renderer keeps them showing the same words.
    const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf8");
    const activation = read("../../app/carrier/dashboard/activation/page.tsx");
    expect(activation).toContain("<AgreementBody agreement={bca} carrierName={data.carrier?.legalName} />");
    expect(activation).toContain("<AgreementBody agreement={qp} carrierName={data.carrier?.legalName} />");
    expect(activation).not.toMatch(/\.clauses\.map\(/);
  });

  it("the application does not show or accept the Broker-Carrier Agreement (ruled 2026-09-28)", () => {
    // The carrier accepts the BCA in ONE place: the formal signature in the
    // portal after approval and two-factor setup. The application used to carry
    // a click-through of the whole agreement too, so the same carrier accepted
    // it twice. The only agreement-adjacent question left there is the Quick Pay
    // pilot request.
    const onboarding = fs.readFileSync(path.resolve(__dirname, "../../app/onboarding/page.tsx"), "utf8");
    expect(onboarding).not.toContain("AgreementBody");
    expect(onboarding).not.toContain("/carrier-auth/agreement/");
    expect(onboarding).not.toContain("agreeTerms");
    expect(onboarding).not.toMatch(/I agree to the Broker-Carrier Agreement/);
    // vacuity: this is the application page, and it still asks the pilot question
    expect(onboarding).toContain("requestQuickPayPilot");
    expect(onboarding).toContain("Please consider me for the Quick Pay pilot");
  });
});
