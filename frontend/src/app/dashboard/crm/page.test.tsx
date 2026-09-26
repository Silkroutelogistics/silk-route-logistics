/**
 * v3.8.bkc — the CRM list's cards and rows are labelled YTD, so they read the
 * YTD pair. They used to read an all-time figure that added the Shipment table's
 * carrier rates to every load's customer rate, cancelled loads included —
 * Beekeepers read $43,450 / 9 loads against $3,700 / 4 earned.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("./CustomerDrawer", () => ({ CustomerDrawer: () => null }));

import CrmPage from "./page";

describe("CRM customers list", () => {
  it("cards and rows show YTD revenue and loads, not the all-time figure", async () => {
    get.mockImplementation(async (_url: string, cfg: any) =>
      cfg?.params?.context === "onboarding"
        ? { data: { customers: [], total: 0 } }
        : {
            data: {
              total: 1,
              customers: [{
                id: "cust-bee", name: "Beekeepers Naturals USA Inc.", type: "SHIPPER", onboardingStatus: "APPROVED",
                email: null, city: "Covina", state: "CA",
                totalRevenue: 43450, totalLoads: 9, totalShipments: 9, // what the old endpoint returned
                ytdRevenue: 3700, ytdLoads: 4,
              }],
            },
          },
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><CrmPage /></QueryClientProvider>);

    expect((await screen.findAllByText("$3,700")).length).toBeGreaterThanOrEqual(2); // card + row
    expect(screen.getByText("4 loads YTD")).toBeTruthy();
    expect(document.body.textContent).not.toContain("43,450");
  });
});
