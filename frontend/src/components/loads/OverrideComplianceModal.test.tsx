/**
 * OverrideComplianceModal — carrier-archive recut B2a (2026-09-20).
 *
 * The modal is the third leg of the §14 mirror rule: the gate marks a block
 * overridable:false, the endpoint 409s on it, and the modal must DISABLE
 * submit rather than offer a button the endpoint refuses. Before B2a the
 * disable keyed on a hand-kept list of named codes, and the one time a code
 * was added to the gate and the endpoint without a name here
 * (INSURANCE_EXPIRED, v3.8.axl) the modal offered the override anyway. The
 * disable is now generic on overridable:false; these cases hold that, and
 * hold the two new panels' remedies by text.
 *
 * Real render, real user events. The quota query is mocked to an empty
 * quota so nothing else disables the button — the reason text and the
 * confirmation are filled in every case, so a disabled button here is the
 * code's doing and nothing else's.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));

import { OverrideComplianceModal, type BlockedCode } from "./OverrideComplianceModal";

function mount(blockedCodes: BlockedCode[], blockedReasons: string[] = ["a reason from the gate"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OverrideComplianceModal
        carrierId="cp-1"
        carrierName="Probe Carrier LLC"
        blockedReasons={blockedReasons}
        blockedCodes={blockedCodes}
        onClose={() => {}}
        onSuccess={() => {}}
      />
    </QueryClientProvider>,
  );
}

/** Satisfy every OTHER submit precondition so only the code decides. */
async function fillTheForm() {
  await userEvent.type(screen.getByRole("textbox"), "a reason long enough to pass the ten-character floor");
  await userEvent.click(screen.getByRole("checkbox"));
}

const applyButton = () => screen.getByTestId("apply-override-btn") as HTMLButtonElement;

beforeEach(() => {
  api.get.mockReset();
  api.get.mockResolvedValue({ data: { recentOverrideCount: 0, max: 15, activeOverride: null } });
});

describe("OverrideComplianceModal disables submit on any overridable:false code", () => {
  it("control: a waivable-only block leaves submit ENABLED once the form is filled", async () => {
    mount([{ code: "CHAMELEON_UNREVIEWED", overridable: true }]);
    await fillTheForm();
    expect(applyButton().disabled).toBe(false);
  });

  it("CARRIER_ARCHIVED disables submit and the panel names the restore as the remedy", async () => {
    mount([{ code: "CARRIER_ARCHIVED", overridable: false }]);
    await fillTheForm();
    expect(applyButton().disabled).toBe(true);
    expect(applyButton().title).toMatch(/archived/i);
    expect(screen.getByText(/Carrier record archived — not overridable/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/Restore the carrier/);
  });

  it("CARRIER_NOT_APPROVED disables submit and the panel names the state that was met", async () => {
    mount([{ code: "CARRIER_NOT_APPROVED", status: "REVIEWING", overridable: false }]);
    await fillTheForm();
    expect(applyButton().disabled).toBe(true);
    expect(screen.getByText(/Carrier is REVIEWING — not overridable/)).toBeTruthy();
    expect(document.body.textContent).toMatch(/Only an APPROVED carrier may be tendered/);
  });

  it("INSURANCE_EXPIRED disables submit — the half-mirror v3.8.axl left open", async () => {
    // The gate and the endpoint refused it since axl; the modal offered it.
    mount([{ code: "INSURANCE_EXPIRED", overridable: false }]);
    await fillTheForm();
    expect(applyButton().disabled).toBe(true);
    expect(screen.getByText(/Insurance expired — not overridable/)).toBeTruthy();
  });

  it("a code the modal has never heard of, marked overridable:false, still disables submit", async () => {
    // The generic rule is the guard: a NINTH absolute added to the gate and
    // the endpoint but not named here must not fall through to an offered
    // button. The mirror test holds the union; this holds the behaviour.
    mount([{ code: "SOME_FUTURE_ABSOLUTE" as BlockedCode["code"], overridable: false }]);
    await fillTheForm();
    expect(applyButton().disabled).toBe(true);
    expect(applyButton().title).toMatch(/Not overridable/);
  });

  it("an absolute beside a waivable block still disables — the waivable one does not win", async () => {
    mount([
      { code: "CHAMELEON_UNREVIEWED", overridable: true },
      { code: "CARRIER_ARCHIVED", overridable: false },
    ]);
    await fillTheForm();
    expect(applyButton().disabled).toBe(true);
  });
});
