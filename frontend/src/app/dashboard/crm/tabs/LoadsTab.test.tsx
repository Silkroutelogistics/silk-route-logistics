/**
 * v3.8.bjx — every Recent Loads row carries its load to Track & Trace, and a
 * figure with nothing behind it renders as a dash rather than 0.0% or "$null".
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get } }));

import { LoadsTab } from "./LoadsTab";

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LoadsTab customerId="cust-bee" />
    </QueryClientProvider>,
  );
}

describe("LoadsTab", () => {
  it("links each row to /dashboard/track-trace?load=<id>, cancelled ones included", async () => {
    get.mockResolvedValue({
      data: {
        loads: [
          { id: "ld-121496", loadNumber: "SRL-121496", status: "TONU", originCity: "Northlake", originState: "TX", destCity: "Hebron", destState: "KY", pickupDate: null },
          { id: "ld-121491", loadNumber: "SRL-121491", status: "CANCELLED", originCity: "Northlake", originState: "TX", destCity: "Hebron", destState: "KY", pickupDate: null },
        ],
        total: 4, totalRevenue: 3700, avgMargin: 8,
        topLanes: [{ origin: "Irving, TX", dest: "Hebron, KY", count: 1, avgRate: 2550 }],
      },
    });
    mount();
    const tonu = (await screen.findByText("SRL-121496")).closest("a")!;
    expect(tonu.getAttribute("href")).toBe("/dashboard/track-trace?load=ld-121496");
    const cancelled = screen.getByText("SRL-121491").closest("a")!;
    expect(cancelled.getAttribute("href")).toBe("/dashboard/track-trace?load=ld-121491");
    // Money renders WITH its dollar sign — a `$${…}` written through a
    // String.replace once lost it, and only these two assertions noticed.
    expect(screen.getByText("$3,700")).toBeTruthy();
    expect(screen.getByText(/avg \$2,550/)).toBeTruthy();
    expect(screen.getByText(/excludes cancelled/i)).toBeTruthy();
  });

  it("renders a dash for a null margin and a null lane average", async () => {
    get.mockResolvedValue({
      data: {
        loads: [], total: 2, totalRevenue: 450, avgMargin: null,
        topLanes: [{ origin: "Northlake, TX", dest: "Hebron, KY", count: 2, avgRate: null }],
      },
    });
    mount();
    expect(await screen.findByText("—")).toBeTruthy();
    expect(screen.getByText(/avg —/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/\$null|NaN/);
  });
});
