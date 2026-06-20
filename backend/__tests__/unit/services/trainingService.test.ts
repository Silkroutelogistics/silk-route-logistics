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
    // v3.8.aoa — default: no carrier-wide required courses (tests that exercise
    // the required/overdue path override this).
    (mockPrisma.carrierTrainingRequirement.findMany as any).mockResolvedValue([]);
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

  // v3.8.aoa — Sprint D required-set + overdue. now is pinned to 2026-06-18.
  it("flags required-course overdue, anchors due dates to the later of join/requirement, and exempts the compliant", async () => {
    (mockPrisma.trainingCourse.findMany as any).mockResolvedValue([courses[0]]); // c1 only
    (mockPrisma.carrierTrainingRequirement.findMany as any).mockResolvedValue([
      { courseId: "c1", dueDays: 30, createdAt: d("2026-01-01T00:00:00Z") },
    ]);
    (mockPrisma.driver.findMany as any).mockResolvedValue([
      // A: joined long ago, never started → due Jan-31, now Jun-18 → OVERDUE
      { id: "drvA", firstName: "Ann", lastName: "Adams", trainingPinSetAt: d("2026-01-01"), createdAt: d("2026-01-01T00:00:00Z"), courseProgress: [] },
      // B: joined Jun-10 → due anchors to the LATER join date → Jul-10 (future) → NOT overdue
      { id: "drvB", firstName: "Bo", lastName: "Brown", trainingPinSetAt: d("2026-06-10"), createdAt: d("2026-06-10T00:00:00Z"), courseProgress: [] },
      // C: joined long ago but PASSED + not expired → compliant → NOT overdue despite past due date
      { id: "drvC", firstName: "Cy", lastName: "Clark", trainingPinSetAt: d("2026-01-01"), createdAt: d("2026-01-01T00:00:00Z"), courseProgress: [{ courseId: "c1", status: "PASSED", bestScorePct: 88, completedAt: d("2026-02-01"), expiresAt: d("2027-02-01T00:00:00Z") }] },
    ]);

    const s = await buildCarrierTrainingSummary("carrier-req");

    expect(s.courses[0].required).toBe(true);
    expect(s.courses[0].dueDays).toBe(30);
    expect(s.summary.requiredCourseCount).toBe(1);
    expect(s.summary.overdueCells).toBe(1); // only driver A

    const a = s.drivers.find((x) => x.id === "drvA")!;
    expect(a.requiredOverdueCourseIds).toContain("c1");
    expect(a.requiredDue["c1"]).toBe(new Date(Date.UTC(2026, 0, 31)).toISOString()); // Jan-01 + 30d

    const b = s.drivers.find((x) => x.id === "drvB")!;
    expect(b.requiredOverdueCourseIds).toHaveLength(0);
    expect(b.requiredDue["c1"]).toBe(new Date(Date.UTC(2026, 6, 10)).toISOString()); // Jun-10 + 30d, anchored to join

    const c = s.drivers.find((x) => x.id === "drvC")!;
    expect(c.requiredOverdueCourseIds).toHaveLength(0); // compliant
  });
});
