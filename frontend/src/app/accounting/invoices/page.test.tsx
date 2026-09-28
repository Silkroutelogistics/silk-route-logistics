/**
 * Accounting invoice detail — the PDF button (invoicing audit G-8, queue B6).
 *
 * The button rendered with no onClick, so it did nothing. It must fetch the
 * generated invoice from GET /pdf/invoice/:id through the api client, and tell
 * the user when that fails rather than failing silently again.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock("@/lib/download", () => ({ downloadFromApi: vi.fn() }));
const toast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast }) }));

import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
import InvoicesPage from "./page";

const INV = {
  id: "inv-1", invoiceNumber: "SRL-121494I", status: "SENT", amount: 2550, totalAmount: 2550,
  dueDate: "2099-01-01T00:00:00Z", createdAt: "2026-09-20T00:00:00Z", lineItems: [],
  load: { referenceNumber: "SRL-121494", customer: { name: "Beekeepers Naturals USA Inc." } },
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><InvoicesPage /></QueryClientProvider>);
}

async function openPdf() {
  mount();
  await userEvent.click(await screen.findByText("SRL-121494I"));
  await userEvent.click(await screen.findByRole("button", { name: /^pdf$/i }));
}

// v3.8.bnd — ruling 2026-09-27, 2: a partly paid invoice past its due day is
// OVERDUE "with the balance shown". $1,000 with $600 paid leaves $400.
describe("a partly paid invoice shows its balance", () => {
  const PART = { ...INV, id: "inv-part", invoiceNumber: "SRL-121495I", status: "OVERDUE", amount: 1000, totalAmount: 1000, paidAmount: 600, paidAt: "2026-10-20T15:00:00Z" };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { invoices: [PART, INV], total: 2, totalPages: 1 } } as any);
  });

  it("in the list, under its amount, and only on the partly paid row", async () => {
    mount();
    const row = (await screen.findByText("SRL-121495I")).closest("tr")!;
    expect(within(row).getByText("Balance $400.00")).toBeTruthy();
    const unpaid = screen.getByText("SRL-121494I").closest("tr")!;
    expect(within(unpaid).queryByText(/^Balance/)).toBeNull();
  });

  it("in the detail panel, beside what was paid", async () => {
    mount();
    await userEvent.click(await screen.findByText("SRL-121495I"));
    const label = await screen.findByText("Balance");
    expect(label.parentElement!.textContent).toContain("$400.00");
  });
});

// v3.8.bnh — ruling 2026-09-27, 3: the page's past-due flag uses the due day on
// the America/Toronto clock from the shared rule, and a due date shows the day
// the invoice prints on any device. The device here is west of UTC, where a
// midnight-UTC due date used to read a day early.
describe("the past-due flag and the due day", () => {
  const DUE = { ...INV, id: "inv-due", invoiceNumber: "SRL-121496I", status: "SENT", dueDate: "2026-10-25T00:00:00.000Z" };
  const TZ = process.env.TZ;
  const show = (rows: unknown[]) =>
    vi.mocked(api.get).mockResolvedValue({ data: { invoices: rows, total: rows.length, totalPages: 1 } } as any);
  const statusAt = async (now: string, rows: unknown[], number: string) => {
    cleanup();
    show(rows);
    vi.setSystemTime(new Date(now));
    mount();
    const row = (await screen.findByText(number)).closest("tr")!;
    return row.lastElementChild!.textContent;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    process.env.TZ = "America/Los_Angeles";
  });
  afterEach(() => {
    vi.useRealTimers();
    if (TZ === undefined) delete process.env.TZ; else process.env.TZ = TZ;
  });

  it("is not raised on the due day, and is from 00:00 Toronto the day after", async () => {
    expect(await statusAt("2026-10-26T03:59:00.000Z", [DUE], "SRL-121496I")).toBe("SENT");
    expect(await statusAt("2026-10-26T04:00:00.000Z", [DUE], "SRL-121496I")).toBe("OVERDUE");
  });

  it("uses the Toronto clock, not New York's (January 1974, when the two differed)", async () => {
    const old = { ...DUE, dueDate: "1974-01-09T00:00:00.000Z" };
    expect(await statusAt("1974-01-10T04:30:00.000Z", [old], "SRL-121496I")).toBe("SENT");
    expect(await statusAt("1974-01-10T05:00:00.000Z", [old], "SRL-121496I")).toBe("OVERDUE");
  });

  it("is not raised on a draft, which has not been sent", async () => {
    expect(await statusAt("2026-11-01T12:00:00.000Z", [{ ...DUE, status: "DRAFT" }], "SRL-121496I")).toBe("DRAFT");
  });

  it("shows the due day the invoice prints, not the device's day", async () => {
    await statusAt("2026-10-20T12:00:00.000Z", [DUE], "SRL-121496I");
    const row = screen.getByText("SRL-121496I").closest("tr")!;
    expect(within(row).getByText("Oct 25, 2026")).toBeTruthy();
  });
});

describe("accounting invoice PDF button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue({ data: { invoices: [INV], total: 1, totalPages: 1 } } as any);
  });

  it("downloads the generated invoice for the selected row", async () => {
    vi.mocked(downloadFromApi).mockResolvedValue();
    await openPdf();
    expect(downloadFromApi).toHaveBeenCalledWith("/pdf/invoice/inv-1", "SRL-121494I.pdf");
  });

  it("says so when the download fails", async () => {
    vi.mocked(downloadFromApi).mockRejectedValue(new Error("404"));
    await openPdf();
    await waitFor(() => expect(toast).toHaveBeenCalledWith("Could not download the invoice PDF", "error"));
  });
});
