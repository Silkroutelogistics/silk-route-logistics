/**
 * v3.8.bjx — `?load=<id>` opens that load's drawer.
 *
 * The CRM Loads tab linked every row to a bare /dashboard/track-trace, which
 * this page never read, so an AE clicking a cancelled or TONU load landed on the
 * Active board ("No loads match your filters") — the board has no tab for those
 * statuses at all. The page now reads the param, opens the drawer by id, and
 * strips the param so a refresh after closing does not reopen it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn().mockResolvedValue({ data: { loads: [], summary: {} } }) } }));
vi.mock("./BoardTable", () => ({ BoardTable: () => <div data-testid="board" /> }));
vi.mock("@/components/accessorials/PendingAccessorialQueue", () => ({ PendingAccessorialQueue: () => null }));
vi.mock("./LoadDetailDrawer", () => ({
  LoadDetailDrawer: ({ loadId }: { loadId: string | null }) => <div data-testid="drawer">{loadId ?? "closed"}</div>,
}));

import TrackTracePage from "./page";

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <TrackTracePage />
    </QueryClientProvider>,
  );
}

describe("Track & Trace deep link", () => {
  beforeEach(() => window.history.replaceState(null, "", "/dashboard/track-trace"));

  it("opens the drawer for the load named in ?load= and strips the param", async () => {
    window.history.replaceState(null, "", "/dashboard/track-trace?load=load-121496");
    mount();
    expect((await screen.findByTestId("drawer")).textContent).toBe("load-121496");
    expect(window.location.search).toBe("");
  });

  it("keeps any other query params when stripping", async () => {
    window.history.replaceState(null, "", "/dashboard/track-trace?load=load-1&foo=bar");
    mount();
    expect((await screen.findByTestId("drawer")).textContent).toBe("load-1");
    expect(window.location.search).toBe("?foo=bar");
  });

  it("with no param, the drawer stays closed (unchanged)", async () => {
    mount();
    expect((await screen.findByTestId("drawer")).textContent).toBe("closed");
  });
});

describe("Track & Trace History deep link (v3.8.bkg)", () => {
  beforeEach(() => window.history.replaceState(null, "", "/dashboard/track-trace"));

  const boardCalls = async () => {
    const { api } = await import("@/lib/api");
    return (api.get as any).mock.calls.filter((c: any[]) => c[0] === "/track-trace/loads").map((c: any[]) => c[1].params);
  };

  it("?tab=history&customer=<id> asks the board for that customer's History, then strips both", async () => {
    const { api } = await import("@/lib/api");
    (api.get as any).mockClear();
    window.history.replaceState(null, "", "/dashboard/track-trace?tab=history&customer=cust-bee");
    mount();
    await vi.waitFor(async () => {
      const calls = await boardCalls();
      expect(calls.some((p: any) => p.tab === "history" && p.shipperId === "cust-bee")).toBe(true);
    });
    expect(window.location.search).toBe("");
    expect((await screen.findByTestId("drawer")).textContent).toBe("closed");
  });

  it("an unknown ?tab= is ignored — the board stays on Active rather than passing it through", async () => {
    const { api } = await import("@/lib/api");
    (api.get as any).mockClear();
    window.history.replaceState(null, "", "/dashboard/track-trace?tab=everything");
    mount();
    await vi.waitFor(async () => expect((await boardCalls()).length).toBeGreaterThan(0));
    const calls = await boardCalls();
    expect(calls.every((p: any) => p.tab === "active")).toBe(true);
  });

  it("the History tab is on the board", async () => {
    mount();
    expect(await screen.findByRole("button", { name: /history/i })).toBeTruthy();
  });
});
