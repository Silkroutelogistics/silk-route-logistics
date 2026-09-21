/** v3.8.ase — what the CUSTOMER is billed for an accessorial.
 *
 *  This decides margin. Until this sprint LoadAccessorial had one `amount`
 *  column and both sides read it, so every accessorial was billed at exactly
 *  what the carrier was paid and SRL earned nothing on any of them —
 *  while Customer.defaultAccessorialRates sat there holding the negotiated
 *  rates, read by no money path.
 *
 *  The rule these pin: carrier pay is the uniform ratified schedule, customer
 *  billing is negotiable per contract, and the two must be able to differ.
 */
import { describe, it, expect } from "vitest";
import { customerPriceFor } from "../../../src/services/invoiceService";
import fs from "fs";
import path from "path";

const DETENTION = { type: "DETENTION_DEL", amount: 250, quantity: 5 };

describe("customerPriceFor", () => {
  it("bills at cost when SRL has negotiated nothing", () => {
    // The honest default, and exactly the behaviour before customerAmount existed.
    expect(customerPriceFor(DETENTION, null)).toBe(250);
    expect(customerPriceFor(DETENTION, undefined)).toBe(250);
    expect(customerPriceFor(DETENTION, {})).toBe(250);
  });

  it("bills the negotiated rate PER UNIT when the row carries a quantity", () => {
    // 5 billable hours at a negotiated $75 customer rate = $375 billed against
    // $250 paid. That $125 is the margin the single-column model could not hold.
    expect(customerPriceFor(DETENTION, { DETENTION_DEL: 75 })).toBe(375);
  });

  it("bills a negotiated rate FLAT when the row carries no quantity", () => {
    // TONU records no quantity. Multiplying by a missing quantity would bill $0 —
    // absence of a quantity has to mean "flat", not "times nothing".
    const tonu = { type: "TONU", amount: 200 };
    expect(customerPriceFor(tonu, { TONU: 300 })).toBe(300);
    expect(customerPriceFor({ ...tonu, quantity: null }, { TONU: 300 })).toBe(300);
  });

  it("treats a quantity of ZERO as a real quantity, not as absent", () => {
    // A zero-hour dwell bills nothing. If 0 were read as "flat" it would bill the
    // full negotiated rate for a stop the carrier was never held at.
    expect(customerPriceFor({ type: "DETENTION_DEL", amount: 0, quantity: 0 }, { DETENTION_DEL: 75 })).toBe(0);
  });

  it("lets an explicit customerAmount win over both the rate card and cost", () => {
    // A figure already on the row was decided for THIS event — by negotiation at
    // creation or by an AE. Nothing recomputes behind an operator.
    expect(customerPriceFor({ ...DETENTION, customerAmount: 400 }, { DETENTION_DEL: 75 })).toBe(400);
    expect(customerPriceFor({ ...DETENTION, customerAmount: 400 }, null)).toBe(400);
  });

  it("honours an explicit customerAmount of zero — a waived charge stays waived", () => {
    // The classic falsy-zero trap. `customerAmount || fallback` would silently
    // re-bill a charge an AE deliberately zeroed as a goodwill credit.
    expect(customerPriceFor({ ...DETENTION, customerAmount: 0 }, { DETENTION_DEL: 75 })).toBe(0);
  });

  it("falls back rather than billing nonsense when a rate card is malformed", () => {
    // defaultAccessorialRates is free-form JSON off a customer record. A string,
    // a negative, or a NaN must not reach an invoice.
    expect(customerPriceFor(DETENTION, { DETENTION_DEL: "75" } as any)).toBe(250);
    expect(customerPriceFor(DETENTION, { DETENTION_DEL: -10 })).toBe(250);
    expect(customerPriceFor(DETENTION, { DETENTION_DEL: NaN })).toBe(250);
  });

  it("only applies the rate card entry matching this accessorial's type", () => {
    expect(customerPriceFor(DETENTION, { LUMPER: 90 })).toBe(250);
  });

  it("resolves a rate card typed in any casing or separator", () => {
    // The CRM editor was free text with a placeholder reading "e.g. Detention,
    // Layover, TONU". An AE who followed it produced keys that matched nothing and
    // the row silently billed at cost — an invoice that looks entirely normal.
    // v3.8.asf constrains the editor; this covers the cards already typed.
    for (const key of ["detention_del", "Detention_Del", "DETENTION DEL", "detention-del", " DETENTION_DEL "]) {
      expect(customerPriceFor(DETENTION, { [key]: 75 })).toBe(375);
    }
  });

  it("still refuses to guess which detention leg a bare 'Detention' meant", () => {
    // The enum has no DETENTION — it splits DETENTION_PU and DETENTION_DEL.
    // Normalising case is safe; inventing the missing leg is not, so this bills at
    // cost rather than picking one and being confidently wrong about the money.
    expect(customerPriceFor(DETENTION, { Detention: 75 })).toBe(250);
  });

  it("rounds to cents", () => {
    // 3 × 33.333 = 99.999, which must not reach a customer document.
    expect(customerPriceFor({ type: "DETENTION_DEL", amount: 10, quantity: 3 }, { DETENTION_DEL: 33.333 })).toBe(100);
  });

  it("never lets the carrier-pay figure leak into the customer price when a rate exists", () => {
    // The whole point: two numbers, independently resolved. A change to what the
    // carrier is paid must not move what the customer is billed.
    const cheap = customerPriceFor({ type: "DETENTION_DEL", amount: 250, quantity: 5 }, { DETENTION_DEL: 75 });
    const dear = customerPriceFor({ type: "DETENTION_DEL", amount: 999, quantity: 5 }, { DETENTION_DEL: 75 });
    expect(cheap).toBe(dear);
  });

  // ── Unit conversion (§13.3 Item 282 finding i; landed before the merge per decision 1, 2026-09-21) ──

  it("converts a minute-denominated quantity to hours before an hourly rate — $75/hr × 120 minutes is $150, not $9,000", () => {
    // The only detention writer (lib/detentionLayover.ts) stores
    // `quantity: billableMinutes, unit: "minutes"`; the CRM rate card is entered
    // as $/hr. Multiplying the card by the raw quantity billed a two-hour hold as
    // $9,000. Inert while no customer held a card; 282c re-prices every stamped
    // draft line the moment one is entered, so this had to land first.
    const twoHours = { type: "DETENTION_DEL", amount: 100, quantity: 120, unit: "minutes" };
    expect(customerPriceFor(twoHours, { DETENTION_DEL: 75 })).toBe(150);
    expect(customerPriceFor(twoHours, { DETENTION_DEL: 75 })).not.toBe(9000);
  });

  it("converts minutes whatever the writer's spelling or casing, and rounds to cents", () => {
    // POST /load-accessorials takes `unit` free-form from the body.
    for (const unit of ["minutes", "MINUTES", " Minutes ", "min", "mins", "minute"]) {
      expect(customerPriceFor({ type: "DETENTION_PU", amount: 75, quantity: 90, unit }, { DETENTION_PU: 75 })).toBe(112.5);
    }
    expect(customerPriceFor({ type: "DETENTION_PU", amount: 0, quantity: 100, unit: "minutes" }, { DETENTION_PU: 75 })).toBe(125);
  });

  it("passes every other unit through — hours, days and a missing unit already agree with the card", () => {
    // A layover row stores `unit: "days"` against a per-day card; a hand-entered
    // row with no unit is taken at face value, exactly as before this conversion.
    expect(customerPriceFor({ type: "LAYOVER", amount: 250, quantity: 2, unit: "days" }, { LAYOVER: 300 })).toBe(600);
    expect(customerPriceFor({ type: "DETENTION_DEL", amount: 250, quantity: 5, unit: "hours" }, { DETENTION_DEL: 75 })).toBe(375);
    expect(customerPriceFor({ type: "DETENTION_DEL", amount: 250, quantity: 5, unit: null }, { DETENTION_DEL: 75 })).toBe(375);
    expect(customerPriceFor({ type: "DETENTION_DEL", amount: 250, quantity: 5 }, { DETENTION_DEL: 75 })).toBe(375);
  });

  it("converts nothing when there is no rate — cost and an explicit customerAmount are already money", () => {
    const row = { type: "DETENTION_DEL", amount: 100, quantity: 120, unit: "minutes" };
    expect(customerPriceFor(row, null)).toBe(100);
    expect(customerPriceFor({ ...row, customerAmount: 130 }, { DETENTION_DEL: 75 })).toBe(130);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The conversion reads `row.unit`. A pure-function case proves the arithmetic
// and says nothing about whether either call site FETCHES the column — with
// `unit` absent from a select the pricer sees undefined, passes the quantity
// through, and bills $9,000 again while every case above stays green (§19
// Sub-pattern 5, audit both ends). So: every loadAccessorial select in the
// service that fetches a `quantity` for pricing must fetch the `unit` it is
// denominated in.
describe("every select that feeds customerPriceFor carries the unit the quantity is in", () => {
  const SERVICE = path.resolve(__dirname, "../../../src/services/invoiceService.ts");
  const src = fs.readFileSync(SERVICE, "utf8").replace(/\r\n/g, "\n");

  /** Every `select: { ... }` block that appears after a `loadAccessorial.findMany(`. */
  function accessorialSelects(s: string): { line: number; body: string }[] {
    const out: { line: number; body: string }[] = [];
    const re = /loadAccessorial\s*\.\s*findMany\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s))) {
      const selAt = s.indexOf("select:", m.index);
      if (selAt < 0) break;
      const open = s.indexOf("{", selAt);
      let depth = 1, i = open + 1;
      while (i < s.length && depth > 0) { if (s[i] === "{") depth++; else if (s[i] === "}") depth--; i++; }
      out.push({ line: s.slice(0, m.index).split("\n").length, body: s.slice(open, i) });
    }
    return out;
  }

  it("a select that fetches a quantity for pricing also fetches the unit (both call sites, by line)", () => {
    const pricing = accessorialSelects(src).filter((sel) => /\bquantity\s*:\s*true\b/.test(sel.body));
    expect(pricing.length).toBeGreaterThanOrEqual(2); // vacuity: unbilledCustomerAccessorials + repriceDraftInvoices
    const missingUnit = pricing.filter((sel) => !/\bunit\s*:\s*true\b/.test(sel.body)).map((sel) => `invoiceService.ts:${sel.line}`);
    expect(missingUnit).toEqual([]);
  });

  it("walker: finds a select and reports the one missing unit", () => {
    const fixture = "a\nawait c.loadAccessorial.findMany({ where: {}, select: { id: true, quantity: true } });\nawait c.loadAccessorial.findMany({\n select: { id: true, quantity: true, unit: true },\n});";
    const sels = accessorialSelects(fixture);
    expect(sels.map((s) => s.line)).toEqual([2, 3]);
    expect(sels.filter((s) => !/\bunit\s*:\s*true\b/.test(s.body)).map((s) => s.line)).toEqual([2]);
  });
});
