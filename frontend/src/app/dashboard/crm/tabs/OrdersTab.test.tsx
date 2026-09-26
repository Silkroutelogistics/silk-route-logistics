/**
 * v3.8.bky — the Orders tab's "New order" button starts an order only for
 * an approved, active customer. It was a plain link to the Order Builder's
 * ?customerId= deep link, which skipped the approved-only customer search.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

import { OrdersTab } from "./OrdersTab";

function mount(props: { onboardingStatus?: string | null; isActive?: boolean | null }) {
  get.mockResolvedValue({ data: { loads: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrdersTab customerId="cust-bee" {...props} />
    </QueryClientProvider>,
  );
}

describe("CRM Orders tab — New order", () => {
  it("an approved customer gets the link to the Order Builder", async () => {
    mount({ onboardingStatus: "APPROVED", isActive: true });
    const link = await screen.findByRole("link", { name: /new order/i });
    expect(link.getAttribute("href")).toBe("/dashboard/orders?customerId=cust-bee");
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("a customer pending approval gets no link, a disabled button, and the reason", async () => {
    mount({ onboardingStatus: "PENDING", isActive: true });
    expect(await screen.findByRole("note")).toHaveTextContent(/pending, not approved/);
    expect(screen.queryByRole("link", { name: /new order/i })).toBeNull();
    expect((screen.getByRole("button", { name: /new order/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("an inactive customer is refused even though approved", async () => {
    mount({ onboardingStatus: "APPROVED", isActive: false });
    expect(await screen.findByRole("note")).toHaveTextContent(/inactive/);
    expect(screen.queryByRole("link", { name: /new order/i })).toBeNull();
  });

  // The rule fails closed, so a drawer that stops passing the status would
  // disable New order for every customer, approved ones included.
  it("the customer drawer passes both fields the rule reads", () => {
    const drawer = fs.readFileSync(path.join(__dirname, "..", "CustomerDrawer.tsx"), "utf8");
    const mount = drawer.split(/\r?\n/).find((l) => l.includes("<OrdersTab"));
    expect(mount).toBeTruthy();
    expect(mount).toContain("onboardingStatus={customer.onboardingStatus}");
    expect(mount).toContain("isActive={customer.isActive}");
  });
});
