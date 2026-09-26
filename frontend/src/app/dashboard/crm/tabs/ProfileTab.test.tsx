/**
 * v3.8.bkq — editing a customer's profile saves, and a refusal says why.
 *
 * The defect: the form held the credit limit as `creditLimit ?? 0` and sent 0,
 * which the validator refuses (it must be positive). So on any customer
 * without a credit limit, EVERY profile edit failed, and the form showed
 * nothing; it just stayed open.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get, patch, post } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, patch, post } }));
vi.mock("@/components/ui/AddressAutocomplete", () => ({ AddressAutocomplete: () => null }));

import { ProfileTab } from "./ProfileTab";

const CUSTOMER: any = {
  id: "cust-bee", name: "Beekeepers", type: "SHIPPER", status: "Active", industry: "Food", industryType: null,
  rating: 0, address: "1 Hive Rd", city: "Hebron", state: "KY", zip: "41048",
  billingAddress: null, billingCity: null, billingState: null, billingZip: null,
  creditLimit: null, paymentTerms: "Net 30", taxId: "", accountRepId: null, accountRep: null,
  minMarginPercent: null, defaultAccessorialRates: null,
};

function mount(customer = CUSTOMER) {
  get.mockResolvedValue({ data: { users: [] } });
  const onChange = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProfileTab customer={customer} onChange={onChange} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: /edit profile/i }));
  return onChange;
}

function creditInput(): HTMLInputElement {
  return screen.getByText("Credit limit", { selector: "span" }).parentElement!.querySelector("input")!;
}

describe("ProfileTab edit — the credit limit and a refused save", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a customer with no credit limit saves, and the limit is not sent at all", async () => {
    patch.mockResolvedValue({ data: {} });
    const onChange = mount();
    expect(creditInput().value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1]).not.toHaveProperty("creditLimit");
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("a positive limit is sent as a number, $ and commas allowed", async () => {
    patch.mockResolvedValue({ data: {} });
    mount();
    fireEvent.change(creditInput(), { target: { value: "$25,000" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0][1].creditLimit).toBe(25000);
  });

  it("zero is caught before sending, with a message", async () => {
    mount();
    fireEvent.change(creditInput(), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/more than \$0, or left blank/i);
    expect(patch).not.toHaveBeenCalled();
  });

  it("a refusal from the server is shown, naming the field", async () => {
    patch.mockRejectedValue({ response: { data: { error: "Validation failed", details: [{ field: "taxId", message: "Invalid" }] } } });
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Not saved: taxId — Invalid");
  });
});
