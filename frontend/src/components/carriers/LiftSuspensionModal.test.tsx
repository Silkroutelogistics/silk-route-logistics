/**
 * LiftSuspensionModal — the AE side of POST /compliance/carrier/:id/lift-suspension.
 *
 * Held here: a 5-character reason before the button enables; the post carries
 * the trimmed reason to the right route; a server refusal is shown rather than
 * swallowed; the modal says what is being lifted and that lifting is not an
 * approval; and an automatic suspension carries a warning a manual one does
 * not, with OFAC worded as the absolute it is.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() } }));

import { api } from "@/lib/api";
import { LiftSuspensionModal } from "./LiftSuspensionModal";

const MANUAL_REASON = "Suspended by an administrator: Carrier not needed in the network.";

function mount(props: Partial<Parameters<typeof LiftSuspensionModal>[0]> = {}) {
  const onDone = vi.fn();
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LiftSuspensionModal
        carrierId="cp-1"
        carrierName="Blue Falcon Brokerage LLC"
        suspendedAt="2026-09-23T22:23:54.133Z"
        suspendReason={MANUAL_REASON}
        suspendCause="AE_MANUAL"
        onClose={onClose}
        onDone={onDone}
        {...props}
      />
    </QueryClientProvider>,
  );
  return { onDone, onClose };
}

describe("LiftSuspensionModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a 5-character reason, then posts the trimmed reason to the lift route", async () => {
    vi.mocked(api.post).mockResolvedValue({ data: { success: true } });
    const { onDone } = mount();
    const box = screen.getByLabelText(/reason/i);
    const btn = screen.getByRole("button", { name: /^lift suspension$/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    await userEvent.type(box, "  test");
    expect(btn.disabled).toBe(true);
    await userEvent.type(box, "ing the portal  ");
    expect(btn.disabled).toBe(false);
    await userEvent.click(btn);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/compliance/carrier/cp-1/lift-suspension", { reason: "testing the portal" }),
    );
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("a server refusal is rendered, and the modal stays open", async () => {
    vi.mocked(api.post).mockRejectedValue({
      response: { status: 409, data: { code: "CARRIER_ARCHIVED", error: "This carrier is archived. Restore it first; restoring returns it to REVIEWING." } },
    });
    const { onDone, onClose } = mount();
    await userEvent.type(screen.getByLabelText(/reason/i), "needed for testing");
    await userEvent.click(screen.getByRole("button", { name: /^lift suspension$/i }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Restore it first");
    expect(onDone).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows what is being lifted, and says lifting is not an approval", () => {
    mount();
    const dialog = screen.getByRole("dialog", { name: /Lift suspension on Blue Falcon Brokerage LLC/ });
    expect(dialog.textContent).toContain("Suspended by an administrator");
    expect(dialog.textContent).toContain(MANUAL_REASON);
    expect(dialog.textContent).toContain("2026");
    expect(dialog.textContent).toContain("returns this carrier to REVIEWING");
    expect(dialog.textContent).toContain("It does not approve them");
  });

  it("a manual suspension carries no automatic-suspension warning", () => {
    mount();
    expect(screen.queryByText(/This suspension was automatic/)).toBeNull();
  });

  it("an automatic suspension warns that it comes back if the condition still holds", () => {
    mount({ suspendCause: "INSURANCE_EXPIRED", suspendReason: "Auto-suspended: Insurance expired on 2026-09-01" });
    expect(screen.getByRole("dialog", { name: /Lift suspension/ }).textContent).toContain("Automatic: insurance expired");
    expect(screen.getByText(/This suspension was automatic/)).toBeTruthy();
  });

  it("an OFAC suspension says lifting does not clear the sanctions match", () => {
    mount({ suspendCause: "OFAC_MATCH", suspendReason: "OFAC match score 92" });
    expect(screen.getByText(/does not clear the sanctions match/)).toBeTruthy();
    expect(screen.queryByText(/This suspension was automatic/)).toBeNull();
  });
});
