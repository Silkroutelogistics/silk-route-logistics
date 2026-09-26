/**
 * v3.8.bky — the Order Builder's ?customerId= deep link selects only an
 * approved, active customer. The page's own customer search lists approved
 * customers only (context=crm); this link used to skip that and select
 * whatever the id named.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams("customerId=cust-x"),
  usePathname: () => "/dashboard/orders",
}));

import OrdersPage from "./page";

// The whole Order Builder renders here. Under a full parallel run it can take
// several seconds to settle, so the waits are sized for that, not for a quiet box.
const SLOW = { timeout: 10_000 };
const CASE_MS = 30_000;

function mount(customer: Record<string, unknown>) {
  get.mockImplementation(async (url: string) => {
    if (url === "/customers/cust-x") return { data: { id: "cust-x", name: "Acme Foods", status: "Active", ...customer } };
    return { data: {} };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrdersPage />
    </QueryClientProvider>,
  );
}

const fetchedNotes = () => get.mock.calls.some(([u]) => u === "/customers/cust-x/notes/for-load");

describe("Order Builder — ?customerId= deep link", () => {
  beforeEach(() => vi.clearAllMocks());

  it("an approved customer is selected", async () => {
    mount({ onboardingStatus: "APPROVED", isActive: true });
    expect(await screen.findByRole("button", { name: "Change" }, SLOW)).toBeTruthy();
    expect(screen.getByText("Acme Foods")).toBeTruthy();
    await waitFor(() => expect(fetchedNotes()).toBe(true), SLOW);
    expect(screen.queryByRole("alert")).toBeNull();
  }, CASE_MS);

  it("a customer pending approval is not selected, and the page says why", async () => {
    mount({ onboardingStatus: "PENDING", isActive: true });
    expect(await screen.findByRole("alert", {}, SLOW)).toHaveTextContent(/Acme Foods: This customer is pending, not approved/);
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
    expect(fetchedNotes()).toBe(false);
  }, CASE_MS);

  it("an inactive customer is not selected either", async () => {
    mount({ onboardingStatus: "APPROVED", isActive: false });
    expect(await screen.findByRole("alert", {}, SLOW)).toHaveTextContent(/inactive/);
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  }, CASE_MS);
});
