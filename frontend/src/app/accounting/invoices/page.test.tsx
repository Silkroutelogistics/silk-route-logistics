/**
 * Accounting invoice detail — the PDF button (invoicing audit G-8, queue B6).
 *
 * The button rendered with no onClick, so it did nothing. It must fetch the
 * generated invoice from GET /pdf/invoice/:id through the api client, and tell
 * the user when that fails rather than failing silently again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
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
