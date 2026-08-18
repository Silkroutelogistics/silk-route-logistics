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
});
