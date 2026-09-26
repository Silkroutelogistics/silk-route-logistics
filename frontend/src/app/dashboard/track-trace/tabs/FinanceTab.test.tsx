/**
 * v3.8.bki — the Finance tab on a load that stopped. Renders the real
 * component: the question is what an AE reads in the cards, not what the
 * source says.
 *
 * Fixtures are the Beekeepers shapes: SRL-121492, a TONU at the shipper's fault
 * whose ledger row was agreed at $250 on both sides; SRL-121496, a TONU raised
 * at $200; and SRL-121491, cancelled. Each carries the rate confirmation's
 * linehaul and fuel, which is exactly what the old tab billed.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }));

import { FinanceTab } from "./FinanceTab";

const base = {
  customerRate: 2550,
  carrierRate: 1950,
  fuelSurcharge: 180,
  totalCarrierPay: 2130,
  distance: 950,
  customerInvoiced: false,
  carrierSettled: false,
  podVerified: false,
  loadAccessorials: [] as any[],
};

const tonuRow = (amount: number, billedTo: string) => ({
  id: `acc-${amount}-${billedTo}`, type: "TONU", amount, status: "APPROVED", billedTo, createdBy: null,
});

/** The figure on a summary card, read from the card itself. */
function card(label: string): string {
  const el = screen.getByText(label);
  return el.parentElement?.querySelector("div:nth-child(2)")?.textContent ?? "";
}

describe("T&T FinanceTab — a load that stopped does not earn its linehaul", () => {
  it("a CANCELLED load bills and pays nothing, and says why", () => {
    render(<FinanceTab load={{ ...base, status: "CANCELLED" }} loadId={null} />);
    expect(card("Customer billed")).toBe("$0.00");
    expect(card("Carrier gross")).toBe("$0.00");
    expect(screen.getByText(/this load was cancelled/i)).toBeTruthy();
    expect(screen.getByText(/rate confirmation total of \$2,130\.00 no longer applies/i)).toBeTruthy();
    // "Pending" promised an invoice the cancellation voided.
    expect(screen.getByText("Not billed")).toBeTruthy();
    expect(screen.getByText("Not paid")).toBeTruthy();
  });

  it("does not raise a settlement-divergence alarm against a voided settlement", () => {
    // The RC total must DIFFER from linehaul + fuel ($2,130) or the old tab
    // raised no alarm either and this passes for the wrong reason: a $70
    // accessorial on the RC makes it $2,200.
    render(<FinanceTab load={{ ...base, status: "CANCELLED", totalCarrierPay: 2200 }} loadId={null} />);
    expect(screen.queryByText(/one of the two is wrong/i)).toBeNull();
    expect(screen.getByText(/rate confirmation total of \$2,200\.00 no longer applies/i)).toBeTruthy();
  });

  it("an approved accessorial on a CANCELLED load is not counted as billed", () => {
    render(
      <FinanceTab
        load={{ ...base, status: "CANCELLED", loadAccessorials: [tonuRow(150, "SHIPPER")] }}
        loadId={null}
      />,
    );
    expect(card("Customer billed")).toBe("$0.00");
    expect(screen.getByText(/not raised on a cancelled load/i)).toBeTruthy();
  });

  it("a shipper-fault TONU bills and pays only the TONU charge (SRL-121492 at $250)", () => {
    render(
      <FinanceTab
        load={{ ...base, status: "TONU", tonuFaultSide: "CUSTOMER", loadAccessorials: [tonuRow(250, "SHIPPER")] }}
        loadId={null}
      />,
    );
    expect(card("Customer billed")).toBe("$250.00");
    expect(card("Carrier gross")).toBe("$250.00");
    expect(card("Margin")).toBe("$0.00");
    expect(screen.getAllByText("not billed").length).toBe(2); // linehaul, fuel
    expect(screen.getAllByText("not paid").length).toBe(2);
    expect(screen.getByText(/truck ordered, not used/i)).toBeTruthy();
  });

  it("a broker-fault TONU pays the carrier out of margin and bills the customer nothing", () => {
    render(
      <FinanceTab
        load={{ ...base, status: "TONU", tonuFaultSide: "BROKER", loadAccessorials: [tonuRow(200, "BROKER")] }}
        loadId={null}
      />,
    );
    expect(card("Customer billed")).toBe("$0.00");
    expect(card("Carrier gross")).toBe("$200.00");
    expect(card("Margin")).toBe("-$200.00");
  });

  it("a delivered load is unchanged: linehaul and fuel on both sides (control)", () => {
    render(<FinanceTab load={{ ...base, status: "DELIVERED" }} loadId={null} />);
    expect(card("Customer billed")).toBe("$2,730.00");
    expect(card("Carrier gross")).toBe("$2,130.00");
    expect(screen.queryByText(/this load was cancelled/i)).toBeNull();
    expect(screen.queryByText("not billed")).toBeNull();
  });
});
