/**
 * Carrier-archive arc B4a (2026-09-19) — archived carriers on the AE list.
 *
 * The real page is mounted under a real QueryClientProvider; only the auth
 * store and the api client are stand-ins. The api mock is a small fake of the
 * server contract: it returns archived rows ONLY when the request carries
 * include_deleted=true, so what these cases exercise is the request the page
 * actually sends, not a fixture it was handed regardless.
 *
 * Held here:
 *  - default off: the request carries no include_deleted and no badge renders;
 *  - "Show archived" on: the request carries include_deleted=true, each
 *    archived row renders the Archived badge plus its reason label (three of
 *    the seven reasons), a live row renders none, and the note rides the
 *    badge's title;
 *  - an archived carrier's detail panel: the banner names the reason and the
 *    note, and every mutating action that renders is DISABLED with the honest
 *    title, and a click on one reaches no endpoint;
 *  - a live carrier's actions are enabled and carry no archived title — including
 *    main's Suspend… and Archive… (C5 recut: the two sweep sites B4a's base lacked);
 *  - the toggle is admin-only, the same gate as the test-account toggle;
 *  - the header (in-network count, stat cards) reads the same with the toggle on
 *    or off — archived rows change the list, never the network stats (C5 recut).
 *
 * Adversarially verified at authoring — matrix in the commit message.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Page from "./page";
import { CARRIER_ARCHIVE_REASON_LABELS } from "@shared/constants/carrierArchiveReasons";

vi.setConfig({ testTimeout: 30_000 });

const auth = vi.hoisted(() => ({ role: "ADMIN" }));
vi.mock("@/hooks/useAuthStore", () => ({
  useAuthStore: (sel?: (s: unknown) => unknown) => {
    const state = { user: { id: "u-admin", role: auth.role, email: "admin@srl.invalid" }, token: "t" };
    return typeof sel === "function" ? sel(state) : state;
  },
}));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

const ARCHIVED_TITLE = "This carrier is archived. Actions that change it are unavailable.";

type Row = Record<string, unknown> & { id: string; company: string; deletedAt: string | null };
function carrier(over: Partial<Row> & { id: string; company: string }): Row {
  return {
    userId: `u-${over.id}`, contactName: "Test Contact", email: `${over.id}@srl.invalid`, phone: null,
    mcNumber: "123456", dotNumber: "7654321", tier: "SILVER", equipmentTypes: ["Dry Van"], operatingRegions: ["Midwest"],
    safetyScore: null, numberOfTrucks: 3, onboardingStatus: "PENDING", insuranceExpiry: null,
    w9Uploaded: false, insuranceCertUploaded: false, authorityDocUploaded: false, authorityGrantedDate: null,
    approvedAt: null, isTestAccount: false, address: null, city: null, state: null, zip: null,
    completedLoads: 0, activeLoads: 0, totalRevenue: 0, tendersAccepted: 0, tendersDeclined: 0, tendersTotal: 0,
    acceptanceRate: 0, performance: null, createdAt: "2026-01-01T00:00:00Z",
    deletedAt: null, deletedBy: null, archiveReason: null, archiveNote: null,
    ...over,
  };
}

const LIVE = carrier({ id: "cp-live", company: "Live Freight LLC" });
const LONG_NAME = "Insurance Lapsed Carriers Of The Upper Peninsula Trucking Company LLC";
const A_INSURANCE = carrier({
  id: "cp-ins", company: LONG_NAME,
  deletedAt: "2026-09-18T15:00:00Z", deletedBy: "admin@srl.invalid",
  archiveReason: "INSURANCE_LAPSED_UNRESPONSIVE", archiveNote: "Two COI requests unanswered since August.",
});
const A_FRAUD = carrier({ id: "cp-fraud", company: "Fraud Case Carrier", deletedAt: "2026-09-10T09:00:00Z", deletedBy: "ceo@srl.invalid", archiveReason: "FRAUD_CONFIRMED" });
const A_CEASED = carrier({ id: "cp-ceased", company: "Retired Owner Transport", deletedAt: "2026-09-01T09:00:00Z", deletedBy: "admin@srl.invalid", archiveReason: "CEASED_OPERATIONS", archiveNote: "Owner retired" });
const ALL = [LIVE, A_INSURANCE, A_FRAUD, A_CEASED];

const listUrls: string[] = [];

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}><Page /></QueryClientProvider>);
}

/** The list row for a company: the <button> that wraps the row. */
function rowFor(company: string) {
  const row = screen.getByText(company, { selector: "p" }).closest("button");
  if (!row) throw new Error(`no row for ${company}`);
  return row;
}

beforeEach(async () => {
  auth.role = "ADMIN";
  listUrls.length = 0;
  const { api } = await import("@/lib/api");
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url.startsWith("/carrier/all")) {
      listUrls.push(url);
      const includeDeleted = /[?&]include_deleted=true(?:&|$)/.test(url);
      const rows = includeDeleted ? ALL : ALL.filter((c) => !c.deletedAt);
      return Promise.resolve({ data: { carriers: rows, total: rows.length } });
    }
    if (url.startsWith("/carriers/quickpay-enrollments")) return Promise.resolve({ data: { status: "ALL", count: 0, enrollments: [] } });
    return Promise.resolve({ data: {} });
  });
});

describe("default — archived rows are neither requested nor shown", () => {
  it("sends no include_deleted and renders no Archived badge", async () => {
    mount();
    expect(await screen.findByText("Live Freight LLC", { selector: "p" })).toBeTruthy();
    expect(listUrls.length).toBeGreaterThan(0); // vacuity tripwire — the list was actually requested
    for (const u of listUrls) expect(u).not.toContain("include_deleted");
    expect(screen.queryByText("Archived")).toBeNull();
    expect(screen.queryByText(LONG_NAME, { selector: "p" })).toBeNull();
  });
});

describe("Show archived — the badge, the label, the note", () => {
  it("requests include_deleted=true and renders Archived + the reason label on each archived row, none on a live row", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Live Freight LLC", { selector: "p" });

    await user.click(screen.getByRole("button", { name: /Show archived/ }));

    await screen.findByText(LONG_NAME, { selector: "p" });
    expect(listUrls.at(-1)).toMatch(/[?&]include_deleted=true(?:&|$)/);
    expect(screen.getByRole("button", { name: /Showing archived/ })).toBeTruthy();

    // Three of the seven reasons, labels read from the shared map — never a copy.
    const expected: Array<[Row, string]> = [
      [A_INSURANCE, CARRIER_ARCHIVE_REASON_LABELS.INSURANCE_LAPSED_UNRESPONSIVE],
      [A_FRAUD, CARRIER_ARCHIVE_REASON_LABELS.FRAUD_CONFIRMED],
      [A_CEASED, CARRIER_ARCHIVE_REASON_LABELS.CEASED_OPERATIONS],
    ];
    for (const [row, label] of expected) {
      const r = rowFor(row.company);
      expect(within(r).getByText("Archived")).toBeTruthy();
      expect(within(r).getByText(label)).toBeTruthy();
      // The status pill is still there: archived is a second dimension, not a status.
      expect(within(r).getByText("PENDING")).toBeTruthy();
    }
    expect(screen.getAllByText("Archived")).toHaveLength(3);
    expect(within(rowFor("Live Freight LLC")).queryByText("Archived")).toBeNull();
  });

  it("the note rides the badge's title (hover); a row without a note has no title there", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Live Freight LLC", { selector: "p" });
    await user.click(screen.getByRole("button", { name: /Show archived/ }));
    await screen.findByText(LONG_NAME, { selector: "p" });

    const withNote = within(rowFor(LONG_NAME)).getByText("Archived").closest("span[title]");
    expect(withNote?.getAttribute("title")).toBe("Two COI requests unanswered since August.");
    const withoutNote = within(rowFor("Fraud Case Carrier")).getByText("Archived").closest("span[title]");
    expect(withoutNote).toBeNull();
  });

  it("the header describes the pool as it stands: showing archived rows changes the list, not the network stats", async () => {
    // C5 recut (2026-09-19). Found by eye on the rendered page, not by this file: with the
    // toggle on, the header read "2 carriers in network" and "of 2 approved" for a pool
    // with one live carrier and one archived. The toggle is a LIST-visibility control;
    // with it off the server never returns an archived row, so the header must read the
    // same either way. The tier cards are filters over the list and count what the list
    // will show — that is design, asserted so nobody "fixes" it the other way.
    const user = userEvent.setup();
    mount();
    await screen.findByText("Live Freight LLC", { selector: "p" });
    const statValue = (label: string) => screen.getByText(label).previousElementSibling?.textContent;
    // The tier filter card: the <button> holding the tier pill AND the word "carriers"
    // (the row pills share the tier text, so pick by structure, not by name).
    const tierCard = (tier: string) =>
      screen.getAllByText(tier, { selector: "span" }).map((s) => s.closest("button"))
        .find((b) => b && /carriers$/.test(b.textContent || ""))!.textContent!.replace(/\s+/g, "");
    expect(screen.getByText(/carriers in network/).textContent).toBe("1 carriers in network");
    expect(statValue("Total Carriers")).toBe("1");
    expect(tierCard("SILVER")).toBe("SILVER1carriers");

    await user.click(screen.getByRole("button", { name: /Show archived/ }));
    await screen.findByText(LONG_NAME, { selector: "p" });
    // four rows on screen, one in the network
    for (const c of ALL) expect(rowFor(c.company)).toBeTruthy();
    expect(screen.getByText(/carriers in network/).textContent).toBe("1 carriers in network");
    expect(statValue("Total Carriers")).toBe("1");
    expect(statValue("Caravan Members")).toBe("1");
    // every fixture is PENDING, so "approved" cannot discriminate here; Pending Onboarding can — 1 live, not 4
    expect(statValue("Pending Onboarding")).toBe("1");
    // the filter card counts the list it filters: all four fixtures are SILVER
    expect(tierCard("SILVER")).toBe("SILVER4carriers");
  });

  it("the toggle is admin-only, the same gate as the test-account toggle", async () => {
    auth.role = "OPERATIONS";
    mount();
    await screen.findByText("Live Freight LLC", { selector: "p" });
    expect(screen.queryByRole("button", { name: /Show archived/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Show test accounts/ })).toBeNull();
  });
});

describe("an archived carrier is read-only on this page", () => {
  it("the panel carries the archive record, and every mutating action that renders is disabled with the honest title", async () => {
    const user = userEvent.setup();
    const { api } = await import("@/lib/api");
    mount();
    await screen.findByText("Live Freight LLC", { selector: "p" });
    await user.click(screen.getByRole("button", { name: /Show archived/ }));
    await screen.findByText(LONG_NAME, { selector: "p" });

    await user.click(rowFor(LONG_NAME));
    const dialog = await screen.findByRole("dialog");

    // The banner: date, who, reason label, note, and the sentence that explains the disabled controls.
    const banner = within(dialog).getByText(/Actions that change this carrier are unavailable\./);
    expect(banner.textContent).toContain("by admin@srl.invalid");
    expect(banner.textContent).toContain(`Reason: ${CARRIER_ARCHIVE_REASON_LABELS.INSURANCE_LAPSED_UNRESPONSIVE}.`);
    expect(banner.textContent).toContain("Note: Two COI requests unanswered since August.");
    // The note already ends with a period; the banner must not add a second one.
    // Found by eye on the rendered page (walkthrough, 2026-09-19), not by this
    // file — which is why the assertion now exists.
    expect(banner.textContent).not.toMatch(/\.\./);

    // PENDING + ADMIN renders this set on the action bar. Each must be disabled AND say why.
    // C5 (recut, 2026-09-19): Suspend… and Archive… are main's lifecycle-gaps B5b buttons, which
    // B4a's base did not have — an archived carrier must not be suspended or archived again
    // from its own read-only drawer. getByRole throws if either stops rendering here, which is
    // the tripwire: a control this list cannot find is a control this test is not holding.
    const names = [/Approve/, /^Reject$/, /Start Review/, /Request Info/, /Edit Profile/, /Mark as test/, /Suspend…/, /Archive…/];
    for (const name of names) {
      const btn = within(dialog).getByRole("button", { name });
      expect(btn, String(name)).toBeDisabled();
      expect(btn.getAttribute("title"), String(name)).toBe(ARCHIVED_TITLE);
    }

    // A disabled control reaches no endpoint: the bug class this arc exists to stop.
    await user.click(within(dialog).getByRole("button", { name: /Mark as test/ }));
    await user.click(within(dialog).getByRole("button", { name: /Start Review/ }));
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("a note without terminal punctuation gets one period; a carrier with no note gets no Note clause", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Live Freight LLC", { selector: "p" });
    await user.click(screen.getByRole("button", { name: /Show archived/ }));
    await screen.findByText("Retired Owner Transport", { selector: "p" });

    await user.click(rowFor("Retired Owner Transport"));
    let dialog = await screen.findByRole("dialog");
    let banner = within(dialog).getByText(/Actions that change this carrier are unavailable\./);
    expect(banner.textContent).toContain("Note: Owner retired. Actions");
    expect(banner.textContent).not.toMatch(/\.\./);

    // Close, open the carrier archived with no note: reason only, no "Note:".
    await user.keyboard("{Escape}");
    await user.click(rowFor("Fraud Case Carrier"));
    dialog = await screen.findByRole("dialog");
    banner = within(dialog).getByText(/Actions that change this carrier are unavailable\./);
    expect(banner.textContent).toContain(`Reason: ${CARRIER_ARCHIVE_REASON_LABELS.FRAUD_CONFIRMED}.`);
    expect(banner.textContent).not.toContain("Note:");
  });

  it("a live carrier's actions are enabled and carry no archived title", async () => {
    const user = userEvent.setup();
    mount();
    await screen.findByText("Live Freight LLC", { selector: "p" });
    await user.click(rowFor("Live Freight LLC"));
    const dialog = await screen.findByRole("dialog");

    expect(within(dialog).queryByText(/Actions that change this carrier are unavailable\./)).toBeNull();
    for (const name of [/Approve/, /^Reject$/, /Start Review/, /Request Info/, /Edit Profile/, /Suspend…/, /Archive…/]) {
      const btn = within(dialog).getByRole("button", { name });
      expect(btn, String(name)).toBeEnabled();
      expect(btn.getAttribute("title"), String(name)).not.toBe(ARCHIVED_TITLE);
    }
    // The one button that carries its own title keeps it.
    expect(within(dialog).getByRole("button", { name: /Mark as test/ }).getAttribute("title")).toMatch(/Mark as a test account/);
  });
});

/* ------------------------------------------------------------------ */
/*  C6 (carrier-archive recut, 2026-09-21) — the archive modal and the  */
/*  restore action.                                                     */
/*                                                                      */
/*  The modal does NOT pre-empt the server: submitting with no reason   */
/*  sends the request and renders the 422 the server answers with,      */
/*  code and message. Restore… is the one control enabled on an         */
/*  archived carrier, rendered for ADMIN/CEO only, and its outcome line  */
/*  says REVIEWING and whether the fingerprint was rebuilt.             */
/*  Adversarially verified at authoring — matrix in the commit message.  */
/* ------------------------------------------------------------------ */
describe("C6 — the archive modal", () => {
  async function openArchiveModal(user: ReturnType<typeof userEvent.setup>) {
    mount();
    await screen.findByText("Live Freight LLC", { selector: "p" });
    await user.click(rowFor("Live Freight LLC"));
    const panel = await screen.findByRole("dialog");
    await user.click(within(panel).getByRole("button", { name: /Archive…/ }));
    return screen.findByRole("dialog", { name: /Archive Live Freight LLC/ });
  }

  it("submitting with no reason sends the request and surfaces the server's 422, code and message", async () => {
    const user = userEvent.setup();
    const { api } = await import("@/lib/api");
    const serverMessage = "Archiving a carrier must carry a reason. One of: DUPLICATE_RECORD, CEASED_OPERATIONS.";
    (api.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      response: { status: 422, data: { error: serverMessage, code: "ARCHIVE_REASON_REQUIRED" } },
    });
    const modal = await openArchiveModal(user);
    // Nothing chosen, nothing typed. The button is enabled: the server is the authority.
    const submit = within(modal).getByRole("button", { name: /Archive carrier/ });
    expect(submit).toBeEnabled();
    await user.click(submit);

    const alert = await within(modal).findByRole("alert");
    expect(alert.textContent).toContain("ARCHIVE_REASON_REQUIRED");
    expect(alert.textContent).toContain(serverMessage);
    // The request that went out carried no reason — the 422 is the server's, not a mock of one.
    expect(api.delete).toHaveBeenCalledWith("/carriers/cp-live", { data: {} });
    // The modal stays open so the operator can pick one.
    expect(screen.getByRole("dialog", { name: /Archive Live Freight LLC/ })).toBeInTheDocument();
  });

  it("a chosen reason and a note are sent under the C3 contract; success closes the modal and reports the withdrawn offers", async () => {
    const user = userEvent.setup();
    const { api } = await import("@/lib/api");
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { success: true, message: "Carrier archived", details: { archived: true, loginDeactivated: true, archiveReason: "DUPLICATE_RECORD", references: 4, withdrawn: { tenders: 2, positions: 1, bids: 0 } } },
    });
    const modal = await openArchiveModal(user);
    await user.selectOptions(within(modal).getByLabelText(/Reason/), "DUPLICATE_RECORD");
    await user.type(within(modal).getByLabelText(/Note/), "  Second registration for the same MC.  ");
    await user.click(within(modal).getByRole("button", { name: /Archive carrier/ }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/carriers/cp-live", { data: { reason: "DUPLICATE_RECORD", archiveNote: "Second registration for the same MC." } }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Archive Live Freight LLC/ })).toBeNull());
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("Archived");
    expect(status.textContent).toContain("3 open offers withdrawn");
  });

  it("a 409 (truck under a load) is handed to the page: the in-flight loads and Suspend instead", async () => {
    const user = userEvent.setup();
    const { api } = await import("@/lib/api");
    (api.delete as ReturnType<typeof vi.fn>).mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          error: "CARRIER_HOLDS_LIVE_LOADS",
          message: "Live Freight LLC cannot be archived: on 2 loads still in flight (SRL-121501, SRL-121502).",
          blockingLoads: [{ id: "l1", loadNumber: "SRL-121501", status: "IN_TRANSIT" }, { id: "l2", loadNumber: "SRL-121502", status: "DELIVERED" }],
          remedy: { inFlightLoads: ["SRL-121501", "SRL-121502"], releaseInFlightLoadsFirst: "Release the carrier from these loads first; a truck may be routed.", holdingTenders: [], suspend: "POST /compliance/carrier/cp-live/suspend" },
        },
      },
    });
    const modal = await openArchiveModal(user);
    await user.selectOptions(within(modal).getByLabelText(/Reason/), "CEASED_OPERATIONS");
    await user.click(within(modal).getByRole("button", { name: /Archive carrier/ }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Archive Live Freight LLC/ })).toBeNull());
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("still in flight");
    expect(alert.textContent).toContain("SRL-121501, SRL-121502");
    expect(within(alert).getByRole("button", { name: /Suspend instead/ })).toBeEnabled();
  });
});

describe("C6 — Restore…", () => {
  it("renders only on an archived carrier, enabled, and its outcome says REVIEWING and whether the fingerprint was rebuilt", async () => {
    const user = userEvent.setup();
    const { api } = await import("@/lib/api");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { success: true, message: "Carrier restored", details: { restored: true, loginReactivated: true, onboardingStatus: "REVIEWING", fingerprintRebuilt: false } },
    });
    mount();
    await screen.findByText("Live Freight LLC", { selector: "p" });

    // A live carrier has no Restore….
    await user.click(rowFor("Live Freight LLC"));
    let panel = await screen.findByRole("dialog");
    expect(within(panel).queryByRole("button", { name: /Restore…/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: /Show archived/ }));
    await screen.findByText("Fraud Case Carrier", { selector: "p" });
    await user.click(rowFor("Fraud Case Carrier"));
    panel = await screen.findByRole("dialog");
    const restore = within(panel).getByRole("button", { name: /Restore…/ });
    // The one control that is NOT read-only on an archived row.
    expect(restore).toBeEnabled();
    expect(restore.getAttribute("title")).not.toBe(ARCHIVED_TITLE);
    await user.click(restore);

    await waitFor(() => expect(api.put).toHaveBeenCalledWith("/carriers/cp-fraud/restore"));
    const status = await screen.findByRole("status");
    expect(status.textContent).toContain("REVIEWING");
    // fingerprintRebuilt:false deserves its own visible line (Item 291.7).
    expect(status.textContent).toMatch(/NOT rebuilt/);
  });

  it("is hidden for a non-ADMIN/CEO role even when an archived row reaches the list", async () => {
    auth.role = "OPERATIONS";
    const user = userEvent.setup();
    const { api } = await import("@/lib/api");
    // The server, not the toggle, decides what the list carries; hand this role an archived
    // row regardless so the assertion is about the BUTTON's gate, not the toggle's.
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url.startsWith("/carrier/all")) return Promise.resolve({ data: { carriers: ALL, total: ALL.length } });
      if (url.startsWith("/carriers/quickpay-enrollments")) return Promise.resolve({ data: { status: "ALL", count: 0, enrollments: [] } });
      return Promise.resolve({ data: {} });
    });
    mount();
    await screen.findByText("Fraud Case Carrier", { selector: "p" });
    await user.click(rowFor("Fraud Case Carrier"));
    const panel = await screen.findByRole("dialog");
    expect(within(panel).queryByRole("button", { name: /Restore…/ })).toBeNull();
    expect(within(panel).queryByRole("button", { name: /Archive…/ })).toBeNull();
    expect(api.put).not.toHaveBeenCalled();
  });
});
