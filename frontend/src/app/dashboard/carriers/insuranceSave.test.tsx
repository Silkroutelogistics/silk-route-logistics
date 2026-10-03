/**
 * coi-verify-email-fix C3 — the AE Insurance tab save.
 *
 * The owner's JetEx save 500'd and the panel closed anyway, so it looked done.
 * The payload also carried every field the form held: tier, safety score and
 * trucks, and four agent fields the list never returned, so they went as "".
 * This drives the real page: list → drawer → Insurance → Edit → Save.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// A US timezone, whatever the runner uses: in UTC (CI) the day-early render
// cannot appear, so the expiry test would pass with or without the fix.
vi.hoisted(() => { process.env.TZ = "America/Detroit"; });

// The full carriers page compiles cold in the first test (~1.3s alone) and timed out at
// vitest's 5s default under full-suite load. Scoped to this file (O2, 2026-10-03).
vi.setConfig({ testTimeout: 20_000 });
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));
vi.mock("@/hooks/useAuthStore", () => ({ useAuthStore: () => ({ user: { id: "u-admin", role: "ADMIN" } }) }));

import { api } from "@/lib/api";
import CarrierPoolPage from "./page";

const JETEX = {
  id: "cp-jetex", company: "JETEX FREIGHT LLC", companyName: "JETEX FREIGHT LLC", mcNumber: "585393", dotNumber: "1234567",
  status: "APPROVED", onboardingStatus: "APPROVED", tier: "GUEST", safetyScore: null, numberOfTrucks: 79,
  insuranceExpiry: null, equipmentTypes: [], operatingRegions: [],
  user: { id: "u-c", firstName: "J", lastName: "X", email: "j@x.test", company: "JETEX", phone: "" },
  autoLiabilityProvider: "McGriff", autoLiabilityPolicy: "VBB188673", autoLiabilityAmount: 1000000, autoLiabilityExpiry: "2027-09-01T00:00:00.000Z",
  cargoInsuranceProvider: "McGriff", cargoInsurancePolicy: "IM6079611149", cargoInsuranceAmount: 100000, cargoInsuranceExpiry: "2026-11-01T00:00:00.000Z",
  generalLiabilityProvider: "McGriff", generalLiabilityPolicy: "VBB188673", generalLiabilityAmount: 1000000, generalLiabilityExpiry: "2027-08-29T00:00:00.000Z",
  workersCompProvider: "McGriff", workersCompPolicy: "0002116633", workersCompAmount: 1000000, workersCompExpiry: "2027-09-01T00:00:00.000Z",
  additionalInsuredSRL: true, waiverOfSubrogation: false, thirtyDayCancellationNotice: null,
  workersCompStatutory: true, workersCompElEachAccident: 1000000, workersCompElDiseaseEachEmployee: 1000000, workersCompElDiseasePolicyLimit: 1000000,
  insuranceAgencyName: "McGriff Insurance Services", insuranceAgentName: "Kayla",
  insuranceAgentEmail: "Texarkana@mcgriff.com", insuranceAgentPhone: "(903) 336-6400",
  completedLoads: 0, activeLoads: 0, totalRevenue: 0, tendersAccepted: 0, tendersTotal: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockImplementation(async (url: string) =>
    ({ data: url.startsWith("/carrier/all") ? { carriers: [JETEX], total: 1 } : [] }) as any);
});
afterEach(cleanup);

async function openInsuranceEdit() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CarrierPoolPage /></QueryClientProvider>);
  await userEvent.click((await screen.findAllByText("JETEX FREIGHT LLC"))[0]);
  await userEvent.click(await screen.findByRole("button", { name: /^insurance$/i }));
  await userEvent.click(await screen.findByRole("button", { name: /edit insurance/i }));
  await screen.findByText("Edit Insurance Details");
}
const policyInputs = () => screen.getAllByPlaceholderText("Policy #") as HTMLInputElement[];

describe("Insurance tab save", () => {
  it("sends only the insurance fields the AE changed — never tier, safety score, trucks or an untouched agent", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { ...JETEX } } as any);
    await openInsuranceEdit();
    fireEvent.change(policyInputs()[0], { target: { value: "TINCA2743700-26" } });
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    const [url, body] = vi.mocked(api.patch).mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe("/carrier/cp-jetex");
    expect(body).toEqual({ autoLiabilityPolicy: "TINCA2743700-26" });
  });

  it("the agent loads from the list, and survives a save that does not touch it", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { ...JETEX } } as any);
    await openInsuranceEdit();
    expect((screen.getByPlaceholderText("Agency Name") as HTMLInputElement).value).toBe("McGriff Insurance Services");
    fireEvent.change(policyInputs()[2], { target: { value: "VBB249734" } });
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    const body = vi.mocked(api.patch).mock.calls[0][1] as Record<string, unknown>;
    for (const k of ["insuranceAgencyName", "insuranceAgentName", "insuranceAgentEmail", "insuranceAgentPhone"]) expect(body).not.toHaveProperty(k);
  });

  it("a 500 keeps the form open and shows the server's message", async () => {
    vi.mocked(api.patch).mockRejectedValue({ response: { status: 500, data: { error: "Internal server error" } } });
    await openInsuranceEdit();
    fireEvent.change(policyInputs()[0], { target: { value: "TINCA2743700-26" } });
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    expect((await screen.findByRole("alert")).textContent).toContain("Internal server error");
    expect(screen.getByText("Edit Insurance Details")).toBeTruthy();
  });

  it("an expiry renders as its calendar date, not a day early", async () => {
    await openInsuranceEdit();
    expect(screen.getAllByText(/09\/01\/2027/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/08\/31\/2027/)).toBeNull();
  });
});

// coi-verify-email-fix C2b-2: three-state endorsements, insurer per policy, WC statutory + EL.
describe("Insurance tab, three-state", () => {
  it("shows Confirmed / Not provided / Not stated, never a bare tick or cross", async () => {
    await openInsuranceEdit();
    expect(screen.getByText(/Additional Insured: Confirmed/)).toBeTruthy();
    expect(screen.getByText(/Waiver of Subrogation: Not provided/)).toBeTruthy();
    expect(screen.getByText(/30-Day Notice: Not stated/)).toBeTruthy();
  });

  it("the three-way control sends null for Not stated, not false", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { ...JETEX } } as any);
    await openInsuranceEdit();
    fireEvent.change(screen.getByLabelText("SRL as Additional Insured"), { target: { value: "" } });
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.patch).mock.calls[0][1]).toEqual({ additionalInsuredSRL: null });
  });

  it("an insurer joins the changed-only save", async () => {
    vi.mocked(api.patch).mockResolvedValue({ data: { ...JETEX } } as any);
    await openInsuranceEdit();
    fireEvent.change(screen.getAllByPlaceholderText("Insurer")[0], { target: { value: "MS Transverse" } });
    fireEvent.change(screen.getAllByPlaceholderText("NAIC")[0], { target: { value: "21075" } });
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledTimes(1));
    expect(vi.mocked(api.patch).mock.calls[0][1]).toEqual({ autoLiabilityInsurerName: "MS Transverse", autoLiabilityInsurerNaic: "21075" });
  });

  it("shows workers comp as Statutory plus its EL limits", async () => {
    await openInsuranceEdit();
    expect(screen.getByText("Statutory · EL $1,000,000 / $1,000,000 / $1,000,000")).toBeTruthy();
  });
});

// coi-verify-email-fix C2d: a policy expiring within 30 days is flagged on its own block.
describe("per-policy 30-day expiry flag", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("flags only the policy inside 30 days (cargo, 11/1, seen on 10/15)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    await openInsuranceEdit();
    const flags = screen.getAllByText("Expires within 30 days");
    expect(flags).toHaveLength(1);
    expect(flags[0].closest("div.bg-gray-100")?.textContent).toContain("CARGO INSURANCE");
  });
});
