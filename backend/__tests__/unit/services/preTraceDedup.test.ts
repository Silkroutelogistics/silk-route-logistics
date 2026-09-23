/**
 * Pre-tracing is once per load per stage, not once per lookback window.
 *
 * WHAT THIS REPRODUCES. On 2026-09-22/23 a carrier received the IDENTICAL email
 * — "Pre-Tracing: Load SRL-121497 pickup in 24 hours" — FIVE times, and another
 * carrier got the SRL-121495 one THREE times. The job runs hourly and deduped
 * against a 2-hour lookback, so the moment the lookback rolled past the last
 * send it sent again, for as long as the load sat inside the window.
 *
 * A LOOKBACK CANNOT EXPRESS "ONCE". Widening it only moves the repeat further
 * out; the window is 24 hours wide and any finite lookback eventually expires
 * inside it. The key has to be the load and the stage.
 *
 * SECOND DEFECT, SAME QUERY: the lookup matched `Pre-Tracing 24H` and did NOT
 * include the load reference, while the row it writes does. So a carrier with
 * two loads both 24h out was sent ONE email and never told about the other —
 * the same bug pointing the opposite way, and the reason the key must carry
 * both the load and the stage rather than either alone.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/emailService", () => ({
  sendPreTracingEmail: vi.fn().mockResolvedValue(undefined),
  sendLateAlertEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordExpiryReminder: vi.fn().mockResolvedValue(undefined),
  settingsPathForRole: vi.fn().mockReturnValue("/dashboard/settings"),
}));

import { sendPreTracingEmail } from "../../../src/services/emailService";
import { runPreTracing } from "../../../src/services/schedulerService";

const mockPrisma = vi.mocked(prisma) as any;

/** Rows the job has written this run, so findFirst can answer honestly. */
let store: Array<{ userId: string; type: string; title: string; createdAt: Date }> = [];
let clock = new Date("2026-09-22T12:00:00Z");

function shipment(ref: string, hoursOut: number) {
  return {
    id: "shp-" + ref,
    shipmentNumber: "SHP-" + ref,
    originCity: "Erlanger", originState: "KY",
    destCity: "Hebron", destState: "KY",
    pickupDate: new Date(clock.getTime() + hoursOut * 3600_000),
    loadId: "load-" + ref,
    load: {
      referenceNumber: ref,
      carrier: { id: "car-1", email: "carrier@example.com", firstName: "Sandy", lastName: "D", company: "JOT" },
    },
  };
}

/** One hourly tick of the cron. */
async function tick(shipments: any[]) {
  mockPrisma.shipment.findMany.mockResolvedValue(shipments);
  await runPreTracing();
  clock = new Date(clock.getTime() + 3600_000);
  vi.setSystemTime(clock);
}

beforeEach(() => {
  vi.clearAllMocks();
  store = [];
  clock = new Date("2026-09-22T12:00:00Z");
  vi.useFakeTimers();
  vi.setSystemTime(clock);

  mockPrisma.notification.findFirst.mockImplementation(async ({ where }: any) => {
    const needle: string | undefined = where?.title?.contains;
    const since: Date | undefined = where?.createdAt?.gte;
    return (
      store.find(
        (r) =>
          r.userId === where.userId &&
          (needle === undefined || r.title.includes(needle)) &&
          (since === undefined || r.createdAt >= since),
      ) ?? null
    );
  });
  mockPrisma.notification.create.mockImplementation(async ({ data }: any) => {
    store.push({ ...data, createdAt: new Date(clock) });
    return data;
  });
});

afterEach(() => vi.useRealTimers());

describe("pre-tracing sends once per load per stage", () => {
  it("THE SRL-121497 SHAPE — five hourly ticks inside the window send ONE email", async () => {
    const s = () => [shipment("SRL-121497", 20)];
    for (let i = 0; i < 5; i++) await tick(s());
    expect(
      vi.mocked(sendPreTracingEmail).mock.calls.length,
      "five hourly ticks produced this many emails",
    ).toBe(1);
  });

  it("THE SRL-121495 SHAPE — three ticks, one email", async () => {
    const s = () => [shipment("SRL-121495", 18)];
    for (let i = 0; i < 3; i++) await tick(s());
    expect(vi.mocked(sendPreTracingEmail).mock.calls.length).toBe(1);
  });

  it("two loads for ONE carrier at the same stage each get their own email", async () => {
    await tick([shipment("SRL-A", 20), shipment("SRL-B", 20)]);
    const refs = vi.mocked(sendPreTracingEmail).mock.calls.map((c) => c[2]);
    expect(refs.sort()).toEqual(["SRL-A", "SRL-B"]);
  });

  it("the 48H stage and the 24H stage are different events", async () => {
    await tick([shipment("SRL-C", 40)]);
    expect(vi.mocked(sendPreTracingEmail).mock.calls.length).toBe(1);
    await tick([shipment("SRL-C", 20)]);
    expect(
      vi.mocked(sendPreTracingEmail).mock.calls.length,
      "crossing into the 24H stage is a new event",
    ).toBe(2);
  });
});

/**
 * Every dedup window against the interval of the job that reads it.
 *
 * A window narrower than its own cron interval re-sends by construction. A
 * window merely WIDER than the interval is still not "once" — it is "once per
 * window", which is what produced six CRITICAL DELAY emails in fourteen hours
 * from a 2-hour lookback on a 30-minute job. Both rules are checked: the floor,
 * and the specific ratified figures.
 */
import fs from "fs";
import path from "path";

const BACKEND = path.resolve(__dirname, "../../..");
const scheduler = fs.readFileSync(path.join(BACKEND, "src/services/schedulerService.ts"), "utf8");
const notify = fs.readFileSync(path.join(BACKEND, "src/services/shipperNotificationService.ts"), "utf8");

describe("dedup windows vs the cron that reads them", () => {
  it("pre-tracing has NO time bound — the key is the load and the stage", () => {
    const block = scheduler.slice(
      scheduler.indexOf("ONCE PER LOAD PER STAGE"),
      scheduler.indexOf("if (alreadySent) continue;"),
    );
    expect(block.length, "vacuity: the dedup block was found").toBeGreaterThan(100);
    expect(block, "a lookback cannot express 'once'").not.toContain("createdAt");
    expect(block, "the key must carry the load").toContain("referenceNumber");
    expect(block, "the key must carry the stage").toContain("${window}");
  });

  it("the customer delay window is 12 hours, on a 30-minute job", () => {
    expect(notify).toContain("12 * 60 * 60 * 1000");
    const start = notify.indexOf("ONCE PER LOAD PER 12 HOURS");
    const block = notify.slice(start, notify.indexOf("if (alreadySent) return;", start));
    expect(block.length, "vacuity: the delay dedup block was found").toBeGreaterThan(100);
    // NB: a bare "2 * 60 * 60 * 1000" check is a substring of the 12-hour
    // literal and passes for the wrong reason. Anchor on the subtraction.
    expect(block, "the window is 12 hours").toContain("Date.now() - 12 * 60 * 60 * 1000");
    expect(block, "the 2-hour lookback is gone").not.toContain("Date.now() - 2 * 60 * 60 * 1000");
    expect(scheduler, "the alert engine still runs on the half-hour").toContain(
      'cron.schedule("0,30 * * * *"',
    );
  });

  it("late detection's 4h window is wider than its 30-minute interval", () => {
    // Kept as a floor check rather than tightened: C6 changes what this job
    // SAYS, not how often it may say it.
    expect(scheduler).toContain("const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000)");
  });

  it("the twice-daily transit update is exempt, and the exemption is stated", () => {
    // 6h window against a 14:00/21:00 pair — a 7h gap — so BOTH runs send. That
    // is the intent (an am and a pm update), not a repeat of one event, so the
    // strictly-greater rule does not apply here. Pinned so a later reader does
    // not "fix" it into one update a day.
    expect(scheduler).toContain('cron.schedule("0 14 * * *"');
    expect(scheduler).toContain('cron.schedule("0 21 * * *"');
    expect(notify).toContain("sixHoursAgo");
  });
});
