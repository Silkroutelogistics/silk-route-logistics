import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { calendarDaysUntil, buildCarrierTrainingSummary } from "../../../src/services/trainingService";

const mockPrisma = vi.mocked(prisma, true);
const d = (s: string) => new Date(s);

describe("trainingService.calendarDaysUntil (the T6 calendar-day basis)", () => {
  it("is 0 for the same calendar day regardless of clock time", () => {
    // The 5 AM cron firing time must not shift the threshold — a same-date
    // target at any hour is still 0 days away.
    expect(calendarDaysUntil(d("2026-06-18T23:59:00Z"), d("2026-06-18T05:00:00Z"))).toBe(0);
    expect(calendarDaysUntil(d("2026-06-18T00:00:00Z"), d("2026-06-18T23:00:00Z"))).toBe(0);
  });

  it("counts whole days forward and backward", () => {
    expect(calendarDaysUntil(d("2026-07-18T00:00:00Z"), d("2026-06-18T00:00:00Z"))).toBe(30);
    expect(calendarDaysUntil(d("2026-06-17T00:00:00Z"), d("2026-06-18T12:00:00Z"))).toBe(-1); // expired yesterday
    expect(calendarDaysUntil(d("2026-06-18T00:00:00Z"), d("2026-06-17T00:00:00Z"))).toBe(1);
  });

  it("crosses month and year boundaries correctly", () => {
    expect(calendarDaysUntil(d("2027-01-01T00:00:00Z"), d("2026-12-31T00:00:00Z"))).toBe(1);
    expect(calendarDaysUntil(d("2026-03-01T00:00:00Z"), d("2026-02-28T00:00:00Z"))).toBe(1); // 2026 not a leap year
  });
});

describe("trainingService.buildCarrierTrainingSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(d("2026-06-18T12:00:00Z")); // pins `now` inside the service
  });
  afterEach(() => vi.useRealTimers());

  const courses = [
    { id: "c1", slug: "eld-hos", title: "ELD & HOS", category: "Hours" },
    { id: "c2", slug: "cargo-securement", title: "Cargo Securement", category: "Safety" },
  ];

  it("computes the matrix, %-trained, and expiry buckets", async () => {
    (mockPrisma.trainingCourse.findMany as any).mockResolvedValue(courses);
    (mockPrisma.driver.findMany as any).mockResolvedValue([
      {
        id: "drv1", firstName: "Sam", lastName: "Adams", trainingPinSetAt: d("2026-06-01T00:00:00Z"),
        courseProgress: [
          // PASSED, expires in 10 days → expiring bucket
          { courseId: "c1", status: "PASSED", bestScorePct: 90, completedAt: d("2026-06-01"), expiresAt: d("2026-06-28T00:00:00Z") },
          // PASSED, expired 2 days ago → expired bucket
          { courseId: "c2", status: "PASSED", bestScorePct: 85, completedAt: d("2025-06-01"), expiresAt: d("2026-06-16T00:00:00Z") },
        ],
      },
      {
        id: "drv2", firstName: "Bea", lastName: "Zorn", trainingPinSetAt: null, // not activated
        courseProgress: [
          { courseId: "c1", status: "IN_PROGRESS", bestScorePct: null, completedAt: null, expiresAt: null },
        ],
      },
    ]);

    const s = await buildCarrierTrainingSummary("carrier-1");

    expect(s.summary.driverCount).toBe(2);
    expect(s.summary.courseCount).toBe(2);
    expect(s.summary.totalCells).toBe(4); // 2 drivers × 2 courses
    expect(s.summary.passedCells).toBe(2); // drv1 passed both
    expect(s.summary.pctTrained).toBe(50); // 2/4
    expect(s.summary.expiredCells).toBe(1); // drv1 c2
    expect(s.summary.expiringCells).toBe(1); // drv1 c1 (10 days out)

    const drv1 = s.drivers.find((x) => x.id === "drv1")!;
    expect(drv1.activated).toBe(true);
    expect(drv1.passedCount).toBe(2);
    expect(drv1.progress["c1"].isExpired).toBe(false);
    expect(drv1.progress["c1"].daysUntilExpiry).toBe(10);
    expect(drv1.progress["c2"].isExpired).toBe(true);

    const drv2 = s.drivers.find((x) => x.id === "drv2")!;
    expect(drv2.activated).toBe(false); // null trainingPinSetAt
    expect(drv2.passedCount).toBe(0);
  });

  it("returns 0% trained (not NaN) for an empty roster", async () => {
    (mockPrisma.trainingCourse.findMany as any).mockResolvedValue(courses);
    (mockPrisma.driver.findMany as any).mockResolvedValue([]);

    const s = await buildCarrierTrainingSummary("carrier-empty");
    expect(s.summary.totalCells).toBe(0);
    expect(s.summary.pctTrained).toBe(0);
    expect(s.summary.expiredCells).toBe(0);
  });

  it("a PASSED course with no expiry never counts as expired or expiring", async () => {
    (mockPrisma.trainingCourse.findMany as any).mockResolvedValue([courses[0]]);
    (mockPrisma.driver.findMany as any).mockResolvedValue([
      {
        id: "drv3", firstName: "No", lastName: "Expiry", trainingPinSetAt: d("2026-06-01"),
        courseProgress: [{ courseId: "c1", status: "PASSED", bestScorePct: 100, completedAt: d("2026-06-01"), expiresAt: null }],
      },
    ]);

    const s = await buildCarrierTrainingSummary("carrier-2");
    expect(s.summary.passedCells).toBe(1);
    expect(s.summary.expiredCells).toBe(0);
    expect(s.summary.expiringCells).toBe(0);
    expect(s.drivers[0].progress["c1"].daysUntilExpiry).toBeNull();
  });
});
