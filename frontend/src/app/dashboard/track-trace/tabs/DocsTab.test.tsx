import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a), patch: vi.fn() } }));
vi.mock("@/lib/useInlineDocument", () => ({ useInlineDocumentUrl: () => null }));

import { DocsTab } from "./DocsTab";

/**
 * D (ruled 2026-09-28). On 2026-09-27 SRL's customer invoices for four Beekeepers loads were
 * filed through this tab's row labelled just "Invoice", which uploads as INVOICE, the
 * CARRIER's invoice everywhere else. They cleared the carrier-pay gate and appeared in the
 * carrier's portal. The tab now names that row for what it is and gives SRL's copy its own
 * row and type. This renders the real component and reads what the AE sees and what the
 * upload sends.
 */
const rowOf = (label: string) => screen.getByText(label).closest("div.border") as HTMLElement;
const renderTab = (documents: unknown[]) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <DocsTab load={{ documents }} loadId="load-121495" onChange={() => {}} />
    </QueryClientProvider>,
  );

describe("T&T DocsTab — the carrier's invoice and SRL's copy are two rows", () => {
  beforeEach(() => post.mockReset().mockResolvedValue({ data: [] }));

  it("labels the INVOICE row as the carrier's, and offers SRL's copy as its own row", () => {
    renderTab([]);
    expect(screen.getByText("Carrier invoice")).toBeTruthy();
    expect(screen.getByText("Customer invoice copy (SRL internal)")).toBeTruthy();
    expect(screen.queryByText("Invoice")).toBeNull(); // the ambiguous label is gone
  });

  it("a copy on file fills its own row and leaves the carrier invoice row missing", () => {
    renderTab([{ id: "d-copy", docType: "CUSTOMER_INVOICE_COPY", status: "PENDING" }]);
    expect(rowOf("Customer invoice copy (SRL internal)").textContent).toContain("Pending");
    expect(rowOf("Carrier invoice").textContent).toContain("Missing");
  });

  it("uploading in the copy row files it as CUSTOMER_INVOICE_COPY on the load", async () => {
    renderTab([]);
    const input = rowOf("Customer invoice copy (SRL internal)").querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["%PDF-1.4"], "121495I-Invoice-POD.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [url, form] = post.mock.calls[0] as [string, FormData];
    expect(url).toBe("/documents/upload");
    expect(form.get("docType")).toBe("CUSTOMER_INVOICE_COPY");
    expect(form.get("loadId")).toBe("load-121495");
  });

  it("uploading in the carrier invoice row still files INVOICE, so the carrier's own path is unchanged", async () => {
    renderTab([]);
    const input = rowOf("Carrier invoice").querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(["%PDF-1.4"], "inv.pdf", { type: "application/pdf" })] } });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect((post.mock.calls[0][1] as FormData).get("docType")).toBe("INVOICE");
  });
});
