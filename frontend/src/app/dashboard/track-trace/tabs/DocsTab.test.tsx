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

/**
 * F-D3 (ruled 2026-09-28). A POD upload no longer emails the customer; staff send one POD
 * from its row, after a confirm, and the row says who received it.
 */
describe("T&T DocsTab — sending the POD to the customer is a deliberate act", () => {
  const POD = { id: "d-pod-44", docType: "POD", status: "PENDING" };
  beforeEach(() => {
    post.mockReset();
    vi.restoreAllMocks();
  });

  it("no POD on file: no Send to customer anywhere, even with a signed delivery BOL", () => {
    renderTab([{ id: "d-bol", docType: "SIGNED_BOL_DEL", status: "PENDING" }]);
    expect(screen.queryByText("Send to customer")).toBeNull();
  });

  it("a POD on file: the button sits on the POD row and nowhere else", () => {
    renderTab([POD, { id: "d-bol", docType: "SIGNED_BOL_DEL", status: "PENDING" }]);
    expect(screen.getAllByText("Send to customer")).toHaveLength(1);
    expect(rowOf("Proof of delivery (POD)").textContent).toContain("Send to customer");
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
