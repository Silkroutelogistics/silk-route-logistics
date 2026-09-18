/**
 * The cancel modal sends what the server requires, and refuses what it would.
 *
 * B7a (v3.8.bdd). Since v3.8.bcy the server refuses a CANCELLED write without
 * a reason code, and OTHER without a note of ten characters. Production Cancel
 * was a window.prompt() that sent neither, so every click was refused. This
 * modal is the surface that restores it, and these cases pin the contract in
 * both directions: the payload it sends, and the submissions it never makes.
 *
 * Rendered with the real component; only onConfirm is a stub. The fault-party
 * cases loop over the SHARED list so a reason added there is covered without
 * anyone editing this file.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { CancelLoadModal } from "./CancelLoadModal";
import {
  CANCELLATION_REASONS,
  FAULT_PARTY_LABELS,
  MIN_CANCELLATION_NOTE_LENGTH,
  faultPartyFor,
} from "@shared/constants/cancellationReasons";

function mount(opts: { onConfirm?: (p: unknown) => Promise<unknown>; onClose?: () => void; intent?: "cancel" | "archive" } = {}) {
  const onConfirm = opts.onConfirm ?? vi.fn(async () => ({}));
  const onClose = opts.onClose ?? vi.fn();
  render(<CancelLoadModal open loadNumber="SRL-121492" intent={opts.intent} onClose={onClose} onConfirm={onConfirm} />);
  const select = screen.getByLabelText("Reason") as HTMLSelectElement;
  const note = screen.getByLabelText(/^Note/) as HTMLTextAreaElement;
  const submit = screen.getByRole("button", { name: opts.intent === "archive" ? "Archive load" : "Cancel load" }) as HTMLButtonElement;
  return { onConfirm, onClose, select, note, submit };
}

describe("CancelLoadModal — the payload", () => {
  it("submits cancellationReasonCode, and no note key when the note is blank", async () => {
    const { onConfirm, onClose, select, submit } = mount();
    expect(submit.disabled, "nothing chosen yet → cannot submit").toBe(true);
    fireEvent.change(select, { target: { value: "SHIPPER_FREIGHT_NOT_READY" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({ cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY" });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("sends the trimmed note alongside the code when one is given", async () => {
    const { onConfirm, select, note, submit } = mount();
    fireEvent.change(select, { target: { value: "CARRIER_NO_SHOW" } });
    fireEvent.change(note, { target: { value: "  driver never arrived at the dock  " } });
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({
      cancellationReasonCode: "CARRIER_NO_SHOW",
      cancellationReason: "driver never arrived at the dock",
    });
  });

  it("the payload carries no fault party — the server derives it, the modal only shows it", async () => {
    const { onConfirm, select, submit } = mount();
    fireEvent.change(select, { target: { value: "CARRIER_LATE" } });
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    const payload = (onConfirm as ReturnType<typeof vi.fn>).mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(["cancellationReasonCode"]);
  });
});

describe("CancelLoadModal — OTHER requires a note, client-side", () => {
  it("OTHER with no note cannot be submitted, and onConfirm is never called", async () => {
    const { onConfirm, select, submit } = mount();
    fireEvent.change(select, { target: { value: "OTHER" } });
    expect(submit.disabled).toBe(true);
    fireEvent.click(submit);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText(/required — at least 10 characters/)).toBeTruthy();
  });

  it("OTHER with a note one character short stays blocked; at the minimum it submits with both fields", async () => {
    const { onConfirm, select, note, submit } = mount();
    fireEvent.change(select, { target: { value: "OTHER" } });
    const short = "x".repeat(MIN_CANCELLATION_NOTE_LENGTH - 1);
    fireEvent.change(note, { target: { value: `  ${short}  ` } });
    expect(submit.disabled, "whitespace does not count toward the minimum").toBe(true);
    const exact = "x".repeat(MIN_CANCELLATION_NOTE_LENGTH);
    fireEvent.change(note, { target: { value: exact } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledWith({ cancellationReasonCode: "OTHER", cancellationReason: exact });
  });
});

describe("CancelLoadModal — the fault party is derived and read-only", () => {
  it("every shared reason renders the fault party the shared map implies", () => {
    const { select } = mount();
    expect(CANCELLATION_REASONS.length, "tripwire: the shared list must be non-empty").toBeGreaterThan(0);
    for (const r of CANCELLATION_REASONS) {
      fireEvent.change(select, { target: { value: r } });
      const text = screen.getByTestId("fault-party").textContent ?? "";
      expect(text, r).toContain(`Fault party: ${FAULT_PARTY_LABELS[faultPartyFor(r)]}`);
    }
  });

  it("a carrier reason says it counts against the carrier; a shipper reason says the carrier is not marked", () => {
    const { select } = mount();
    fireEvent.change(select, { target: { value: "CARRIER_NO_SHOW" } });
    expect(screen.getByTestId("fault-party").textContent).toMatch(/counts against the carrier/);
    fireEvent.change(select, { target: { value: "SHIPPER_CANCELLED" } });
    expect(screen.getByTestId("fault-party").textContent).toMatch(/carrier is not marked/i);
  });

  it("there is exactly one select and no control for the fault party", () => {
    mount();
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});

describe("CancelLoadModal — a refusal is shown, not swallowed", () => {
  it("stays open and prints the server's 400 details naming the field", async () => {
    const refusal = Object.assign(new Error("Request failed with status code 400"), {
      response: {
        data: {
          error: "Validation failed",
          details: [{ field: "cancellationReasonCode", message: "Reason OTHER needs a note of at least 10 characters saying what happened." }],
        },
      },
    });
    const onConfirm = vi.fn(async () => { throw refusal; });
    const { onClose, select, submit } = mount({ onConfirm });
    fireEvent.change(select, { target: { value: "SHIPPER_CANCELLED" } });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/needs a note of at least 10 characters/));
    expect(onClose).not.toHaveBeenCalled();
    expect(submit.disabled, "the AE can correct and resubmit").toBe(false);
  });

  it("prints a 409/422 error body when there are no details", async () => {
    const refusal = Object.assign(new Error("Request failed with status code 409"), {
      response: { data: { error: "Proof of delivery is on file; this load is a claim question, not a cancellation.", code: "POD_ON_FILE" } },
    });
    const onConfirm = vi.fn(async () => { throw refusal; });
    const { select, submit } = mount({ onConfirm });
    fireEvent.change(select, { target: { value: "SHIPPER_CANCELLED" } });
    fireEvent.click(submit);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Proof of delivery is on file/));
  });
});

describe("CancelLoadModal — archive intent", () => {
  it("names the act as archiving and still sends the same payload", async () => {
    const { onConfirm, select, submit } = mount({ intent: "archive" });
    expect(screen.getByText(/Nothing is deleted/)).toBeTruthy();
    fireEvent.change(select, { target: { value: "DUPLICATE_ENTRY" } });
    fireEvent.click(submit);
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ cancellationReasonCode: "DUPLICATE_ENTRY" }));
  });
});
