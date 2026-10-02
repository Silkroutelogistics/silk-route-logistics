// carrier-portal-upgrade M1 — a locked feature is visible, explained, and inert.
//
// The A11 walk found controls with nothing behind them: the header search box
// had no handler, and two Settings saves PUT routes that do not exist. The owner
// ruled they are LOCKED, not removed, from one flag file. This holds the three
// promises a lock makes: the live control is not rendered, the lock says why
// (reachable by tap, not only hover), and a locked page sends the carrier to the
// Dashboard. One route is locked here by mocking the flag file, because none is
// locked in production today and the redirect must still be proven.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor, screen, fireEvent } from "@testing-library/react";

const { replace, pathname } = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: { value: "/carrier/dashboard" },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname.value,
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) =>
    queryKey[0] === "carrier-activation" ? { data: { requiresTotpEnrollment: false, requiresActivation: false } } : { data: [] },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
const authState = {
  user: { id: "u1", firstName: "A", lastName: "B", carrierProfile: { onboardingStatus: "APPROVED", companyName: "Acme" } },
  loadUser: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn(),
};
vi.mock("@/hooks/useCarrierAuth", () => ({
  useCarrierAuth: Object.assign(() => authState, { getState: () => authState }),
}));
vi.mock("@/hooks/useSessionTimeout", () => ({ useSessionTimeout: () => ({}) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() }, isLoginRedirectInFlight: () => false }));
vi.mock("@/components/carrier", () => ({ CarrierSidebar: () => null }));
vi.mock("@/components/ui/Logo", () => ({ Logo: () => null }));
vi.mock("@/components/ui/AuthRefreshBanner", () => ({ AuthRefreshBanner: () => null }));
vi.mock("@/components/MarcoPolo", () => ({ MarcoPolo: () => null }));
vi.mock("@/lib/carrierPortalFeatures", async (orig) => {
  const actual = (await orig()) as any;
  const locked = { enabled: false, reason: "Not built yet.", route: "/carrier/dashboard/messaging" };
  return {
    ...actual,
    lockedFeatureForPath: (p: string) => (p === locked.route || p?.startsWith(`${locked.route}/`) ? locked : actual.lockedFeatureForPath(p)),
  };
});

import CarrierDashboardLayout from "./layout";
import { CARRIER_PORTAL_FEATURES, isFeatureEnabled, lockedFeatureForPath } from "@/lib/carrierPortalFeatures";

async function mount() {
  render(<CarrierDashboardLayout>{null}</CarrierDashboardLayout>);
  await waitFor(() => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  pathname.value = "/carrier/dashboard";
});

describe("the flag file", () => {
  it("locks the three features the A11 walk found broken, each with a reason", () => {
    for (const key of ["headerSearch", "contactPhoneEdit", "notificationPreferences"] as const) {
      expect(isFeatureEnabled(key)).toBe(false);
      expect(CARRIER_PORTAL_FEATURES[key].reason.length).toBeGreaterThan(20);
    }
  });
});

describe("Messages (owner ruling F2)", () => {
  it("is locked as a whole page, with a route and a reason", () => {
    expect(isFeatureEnabled("messaging")).toBe(false);
    expect(CARRIER_PORTAL_FEATURES.messaging.route).toBe("/carrier/dashboard/messaging");
    expect(CARRIER_PORTAL_FEATURES.messaging.reason).toMatch(/SRL rep/);
  });
});

describe("the header search", () => {
  it("renders no search box while locked, and a lock that explains itself on tap", async () => {
    await mount();
    expect(screen.queryByPlaceholderText(/Search loads/i)).toBeNull();
    const lock = screen.getByRole("button", { name: /Search: Available soon/i });
    expect(lock.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(lock);
    expect(screen.getByRole("tooltip").textContent).toMatch(/not available yet/i);
  });
});

describe("a locked page", () => {
  it("sends the carrier to the Dashboard", async () => {
    pathname.value = "/carrier/dashboard/messaging";
    await mount();
    expect(replace).toHaveBeenCalledWith("/carrier/dashboard");
  });

  it("leaves an unlocked page alone", async () => {
    pathname.value = "/carrier/dashboard/my-loads";
    await mount();
    expect(replace).not.toHaveBeenCalledWith("/carrier/dashboard");
    expect(lockedFeatureForPath("/carrier/dashboard/my-loads")).toBeNull();
  });
});

describe("the header icon buttons", () => {
  it("are named for assistive technology", async () => {
    await mount();
    expect(screen.getByRole("button", { name: /^Notifications/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log out" })).toBeTruthy();
  });
});
