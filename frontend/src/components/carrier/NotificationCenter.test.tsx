// carrier-portal-upgrade M2 — the carrier notification center.
//
// Owner ruling: unread count on the bell, a list panel, mark read and mark all
// read, each item linking to its load or page, fetched on load and on window
// focus with no polling loop. A real QueryClient is used, so "refetch on focus"
// and "no interval" are measured by request counts rather than by reading the
// options object.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";

const { get, patch, push } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, patch } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { NotificationCenter } from "./NotificationCenter";

const rows = [
  { id: "n1", title: "Tender offer", message: "SRL-1 Chicago to Dallas", actionUrl: "/carrier/dashboard/tenders", readAt: null, createdAt: new Date().toISOString() },
  { id: "n2", title: "Payment received", message: "SRL-0 paid", actionUrl: "/accounting/disputes", readAt: null, createdAt: new Date().toISOString() },
  { id: "n3", title: "Old", message: "seen", actionUrl: null, readAt: "2026-09-30T00:00:00Z", createdAt: "2026-09-30T00:00:00Z" },
];

function mount(enabled = true) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NotificationCenter enabled={enabled} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  get.mockResolvedValue({ data: rows });
  patch.mockResolvedValue({ data: { success: true } });
});
afterEach(() => focusManager.setFocused(undefined));

describe("the bell", () => {
  it("shows the unread count and names it", async () => {
    mount();
    expect(await screen.findByTestId("notif-badge")).toHaveProperty("textContent", "2");
    expect(screen.getByRole("button", { name: "Notifications, 2 unread" })).toBeTruthy();
  });

  it("renders nothing for a carrier without the operational chrome", () => {
    mount(false);
    expect(screen.queryByRole("button", { name: /Notifications/ })).toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});

describe("fetching", () => {
  it("fetches on load and again on window focus, and never on a timer", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mount();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await act(async () => { vi.advanceTimersByTime(10 * 60_000); });
    expect(get).toHaveBeenCalledTimes(1);
    act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    vi.useRealTimers();
  });
});

describe("the panel", () => {
  it("opens an item to its page and marks it read", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Notifications, 2 unread/ }));
    fireEvent.click(screen.getByText("Tender offer"));
    expect(patch).toHaveBeenCalledWith("/notifications/n1/read");
    expect(push).toHaveBeenCalledWith("/carrier/dashboard/tenders");
  });

  it("never navigates a carrier to a non-carrier page; the row only marks itself read", async () => {
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Notifications, 2 unread/ }));
    fireEvent.click(screen.getByRole("button", { name: /Payment received.*Mark as read/ }));
    expect(patch).toHaveBeenCalledWith("/notifications/n2/read");
    expect(push).not.toHaveBeenCalled();
  });

  it("marks all read once, however many times it is clicked", async () => {
    let release: () => void = () => {};
    patch.mockImplementation((url: string) => (url === "/notifications/read-all" ? new Promise((r) => { release = () => r({ data: {} }); }) : Promise.resolve({ data: {} })));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /Notifications, 2 unread/ }));
    const all = screen.getByRole("button", { name: /Mark all read/ });
    fireEvent.click(all);
    fireEvent.click(all);
    fireEvent.click(all);
    expect(patch.mock.calls.filter((c) => c[0] === "/notifications/read-all")).toHaveLength(1);
    await act(async () => release());
  });

  it("says so when there is nothing to show", async () => {
    get.mockResolvedValue({ data: [] });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText("No notifications yet")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Mark all read/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
