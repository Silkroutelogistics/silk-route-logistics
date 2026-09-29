/**
 * v3.8.bog — what the tender drawer sends is what the Rate Confirmation prints.
 */
import { describe, it, expect } from "vitest";
import { buildWithTenderPayload } from "./withTenderPayload";
import type { DrawerFormState } from "./CarrierEngagementDrawer";

const form = (over: Partial<DrawerFormState> = {}): DrawerFormState => ({
  originCity: "Irving", originState: "TX", originZip: "75063", originAddress: "", originCompany: "Dallas One",
  originContactName: "", originContactPhone: "9724903300",
  destCity: "Northlake", destState: "TX", destZip: "76262", destAddress: "", destCompany: "Mainfreight",
  destContactName: "", destContactPhone: "9723332500", distance: "34",
  equipmentType: "Dry Van 53'", commodity: "OTC Supplements", pieces: "10", packageType: "PLT", weight: "20000",
  description: "OTC Supplements", hazmat: false, temperatureControlled: false, tempMin: "", tempMax: "",
  tempSetpoint: "", preCoolTo: "", reeferContinuous: true,
  pickupDate: "2026-09-27", pickupTimeStart: "21:00", pickupTimeEnd: "21:30",
  deliveryDate: "2026-09-27", deliveryTimeStart: "23:00", deliveryTimeEnd: "23:30",
  poNumbersText: "PO1872, PO1873", shipperReference: "SR-1", deliveryReference: "DR-2", appointmentNumber: "",
  pickupAppointment: "24565412", deliveryAppointment: "DA-99", pickupNumber: "PU-7781", cargoValue: "84000",
  driverInstructions: "Check in at the guard shack.",
  carrierId: "", customerRate: "700", offeredRate: "400", expiresAtHours: "24",
  specialInstructions: "", pickupInstructions: "", deliveryInstructions: "",
  ...over,
});
const ctx = { customerId: "cust-1", carrierId: "cp-1", now: Date.UTC(2026, 8, 27, 12) };

describe("buildWithTenderPayload", () => {
  it("carries every fact the rate confirmation prints", () => {
    const p = buildWithTenderPayload(form(), ctx);
    expect(p).toMatchObject({
      pickupAppointment: "24565412",
      deliveryAppointment: "DA-99",
      pickupNumber: "PU-7781",
      shipperReference: "SR-1",
      deliveryReference: "DR-2",
      cargoValue: 84000,
      driverInstructions: "Check in at the guard shack.",
      poNumbers: ["PO1872", "PO1873"],
    });
  });

  it("sends the LOAD's totals, not line 1's", () => {
    const p = buildWithTenderPayload(form(), {
      ...ctx,
      lineItemsRest: [
        { pieces: 8, packageType: "PLT", description: "Line 2", weight: 14500 },
        { pieces: 40, packageType: "CTN", description: "Line 3", weight: 800 },
      ],
    });
    expect(p.weight).toBe(35300);
    expect(p.pieces).toBe(58);
    expect(p.pallets).toBe(18); // PLT lines only
    expect(p.lineItems.map((l) => l.weight)).toEqual([20000, 14500, 800]);
  });

  it("the totals agree with the lines it sends, even when line 1 is blank", () => {
    // Line 1 defaults to one piece; the total must count that same piece.
    const p = buildWithTenderPayload(form({ pieces: "", weight: "" }), ctx);
    expect(p.pieces).toBe(p.lineItems.reduce((n, l) => n + l.pieces, 0));
    expect(p.weight).toBeNull(); // no pounds entered is not a claim of zero pounds
  });

  it("is hazmat when any line is", () => {
    const p = buildWithTenderPayload(form(), {
      ...ctx,
      lineItemsRest: [{ pieces: 1, packageType: "DRM", description: "Class 3", weight: 400, hazmat: true, hazmatClass: "3" }],
    });
    expect(p.hazmat).toBe(true);
  });

  it("keeps a declared value of zero, and omits an empty one", () => {
    expect(buildWithTenderPayload(form({ cargoValue: "0" }), ctx).cargoValue).toBe(0);
    expect(buildWithTenderPayload(form({ cargoValue: "" }), ctx).cargoValue).toBeNull();
  });

  it("puts a legacy single appointment on the delivery side", () => {
    const p = buildWithTenderPayload(form({ deliveryAppointment: "", appointmentNumber: "OLD-1" }), ctx);
    expect(p.deliveryAppointment).toBe("OLD-1");
    expect(p.pickupAppointment).toBe("24565412");
  });

  it("never sends the customer's pricing as the carrier's", () => {
    // The drawer's payload has no FSC or accessorial field for the carrier: the
    // tender carries the offered rate only, and customerRate is the customer's.
    const p = buildWithTenderPayload(form(), ctx) as Record<string, unknown>;
    expect(p).not.toHaveProperty("fuelSurcharge");
    expect(p).not.toHaveProperty("fuelSurchargeAmount");
    expect((p.tender as { offeredRate: number }).offeredRate).toBe(400);
  });
});
