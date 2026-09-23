/**
 * E2 (2026-09-21) — the next-step strip and the BOL button state on My Loads.
 *
 * Before this the "Bill of Lading" button rendered live on every load at every
 * status and the refusal arrived as a 403 after the tap; the page said
 * nothing about what a carrier should do next between accepting and the
 * truck rolling. Now the strip is decided by carrierNextStep — a projection
 * of the selector the AE board uses — and the button is disabled with the
 * reason shown until the backend would serve it.
 *
 * C6 (2026-09-23) — and "what the backend would serve" is now what the backend
 * actually reads: the recorded acceptance, OR a signed rate confirmation (bgs).
 * These cases asked for a tender at CONFIRMED, a condition the backend had
 * stopped using, so they were green while a carrier who had accepted their
 * load was shown a disabled button.
 *
 * Behavioural: the REAL page is rendered; react-query is answered by key so
 * the page's own reads are exercised; chrome is stubbed because this is about
 * the strip and the button, not the sidebar.
 *
 * Adversarially verified at authoring: removing `!step.bolReady` from the
 * button's disabled expression turns the two disabled cases red; dropping the
 * strip from the card turns the strip cases red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";

const state = vi.hoisted(() => ({
  loads: [] as any[],
  detail: null as any,
  search: "",
  myLoadsFn: null as null | (() => Promise<unknown>),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey, queryFn }: any) => {
    if (queryKey[0] === "carrier-my-loads") { state.myLoadsFn = queryFn; return { data: { loads: state.loads, total: state.loads.length, page: 1, totalPages: 1 }, isLoading: false }; }
    if (queryKey[0] === "carrier-my-load-detail") return { data: queryKey[1] ? state.detail : undefined };
    return { data: undefined, isLoading: false };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/download", () => ({
  openPdfFromApi: vi.fn(),
  extractApiError: vi.fn(async () => "err"),
  apiHref: (p: string) => p,
}));
// The paperwork panel is the REAL component (E4) — its rows are what these
// cases read; the chrome around it stays stubbed.
vi.mock("@/components/carrier", async (orig) => {
  const actual = (await orig()) as any;
  return {
    CarrierCard: ({ children, onClick }: any) => <div onClick={onClick}>{children}</div>,
    CarrierBadge: ({ status }: any) => <span data-testid="badge">{status}</span>,
    DriverAssignmentPanel: () => null,
    PaperworkPanel: actual.PaperworkPanel,
  };
});

import MyLoadsPage from "./page";
import { api } from "@/lib/api";
import { extractApiError } from "@/lib/download";
import { fireEvent } from "@testing-library/react";

function load(id: string, status: string, tenders: string[], extra: Record<string, unknown> = {}) {
  return {
    id, referenceNumber: `SRL-${id}`, status,
    originCity: "Lebanon", originState: "NH", originZip: "03766", destCity: "North Lake", destState: "TX", destZip: "76247",
    equipmentType: "Reefer", weight: 28400, pickupDate: "2026-09-22T00:00:00Z", deliveryDate: "2026-09-24T00:00:00Z",
    carrierRate: 4100, rate: 5100, distance: 1900, driverName: null, driverPhone: null,
    tenders: tenders.map((s, i) => ({ id: `t-${id}-${i}`, status: s, statusReason: null, updatedAt: "2026-09-22T00:00:00Z" })),
    ...extra,
  };
}

beforeEach(() => {
  state.loads = [];
  state.detail = null;
  window.history.replaceState({}, "", "/carrier/dashboard/my-loads");
});

describe("the next-step strip on the list", () => {
  it("says what happens next, per load, from the tender", () => {
    state.loads = [
      load("a", "BOOKED", ["ACCEPTED"]),
      load("b", "BOOKED", ["RC_SENT"]),
      load("c", "BOOKED", ["CONFIRMED"]),
    ];
    render(<MyLoadsPage />);
    const strips = screen.getAllByTestId("next-step").map((el) => el.textContent);
    expect(strips[0]).toMatch(/Rate confirmation on its way/);
    expect(strips[1]).toMatch(/Sign the rate confirmation/);
    expect(strips[2]).toMatch(/Signed\. Bill of lading ready/);
  });

  it("a withdrawn sibling's row is not what decides it — only this carrier's tender arrives, and the strip reads it", () => {
    // The backend scopes tenders to the carrier's own; the strip must not need
    // anything else to be right.
    state.loads = [load("a", "BOOKED", ["CONFIRMED"])];
    render(<MyLoadsPage />);
    expect(screen.getByTestId("next-step").textContent).toMatch(/Signed/);
  });
});

describe("the BOL button in the detail panel", () => {
  // C6 — these read the two facts the BACKEND reads (bgs): the recorded
  // acceptance, and the presence of a signed rate confirmation. They asked for
  // a tender at CONFIRMED until now, which is a condition the backend stopped
  // using, so they were green while the button was refusing carriers a document
  // SRL would have served them.
  const ACCEPTED_AT = "2026-09-20T10:00:00.000Z";
  const SIGNED_RC = [{ id: "rc-1" }];

  it("is LIVE on a tender-accepted load whose RC is unsigned — the acceptance alone opens it", async () => {
    // THE CASE. Accepted, nothing signed: the backend serves this, so the
    // button must. Pre-C6 this rendered disabled, under a sentence telling the
    // carrier to sign something they had already agreed to.
    const l = load("a", "BOOKED", ["ACCEPTED"], { carrierAcceptedAt: ACCEPTED_AT });
    state.loads = [l];
    state.detail = l;
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    render(<MyLoadsPage />);
    const btn = await screen.findByRole("button", { name: /Bill of Lading/ });
    expect(btn).not.toBeDisabled();
    expect(screen.queryByTestId("bol-reason")).toBeNull();
  });

  it("is DISABLED on a finalize-dispatched load where the carrier did nothing", async () => {
    // The other direction, and the reason the gate is not "is the status late
    // enough". R8c records no acceptance from a finalize, so there is nothing
    // SRL can point at — the backend refuses and the button says so first.
    const l = load("a", "DISPATCHED", [], { carrierId: "u1" });
    state.loads = [l];
    state.detail = l;
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    render(<MyLoadsPage />);
    const btn = await screen.findByRole("button", { name: /Bill of Lading/ });
    expect(btn).toBeDisabled();
    expect(screen.getByTestId("bol-reason").textContent).toMatch(/acceptance is recorded/i);
  });

  it("is DISABLED with the reason shown while neither fact is recorded", async () => {
    // An RC is out and unsigned, and this load predates the acceptance stamp.
    state.loads = [load("a", "BOOKED", ["RC_SENT"])];
    state.detail = load("a", "BOOKED", ["RC_SENT"]);
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    render(<MyLoadsPage />);
    const btn = await screen.findByRole("button", { name: /Bill of Lading/ });
    expect(btn).toBeDisabled();
    expect(screen.getByTestId("bol-reason").textContent).toMatch(/acceptance is recorded/i);
    expect(screen.getByTestId("bol-reason").textContent).toMatch(/here, or from the email/);
    expect(screen.getByTestId("next-step-detail").textContent).toMatch(/Sign the rate confirmation/);
  });

  it("is disabled on a directly-assigned load with nothing recorded against it", async () => {
    state.loads = [load("a", "BOOKED", [], { carrierId: "u1" })];
    state.detail = load("a", "BOOKED", [], { carrierId: "u1" });
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    render(<MyLoadsPage />);
    const btn = await screen.findByRole("button", { name: /Bill of Lading/ });
    expect(btn).toBeDisabled();
    expect(screen.getByTestId("bol-reason").textContent).toMatch(/sign the rate confirmation/i);
  });

  it("is LIVE on a signed rate confirmation — the gate's other half (control)", async () => {
    const l = load("a", "BOOKED", ["CONFIRMED"], { rateConfirmations: SIGNED_RC });
    state.loads = [l];
    state.detail = l;
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    render(<MyLoadsPage />);
    const btn = await screen.findByRole("button", { name: /Bill of Lading/ });
    expect(btn).not.toBeDisabled();
    expect(screen.queryByTestId("bol-reason")).toBeNull();
    expect(screen.getByTestId("next-step-detail").textContent).toMatch(/Bill of lading ready/);
  });

  it("stays live while the truck is rolling — the acceptance is recorded, the gate still holds", async () => {
    const l = load("a", "IN_TRANSIT", ["CONFIRMED"], { carrierAcceptedAt: ACCEPTED_AT });
    state.loads = [l];
    state.detail = l;
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    render(<MyLoadsPage />);
    expect(await screen.findByRole("button", { name: /Bill of Lading/ })).not.toBeDisabled();
  });
});

describe("?load= opens the load the accept confirmation points at", () => {
  it("selects that load's detail on mount", async () => {
    state.loads = [load("zz", "BOOKED", ["ACCEPTED"])];
    state.detail = load("zz", "BOOKED", ["ACCEPTED"]);
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=zz");
    render(<MyLoadsPage />);
    await waitFor(() => expect(screen.getByTestId("next-step-detail")).toBeTruthy());
    expect(screen.getAllByText("SRL-zz").length).toBeGreaterThan(1); // card + detail header
  });

  it("without the param nothing is selected", () => {
    state.loads = [load("zz", "BOOKED", ["ACCEPTED"])];
    state.detail = load("zz", "BOOKED", ["ACCEPTED"]);
    render(<MyLoadsPage />);
    expect(screen.queryByTestId("next-step-detail")).toBeNull();
  });
});

describe("E3 — signing from the portal, at RC_SENT and nowhere else", () => {
  const at = (tender: string) => {
    state.loads = [load("a", "BOOKED", [tender])];
    state.detail = load("a", "BOOKED", [tender]);
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    return render(<MyLoadsPage />);
  };

  it("at RC_SENT: a real form POST to the mint route, so the 303 lands the browser on the token page", async () => {
    at("RC_SENT");
    const form = (await screen.findByTestId("rc-sign-form")) as HTMLFormElement;
    // A navigation, not an XHR: the route answers 303 to /api/rc-sign/:token and
    // only a top-level POST both follows it into the tab and carries the cookie.
    expect(form.method.toUpperCase()).toBe("POST");
    expect(form.getAttribute("action")).toBe("/carrier-loads/a/rc-sign-link");
    expect(screen.getByRole("button", { name: /Sign the rate confirmation/ })).toHaveAttribute("type", "submit");
    expect(screen.getByTestId("next-step-detail").textContent).toMatch(/here, or from the email/);
  });

  it("absent before the RC is sent (ACCEPTED) and after it is signed (CONFIRMED)", async () => {
    const { unmount } = at("ACCEPTED");
    await screen.findByTestId("next-step-detail");
    expect(screen.queryByTestId("rc-sign-panel")).toBeNull();
    unmount();
    at("CONFIRMED");
    await screen.findByTestId("next-step-detail");
    expect(screen.queryByTestId("rc-sign-panel")).toBeNull();
  });

  it("Email me a new link posts to the email route with NO address, and shows where the server sent it", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { ok: true, sentTo: "dispatch@carrier.test" } } as any);
    at("RC_SENT");
    fireEvent.click(await screen.findByTestId("rc-sign-email"));
    await waitFor(() => expect(screen.getByTestId("rc-sign-email-result").textContent).toMatch(/Sent to dispatch@carrier\.test/));
    expect(api.post).toHaveBeenCalledTimes(1);
    const [path, body] = vi.mocked(api.post).mock.calls[0];
    expect(path).toBe("/carrier-loads/a/rc-sign-link/email");
    expect(body).toBeUndefined();
  });

  it("a refusal (rate-limited, RC not out yet) renders inline instead of vanishing", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error("429"));
    vi.mocked(extractApiError).mockResolvedValueOnce("A new signing link has been issued 3 times in the last hour.");
    at("RC_SENT");
    fireEvent.click(await screen.findByTestId("rc-sign-email"));
    await waitFor(() => expect(screen.getByTestId("rc-sign-email-result").textContent).toMatch(/3 times in the last hour/));
  });
});

describe("E4 — the paperwork panel, from CONFIRMED", () => {
  const at = (status: string, tender: string, docs: any[] = []) => {
    const l = load("a", status, tender ? [tender] : [], { documents: docs, equipmentType: "Reefer 53'" });
    state.loads = [l];
    state.detail = l;
    window.history.replaceState({}, "", "/carrier/dashboard/my-loads?load=a");
    return render(<MyLoadsPage />);
  };

  it("absent while the rate confirmation is unsigned — nothing is owed before the load is confirmed", async () => {
    at("BOOKED", "RC_SENT");
    await screen.findByTestId("next-step-detail");
    expect(screen.queryByTestId("paperwork-slots")).toBeNull();
  });

  it("present at CONFIRMED and renders the slots from the load's Document rows, reefer included", async () => {
    at("BOOKED", "CONFIRMED", [{ id: "d1", docType: "POD", status: "VERIFIED", fileName: "pod.pdf", createdAt: "2026-09-22T00:00:00Z" }]);
    await screen.findByTestId("paperwork-slots");
    expect(screen.getByTestId("paperwork-slot-DELIVERY_PROOF").getAttribute("data-state")).toBe("VERIFIED");
    expect(screen.getByTestId("paperwork-slot-TEMP_LOG").getAttribute("data-state")).toBe("MISSING");
    expect(screen.getByTestId("paperwork-summary").textContent).toBe("1 of 3 required on file");
    // The pickup slot is closed at this status and says so.
    expect(screen.getByTestId("paperwork-closed-PICKUP_BOL")).toBeTruthy();
  });

  it("stays through delivery; the old POD-only card is gone", async () => {
    at("DELIVERED", "CONFIRMED");
    await screen.findByTestId("paperwork-slots");
    expect(screen.queryByText(/Upload Proof of Delivery/)).toBeNull();
    expect(screen.getByTestId("paperwork-upload-POD")).toBeTruthy();
    expect(screen.getByTestId("paperwork-upload-SIGNED_BOL_DEL")).toBeTruthy();
  });
});

describe("E6 — the Completed chip", () => {
  it("exists, and asks the list for the three statuses that mean done to a carrier, as one set", async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { loads: [], total: 0 } } as any);
    render(<MyLoadsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Completed" }));
    await waitFor(() => expect(state.myLoadsFn).toBeTruthy());
    await state.myLoadsFn!();
    const url = vi.mocked(api.get).mock.calls.at(-1)![0] as string;
    expect(decodeURIComponent(url)).toBe("/carrier-loads/my-loads?status=POD_RECEIVED,INVOICED,COMPLETED&page=1&limit=20");
    // The other chips are still their own status.
    fireEvent.click(screen.getByRole("button", { name: "DELIVERED" }));
    await state.myLoadsFn!();
    expect(decodeURIComponent(vi.mocked(api.get).mock.calls.at(-1)![0] as string)).toBe("/carrier-loads/my-loads?status=DELIVERED&page=1&limit=20");
  });
});
