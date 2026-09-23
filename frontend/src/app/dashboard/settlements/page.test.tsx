/**
 * C7b — the settlement says what it is paying against.
 *
 * The load-bearing property is that an ABSENT fact is stated. "not signed" and
 * "no acceptance recorded" are findings an AE should act on; an empty cell is
 * indistinguishable from a column the page failed to read, and a settlement is
 * the last screen before money leaves.
 *
 * The second property is that the two facts are independent. A signed rate
 * confirmation does not imply a recorded acceptance and vice versa, so neither
 * is allowed to render the other's state.
 *
 * Behavioural: the REAL page is rendered and the real detail fetch is
 * exercised; only the transport and the chrome are stubbed.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";

const state = vi.hoisted(() => ({ settlements: [] as any[], detail: null as any }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { settlements: state.settlements, total: state.settlements.length }, isLoading: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(async () => ({ data: state.detail })),
    patch: vi.fn(),
  },
}));
vi.mock("@/components/accounting/CreateSettlementModal", () => ({ CreateSettlementModal: () => null }));

import SettlementsPage from "./page";

const SIGNED_AT = "2026-09-20T10:00:00.000Z";
const ACCEPTED_AT = "2026-09-19T08:00:00.000Z";

function pay(over: Record<string, unknown> = {}) {
  return {
    id: "cp-1", amount: 4100, quickPayDiscount: null, netAmount: 4100, status: "APPROVED",
    load: {
      referenceNumber: "SRL-121500", originCity: "Lebanon", originState: "NH",
      destCity: "North Lake", destState: "TX", pickupDate: null, deliveryDate: null,
      carrierAcceptedAt: ACCEPTED_AT, carrierAcceptedVia: "TENDER_ACCEPT",
    },
    rateConfirmation: { id: "rc-1", rateConNumber: "SRL-121500R", signed: true, signedAt: SIGNED_AT },
    ...over,
  };
}

function settlement(pays: any[]) {
  return {
    id: "s-1", settlementNumber: "STL-0001", grossPay: 4100, deductions: 0, netSettlement: 4100,
    status: "DRAFT", period: "WEEKLY", periodStart: "2026-09-14T00:00:00Z", periodEnd: "2026-09-21T00:00:00Z",
    paidAt: null, notes: null, createdAt: "2026-09-21T00:00:00Z",
    carrier: { id: "u1", firstName: "Jordan", lastName: "Carrier", company: "Jordan Freight" },
    carrierPays: pays,
  };
}

/** Render, open the settlement, and hand back the reference cell. */
async function openDetail(pays: any[]) {
  state.settlements = [settlement(pays)];
  state.detail = settlement(pays);
  render(<SettlementsPage />);
  fireEvent.click(screen.getByText("STL-0001"));
  await waitFor(() => expect(screen.getByTestId("rc-reference")).toBeInTheDocument());
  return screen.getByTestId("rc-reference");
}

beforeEach(() => {
  vi.clearAllMocks();
  state.settlements = [];
  state.detail = null;
});

describe("a signed, accepted load shows both facts", () => {
  it("renders the rate con number, that it is signed, and how the load was accepted", async () => {
    const cell = await openDetail([pay()]);
    expect(cell.textContent).toMatch(/SRL-121500R/);
    expect(cell.textContent).toMatch(/signed/);
    expect(cell.textContent).not.toMatch(/not signed/);
    // The ACT, in words rather than the enum the column stores.
    expect(cell.textContent).toMatch(/Accepted the tender/);
  });

  it("the values are the row's, not a default — a different row reads differently", async () => {
    const cell = await openDetail([
      pay({
        rateConfirmation: { id: "rc-9", rateConNumber: "SRL-999999R", signed: true, signedAt: SIGNED_AT },
        load: { ...pay().load, carrierAcceptedVia: "RC_SIGNATURE" },
      }),
    ]);
    expect(cell.textContent).toMatch(/SRL-999999R/);
    expect(cell.textContent).toMatch(/Signed the rate confirmation/);
    expect(cell.textContent).not.toMatch(/SRL-121500R/);
  });
});

describe("an absent fact is stated, never left blank", () => {
  it("says 'not signed' rather than rendering an empty cell", async () => {
    const cell = await openDetail([
      pay({ rateConfirmation: { id: "rc-1", rateConNumber: "SRL-121500R", signed: false, signedAt: null } }),
    ]);
    expect(cell.textContent).toMatch(/not signed/);
    // The number still renders: the document exists, it is simply unexecuted.
    expect(cell.textContent).toMatch(/SRL-121500R/);
  });

  it("says 'no rate con' when no rate confirmation is linked at all", async () => {
    const cell = await openDetail([pay({ rateConfirmation: null })]);
    expect(cell.textContent).toMatch(/no rate con/);
  });

  it("says 'no acceptance recorded' and does not let the signature stand in for it", async () => {
    // SIGNED but never accepted — a pre-C4a load, where the stamp did not
    // exist. The two facts must not collapse into one.
    const cell = await openDetail([
      pay({ load: { ...pay().load, carrierAcceptedAt: null, carrierAcceptedVia: null } }),
    ]);
    expect(cell.textContent).toMatch(/no acceptance recorded/);
    expect(cell.textContent).toMatch(/signed/);
  });

  it("shows an acceptance on a load whose rate confirmation is unsigned — the other direction", async () => {
    const cell = await openDetail([
      pay({ rateConfirmation: { id: "rc-1", rateConNumber: "SRL-121500R", signed: false, signedAt: null } }),
    ]);
    expect(cell.textContent).toMatch(/not signed/);
    expect(cell.textContent).toMatch(/Accepted the tender/);
  });
});

describe("the surface stays thin", () => {
  it("renders no signer, no IP, no hash and no document link", async () => {
    const cell = await openDetail([pay()]);
    // Nothing here should be able to render evidence it was never sent. The
    // guard is the payload (C7a); this asserts the surface does not go looking.
    for (const leak of ["signerIp", "contentHash", "signedUrl", "203.0.113", "href"]) {
      expect(cell.innerHTML, `${leak} does not belong on a settlement row`).not.toContain(leak);
    }
  });
});
