/**
 * The F-D6 field sets must cover every money column on Load.
 *
 * lib/loadPartyView names the fields each party must not receive. A money column added
 * to Load later is withheld from nobody until it is classified, and nothing would say so.
 * This reads the Load model from schema.prisma and fails for any Float column whose name
 * reads as money and that sits in none of the four sets. It also checks the sets are
 * disjoint, and that the rule names the sides as the ruling does.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  CUSTOMER_SIDE_LOAD_FIELDS, CARRIER_SIDE_LOAD_FIELDS, SRL_ONLY_LOAD_FIELDS, SHARED_LOAD_MONEY_FIELDS,
  hiddenLoadFieldsFor, loadPartyOf,
} from "../../../src/lib/loadPartyView";

const MONEY_NAME = /rate|cost|margin|pay|amount|fee|price|revenue|profit|surcharge|total|estimate|value|permile/i;

function loadFloatFields(schema: string): string[] {
  const start = schema.indexOf("model Load {");
  expect(start, "model Load not found in schema.prisma").toBeGreaterThan(-1);
  const body = schema.slice(start, schema.indexOf("\n}", start));
  return [...body.matchAll(/^\s+([a-zA-Z0-9_]+)\s+Float\??/gm)].map((m) => m[1]);
}

const schema = fs.readFileSync(path.resolve(__dirname, "../../../prisma/schema.prisma"), "utf8");
const classified = new Set<string>([...CUSTOMER_SIDE_LOAD_FIELDS, ...CARRIER_SIDE_LOAD_FIELDS, ...SRL_ONLY_LOAD_FIELDS, ...SHARED_LOAD_MONEY_FIELDS]);

describe("loadPartyView — every money column on Load is classified", () => {
  it("the scan sees the Load model's money columns (vacuity)", () => {
    const money = loadFloatFields(schema).filter((f) => MONEY_NAME.test(f));
    expect(money).toEqual(expect.arrayContaining(["customerRate", "carrierRate", "grossMargin"]));
  });

  it("no money-named Float column on Load is left unclassified", () => {
    const unclassified = loadFloatFields(schema).filter((f) => MONEY_NAME.test(f) && !classified.has(f));
    expect(unclassified, "classify these in lib/loadPartyView before shipping them").toEqual([]);
  });

  it("the four sets do not overlap", () => {
    const all = [...CUSTOMER_SIDE_LOAD_FIELDS, ...CARRIER_SIDE_LOAD_FIELDS, ...SRL_ONLY_LOAD_FIELDS, ...SHARED_LOAD_MONEY_FIELDS];
    expect(new Set(all).size).toBe(all.length);
  });

  it("a carrier loses the customer side and the margin; a shipper the carrier side and the margin; staff nothing", () => {
    expect(hiddenLoadFieldsFor("CARRIER")).toEqual(expect.arrayContaining(["customerRate", "rate", "invoicedTotal", "grossMargin"]));
    expect(hiddenLoadFieldsFor("CARRIER")).not.toContain("carrierRate");
    expect(hiddenLoadFieldsFor("SHIPPER")).toEqual(expect.arrayContaining(["carrierRate", "totalCarrierPay", "grossMargin"]));
    expect(hiddenLoadFieldsFor("SHIPPER")).not.toContain("customerRate");
    expect(hiddenLoadFieldsFor("STAFF")).toEqual([]);
  });

  it("party: staff always; carrier only when assigned; shipper as poster or customer; nobody else", () => {
    const load = { carrierId: "c", posterId: "p", customer: { userId: "cu" } };
    expect(loadPartyOf({ id: "x", role: "ADMIN" }, load)).toBe("STAFF");
    expect(loadPartyOf({ id: "c", role: "CARRIER" }, load)).toBe("CARRIER");
    expect(loadPartyOf({ id: "z", role: "CARRIER" }, load)).toBeNull();
    expect(loadPartyOf({ id: "p", role: "SHIPPER" }, load)).toBe("SHIPPER");
    expect(loadPartyOf({ id: "cu", role: "SHIPPER" }, load)).toBe("SHIPPER");
    expect(loadPartyOf({ id: "c", role: "SHIPPER" }, load)).toBeNull(); // the carrier's id under the wrong role
    expect(loadPartyOf({ id: "p", role: "FACTOR" }, load)).toBeNull();
    expect(loadPartyOf(undefined, load)).toBeNull();
    expect(loadPartyOf({ id: "cu", role: "SHIPPER" }, { carrierId: "c", posterId: "p", customer: { userId: null } })).toBeNull();
  });
});
