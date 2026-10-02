// carrier-portal-upgrade F2 (M4/M5) — the load board on a phone.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post } }));

import LoadboardPage from "./page";

const LOAD = {
  id: "l1", loadNumber: "121498", referenceNumber: "SRL-121498", visibility: "open", originCity: "Kalamazoo", originState: "MI",
  destCity: "Dallas", destState: "TX", equipmentType: "Dry Van", weight: 40000, commodity: "Paper", distance: 1000,
  pickupDate: "2026-10-05T00:00:00.000Z", deliveryDate: "2026-10-07T00:00:00.000Z", carrierRate: 2500,
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><LoadboardPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: { loads: [LOAD] } });
});

describe("Load Board", () => {
  it("shows the rate per mile and a copyable load number", async () => {
    mount();
    expect(await screen.findByText("($2.50/mi)")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy load number" })).toBeTruthy();
  });

  it("opens the bid form as a bottom sheet on a phone, with labelled fields", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Bid" }));
    const dialog = screen.getByRole("dialog", { name: "Submit bid" });
    expect(dialog.parentElement!.className).toMatch(/\bitems-end\b.*\bmd:items-center\b/);
    expect(dialog.className).toMatch(/\brounded-t-xl\b/);
    expect((screen.getByLabelText("Your bid rate ($)") as HTMLInputElement).value).toBe("2500");
  });

  it("sends a bid once, and shows the reason when it fails", async () => {
    let fail: (e: unknown) => void = () => {};
    post.mockImplementation(() => new Promise((_r, rej) => { fail = rej; }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Bid" }));
    const send = screen.getByRole("button", { name: "Submit bid" });
    fireEvent.click(send);
    fireEvent.click(send);
    await waitFor(() => expect(post).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(post).toHaveBeenCalledTimes(1);
    fail({ response: { data: { error: "Load is no longer open" } } });
    expect((await screen.findByRole("alert")).textContent).toMatch(/no longer open|Could not send/);
  });

  it("closes the bid form with Escape", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Bid" }));
    // Open first: without this the case passed on the old page, which had no
    // dialog role at all, so "no dialog after Escape" was true before Escape.
    expect(screen.getByRole("dialog", { name: "Submit bid" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
