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

  it("draws the clauses as a list, with bullets where registration showed them (v3.8.bma)", () => {
    // Two clauses in the fixture, one per section.
    const { unmount } = render(<AgreementBody agreement={AGREEMENT} carrierName="X LLC" size="comfortable" />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual([
      "BROKER may update this Schedule on thirty (30) days' written notice.",
      "1. Standard tier payment is free of charge.",
    ]);
    for (const list of screen.getAllByRole("list")) expect(list.className).toContain("list-disc");
    unmount();

    // Compact keeps the activation pane's look, and is still a list.
    render(<AgreementBody agreement={AGREEMENT} carrierName="X LLC" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    for (const list of screen.getAllByRole("list")) {
      expect(list.className).not.toContain("list-disc");
      // Safari drops a list's role when list-style is none, and jsdom does not
      // model that, so getByRole passes either way. The explicit attribute is
      // what keeps VoiceOver announcing it; hold the attribute itself.
      expect(list.getAttribute("role")).toBe("list");
    }
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
