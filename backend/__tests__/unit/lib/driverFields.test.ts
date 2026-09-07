/**
 * Accepting a load writes only the driver fields the body carried.
 *
 * The carrier portal's accept button posts no body. Until Phase 0 of the
 * mandatory-ELD arc the accept route wrote all four driver fields as
 * `value || null`, so every portal accept erased the driver name, phone,
 * truck and trailer an AE had entered on the load, and the rate confirmation
 * gate that needs a verified driver phone found nothing to verify. The rule
 * that PATCH /:id/driver already had is now one helper used by both routes.
 *
 * Phase 0 of the mandatory-ELD arc.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { driverFieldsFromBody, hasDriverFields } from "../../../src/lib/driverFields";

describe("driverFieldsFromBody", () => {
  it("an empty body touches nothing", () => {
    expect(driverFieldsFromBody({})).toEqual({});
    expect(driverFieldsFromBody(undefined)).toEqual({});
    expect(driverFieldsFromBody(null)).toEqual({});
    expect(hasDriverFields(driverFieldsFromBody({}))).toBe(false);
  });

  it("writes only the keys present, trimmed", () => {
    expect(driverFieldsFromBody({ driverName: "  Sam Tran " })).toEqual({ driverName: "Sam Tran" });
    expect(driverFieldsFromBody({ truckNumber: "T-118", trailerNumber: "R-22" })).toEqual({
      truckNumber: "T-118",
      trailerNumber: "R-22",
    });
  });

  it("an explicit empty string or null clears the column", () => {
    expect(driverFieldsFromBody({ driverPhone: "" })).toEqual({ driverPhone: null });
    expect(driverFieldsFromBody({ driverPhone: "   " })).toEqual({ driverPhone: null });
    expect(driverFieldsFromBody({ driverPhone: null })).toEqual({ driverPhone: null });
  });

  it("ignores unrelated keys and non-string values", () => {
    expect(driverFieldsFromBody({ status: "BOOKED", driverName: 42, truckNumber: undefined })).toEqual({});
  });
});

describe("both carrier routes go through the helper", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../../src/routes/carrierLoads.ts"), "utf8");

  it("the accept route no longer nulls fields the body did not carry", () => {
    expect(src).not.toContain("driverName: driverName || null");
    expect(src).not.toContain("truckNumber: truckNumber || null");
  });

  it("accept and PATCH /:id/driver both read present-only fields", () => {
    // Two call sites: accept, and the PATCH the panel saves through.
    expect(src.split("driverFieldsFromBody(req.body)").length - 1).toBe(2);
  });
});
