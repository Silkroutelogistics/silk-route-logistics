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

  it("every pane that shows an agreement renders it through this component", () => {
    // Three panes drawing their own clauses is how two of them came to drop the
    // tables and the name. One renderer keeps them showing the same words.
    const read = (p: string) => fs.readFileSync(path.resolve(__dirname, p), "utf8");
    const activation = read("../../app/carrier/dashboard/activation/page.tsx");
    expect(activation).toContain("<AgreementBody agreement={bca} carrierName={data.carrier?.legalName} />");
    expect(activation).toContain("<AgreementBody agreement={qp} carrierName={data.carrier?.legalName} />");
    const onboarding = read("../../app/onboarding/page.tsx");
    expect(onboarding).toContain('<AgreementBody agreement={bcaContent} carrierName={form.company} size="comfortable" />');
    // And none of them walks the clauses itself any more.
    for (const src of [activation, onboarding]) {
      expect(src).not.toMatch(/\.clauses\.map\(/);
    }
  });
});
