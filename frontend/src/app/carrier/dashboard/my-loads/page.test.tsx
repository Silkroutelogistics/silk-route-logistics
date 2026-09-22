/**
 * E2 (2026-09-21) — the next-step strip and the BOL button state on My Loads.
 *
 * Before this the "Bill of Lading" button rendered live on every load at every
 * status and the refusal arrived as a 403 after the tap; the page said
 * nothing about what a carrier should do next between accepting and the
 * truck rolling. Now the strip is decided by carrierNextStep — a projection
 * of the selector the AE board uses — and the button is disabled with the
 * reason shown until a tender is CONFIRMED, which is the backend gate.
 *
 * Behavioural: the REAL page is rendered; react-query is answered by key so
 * the page's own reads are exercised; chrome is stubbed because this is about
 * the strip and the button, not the sidebar.
 *
 * Adversarially verified at authoring: removing `!step.bolReady` from the
 * button's disabled expression turns the two disabled cases red; dropping the
 * strip from the card turns the strip cases red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

const state = vi.hoisted(() => ({
  loads: [] as any[],
  detail: null as any,
  search: "",
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) => {
    if (queryKey[0] === "carrier-my-loads") return { data: { loads: state.loads, total: state.loads.length, page: 1, totalPages: 1 }, isLoading: false };
    if (queryKey[0] === "carrier-my-load-detail") return { data: queryKey[1] ? state.detail : undefined };
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/download", () => ({
  openPdfFromApi: vi.fn(),
  extractApiError: vi.fn(async () => "err"),
  apiHref: (p: string) => p,
}));
vi.mock("@/components/carrier", () => ({
  CarrierCard: ({ children, onClick }: any) => <div onClick={onClick}>{children}</div>,
  CarrierBadge: ({ status }: any) => <span data-testid="badge">{status}</span>,
  DriverAssignmentPanel: () => null,
}));

import MyLoadsPage from "./page";

function load(id: string, status: string, tenders: string[], extra: Record<string, unknown> = {}) {
  return {
    id, referenceNumber: `SRL-${id}`, status,
    originCity: "Lebanon", originState: "NH", originZip: "03766", destCity: "North Lake", destState: "TX", destZip: "76247",
    equipmentType: "Reefer", weight: 28400, pickupDate: "2026-09-22T00:00:00Z", deliveryDate: "2026-09-24T00:00:00Z",
    carrierRate: 4100, rate: 5100, distance: 1900, driverName: null, driverPhone: null,
    tenders: tenders.map((s, i) => ({ id: `t-${id}-${i}`, status: s, statusReason: null, updatedAt: "2026-09-22T00:00:00Z" })),
    ...extra,
  };
}

beforeEach(() => {
  state.loads = [];
  state.detail = null;
  window.history.replaceState({}, "", "/carrier/dashboard/my-loads");
});

describe("the next-step strip on the list", () => {
  it("says what happens next, per load, from the tender", () => {
    state.loads = [
      load("a", "BOOKED", ["ACCEPTED"]),
      load("b", "BOOKED", ["RC_SENT"]),
      load("c", "BOOKED", ["CONFIRMED"]),
    ];
    render(<MyLoadsPage />);
    const strips = screen.getAllByTestId("next-step").map((el) => el.textContent);
    expect(strips[0]).toMatch(/Rate confirmation on its way/);
    expect(strips[1]).toMatch(/Sign the rate confirmation/);
    expect(strips[2]).toMatch(/Signed\. Bill of lading ready/);
  });

  it("a withdrawn sibling's row is not what decides it — only this carrier's tender arrives, and the strip reads it", () => {
    // The backend scopes tenders to the carrier's own; the strip must not need
    // anything else to be right.
    state.loads = [load("a", "BOOKED", ["CONFIRMED"])];
    render(<MyLoadsPage />);
    expect(screen.getByTestId("next-step").textContent).toMatch(/Signed/);
  });
});

describe("the BOL button in the detail panel", () => {
  it("is DISABLED with the reason shown while the rate confirmation is unsigned", async () => {
    state.loads = [load("a", "BOOKED", ["RC_SENT"])];
    state.detail = load("a", "BOOKED", ["RC_SENT"]);
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    render(<MyLoadsPage />);
    const btn = await screen.findByRole("button", { name: /Bill of Lading/ });
    expect(btn).toBeDisabled();
    expect(screen.getByTestId("bol-reason").textContent).toMatch(/Sign the rate confirmation to unlock the bill of lading/);
    expect(screen.getByTestId("bol-reason").textContent).toMatch(/signing link is in the email/);
    expect(screen.getByTestId("next-step-detail").textContent).toMatch(/Sign the rate confirmation/);
  });

  it("is disabled on a directly-assigned load too, because the gate asks for a CONFIRMED tender it never had", async () => {
    state.loads = [load("a", "BOOKED", [], { carrierId: "u1" })];
    state.detail = load("a", "BOOKED", [], { carrierId: "u1" });
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    render(<MyLoadsPage />);
    const btn = await screen.findByRole("button", { name: /Bill of Lading/ });
    expect(btn).toBeDisabled();
    expect(screen.getByTestId("bol-reason").textContent).toMatch(/sign the rate confirmation/i);
  });

  it("is LIVE once a tender is CONFIRMED, with no reason shown (control)", async () => {
    state.loads = [load("a", "BOOKED", ["CONFIRMED"])];
    state.detail = load("a", "BOOKED", ["CONFIRMED"]);
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    render(<MyLoadsPage />);
    const btn = await screen.findByRole("button", { name: /Bill of Lading/ });
    expect(btn).not.toBeDisabled();
    expect(screen.queryByTestId("bol-reason")).toBeNull();
    expect(screen.getByTestId("next-step-detail").textContent).toMatch(/Bill of lading ready/);
  });

  it("stays live while the truck is rolling — the tender is settled, the gate still holds", async () => {
    state.loads = [load("a", "IN_TRANSIT", ["CONFIRMED"])];
    state.detail = load("a", "IN_TRANSIT", ["CONFIRMED"]);
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    render(<MyLoadsPage />);
    expect(await screen.findByRole("button", { name: /Bill of Lading/ })).not.toBeDisabled();
  });
});

describe("?load= opens the load the accept confirmation points at", () => {
  it("selects that load's detail on mount", async () => {
    state.loads = [load("zz", "BOOKED", ["ACCEPTED"])];
    state.detail = load("zz", "BOOKED", ["ACCEPTED"]);
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=zz");
    render(<MyLoadsPage />);
    await waitFor(() => expect(screen.getByTestId("next-step-detail")).toBeTruthy());
    expect(screen.getAllByText("SRL-zz").length).toBeGreaterThan(1); // card + detail header
  });

  it("without the param nothing is selected", () => {
    state.loads = [load("zz", "BOOKED", ["ACCEPTED"])];
    state.detail = load("zz", "BOOKED", ["ACCEPTED"]);
    render(<MyLoadsPage />);
    expect(screen.queryByTestId("next-step-detail")).toBeNull();
  });
});
