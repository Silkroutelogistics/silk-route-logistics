/**
 * v3.8.bko — the payment-reminder switch as an AE sees it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get, put, role } = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), role: { current: "ADMIN" } }));
vi.mock("@/lib/api", () => ({ api: { get, put } }));
vi.mock("@/hooks/useAuthStore", () => ({ useAuthStore: () => ({ user: { role: role.current } }) }));

import { ReminderEmailSwitch } from "./ReminderEmailSwitch";

function mount(enabled = false) {
  get.mockResolvedValue({ data: { enabled, updatedAt: null } });
  put.mockImplementation(async (_url: string, body: { enabled: boolean }) => ({ data: { enabled: body.enabled, updatedAt: null } }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ReminderEmailSwitch />
    </QueryClientProvider>,
  );
}

describe("ReminderEmailSwitch", () => {
  beforeEach(() => { vi.clearAllMocks(); role.current = "ADMIN"; });
  afterEach(() => vi.restoreAllMocks());

  it("reads Off by default and says no customer is emailed", async () => {
    mount(false);
    expect(await screen.findByText("Off")).toBeTruthy();
    expect(screen.getByText(/no customer is emailed about an unpaid invoice/i)).toBeTruthy();
  });

  it("an admin turns it on only after confirming what it will do", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    mount(false);
    // Wait for the loaded state: the button is disabled while the switch loads,
    // and a click on it then would prove nothing.
    await screen.findByText("Off");
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    expect(confirm.mock.calls[0][0]).toMatch(/every customer with an unpaid invoice/i);
    await waitFor(() => expect(put).toHaveBeenCalledWith("/accounting/reminder-emails", { enabled: true }));
    expect(await screen.findByText("On")).toBeTruthy();
  });

  it("a declined confirm changes nothing", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    mount(false);
    // Wait for the loaded state: the button is disabled while the switch loads,
    // and a click on it then would prove nothing.
    await screen.findByText("Off");
    fireEvent.click(screen.getByRole("button", { name: "Turn on" }));
    // The mutation calls put asynchronously: assert only after pending work has
    // had its chance, or a broken gate that DOES send would still pass here.
    await new Promise((r) => setTimeout(r, 50));
    expect(put).not.toHaveBeenCalled();
    expect(screen.getByText("Off")).toBeTruthy();
  });

  it("turning it off does not ask", async () => {
    const confirm = vi.spyOn(window, "confirm");
    mount(true);
    fireEvent.click(await screen.findByRole("button", { name: "Turn off" }));
    await waitFor(() => expect(put).toHaveBeenCalledWith("/accounting/reminder-emails", { enabled: false }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("accounting sees the state but has no button", async () => {
    role.current = "ACCOUNTING";
    mount(false);
    expect(await screen.findByText("Off")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText(/only an admin can change this/i)).toBeTruthy();
  });
});
