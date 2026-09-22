/**
 * Ruling 6 (2026-09-21) as code — shared/constants/paperwork, the one table
 * the carrier's paperwork panel (E4) and the settlement gate (E5) both read.
 *
 * "Required paperwork: SIGNED_BOL_DEL or POD, plus INVOICE; TEMP_LOG required
 * on reefer; RECEIPT_LUMPER/RECEIPT_SCALE optional; SIGNED_BOL_PU accepted from
 * AT_PICKUP, not required."
 *
 * Pure cases over the rule, plus the parity that makes it one vocabulary: the
 * words here are exactly backend/src/lib/documentTypes SETTLEMENT_DOC_TYPES,
 * so a type added to either side without the other fails here. The route gate
 * (POST /carrier-loads/:id/documents refusing a pickup BOL before AT_PICKUP)
 * is in routes/carrierPaperworkGate.test.ts.
 */
import { describe, it, expect } from "vitest";
import {
  PAPERWORK_DOC_TYPES,
  PAPERWORK_DOC_LABELS,
  isReeferLoad,
  paperworkAccepts,
  paperworkOpenAt,
  paperworkNotBefore,
  paperworkSlotsFor,
  paperworkSlots,
  paperworkMissing,
} from "../../../../shared/constants/paperwork";
import { SETTLEMENT_DOC_TYPES } from "../../../src/lib/documentTypes";

const dryVan = { status: "DELIVERED", equipmentType: "Dry Van 53'", temperatureControlled: false };
const reefer = { status: "DELIVERED", equipmentType: "Reefer 53'", temperatureControlled: false };
const doc = (docType: string, status = "PENDING", extra: Record<string, unknown> = {}) => ({
  id: `d-${docType}-${status}`, docType, status, createdAt: "2026-09-22T00:00:00Z", ...extra,
});

describe("one vocabulary", () => {
  it("PAPERWORK_DOC_TYPES is exactly SETTLEMENT_DOC_TYPES, and every type has a label", () => {
    expect([...PAPERWORK_DOC_TYPES].sort()).toEqual([...SETTLEMENT_DOC_TYPES].sort());
    for (const t of PAPERWORK_DOC_TYPES) expect(PAPERWORK_DOC_LABELS[t]).toMatch(/\S/);
  });
});

describe("reefer", () => {
  it("is decided by the flag OR the equipment string, in any spelling", () => {
    expect(isReeferLoad({ equipmentType: "Reefer 53'", temperatureControlled: false })).toBe(true);
    expect(isReeferLoad({ equipmentType: "REEFER", temperatureControlled: null })).toBe(true);
    expect(isReeferLoad({ equipmentType: "Refrigerated van" })).toBe(true);
    expect(isReeferLoad({ equipmentType: "Dry Van 53'", temperatureControlled: true })).toBe(true);
    expect(isReeferLoad({ equipmentType: "Dry Van 53'", temperatureControlled: false })).toBe(false);
    expect(isReeferLoad({ equipmentType: null })).toBe(false);
  });
});

describe("the required set", () => {
  it("dry van: proof of delivery (either type) and the invoice; lumper and scale optional; no temp-log slot at all", () => {
    const slots = paperworkSlotsFor(dryVan);
    expect(slots.map((s) => s.key)).toEqual(["PICKUP_BOL", "DELIVERY_PROOF", "INVOICE", "LUMPER", "SCALE"]);
    expect(slots.filter((s) => s.required).map((s) => s.key)).toEqual(["DELIVERY_PROOF", "INVOICE"]);
    expect(slots.find((s) => s.key === "DELIVERY_PROOF")!.accepts).toEqual(["SIGNED_BOL_DEL", "POD"]);
  });

  it("reefer: the temperature log appears and is required", () => {
    const slots = paperworkSlotsFor(reefer);
    expect(slots.map((s) => s.key)).toContain("TEMP_LOG");
    expect(slots.filter((s) => s.required).map((s) => s.key)).toEqual(["DELIVERY_PROOF", "INVOICE", "TEMP_LOG"]);
  });

  it("the pickup BOL is never required", () => {
    for (const l of [dryVan, reefer]) expect(paperworkSlotsFor(l).find((s) => s.key === "PICKUP_BOL")!.required).toBe(false);
  });
});

describe("the one status gate", () => {
  it("SIGNED_BOL_PU is refused before AT_PICKUP and accepted from it", () => {
    for (const s of ["CONFIRMED", "BOOKED", "DISPATCHED"]) expect(paperworkAccepts("SIGNED_BOL_PU", s), s).toBe(false);
    for (const s of ["AT_PICKUP", "LOADED", "IN_TRANSIT", "DELIVERED", "COMPLETED"]) expect(paperworkAccepts("SIGNED_BOL_PU", s), s).toBe(true);
    expect(paperworkNotBefore("SIGNED_BOL_PU")).toBe("AT_PICKUP");
  });

  it("every other paperwork type is open from CONFIRMED", () => {
    for (const t of PAPERWORK_DOC_TYPES.filter((t) => t !== "SIGNED_BOL_PU")) {
      expect(paperworkAccepts(t, "CONFIRMED"), t).toBe(true);
      expect(paperworkAccepts(t, "BOOKED"), t).toBe(true);
      expect(paperworkNotBefore(t)).toBe("CONFIRMED");
    }
  });

  it("nothing is accepted on a load outside the pipeline — POSTED, CANCELLED, TONU — and the rule says the load is closed, not early", () => {
    for (const s of ["DRAFT", "POSTED", "TENDERED", "CANCELLED", "TONU"]) {
      expect(paperworkOpenAt(s), s).toBe(false);
      expect(paperworkAccepts("POD", s), s).toBe(false);
    }
    expect(paperworkOpenAt("BOOKED")).toBe(true);
  });

  it("a type this rule does not govern (a photo, the original BOL) is not its business", () => {
    expect(paperworkAccepts("PHOTO_SEAL", "DELIVERED")).toBe(false);
    expect(paperworkNotBefore("BOL")).toBeNull();
  });
});

describe("slot state", () => {
  it("MISSING with nothing on the load; the required slots are what paperworkMissing names", () => {
    const slots = paperworkSlots(dryVan, []);
    expect(slots.every((s) => s.state === "MISSING")).toBe(true);
    expect(paperworkMissing(slots).map((s) => s.key)).toEqual(["DELIVERY_PROOF", "INVOICE"]);
  });

  it("either delivery document satisfies the delivery slot", () => {
    expect(paperworkSlots(dryVan, [doc("POD")]).find((s) => s.key === "DELIVERY_PROOF")!.state).toBe("UPLOADED");
    expect(paperworkSlots(dryVan, [doc("SIGNED_BOL_DEL")]).find((s) => s.key === "DELIVERY_PROOF")!.state).toBe("UPLOADED");
  });

  it("precedence: VERIFIED over UPLOADED over REJECTED, and a rejection carries the AE's note", () => {
    const pick = (docs: any[]) => paperworkSlots(dryVan, docs).find((s) => s.key === "INVOICE")!;
    expect(pick([doc("INVOICE", "REJECTED", { notes: "wrong load number" })]).state).toBe("REJECTED");
    expect(pick([doc("INVOICE", "REJECTED", { notes: "wrong load number" })]).rejectionNote).toBe("wrong load number");
    expect(pick([doc("INVOICE", "REJECTED"), doc("INVOICE", "PENDING")]).state).toBe("UPLOADED");
    expect(pick([doc("INVOICE", "REJECTED"), doc("INVOICE", "PENDING"), doc("INVOICE", "VERIFIED")]).state).toBe("VERIFIED");
  });

  it("a rejected required document still counts as missing — the AE is waiting for a replacement", () => {
    const slots = paperworkSlots(dryVan, [doc("INVOICE", "REJECTED"), doc("POD", "VERIFIED")]);
    expect(paperworkMissing(slots).map((s) => s.key)).toEqual(["INVOICE"]);
  });

  it("documents in a slot are newest first, and a document of another type never lands in it", () => {
    const slots = paperworkSlots(dryVan, [
      doc("POD", "PENDING", { id: "old", createdAt: "2026-09-01T00:00:00Z" }),
      doc("POD", "PENDING", { id: "new", createdAt: "2026-09-20T00:00:00Z" }),
      doc("RECEIPT_SCALE", "PENDING"),
      doc("PHOTO_SEAL", "PENDING"),
    ]);
    const del = slots.find((s) => s.key === "DELIVERY_PROOF")!;
    expect(del.documents.map((d) => d.id)).toEqual(["new", "old"]);
    expect(slots.find((s) => s.key === "SCALE")!.documents).toHaveLength(1);
    expect(slots.flatMap((s) => s.documents).some((d) => d.docType === "PHOTO_SEAL")).toBe(false);
  });

  it("`open` follows the status gate: the pickup slot is closed at BOOKED and open at AT_PICKUP; the rest open at BOOKED", () => {
    const at = (status: string) => paperworkSlots({ ...dryVan, status }, []);
    expect(at("BOOKED").find((s) => s.key === "PICKUP_BOL")!.open).toBe(false);
    expect(at("AT_PICKUP").find((s) => s.key === "PICKUP_BOL")!.open).toBe(true);
    expect(at("BOOKED").filter((s) => s.key !== "PICKUP_BOL").every((s) => s.open)).toBe(true);
    expect(at("CANCELLED").every((s) => !s.open)).toBe(true);
  });
});
