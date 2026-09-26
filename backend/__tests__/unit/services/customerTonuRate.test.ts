/**
 * The customer's TONU rate (D1-D5 directive, item 2).
 *
 * The customer-level TONU rate is Customer.defaultAccessorialRates.TONU — the
 * negotiated rate card the CRM Rates editor writes and customerPriceFor already
 * reads. It is not a new column: a second place to hold the same number is how
 * the two come to disagree. TONU_AMOUNT is the default and is what the CARRIER
 * is paid; the customer's rate never moves carrier pay (Jetex stays at $200 on
 * 121496 while BKN is billed $250).
 *
 * The chain under test: recordTonuObligation writes the row with the carrier
 * amount and customerAmount NULL, and unbilledCustomerAccessorials — the reader
 * that produces the invoice lines — prices that row from the customer's card.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    load: { findUnique: vi.fn() },
    loadAccessorial: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  },
}));
vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

import { recordTonuObligation } from "../../../src/services/tonuBillingService";
import { unbilledCustomerAccessorials } from "../../../src/services/invoiceService";
import { TONU_AMOUNT } from "../../../src/lib/accessorialPolicy";

/** The ledger row recordTonuObligation writes, captured from its create call. */
async function recordedRow() {
  mockPrisma.loadAccessorial.findFirst.mockResolvedValue(null);
  mockPrisma.loadAccessorial.create.mockResolvedValue({ id: "acc-1" });
  await recordTonuObligation("load-1", "CUSTOMER", "ae-1");
  const data = mockPrisma.loadAccessorial.create.mock.calls[0][0].data;
  return { id: "acc-1", type: data.type, amount: data.amount, customerAmount: data.customerAmount,
    quantity: null, unit: null, billedTo: data.billedTo, notes: data.notes };
}

async function invoiceLineFor(rateCard: Record<string, number> | null) {
  const row = await recordedRow();
  mockPrisma.loadAccessorial.findMany.mockResolvedValue([row]);
  mockPrisma.load.findUnique.mockResolvedValue({ customer: { defaultAccessorialRates: rateCard } });
  const lines = await unbilledCustomerAccessorials("load-1");
  expect(lines).toHaveLength(1);
  return lines[0];
}

describe("customer TONU rate", () => {
  beforeEach(() => vi.resetAllMocks());

  it("the ledger row carries the carrier amount and leaves the customer price to the card", async () => {
    const row = await recordedRow();
    expect(row.amount).toBe(TONU_AMOUNT);
    expect(row.customerAmount).toBeNull();
    expect(row.billedTo).toBe("SHIPPER");
  });

  it("BKN, with TONU 250 on its rate card, is billed a $250 line; the carrier amount stays at the default", async () => {
    const line = await invoiceLineFor({ TONU: 250 });
    expect(line.amount).toBe(250);
    expect(line.carrierAmount).toBe(TONU_AMOUNT);
  });

  it("a customer with no TONU on its card is billed the default", async () => {
    expect((await invoiceLineFor(null)).amount).toBe(TONU_AMOUNT);
    expect((await invoiceLineFor({ LUMPER: 75 })).amount).toBe(TONU_AMOUNT);
  });

  it("the default is $200", () => {
    expect(TONU_AMOUNT).toBe(200);
  });
});
