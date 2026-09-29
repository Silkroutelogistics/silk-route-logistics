/**
 * v3.8.bog — the direct-create exit (Waterfall / Load Board / DAT) sends every
 * fact the Rate Confirmation prints, and the load's totals rather than line 1's.
 *
 * Renders the real Order Builder resumed onto a complete two-line draft, presses
 * Load Board, and reads the body of the POST /loads the page makes.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get, post, patch } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post, patch, put: vi.fn(), delete: vi.fn() } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams("resume=ord-1"),
  usePathname: () => "/dashboard/orders",
}));

import OrdersPage from "./page";
import { emptyLineItem, emptyOrderForm, loadTotals } from "./types";

const line = (pieces: string, weight: string, description: string, packageType = "PLT") => ({
  ...emptyLineItem(), pieces, weight, description, packageType,
});

const DRAFT = {
  ...emptyOrderForm(),
  customerId: "cust-bee",
  originCity: "Irving", originState: "TX", originZip: "75063", originCompany: "Dallas One", originContactPhone: "9724903300",
  destCity: "Northlake", destState: "TX", destZip: "76262", destCompany: "Mainfreight", destContactPhone: "9723332500",
  pickupDate: "2026-09-27", pickupTimeStart: "21:00", deliveryDate: "2026-09-28", deliveryTimeStart: "08:00",
  equipmentType: "Dry Van 53'",
  customerRate: "700", targetCost: "400", distance: "34",
  pickupAppointment: "24565412", deliveryAppointment: "DA-99",
  pickupNumber: "PU-7781", shipperReference: "SR-1", deliveryReference: "DR-2",
  cargoValue: "84000",
  driverInstructions: "Check in at the guard shack.",
  poNumbers: ["PO1872"],
  lineItems: [line("10", "20000", "OTC Supplements"), line("8", "14500", "Vitamins")],
};

function mount() {
  get.mockImplementation(async (url: string) => {
    if (url === "/orders/ord-1") {
      return { data: { order: { id: "ord-1", customerId: "cust-bee", customer: { id: "cust-bee", name: "Beekeepers" }, formData: DRAFT, loadId: null } } };
    }
    return { data: {} };
  });
  patch.mockResolvedValue({ data: { order: { id: "ord-1" } } });
  post.mockImplementation(async (url: string) => (url === "/loads" ? { data: { id: "load-1" } } : { data: {} }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrdersPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("Order Builder — posting straight to the load board", () => {
  it("sends every fact the rate confirmation prints, with the load's totals", async () => {
    mount();
    const button = await screen.findByRole("button", { name: /^Load Board$/ });
    await waitFor(() => expect(button).not.toBeDisabled());
    fireEvent.click(button);

    await waitFor(() => expect(post.mock.calls.some(([u]) => u === "/loads")).toBe(true));
    const body = post.mock.calls.find(([u]) => u === "/loads")![1];
    expect(body).toMatchObject({
      pickupAppointment: "24565412",
      deliveryAppointment: "DA-99",
      pickupNumber: "PU-7781",
      shipperReference: "SR-1",
      deliveryReference: "DR-2",
      cargoValue: 84000,
      driverInstructions: "Check in at the guard shack.",
      weight: 34500, // both lines, not line 1's 20,000
      pieces: 18,
      pallets: 18,
    });
  });
});

describe("loadTotals", () => {
  it("sums every line and says null, not zero, when nothing was entered", () => {
    expect(loadTotals([{ weight: "20000", pieces: "10" }, { weight: "14500", pieces: "8" }])).toEqual({ weight: 34500, pieces: 18 });
    expect(loadTotals([{ weight: "", pieces: "" }])).toEqual({ weight: null, pieces: null });
  });
});
