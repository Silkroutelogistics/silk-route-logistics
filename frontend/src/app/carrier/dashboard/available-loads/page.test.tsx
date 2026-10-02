// carrier-portal-upgrade M4/M5/G28 — Available Loads on a phone and from a keyboard.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post } }));

import AvailableLoadsPage from "./page";

const LOAD = {
  id: "l1", referenceNumber: "SRL-121498", equipmentType: "Dry Van", originCity: "Kalamazoo", originState: "MI",
  destCity: "Dallas", destState: "TX", pickupDate: "2026-10-05T00:00:00.000Z", weight: 40000, distance: 1000, carrierRate: 2500,
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><AvailableLoadsPage /></QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url.startsWith("/carrier-loads/available")
        ? { loads: [LOAD], total: 1, totalPages: 1 }
        : { ...LOAD, poster: { firstName: "Ann", lastName: "Ruiz", phone: "2695550101", email: "ann@srl.invalid" } },
    }),
  );
});

describe("Available Loads", () => {
  it("is one column under lg, with no fixed-width grid", () => {
    const { container } = mount();
    const grid = container.querySelector(".grid.grid-cols-1");
    expect(grid?.className).toMatch(/lg:grid-cols-\[1fr_380px\]/);
    expect(container.innerHTML).not.toMatch(/"grid grid-cols-\[1fr_380px\]/);
  });

  it("a load card is chosen from the keyboard, and shows rate per mile", async () => {
    mount();
    const card = await screen.findByRole("button", { name: /Load SRL-121498, Kalamazoo to Dallas/ });
    expect(screen.getByText("($2.50/mi)")).toBeTruthy();
    fireEvent.keyDown(card, { key: "Enter" });
    await waitFor(() => expect(get).toHaveBeenCalledWith("/carrier-loads/l1"));
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByRole("link", { name: "Call Ann Ruiz" })).toBeTruthy();
  });

  it("accepts a load once, however many times Accept is clicked", async () => {
    let release: () => void = () => {};
    post.mockImplementation(() => new Promise((r) => { release = () => r({ data: {} }); }));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Load SRL-121498/ }));
    const accept = await screen.findByRole("button", { name: "Accept Load" });
    fireEvent.click(accept);
    fireEvent.click(accept);
    // react-query runs mutationFn after a microtask, so wait for the first call
    // before counting; a second one would have to have arrived by then too.
    await waitFor(() => expect(post).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 20));
    expect(post.mock.calls.filter((c) => c[0] === "/carrier-loads/l1/accept")).toHaveLength(1);
    release();
  });

  it("explains why Post Capacity is disabled, and uses no contraction", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /Post My Capacity/ }));
    expect((screen.getByRole("button", { name: /Post Capacity$/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Add your city, state and available date first.")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/you're|you&apos;re/);
  });
});
