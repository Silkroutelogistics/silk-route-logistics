/**
 * E4 (ruling 6, 2026-09-21) — the paperwork panel renders the rule, and the
 * upload it offers is the slot's own type.
 *
 * The rule itself (which slots, required or not, the state precedence, the
 * one status gate) is held by backend/__tests__/unit/lib/paperwork.test.ts
 * against the shared module. This file holds the SURFACE: that each slot row
 * shows the state the rule computed, that a rejected upload carries the AE's
 * note, that the pickup slot is closed before AT_PICKUP and says so, that the
 * delivery slot offers BOTH accepted types and each button reports its own
 * type, and that the summary counts required slots only.
 *
 * Adversarially verified at authoring: reporting the slot's FIRST accepted
 * type for every button turns the two-button case red; dropping the `open`
 * check turns the closed-slot case red.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";
import { PaperworkPanel } from "./PaperworkPanel";

vi.mock("@/lib/download", () => ({ apiHref: (p: string) => p }));

const dryVan = { status: "DELIVERED", equipmentType: "Dry Van 53'", temperatureControlled: false };
const doc = (id: string, docType: string, status = "PENDING", extra: Record<string, unknown> = {}) => ({
  id, docType, status, fileName: `${id}.pdf`, createdAt: "2026-09-22T00:00:00Z", ...extra,
});
const slot = (key: string) => screen.getByTestId(`paperwork-slot-${key}`);

describe("PaperworkPanel", () => {
  it("one row per slot, each with the rule's state; the summary counts required slots only", () => {
    render(<PaperworkPanel load={dryVan} documents={[doc("p", "POD", "VERIFIED"), doc("s", "RECEIPT_SCALE")]} onUpload={vi.fn()} />);
    expect(slot("DELIVERY_PROOF").getAttribute("data-state")).toBe("VERIFIED");
    expect(slot("INVOICE").getAttribute("data-state")).toBe("MISSING");
    expect(slot("SCALE").getAttribute("data-state")).toBe("UPLOADED");
    expect(slot("LUMPER").getAttribute("data-state")).toBe("MISSING");
    expect(screen.queryByTestId("paperwork-slot-TEMP_LOG")).toBeNull();
    // 2 required (delivery proof, invoice); one on file.
    expect(screen.getByTestId("paperwork-summary").textContent).toBe("1 of 2 required on file");
    expect(within(slot("SCALE")).getByText("View").getAttribute("href")).toBe("/documents/s/download");
  });

  it("a reefer gets the temperature-log row, required", () => {
    render(<PaperworkPanel load={{ ...dryVan, equipmentType: "Reefer 53'" }} documents={[]} onUpload={vi.fn()} />);
    expect(slot("TEMP_LOG").textContent).toMatch(/Required/);
    expect(screen.getByTestId("paperwork-summary").textContent).toBe("0 of 3 required on file");
  });

  it("a rejected upload shows the AE's note and still counts as missing", () => {
    render(<PaperworkPanel load={dryVan} documents={[doc("i", "INVOICE", "REJECTED", { notes: "Wrong load number on the invoice." })]} onUpload={vi.fn()} />);
    expect(slot("INVOICE").getAttribute("data-state")).toBe("REJECTED");
    expect(screen.getByTestId("paperwork-rejection-INVOICE").textContent).toBe("Wrong load number on the invoice.");
    expect(screen.getByTestId("paperwork-summary").textContent).toBe("0 of 2 required on file");
    // and the slot still offers an upload — the carrier must replace it
    expect(within(slot("INVOICE")).getByTestId("paperwork-upload-INVOICE")).toBeTruthy();
  });

  it("the delivery slot offers BOTH accepted types, and each button reports its own type", () => {
    const onUpload = vi.fn();
    render(<PaperworkPanel load={dryVan} documents={[]} onUpload={onUpload} />);
    const row = slot("DELIVERY_PROOF");
    const bol = within(row).getByTestId("paperwork-upload-SIGNED_BOL_DEL").querySelector("input")!;
    const pod = within(row).getByTestId("paperwork-upload-POD").querySelector("input")!;
    const file = new File(["%PDF"], "pod.pdf", { type: "application/pdf" });
    fireEvent.change(pod, { target: { files: [file] } });
    expect(onUpload).toHaveBeenCalledWith("POD", file);
    fireEvent.change(bol, { target: { files: [file] } });
    expect(onUpload).toHaveBeenLastCalledWith("SIGNED_BOL_DEL", file);
  });

  it("the pickup BOL is closed before AT_PICKUP, says so, and has no input; open from AT_PICKUP", () => {
    const { unmount } = render(<PaperworkPanel load={{ ...dryVan, status: "DISPATCHED" }} documents={[]} onUpload={vi.fn()} />);
    expect(screen.getByTestId("paperwork-closed-PICKUP_BOL").textContent).toMatch(/Available from at pickup/);
    expect(slot("PICKUP_BOL").querySelector("input")).toBeNull();
    unmount();
    render(<PaperworkPanel load={{ ...dryVan, status: "AT_PICKUP" }} documents={[]} onUpload={vi.fn()} />);
    expect(screen.queryByTestId("paperwork-closed-PICKUP_BOL")).toBeNull();
    expect(slot("PICKUP_BOL").querySelector("input")).toBeTruthy();
  });

  it("a verified slot offers no upload; pending disables every input; an error renders", () => {
    render(<PaperworkPanel load={dryVan} documents={[doc("p", "POD", "VERIFIED")]} onUpload={vi.fn()} pending error="Upload failed. Please try again." />);
    expect(slot("DELIVERY_PROOF").querySelector("input")).toBeNull();
    for (const input of Array.from(document.querySelectorAll('input[type="file"]'))) {
      expect((input as HTMLInputElement).disabled).toBe(true);
    }
    expect(screen.getByTestId("paperwork-error").textContent).toBe("Upload failed. Please try again.");
  });
});
