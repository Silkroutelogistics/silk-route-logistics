// carrier-portal-upgrade G14/G15/M4 — the Revenue page reports what the API says.
//
// G14: the Total Loads KPI read rev.totalLoads; the API sends loadCount, so the
// KPI always said 0. G15: the YTD tab sent period=monthly and showed trailing
// twelve months under a YTD label. M4: the invoice table reads as cards on a phone.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));

import CarrierRevenuePage from "./page";

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CarrierRevenuePage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url.startsWith("/carrier/revenue")
        ? {
            totalRevenue: 9000, loadCount: 3, avgPerLoad: 3000, totalBonuses: 0, bonuses: [], lanes: [],
            invoices: [{ id: "i1", amount: 3000, status: "PAID", createdAt: "2026-09-30T15:00:00Z", load: { referenceNumber: "SRL-1", originCity: "A", originState: "MI", destCity: "B", destState: "TX" } }],
          }
        : {},
    }),
  );
});

describe("Revenue", () => {
  it("counts the loads the API reports (G14)", async () => {
    mount();
    const kpi = (await screen.findByText("Total Loads")).parentElement!.parentElement!; // the card
    await waitFor(() => expect(kpi.textContent).toContain("3"));
  });

  it("asks for year-to-date when the YTD tab is chosen (G15)", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /YTD/i }));
    await waitFor(() => expect(get).toHaveBeenCalledWith("/carrier/revenue?period=ytd"));
  });

  it("labels each invoice cell, so the row reads as a card under 768px (M4)", async () => {
    const { container } = mount();
    await screen.findByText("SRL-1");
    const labels = Array.from(container.querySelectorAll("td[data-label]")).map((td) => td.getAttribute("data-label"));
    expect(labels).toEqual(["Load", "Route", "Amount", "Status", "Date"]);
  });
});
