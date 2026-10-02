// carrier-portal-upgrade G32 — insurance and expiry dates on the Compliance page
// show their own calendar day west of UTC.
//
// Expiry dates are stored at UTC midnight. new Date(d).toLocaleDateString()
// rendered them the day before for any carrier west of UTC: a policy expiring on
// Dec 31 read Dec 30. TZ is pinned to America/Los_Angeles so the case fails
// when the bug is present (in UTC the bug is invisible).

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post: vi.fn(), patch: vi.fn(), put: vi.fn() } }));
vi.mock("@/hooks/useStepUp", () => ({ useStepUp: () => ({ run: vi.fn(), prompt: null }) }));
vi.mock("@/components/carrier", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, StepUpPrompt: () => null };
});

import CompliancePage from "./page";

const EXPIRY = "2026-12-31T00:00:00.000Z";

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><CompliancePage /></QueryClientProvider>);
}

const TZ = process.env.TZ;
beforeEach(() => {
  process.env.TZ = "America/Los_Angeles";
  get.mockImplementation((url: string) =>
    Promise.resolve({
      data: url.startsWith("/carrier-compliance/overview")
        ? { carrier: { tier: "SILVER" }, insurance: { status: "VALID", expiry: EXPIRY, autoLiabilityExpiry: EXPIRY }, alerts: [] }
        : url.startsWith("/carrier-compliance/expiration-calendar")
          ? { expirations: [{ type: "Auto Liability", date: EXPIRY, status: "VALID" }] }
          : url.startsWith("/carrier/vetting-report")
            ? null // no report yet: the card is not drawn
            : {},
    }),
  );
});
afterEach(() => { if (TZ === undefined) delete process.env.TZ; else process.env.TZ = TZ; });

describe("Compliance dates (G32)", () => {
  it("shows a UTC-midnight expiry as its own day in Los Angeles", async () => {
    mount();
    expect((await screen.findAllByText(/Dec 31, 2026/)).length).toBeGreaterThan(0);
    expect(screen.queryByText(/12\/30\/2026|Dec 30, 2026/)).toBeNull();
  });
});
