// carrier-portal-upgrade F2 (M4/M5) — the Scorecard on a phone.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

import ScorecardPage from "./page";

const DATA = {
  currentScore: 88, currentTier: "SILVER", bonusPercentage: 0, trackingMeasured: false,
  metrics: { onTimeDeliveryPct: 97, onTimePickupPct: 96, claimRatio: 0, communicationScore: 90, documentTimeliness: 95, acceptanceRate: 80, gpsCompliance: 0 },
  history: [],
  bonuses: [{ period: "2026-09", type: "Milestone", amount: 250, status: "PAID", description: "First 12 loads" }],
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ScorecardPage /></QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe("Scorecard", () => {
  it("shows a skeleton while loading", () => {
    get.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByRole("status", { name: "Loading scorecard" })).toBeTruthy();
  });

  it("labels each bonus cell, so the row reads as a card under 768px", async () => {
    get.mockResolvedValue({ data: DATA });
    const { container } = mount();
    await screen.findByText("First 12 loads");
    const labels = Array.from(container.querySelectorAll("td[data-label]")).map((td) => td.getAttribute("data-label"));
    expect(labels).toEqual(["Period", "Type", "Amount", "Status", "Description"]);
    expect(container.querySelector("table")!.className).toMatch(/\bblock md:table\b/);
  });

  it("does not force the pay ladder wider than a phone", async () => {
    get.mockResolvedValue({ data: DATA });
    const { container } = mount();
    await screen.findByText("First 12 loads");
    expect(container.innerHTML).not.toMatch(/whitespace-nowrap/);
  });
});
