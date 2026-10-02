// carrier-portal-upgrade M4/M5 — the carrier Dashboard on a phone.
//
// The KPI and quick-action rows were fixed four-column grids, and the two load
// lists a fixed two-column grid. At 380px their content pushed <main> sideways
// (the responsive E2E measured it). The rows now stack, and each active load
// opens on My Loads.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/hooks/useCarrierAuth", () => ({
  useCarrierAuth: () => ({ user: { firstName: "Ana", carrierProfile: { tier: "SILVER", companyName: "Ruiz Freight" } } }),
}));

import CarrierOverviewPage from "./page";

const ACTIVE = { id: "l1", referenceNumber: "SRL-121498", status: "IN_TRANSIT", originCity: "Kalamazoo", originState: "MI", destCity: "Dallas", destState: "TX", carrierRate: 2500, distance: 1000 };

get.mockImplementation((url: string) =>
  Promise.resolve({
    data: url.startsWith("/carrier-loads/my-loads")
      ? { loads: [ACTIVE], total: 1 }
      : url.startsWith("/carrier-loads/available")
        ? { loads: [], total: 0 }
        : {},
  }),
);

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CarrierOverviewPage /></QueryClientProvider>);
}

describe("Dashboard", () => {
  it("has no fixed multi-column grid below its breakpoint", () => {
    const { container } = mount();
    const fixed = Array.from(container.querySelectorAll("[class*='grid-cols-']")).filter((el) =>
      el.className.split(/\s+/).some((c) => /^grid-cols-[2-9]$/.test(c) && !el.className.includes("grid-cols-2 lg:") && !el.className.includes("grid-cols-2 md:")),
    );
    expect(fixed.map((el) => el.className)).toEqual([]);
  });

  it("opens an active load on My Loads, with its rate per mile and its status in words", async () => {
    mount();
    const row = await screen.findByRole("link", { name: /SRL-121498/ });
    expect(row.getAttribute("href")).toBe("/carrier/dashboard/my-loads?load=l1");
    expect(screen.getByText("($2.50/mi)")).toBeTruthy();
    expect(screen.getByText("In transit")).toBeTruthy();
  });

  it("tells a carrier with no available loads what will happen", async () => {
    mount();
    expect(await screen.findByText(/New loads appear here as SRL posts them/)).toBeTruthy();
  });
});
