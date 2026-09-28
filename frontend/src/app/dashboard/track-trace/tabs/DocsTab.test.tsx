import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const post = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a), patch: vi.fn() } }));
vi.mock("@/lib/useInlineDocument", () => ({ useInlineDocumentUrl: () => null }));

import { readFileSync } from "fs";
import { resolve } from "path";
import { DocsTab, CUSTOMER_SENDABLE_DOC_TYPES } from "./DocsTab";

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

/**
 * F-D3 (ruled 2026-09-28). A POD upload no longer emails the customer; staff send one
 * delivery document from its row, after a confirm, and the row says who received it.
 * Second ruling the same day: the signed delivery BOL is sendable the same way; no other
 * type is.
 */
describe("T&T DocsTab — sending delivery evidence to the customer is a deliberate act", () => {
  const POD = { id: "d-pod-44", docType: "POD", status: "PENDING" };
  const BOL_DEL = { id: "d-bol-del-45", docType: "SIGNED_BOL_DEL", status: "PENDING" };
  const OTHERS = [
    { id: "d-rc", docType: "RATE_CON", status: "PENDING" },
    { id: "d-bol", docType: "BOL", status: "PENDING" },
    { id: "d-pu", docType: "SIGNED_BOL_PU", status: "PENDING" },
    { id: "d-inv", docType: "INVOICE", status: "PENDING" },
    { id: "d-copy", docType: "CUSTOMER_INVOICE_COPY", status: "PENDING" },
  ];
  beforeEach(() => {
    post.mockReset();
    vi.restoreAllMocks();
  });

  it("the tab's sendable list is the backend's, read from source", () => {
    const src = readFileSync(resolve(process.cwd(), "../backend/src/services/shipperLoadNotifyService.ts"), "utf8");
    const m = src.match(/export const CUSTOMER_SENDABLE_DOC_TYPES = \[([^\]]*)\]/);
    expect(m, "backend constant not found").not.toBeNull();
    const backend = [...m![1].matchAll(/"([A-Z_]+)"/g)].map((x) => x[1]);
    expect(backend.length).toBeGreaterThan(0);
    expect([...CUSTOMER_SENDABLE_DOC_TYPES]).toEqual(backend);
  });

  it("every other row, on file, gets no Send to customer", () => {
    renderTab(OTHERS);
    expect(screen.queryByText("Send to customer")).toBeNull();
  });

  it("the POD row and the signed delivery BOL row each get one", () => {
    renderTab([POD, BOL_DEL, ...OTHERS]);
    expect(screen.getAllByText("Send to customer")).toHaveLength(2);
    expect(rowOf("Proof of delivery (POD)").textContent).toContain("Send to customer");
    expect(rowOf("Signed BOL (delivery)").textContent).toContain("Send to customer");
  });

  it("the signed delivery BOL row sends its own document, asks about it by name, and the note lands on its row", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    post.mockResolvedValue({ data: { sent: 1, recipients: ["ops@cust.test"], failed: [] } });
    renderTab([POD, BOL_DEL]);
    fireEvent.click(within(rowOf("Signed BOL (delivery)")).getByText("Send to customer"));
    expect(confirm.mock.calls[0][0]).toContain("Signed BOL (delivery)");
    await waitFor(() => expect(post).toHaveBeenCalledWith("/documents/d-bol-del-45/send-to-customer"));
    await waitFor(() => expect(rowOf("Signed BOL (delivery)").textContent).toContain("Sent to ops@cust.test."));
    expect(rowOf("Proof of delivery (POD)").textContent).not.toContain("Sent to");
  });

  it("confirmed: posts to the POD's send route and shows who got it, and who did not", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    post.mockResolvedValue({ data: { sent: 1, recipients: ["ops@cust.test"], failed: ["lead@cust.test"] } });
    renderTab([POD]);
    fireEvent.click(screen.getByText("Send to customer"));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/documents/d-pod-44/send-to-customer"));
    await waitFor(() => expect(rowOf("Proof of delivery (POD)").textContent).toContain("Sent to ops@cust.test. Not sent to lead@cust.test."));
  });

  it("declined confirm: nothing is posted", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    post.mockResolvedValue({ data: { sent: 1, recipients: ["ops@cust.test"], failed: [] } });
    renderTab([POD]);
    fireEvent.click(screen.getByText("Send to customer"));
    expect(confirm).toHaveBeenCalledTimes(1);
    // The mutation runs after the click returns; asserting at once would pass even if
    // the confirm were skipped (it did, on the first draft). Give it the time to post.
    await new Promise((r) => setTimeout(r, 50));
    expect(post).not.toHaveBeenCalled();
  });

  it("a refusal is shown in the row, in the server's words", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    post.mockRejectedValue({ response: { data: { error: "This customer has no operational contact to send it to." } } });
    renderTab([POD]);
    fireEvent.click(screen.getByText("Send to customer"));
    await waitFor(() => expect(rowOf("Proof of delivery (POD)").textContent).toContain("Not sent: This customer has no operational contact"));
  });
});
