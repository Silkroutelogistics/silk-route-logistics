/**
 * The with-tender schema carries every freight fact the Rate Confirmation
 * prints (v3.8.bof).
 *
 * `validateBody` replaces req.body with the parsed result and `z.object()`
 * strips keys it does not declare, so a field Order Builder sends and this
 * schema omits never reaches the controller — the RC then prints a blank with
 * no error anywhere. That is §19 Sub-pattern 5, and it is how the pickup
 * appointment, pickup number, cargo value, pallets and driver instructions
 * were lost on this path.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { createLoadWithTenderSchema } from "../../../src/validators/withTender";

const base = {
  customerId: "cust-1",
  originCity: "Irving", originState: "TX", originZip: "75063",
  destCity: "Northlake", destState: "TX", destZip: "76262",
  equipmentType: "Dry Van 53'",
  lineItems: [{ lineNumber: 1, pieces: 18, description: "OTC Supplements", weight: 34500 }],
  pickupDate: "2026-09-27T00:00:00.000Z",
  deliveryDate: "2026-09-27T00:00:00.000Z",
  tender: { carrierId: "cp-1", offeredRate: 400, expiresAt: "2026-09-28T00:00:00.000Z" },
};

const PRINTED = {
  pickupAppointment: "24565412",
  deliveryAppointment: "DA-99",
  pickupNumber: "PU-7781",
  shipperReference: "SR-1",
  deliveryReference: "DR-2",
  cargoValue: 84000,
  pallets: 18,
  driverInstructions: "Check in at the guard shack.",
};

describe("createLoadWithTenderSchema", () => {
  it("keeps every field the rate confirmation prints", () => {
    const parsed = createLoadWithTenderSchema.parse({ ...base, ...PRINTED });
    for (const [k, v] of Object.entries(PRINTED)) {
      expect((parsed as Record<string, unknown>)[k], `${k} was stripped`).toEqual(v);
    }
  });

  it("keeps a declared value of zero", () => {
    // `|| null` downstream would turn 0 into "not declared"; the schema must
    // at least hand the controller the 0.
    expect(createLoadWithTenderSchema.parse({ ...base, cargoValue: 0 }).cargoValue).toBe(0);
  });

  it("refuses a negative value or a fractional pallet count", () => {
    expect(createLoadWithTenderSchema.safeParse({ ...base, cargoValue: -1 }).success).toBe(false);
    expect(createLoadWithTenderSchema.safeParse({ ...base, pallets: 1.5 }).success).toBe(false);
  });

  it("the controller writes every one of them onto the load", () => {
    // The other end of the pipe: a declared field the controller never writes
    // is lost just as surely as a stripped one.
    const src = fs.readFileSync(path.join(__dirname, "../../../src/controllers/withTenderController.ts"), "utf8");
    for (const k of Object.keys(PRINTED)) {
      expect(src, `withTenderController never writes ${k}`).toMatch(new RegExp(`\\b${k}:\\s*loadFields\\.${k}\\b`));
    }
  });

  it("the direct-create path (waterfall, load board) writes them too", () => {
    const src = fs.readFileSync(path.join(__dirname, "../../../src/controllers/loadController.ts"), "utf8");
    for (const k of Object.keys(PRINTED)) {
      expect(src, `createLoad never writes ${k}`).toMatch(new RegExp(`\\b${k}:\\s*raw\\.${k}\\b`));
    }
  });

  it("vacuity: an undeclared key really is stripped", () => {
    const parsed = createLoadWithTenderSchema.parse({ ...base, notAField: "x" });
    expect((parsed as Record<string, unknown>).notAField).toBeUndefined();
  });
});
