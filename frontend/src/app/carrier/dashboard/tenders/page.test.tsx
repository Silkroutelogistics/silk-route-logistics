/**
 * E2 (2026-09-21) — accepting a tender tells the carrier what happens next.
 *
 * The list is OFFERED-only, so the row vanishes on accept and before this the
 * carrier was left with nothing: no confirmation, no pointer, the load sitting
 * in My Loads under BOOKED with no rate confirmation yet. The confirmation
 * names the load, says the rate confirmation is coming by email and must be
 * signed to unlock the bill of lading, and links the load.
 *
 * Behavioural over the real page. The mutation is a stub whose onSuccess is
 * invoked by the test the way react-query would — with the variables the page
 * passed — so what is asserted is the page's own handling of the result.
 *
 * Adversarially verified at authoring: passing the tender id (the old shape)
 * instead of the tender leaves onSuccess with no load to name and the
 * confirmation case red; removing the banner turns both cases red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";

const state = vi.hoisted(() => ({
  tenders: [] as any[],
  email: "dispatch@carrier.test" as string | undefined,
  lastMutation: null as null | { mutationFn: (v: any) => Promise<any>; onSuccess?: (d: any, v: any) => void },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: any) =>
    queryKey[0] === "carrier-tenders" ? { data: state.tenders, isLoading: false } : { data: undefined },
  useMutation: (opts: any) => {
    // Only the accept mutation matters here; the others are created too and
    // must not throw. Whichever is called last with a matching shape is kept.
    const m = {
      mutate: async (v: any) => {
        state.lastMutation = opts;
        const d = await opts.mutationFn(v);
        opts.onSuccess?.(d, v);
      },
      isPending: false,
    };
    return m;
  },
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(async () => ({ data: { ok: true } })) } }));
vi.mock("@/hooks/useCarrierAuth", () => ({
  useCarrierAuth: (sel: any) => sel({ user: state.email ? { email: state.email } : null }),
}));

import CarrierTendersPage from "./page";

function tender(id: string, ref: string) {
  return {
    id, loadId: `load-${id}`, carrierId: "cp-1", status: "OFFERED", offeredRate: 4100, counterRate: null,
    respondedAt: null, expiresAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: new Date().toISOString(),
    waterfallPositionId: null,
    load: {
      id: `load-${id}`, referenceNumber: ref, originCity: "Lebanon", originState: "NH", destCity: "North Lake", destState: "TX",
      equipmentType: "Reefer", weight: 28400, commodity: "Frozen", pickupDate: new Date().toISOString(),
      deliveryDate: new Date().toISOString(), distance: 1900, rate: 5100, poster: null,
    },
  };
}

beforeEach(() => {
  state.tenders = [tender("t1", "SRL-121500")];
  state.email = "dispatch@carrier.test";
});

describe("accepting a tender", () => {
  it("shows a confirmation naming the load, the email, the signature, and a link to the load", async () => {
    render(<CarrierTendersPage />);
    expect(screen.queryByTestId("accept-confirmation")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    const banner = await screen.findByTestId("accept-confirmation");
    expect(banner.textContent).toMatch(/Booked\. Load SRL-121500 is yours/);
    expect(banner.textContent).toMatch(/email the rate confirmation to dispatch@carrier\.test/);
    expect(banner.textContent).toMatch(/Sign it to unlock the bill of lading/);
    const link = banner.querySelector("a") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/carrier/dashboard/my-loads?load=load-t1");
  });

  it("still reads sensibly when the session has no email on it", async () => {
    state.email = undefined;
    render(<CarrierTendersPage />);
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));
    const banner = await screen.findByTestId("accept-confirmation");
    expect(banner.textContent).toMatch(/SRL will email the rate confirmation\. Sign it/);
    expect(banner.textContent).not.toMatch(/undefined/);
  });
});
