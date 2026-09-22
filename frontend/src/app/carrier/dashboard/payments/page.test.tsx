/**
 * E6 (2026-09-22) — a payment row links to its load.
 *
 * The Payments page named the load by reference number as plain text; a
 * carrier reading "why is this settlement PREPARED" had to go to My Loads and
 * find the row by hand. The reference is now a link to
 * /carrier/dashboard/my-loads?load=<id>, the deep link E2 taught My Loads to
 * open on mount.
 *
 * Behavioural: the REAL page is rendered under a real QueryClient; api.get is
 * answered per path. The carrier auth store is stubbed with a Silver profile.
 *
 * Adversarially verified at authoring: rendering the reference as text again
 * turns the link case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/hooks/useCarrierAuth", () => ({
  useCarrierAuth: () => ({ user: { id: "u-carrier", email: "c@srl.invalid", carrierProfile: { tier: "SILVER" } } }),
}));
vi.mock("@/components/carrier", () => ({
  CarrierCard: ({ children }: any) => <div>{children}</div>,
  CarrierBadge: ({ status }: any) => <span>{status}</span>,
}));

import { api } from "@/lib/api";
import Page from "./page";

const get = api.get as unknown as ReturnType<typeof vi.fn>;

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
}

beforeEach(() => {
  get.mockReset();
  get.mockImplementation((url: string) => {
    if (url.startsWith("/carrier-auth/activation-status")) return Promise.resolve({ data: { quickPayEnabled: false, quickPayPilot: null, agreements: [] } });
    if (url.startsWith("/carrier-payments/summary")) return Promise.resolve({ data: { totalPaid: 0, pending: 0, quickPayAvailable: 0 } });
    if (url.startsWith("/carrier-payments?")) return Promise.resolve({
      data: {
        payments: [{
          id: "pay-1", paymentNumber: "SRL-121492P", status: "PREPARED", amount: 4100, netAmount: 4100, createdAt: "2026-09-22T00:00:00Z",
          load: { id: "load-1", referenceNumber: "SRL-121492", originCity: "Lebanon", originState: "NH", destCity: "North Lake", destState: "TX" },
        }],
        total: 1,
      },
    });
    return Promise.reject(new Error(`unexpected get ${url}`));
  });
});

describe("a payment row", () => {
  it("names its load as a link to My Loads, opened on that load", async () => {
    mount();
    const link = await screen.findByTestId("payment-load-link");
    expect(link.textContent).toBe("SRL-121492");
    expect(link.getAttribute("href")).toBe("/carrier/dashboard/my-loads?load=load-1");
  });
});
