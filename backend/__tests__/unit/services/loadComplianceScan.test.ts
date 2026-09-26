// §13.3 Item 320 — the 2-hourly load-compliance scan: fenced, and one alert per load.
// The doubles ANSWER THE WHERE they are given (load fence, alert key), because a
// mock that returns one array to every caller passes whether or not the fence exists.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/notificationService", () => ({ createNotification: vi.fn() }));
import { createNotification } from "../../../src/services/notificationService";
import { checkAllActiveLoadCompliance } from "../../../src/services/loadComplianceService";

const p = prisma as any;
const DAY = 86_400_000;
const cp = (over: any = {}) => ({ deletedAt: null, isTestAccount: false, ...over });
const LOADS = [
  { id: "live", referenceNumber: "SRL-1", posterId: "ae", carrierId: "u1", deletedAt: null, isTestAccount: false, carrier: { carrierProfile: cp() } },
  { id: "deleted", referenceNumber: "L918", posterId: "ae", carrierId: "u1", deletedAt: new Date(), isTestAccount: false, carrier: { carrierProfile: cp() } },
  { id: "test-load", referenceNumber: "T-1", posterId: "ae", carrierId: "u1", deletedAt: null, isTestAccount: true, carrier: { carrierProfile: cp() } },
  { id: "carrier-gone", referenceNumber: "C-1", posterId: "ae", carrierId: "u2", deletedAt: null, isTestAccount: false, carrier: { carrierProfile: cp({ deletedAt: new Date() }) } },
  { id: "carrier-test", referenceNumber: "C-2", posterId: "ae", carrierId: "u3", deletedAt: null, isTestAccount: false, carrier: { carrierProfile: cp({ isTestAccount: true }) } },
];
const matches = (row: any, w: any): boolean =>
  Object.entries(w ?? {}).every(([k, v]: [string, any]) => {
    if (k === "status" || k === "carrierId") return true; // status/carrier presence are not what this suite fences
    if (v && typeof v === "object" && !(v instanceof Date)) return matches(row[k] ?? {}, v);
    return row[k] === v;
  });

let alerts: any[];
let insuranceExpiry: Date;
const run = () => checkAllActiveLoadCompliance();

beforeEach(() => {
  vi.clearAllMocks();
  alerts = [];
  insuranceExpiry = new Date(Date.now() - 5 * DAY); // WARNING: expired inside the 14-day window
  p.load.findMany.mockImplementation(async ({ where }: any) => LOADS.filter((l) => matches(l, where)));
  p.load.findUnique.mockImplementation(async ({ where }: any) => LOADS.find((l) => l.id === where.id) ?? null);
  p.carrierProfile.findUnique.mockImplementation(async () => ({ id: "cp", userId: "u1", companyName: "C", insuranceExpiry, insuranceGracePeriodEnd: null, fmcsaAuthorityStatus: null, onboardingStatus: "APPROVED", autoSuspendedAt: null, ofacStatus: null }));
  p.user.findMany.mockResolvedValue([]);
  const statusOk = (s: string, w: any) => (w == null ? true : typeof w === "string" ? s === w : s !== w.not);
  const open = (w: any) => alerts.filter((a) => a.type === w.type && a.entityId === w.entityId && statusOk(a.status, w.status));
  p.complianceAlert = {
    findFirst: vi.fn(async ({ where }: any) => open(where).at(-1) ?? null),
    create: vi.fn(async ({ data }: any) => { const a = { id: `a${alerts.length}`, ...data }; alerts.push(a); return a; }),
    update: vi.fn(async ({ where, data }: any) => Object.assign(alerts.find((a) => a.id === where.id), data)),
    updateMany: vi.fn(async ({ where, data }: any) => { const hit = open(where); hit.forEach((a) => Object.assign(a, data)); return { count: hit.length }; }),
  };
});

describe("Item 320: the load-compliance scan", () => {
  it("skips deleted loads, test loads, and loads whose carrier is deleted or a test account", async () => {
    const stats = await run();
    expect(stats.total).toBe(1);
    expect(alerts.map((a) => a.entityId)).toEqual(["live"]);
    expect(vi.mocked(createNotification).mock.calls.map((c) => c[2])).toEqual(["Load SRL-1 — Compliance WARNING"]);
  });

  it("a repeat scan at the same severity creates no second alert and no second notification", async () => {
    await run(); await run(); await run();
    expect(alerts).toHaveLength(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  it("a severity change updates the open alert and notifies once more", async () => {
    await run();
    insuranceExpiry = new Date(Date.now() - 20 * DAY); // now CRITICAL
    await run(); await run();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("CRITICAL");
    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it("a load that comes back CLEAR resolves its alert, and a recurrence alerts again", async () => {
    await run();
    insuranceExpiry = new Date(Date.now() + 90 * DAY);
    await run();
    expect(alerts[0].status).toBe("RESOLVED");
    insuranceExpiry = new Date(Date.now() - 5 * DAY);
    await run();
    expect(alerts).toHaveLength(2);
    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it("a human DISMISS suppresses repeats at the same severity", async () => {
    await run();
    alerts[0].status = "DISMISSED";
    await run();
    expect(alerts).toHaveLength(1);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });
});
