/**
 * v3.8.bkr — a refused customer-document upload says which and why. It
 * used to clear the spinner and leave the row reading "Missing", as though
 * nothing had been tried.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post, patch } }));
vi.mock("@/lib/useInlineDocument", () => ({ useInlineDocumentUrl: () => null }));

import { DocsTab } from "./DocsTab";

function mount() {
  get.mockResolvedValue({ data: { documents: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <DocsTab customerId="cust-bee" onChange={() => {}} />
    </QueryClientProvider>,
  );
}

async function uploadInto(label: string) {
  const row = (await screen.findByText(label)).closest("div.border")!;
  const input = row.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(["x"], "w9.pdf", { type: "application/pdf" })] } });
}

describe("CRM DocsTab upload", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends a W-9 as docType W9 for this customer", async () => {
    post.mockResolvedValue({ data: {} });
    mount();
    await uploadInto("W-9");
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const form = post.mock.calls[0][1] as FormData;
    expect(form.get("docType")).toBe("W9");
    expect(form.get("entityType")).toBe("CUSTOMER");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a refused upload names the document and the server's reason", async () => {
    post.mockRejectedValue({ response: { data: { error: 'docType "W9" is not allowed for this upload' } } });
    mount();
    await uploadInto("W-9");
    expect((await screen.findByRole("alert")).textContent).toBe('W-9 was not uploaded: docType "W9" is not allowed for this upload');
  });
});
