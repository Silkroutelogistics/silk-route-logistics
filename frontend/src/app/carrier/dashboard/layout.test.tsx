// Which wall a carrier hits, and in what order (Arc 12 Phase 1).
//
// REPLACES A STATIC GUARD. Arc 11 could only assert that the string
// "if (mustEnroll) return;" appeared twice in the layout, because there was no
// frontend runner. That proved the rule was written down. It could not prove the
// redirect fires, or that it wins.
//
// WHY PRECEDENCE IS THE THING UNDER TEST. Three gates redirect here — status
// routing, the activation wall, and enrollment — and each calls router.replace.
// Without an explicit rule the winner is whichever effect React runs last, which
// is not a way to decide anything. The failure is silent: a PENDING carrier
// without an authenticator, if status routing won, would be sent to the
// application-status page — and since the backend exempts that route, they would
// sit on the one page that loads, with no sidebar and no route out, never
// reaching the screen that lets them enroll. Nothing errors. They are just stuck.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const { replace, pathname, activationData, authState } = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: { value: "/carrier/dashboard" },
  activationData: { value: undefined as any },
  authState: { value: {} as any },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => pathname.value,
}));

// The layout runs two queries: notifications and activation-status. Only the
// second decides routing, so the mock keys on it and returns nothing for the
// other — which also proves the routing does not depend on notifications
// having loaded.
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) =>
    queryKey[0] === "carrier-activation" ? { data: activationData.value } : { data: [] },
}));

vi.mock("@/hooks/useCarrierAuth", () => ({
  useCarrierAuth: Object.assign(() => authState.value, { getState: () => authState.value }),
}));

vi.mock("@/hooks/useSessionTimeout", () => ({ useSessionTimeout: () => ({}) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));

// Chrome, stubbed. This test is about routing, and rendering the real sidebar
// would drag in a dozen unrelated modules whose failures would look like
// routing failures.
vi.mock("@/components/carrier", () => ({ CarrierSidebar: () => null }));
vi.mock("@/components/ui/Logo", () => ({ Logo: () => null }));
vi.mock("@/components/ui/AuthRefreshBanner", () => ({ AuthRefreshBanner: () => null }));
vi.mock("@/components/MarcoPolo", () => ({ MarcoPolo: () => null }));

import CarrierDashboardLayout from "./layout";

const SECURITY = "/carrier/dashboard/security";
const STATUS = "/carrier/dashboard/application-status";
const ACTIVATION = "/carrier/dashboard/activation";

function carrier(onboardingStatus: string) {
  return {
    user: {
      id: "u1",
      firstName: "A",
      lastName: "B",
      carrierProfile: { onboardingStatus, companyName: "Acme" },
    },
    loadUser: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
  };
}

async function mount() {
  render(<CarrierDashboardLayout>{null}</CarrierDashboardLayout>);
  // The gates run in effects; give them a tick to settle.
  await waitFor(() => {});
}

beforeEach(() => {
  vi.clearAllMocks();
  pathname.value = "/carrier/dashboard";
  activationData.value = undefined;
  authState.value = carrier("APPROVED");
});

describe("the enrollment wall", () => {
  it("sends an unenrolled carrier to the enrollment screen", async () => {
    activationData.value = { requiresTotpEnrollment: true, requiresActivation: false };
    await mount();
    await waitFor(() => expect(replace).toHaveBeenCalledWith(SECURITY));
  });

  it("does not bounce a carrier already on it", async () => {
    // A gate that redirects to its own page is an infinite loop.
    activationData.value = { requiresTotpEnrollment: true, requiresActivation: false };
    pathname.value = SECURITY;
    await mount();
    expect(replace).not.toHaveBeenCalledWith(SECURITY);
  });

  it("leaves an enrolled carrier alone", async () => {
    activationData.value = { requiresTotpEnrollment: false, requiresActivation: false };
    await mount();
    expect(replace).not.toHaveBeenCalled();
  });
});

describe("precedence — the silent failure this exists for", () => {
  it("outranks status routing for a PENDING carrier", async () => {
    // THE CASE. Status routing would send them to the application-status page,
    // which the backend exempts — so they would load exactly one page forever
    // and never reach the screen that lets them out.
    authState.value = carrier("PENDING");
    activationData.value = { requiresTotpEnrollment: true, requiresActivation: false };

    await mount();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(SECURITY));
    expect(replace).not.toHaveBeenCalledWith(STATUS);
  });

  it("outranks the activation wall", async () => {
    // A carrier should not be asked to sign the Broker-Carrier Agreement before
    // their account is protected.
    activationData.value = { requiresTotpEnrollment: true, requiresActivation: true };

    await mount();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(SECURITY));
    expect(replace).not.toHaveBeenCalledWith(ACTIVATION);
  });

  it("hands back to the activation wall once enrollment is done", async () => {
    // Standing down must be conditional, not permanent — otherwise closing one
    // gate quietly disables the next.
    activationData.value = { requiresTotpEnrollment: false, requiresActivation: true };

    await mount();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(ACTIVATION));
  });

  it("hands back to status routing once enrollment is done", async () => {
    authState.value = carrier("PENDING");
    activationData.value = { requiresTotpEnrollment: false, requiresActivation: false };

    await mount();

    await waitFor(() => expect(replace).toHaveBeenCalledWith(STATUS));
  });
});
