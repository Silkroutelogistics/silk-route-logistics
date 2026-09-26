/**
 * v3.8.bkn — the quote goes to a contact the AE picks from the list, and
 * the page says it was sent only when the server says so.
 *
 * Renders the real Order Builder, resumed onto a draft that has a customer.
 * The API is mocked by URL, so what is asserted is the request the page makes
 * and what it shows the AE afterwards.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post, patch, put: vi.fn(), delete: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams("resume=ord-1"),
  usePathname: () => "/dashboard/orders",
}));

import OrdersPage from "./page";

type Recipient = { id: string; name: string; email: string; isPrimary: boolean; title: string | null };
const JANE: Recipient = { id: "ct-jane", name: "Jane Ops", email: "jane@bee.test", isPrimary: true, title: "Logistics" };
const SAM: Recipient = { id: "ct-sam", name: "Sam Buyer", email: "sam@bee.test", isPrimary: false, title: null };

function preview(recipients: Recipient[], asked?: string) {
  const selected = recipients.find((r) => r.id === asked) ?? recipients[0] ?? null;
  return {
    subject: "Quote Q-1001 · Northlake, TX → Hebron, KY",
    html: `<p>Hello ${selected?.name ?? "Beekeepers"},</p>`,
    lane: "Northlake, TX → Hebron, KY",
    recipients,
    selectedContactId: selected?.id ?? null,
    recipientEmail: selected?.email ?? null,
    recipientName: selected?.name ?? null,
    orderNumber: "Q-1001",
  };
}

function mount(recipients: Recipient[] = [JANE, SAM]) {
  get.mockImplementation(async (url: string) => {
    if (url === "/orders/ord-1") {
      return { data: { order: { id: "ord-1", customerId: "cust-bee", customer: { id: "cust-bee", name: "Beekeepers" }, formData: { customerId: "cust-bee" }, loadId: null } } };
    }
    if (url.startsWith("/orders/ord-1/quote-preview")) {
      const asked = new URLSearchParams(url.split("?")[1] ?? "").get("contactId") ?? undefined;
      return { data: preview(recipients, asked) };
    }
    return { data: {} };
  });
  patch.mockResolvedValue({ data: { order: { id: "ord-1" } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrdersPage />
    </QueryClientProvider>,
  );
}

async function openReview() {
  const btn = await screen.findByRole("button", { name: /send quote/i });
  await waitFor(() => expect((btn as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(btn);
  return screen.findByRole("dialog", { name: "Quote preview" });
}

describe("Order Builder — sending a quote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends to the contact the AE picked, and names them in the confirmation", async () => {
    post.mockResolvedValue({ data: { order: { orderNumber: "Q-1001" }, sentTo: { name: "Sam Buyer", email: "sam@bee.test" } } });
    mount();
    const dialog = await openReview();
    const select = within(dialog).getByLabelText("Quote recipient") as HTMLSelectElement;
    expect(select.value).toBe("ct-jane"); // primary by default

    fireEvent.change(select, { target: { value: "ct-sam" } });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/orders/ord-1/quote-preview?contactId=ct-sam"));
    await waitFor(() => expect((within(dialog).getByLabelText("Quote recipient") as HTMLSelectElement).value).toBe("ct-sam"));

    fireEvent.click(within(dialog).getByRole("button", { name: /send now/i }));
    await waitFor(() => expect(post).toHaveBeenCalledWith("/orders/ord-1/send-quote", { contactId: "ct-sam" }));
    expect(await screen.findByText(/Quote Q-1001 sent to Sam Buyer <sam@bee\.test>\./)).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Quote preview" })).toBeNull();
  });

  it("a refused send keeps the review open and says why — no 'sent' banner", async () => {
    post.mockRejectedValue({ response: { data: { error: "That contact is not on this customer's contact list. No quote was sent." } } });
    mount();
    const dialog = await openReview();
    fireEvent.click(within(dialog).getByRole("button", { name: /send now/i }));
    expect(await within(dialog).findByRole("alert")).toBeTruthy();
    expect(within(dialog).getByRole("alert").textContent).toMatch(/No quote was sent/);
    expect(screen.queryByText(/sent to/i)).toBeNull();
  });

  it("with no eligible contact, says so and cannot send", async () => {
    mount([]);
    const dialog = await openReview();
    expect(within(dialog).getByText(/no contact on this customer's list can receive a quote/i)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: /send now/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(dialog).queryByLabelText("Quote recipient")).toBeNull();
  });
});
