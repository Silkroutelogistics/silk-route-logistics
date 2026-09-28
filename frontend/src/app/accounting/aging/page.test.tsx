/**
 * The AR aging page (/accounting/aging).
 *
 * v3.8.bnc — ruling 2026-09-27, 2: a partly paid invoice past its due day is
 * OVERDUE "with the balance shown". The report ages balances (v3.8.bnb); the
 * page's overdue table shows each row's balance, under a column that says so.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock("@/components/accounting/ReminderEmailSwitch", () => ({ ReminderEmailSwitch: () => null }));

import { api } from "@/lib/api";
import AgingReportPage from "./page";

// The shape GET /accounting/invoices/aging returns: a partly paid invoice,
// $1,000 with $600 paid, 40 days past due.
const PART = {
  id: "inv-part", invoiceNumber: "SRL-121494I", amount: 1000, balance: 400,
  dueDate: "2026-10-11T00:00:00.000Z", createdAt: "2026-09-11T00:00:00.000Z", daysOutstanding: 40,
  load: { referenceNumber: "SRL-121494", customer: { name: "Beekeepers Naturals USA Inc." } },
};
const EMPTY = { invoices: [], total: 0 };
const REPORT = {
  buckets: { current: EMPTY, "1-30": EMPTY, "31-60": { invoices: [PART], total: 400 }, "61-90": EMPTY, "90+": EMPTY },
  summary: { current: 0, "1-30": 0, "31-60": 400, "61-90": 0, "90+": 0, grandTotal: 400, invoiceCount: 1 },
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AgingReportPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ data: REPORT } as any);
});

describe("aging page — the balance shown", () => {
  it("an overdue partly paid invoice shows its balance, not its face amount", async () => {
    mount();
    const row = (await screen.findByText("SRL-121494I")).closest("tr")!;
    expect(within(row).getByText("$400")).toBeTruthy();
    expect(within(row).queryByText("$1,000")).toBeNull();
    expect(screen.getByRole("columnheader", { name: "Balance" })).toBeTruthy();
  });
});
