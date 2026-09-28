/**
 * The employee dashboard's "Overdue Invoices" count (Needs Attention).
 *
 * v3.8.bnj — ruling 2026-09-27, 3: the count uses the due day on the
 * America/Toronto clock from the shared rule the accounting pages read. It had
 * counted any invoice not PAID (VOID and DRAFT included) from its stored
 * instant, so a midnight-UTC due date counted from 8 PM Eastern the evening
 * before.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock("@/hooks/useAuthStore", () => ({ useAuthStore: () => ({ user: { id: "u-1", firstName: "Wasi", role: "ADMIN" } }) }));

import { api } from "@/lib/api";
import { EmployeeOverview } from "./EmployeeOverview";

const DUE_OCT25 = "2026-10-25T00:00:00.000Z"; // Beekeepers' shape: midnight UTC

let invoices: { id: string; status: string; dueDate: string | null }[] = [];

async function overdueCountAt(now: string) {
  cleanup();
  vi.setSystemTime(new Date(now));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><EmployeeOverview /></QueryClientProvider>);
  const label = await screen.findByText("Overdue Invoices");
  // The Pending Invoices card reads "—" until the invoices query resolves, so
  // once it shows a number the overdue count has been computed from the rows.
  await waitFor(() =>
    expect(screen.getByText("Pending Invoices").closest("a")!.querySelector("p")!.textContent).not.toBe("—"),
  );
  return Number(label.previousElementSibling!.textContent);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === "/invoices") return { data: invoices } as any;
    if (url === "/loads") return { data: { loads: [] } } as any;
    if (url === "/notifications") return { data: [] } as any;
    return { data: {} } as any;
  });
});
afterEach(() => vi.useRealTimers());

describe("EmployeeOverview — Overdue Invoices", () => {
  it("does not count an invoice on its due day, and counts it from 00:00 Toronto the day after", async () => {
    invoices = [{ id: "bkn", status: "SENT", dueDate: DUE_OCT25 }];
    expect(await overdueCountAt("2026-10-26T03:59:00.000Z")).toBe(0); // 11:59 PM Toronto, the due day
    expect(await overdueCountAt("2026-10-26T04:00:00.000Z")).toBe(1); // 00:00 Toronto, the day after
  });

  it("uses the Toronto clock, not New York's (January 1974, when the two differed)", async () => {
    invoices = [{ id: "a", status: "SENT", dueDate: "1974-01-09T00:00:00.000Z" }];
    expect(await overdueCountAt("1974-01-10T04:30:00.000Z")).toBe(0);
    expect(await overdueCountAt("1974-01-10T05:00:00.000Z")).toBe(1);
  });

  it("counts open invoices past due, PARTIAL included, and never a void or a draft", async () => {
    invoices = ["SENT", "PARTIAL", "OVERDUE", "VOID", "DRAFT", "PAID"].map((s) => ({ id: s, status: s, dueDate: DUE_OCT25 }));
    expect(await overdueCountAt("2026-11-01T12:00:00.000Z")).toBe(3);
  });
});
