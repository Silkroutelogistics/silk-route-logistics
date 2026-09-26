/**
 * v3.8.bki — no check call is logged, or due, on a load that is not running.
 * The fixture carries a PENDING schedule an hour overdue: on a live load that is
 * one call due now, and on a cancelled load it is a schedule the reversal has
 * not reached yet, which must not read as work waiting.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));

import { CheckCallsTab } from "./CheckCallsTab";

function mount(status: string) {
  const load = {
    status,
    checkCalls: [],
    checkCallSchedules: [
      { id: "s1", status: "PENDING", type: "IN_TRANSIT", scheduledTime: new Date(Date.now() - 3_600_000).toISOString() },
    ],
  };
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <CheckCallsTab load={load} loadId="ld-1" onChange={() => {}} />
    </QueryClientProvider>,
  );
}

function card(label: string): string {
  return screen.getByText(label).parentElement?.querySelector("div:nth-child(2)")?.textContent ?? "";
}

describe("T&T CheckCallsTab on a closed load", () => {
  it.each(["CANCELLED", "TONU", "COMPLETED"])("%s: no Log call, and nothing is due", (status) => {
    mount(status);
    expect(screen.queryByRole("button", { name: /log call/i })).toBeNull();
    expect(card("Due now")).toBe("—");
    expect(card("Upcoming")).toBe("—");
    expect(screen.getByText(/no check calls are due/i)).toBeTruthy();
  });

  it("IN_TRANSIT keeps Log call and counts the overdue schedule (control)", () => {
    mount("IN_TRANSIT");
    expect(screen.getByRole("button", { name: /log call/i })).toBeTruthy();
    expect(card("Due now")).toBe("1");
  });
});
