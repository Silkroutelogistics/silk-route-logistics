import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

/**
 * WHAT THIS FILE IS FOR. The Order Builder collects dock contacts and stop
 * windows, the AE types them, and on the loadboard path they were never stored.
 * Not a validator problem — `createLoadSchema` is `.passthrough()`, so the keys
 * arrived on req.body intact. The controller's field mapping simply never read
 * them, and nothing downstream noticed, because a NULL window and a window
 * nobody entered are the same row.
 *
 * Production 2026-09-23 split 7/7 by creation path with no exceptions: the three
 * drawer-created loads carry windows and contacts, the four loadboard-created
 * ones carry neither. These tests drive the loadboard shape — the flat keys the
 * Order Builder actually sends — and assert the payload handed to Prisma.
 *
 * They assert on `load.create`'s argument rather than on the 201, because the
 * endpoint answered 201 the whole time it was losing the data.
 */

vi.mock("../../../src/services/invoiceService", () => ({
  autoGenerateInvoice: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/mileageService", () => ({
  calculateMileage: vi.fn().mockResolvedValue({ practical_miles: 500, drive_time_hours: 8 }),
}));
vi.mock("../../../src/services/integrationService", () => ({
  onLoadDelivered: vi.fn().mockResolvedValue(undefined),
  onLoadDispatched: vi.fn().mockResolvedValue(undefined),
  onLoadCancelledOrTONU: vi.fn().mockResolvedValue(undefined),
  enforceShipperCredit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../../../src/services/carrierOutreachService", () => ({
  notifyMatchedCarriers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/loadAuditService", () => ({
  logLoadCreation: vi.fn().mockResolvedValue(undefined),
  diffLoadChanges: vi.fn().mockReturnValue([]),
  logLoadChanges: vi.fn().mockResolvedValue(undefined),
  logStatusChange: vi.fn().mockResolvedValue(undefined),
  getLoadAuditHistory: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../../src/lib/customerActive", () => ({
  checkCustomerActive: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock("../../../src/validators/load", () => ({
  createLoadSchema: { parse: (v: any) => v },
  updateLoadStatusSchema: { parse: (v: any) => v },
  loadQuerySchema: { parse: (v: any) => ({ page: 1, limit: 50, ...v }) },
}));

import { createLoad } from "../../../src/controllers/loadController";

const mockPrisma = vi.mocked(prisma);

/** Exactly what frontend/src/app/dashboard/orders/page.tsx puts on the wire. */
function loadboardBody(extra: Record<string, any> = {}) {
  return {
    originCity: "Erlanger", originState: "KY", originZip: "41018",
    destCity: "Hebron", destState: "KY", destZip: "41048",
    pickupDate: "2026-09-24", deliveryDate: "2026-09-25",
    equipmentType: "Dry Van 53'",
    // Flat, as the Order Builder sends them — NOT a nested pickupContact object.
    originContactName: "Carlos", originContactPhone: "9724903300",
    destContactName: "Brynn", destContactPhone: "502-219-3219",
    ...extra,
  };
}

async function createAndCapture(body: Record<string, any>) {
  (mockPrisma as any).$executeRaw = vi.fn().mockResolvedValue(undefined);
  (mockPrisma as any).$queryRaw = vi.fn().mockResolvedValue([{ nextval: BigInt(121497) }]);
  mockPrisma.load.create.mockResolvedValue({ id: "load-1", referenceNumber: "SRL-121497" } as any);
  const req = { body, user: { id: "user-1", role: "BROKER" }, params: {}, query: {}, headers: {} } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  await createLoad(req, res);
  return { data: (mockPrisma.load.create.mock.calls[0]?.[0] as any)?.data, res };
}

describe("loadboard create — dock contacts the AE typed are persisted", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists the flat origin and destination contacts", async () => {
    const { data } = await createAndCapture(loadboardBody());
    expect(data.originContactName).toBe("Carlos");
    expect(data.originContactPhone).toBe("9724903300");
    expect(data.destContactName).toBe("Brynn");
    expect(data.destContactPhone).toBe("502-219-3219");
  });

  it("still accepts the nested shape the Carrier Engagement Drawer sends", async () => {
    const { data } = await createAndCapture({
      ...loadboardBody({ originContactName: undefined, destContactName: undefined }),
      pickupContact: { name: "Brian Morgan", phone: "9723332500" },
      deliveryContact: { name: "Monika", phone: "5551234567" },
    });
    expect(data.originContactName).toBe("Brian Morgan");
    expect(data.destContactName).toBe("Monika");
  });

  it("prefers the nested shape when a caller somehow sends both", async () => {
    const { data } = await createAndCapture({
      ...loadboardBody(),
      pickupContact: { name: "Nested Wins", phone: "1111111111" },
    });
    expect(data.originContactName).toBe("Nested Wins");
  });

  it("leaves the columns undefined when no contact was entered at all", async () => {
    const { data } = await createAndCapture(
      loadboardBody({
        originContactName: undefined, originContactPhone: undefined,
        destContactName: undefined, destContactPhone: undefined,
      }),
    );
    expect(data.originContactName).toBeUndefined();
    expect(data.destContactName).toBeUndefined();
  });
});

describe("loadboard create — stop windows are written whenever a time was sent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists the Order Builder's window spelling with NO discriminator sent", async () => {
    // This is the whole defect: the Order Builder sends these four keys and has
    // never sent pickupTimeType/deliveryTimeType. Every window was dropped.
    const { data } = await createAndCapture(
      loadboardBody({
        pickupWindowOpen: "09:00", pickupWindowClose: "10:00",
        deliveryWindowOpen: "15:30", deliveryWindowClose: "16:30",
      }),
    );
    expect(data.pickupTimeStart).toBe("09:00");
    expect(data.pickupTimeEnd).toBe("10:00");
    expect(data.deliveryTimeStart).toBe("15:30");
    expect(data.deliveryTimeEnd).toBe("16:30");
  });

  it("persists the drawer's direct spelling too", async () => {
    const { data } = await createAndCapture(
      loadboardBody({
        pickupTimeStart: "12:00", pickupTimeEnd: "13:00",
        deliveryTimeStart: "14:00", deliveryTimeEnd: "15:00",
      }),
    );
    expect(data.pickupTimeStart).toBe("12:00");
    expect(data.deliveryTimeEnd).toBe("15:00");
  });

  it("still honours an explicit WINDOW discriminator, so old callers keep working", async () => {
    const { data } = await createAndCapture(
      loadboardBody({
        pickupTimeType: "WINDOW", pickupWindowOpen: "08:00", pickupWindowClose: "09:00",
      }),
    );
    expect(data.pickupTimeStart).toBe("08:00");
    expect(data.pickupTimeEnd).toBe("09:00");
  });

  it("still honours the APPOINTMENT shape's bare time", async () => {
    const { data } = await createAndCapture(
      loadboardBody({ pickupTimeType: "APPOINTMENT", pickupTime: "11:15" }),
    );
    expect(data.pickupTimeStart).toBe("11:15");
  });

  it("leaves windows undefined when no time was sent at all", async () => {
    const { data } = await createAndCapture(loadboardBody());
    expect(data.pickupTimeStart).toBeUndefined();
    expect(data.deliveryTimeEnd).toBeUndefined();
  });
});
