/**
 * v3.8.bnr — ruling 2026-09-27, 6: an invoice's status is not set from a
 * request. The batch bar offered Approve, Mark Paid and Reject, each posting a
 * status to /invoices/batch/status; Mark Paid wrote PAID with no amount and
 * credited no fund. The bar now only exports and clears.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { api } from "@/lib/api";
import { BatchActionsBar } from "./BatchActionsBar";

const INVOICES = [
  { id: "a", invoiceNumber: "121494I", amount: 3000, status: "SENT", createdAt: "2026-09-25T00:00:00.000Z" },
  { id: "b", invoiceNumber: "121495I", amount: 1200, status: "OVERDUE", createdAt: "2026-09-20T00:00:00.000Z" },
];

// Inside a query client, so the check is fair to a bar that used a mutation.
const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("BatchActionsBar — no status actions", () => {
  it("offers no Approve, Mark Paid or Reject for a selection", () => {
    render(<BatchActionsBar selectedIds={["a", "b"]} onClear={() => {}} invoices={INVOICES} />);
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: /export csv/i })).toBeTruthy();
    for (const label of [/approve/i, /mark paid/i, /reject/i]) {
      expect(screen.queryByRole("button", { name: label })).toBeNull();
    }
  });

  it("every button it does offer leaves the invoices alone", async () => {
    const onClear = vi.fn();
    const createObjectURL = vi.fn(() => "blob:x");
    const revokeObjectURL = vi.fn();
    Object.assign(window.URL, { createObjectURL, revokeObjectURL });
    render(<BatchActionsBar selectedIds={["a", "b"]} onClear={onClear} invoices={INVOICES} />);
    for (const button of screen.getAllByRole("button")) fireEvent.click(button);
    await new Promise((r) => setTimeout(r, 0)); // a mutation calls its function after a tick
    for (const verb of ["post", "put", "patch", "delete"] as const) expect(vi.mocked(api[verb])).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it("renders nothing with no selection", () => {
    render(<BatchActionsBar selectedIds={[]} onClear={() => {}} invoices={INVOICES} />);
    expect(screen.queryByText(/selected/)).toBeNull();
  });
});
