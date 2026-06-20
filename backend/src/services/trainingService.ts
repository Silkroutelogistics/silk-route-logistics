import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { sendCarrierTrainingRefresherEmail } from "./emailService";

/**
 * v3.8.and — SRL Driver Academy Sprint T6: training visibility + lifecycle.
 *
 * Three training-domain functions used by T6 surfaces:
 *  - buildCarrierTrainingSummary(carrierProfileId) — the roster × course
 *    completion matrix, SHARED by the carrier-portal Training dashboard
 *    (/api/carrier-drivers/training-summary, T5) AND the AE carrier-detail
 *    Training tab (/api/carriers/:id/training-summary, T6). Single source so
 *    the two surfaces never drift.
 *  - sendTrainingExpiryReminders() — the daily 5:10 AM Eastern cron. Emails
 *    carriers when a driver's certification approaches/crosses its validity
 *    window.
 *  - getTrainingDigestMetrics() — the one-line training summary for the daily
 *    health digest.
 *
 * EXPIRY IS A COMPUTED PROPERTY, NOT A STATUS (no migration). DriverCourseStatus
 * stays {NOT_STARTED, IN_PROGRESS, PASSED, FAILED}; a cert is "expired" when
 * status === PASSED && expiresAt < now. Status never mutates on expiry —
 * matches the T6 "visibility-only at launch, no Compass mutation" posture, and
 * keeps the completion record (+ its certificate) a permanent historical fact.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// Exact-day reminder thresholds, mirroring the checkExpiringInsurance precedent
// (daysUntil === 60 || 30 || 7). Caps carrier emails at 4 per cert across its
// approach (30 → 14 → 7 → 0), then silent — the dashboard + digest carry the
// persistent "expired, refresher due" signal so there's no daily nag (the
// Item 192 flood lesson). Banked follow-up: robust banded dedup that survives a
// missed cron day (same edge the insurance reminders have today).
const REMINDER_THRESHOLDS = [30, 14, 7, 0];

// Whole-calendar-day count to expiry (UTC date-only diff, so the 5 AM cron
// firing time doesn't shift the threshold). Negative = already expired.
export function calendarDaysUntil(target: Date, from: Date): number {
  const t = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  const f = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((t - f) / DAY_MS);
}

export interface TrainingCell {
  status: string;
  bestScorePct: number | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  isExpired: boolean;
  daysUntilExpiry: number | null; // null unless PASSED with an expiresAt
}

export interface TrainingSummary {
  // v3.8.aoa — `required` + `dueDays` carry the carrier-wide required-course set
  // (Sprint D). Optional courses have required=false, dueDays=null.
  courses: { id: string; slug: string; title: string; category: string; required: boolean; dueDays: number | null }[];
  drivers: {
    id: string;
    firstName: string;
    lastName: string;
    activated: boolean;
    passedCount: number;
    progress: Record<string, TrainingCell>;
    // v3.8.aoa — per-driver required-course due dates (ISO) + the subset that's
    // overdue (required, not compliant, past the due date). Only required courses
    // appear here; a required course the driver hasn't started still gets a due
    // date + may be overdue even with no progress cell.
    requiredDue: Record<string, string>;
    requiredOverdueCourseIds: string[];
  }[];
  summary: {
    driverCount: number;
    courseCount: number;
    passedCells: number;
    totalCells: number;
    pctTrained: number;
    expiredCells: number;
    expiringCells: number; // PASSED, not expired, within 30 days of expiry
    requiredCourseCount: number; // v3.8.aoa
    overdueCells: number; // v3.8.aoa — required-and-overdue across the roster
  };
}

/**
 * Build the roster × published-course completion matrix for one carrier.
 * Scope: active drivers (status NOT IN INACTIVE/TERMINATED) on this carrier's
 * roster × PUBLISHED courses. Each cell carries the computed isExpired +
 * daysUntilExpiry so both the carrier dashboard and the AE tab render expiry
 * state without recomputing.
 */
export async function buildCarrierTrainingSummary(carrierProfileId: string): Promise<TrainingSummary> {
  const now = new Date();

  const courseRows = await prisma.trainingCourse.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { sortOrder: "asc" },
    select: { id: true, slug: true, title: true, category: true },
  });

  // v3.8.aoa — carrier-wide required-course set. Map courseId → {dueDays,
  // createdAt}; the due date for a given driver is computed per-row below.
  // Filter to requirements whose course is still PUBLISHED: a course archived
  // AFTER a carrier required it would otherwise be invisible in the matrix yet
  // still count toward overdueCells (a phantom). The requirement row persists
  // (no cascade on archive) but stops being enforced until the course returns.
  const publishedIds = new Set(courseRows.map((c) => c.id));
  const allRequirements = await prisma.carrierTrainingRequirement.findMany({
    where: { carrierProfileId },
    select: { courseId: true, dueDays: true, createdAt: true },
  });
  const requirements = allRequirements.filter((r) => publishedIds.has(r.courseId));
  const reqByCourse = new Map(requirements.map((r) => [r.courseId, r]));

  const courses = courseRows.map((c) => {
    const req = reqByCourse.get(c.id);
    return { ...c, required: !!req, dueDays: req ? req.dueDays : null };
  });

  const drivers = await prisma.driver.findMany({
    where: { carrierProfileId, status: { notIn: ["INACTIVE", "TERMINATED"] } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true, firstName: true, lastName: true, trainingPinSetAt: true, createdAt: true,
      courseProgress: { select: { courseId: true, status: true, bestScorePct: true, completedAt: true, expiresAt: true } },
    },
  });

  let expiredCells = 0;
  let expiringCells = 0;
  let overdueCells = 0;

  const rows = drivers.map((d) => {
    const progress: Record<string, TrainingCell> = {};
    for (const p of d.courseProgress) {
      const passed = p.status === "PASSED";
      const daysUntilExpiry = passed && p.expiresAt ? calendarDaysUntil(p.expiresAt, now) : null;
      // Calendar-day expiry (valid THROUGH the expiry date; expired the day
      // after) — must match the cron's calendarDaysUntil basis so the dashboard
      // badge and the reminder email never contradict each other (review fix).
      const isExpired = passed && daysUntilExpiry != null && daysUntilExpiry < 0;
      if (passed && p.expiresAt) {
        if (isExpired) expiredCells++;
        else if (daysUntilExpiry !== null && daysUntilExpiry <= 30) expiringCells++;
      }
      progress[p.courseId] = {
        status: p.status, bestScorePct: p.bestScorePct,
        completedAt: p.completedAt, expiresAt: p.expiresAt, isExpired, daysUntilExpiry,
      };
    }

    // v3.8.aoa — required-course due dates + overdue. The due date is anchored to
    // the LATER of the driver's roster-add date and when the requirement was set,
    // so a newly-added requirement never makes an existing driver instantly
    // overdue. Overdue = required AND not (PASSED & not-expired) AND now > due.
    const requiredDue: Record<string, string> = {};
    const requiredOverdueCourseIds: string[] = [];
    for (const req of requirements) {
      const anchor = Math.max(d.createdAt.getTime(), req.createdAt.getTime());
      const due = new Date(anchor + req.dueDays * DAY_MS);
      requiredDue[req.courseId] = due.toISOString();
      const cell = progress[req.courseId];
      const compliant = cell?.status === "PASSED" && !cell.isExpired;
      if (!compliant && now.getTime() > due.getTime()) {
        requiredOverdueCourseIds.push(req.courseId);
        overdueCells++;
      }
    }

    const passedCount = courses.filter((c) => progress[c.id]?.status === "PASSED").length;
    return {
      id: d.id, firstName: d.firstName, lastName: d.lastName,
      activated: !!d.trainingPinSetAt, passedCount, progress,
      requiredDue, requiredOverdueCourseIds,
    };
  });

  const totalCells = rows.length * courses.length;
  const passedCells = rows.reduce((acc, r) => acc + r.passedCount, 0);
  const pctTrained = totalCells ? Math.round((passedCells / totalCells) * 100) : 0;

  return {
    courses,
    drivers: rows,
    summary: {
      driverCount: rows.length, courseCount: courses.length, passedCells, totalCells, pctTrained,
      expiredCells, expiringCells, requiredCourseCount: requirements.length, overdueCells,
    },
  };
}

/**
 * Daily cron (5:10 AM Eastern). Find PASSED certifications whose validity
 * window is approaching/crossed and email the carrier (the employer manages
 * the roster — the carrier is who acts on a refresher). Fires only at the
 * exact calendar-day thresholds (30/14/7/0) so a carrier gets at most 4
 * reminders per cert. Excludes test carriers (Item 189/190 fence) + inactive
 * drivers. Carrier-facing email only — AE visibility is the Training tab +
 * digest, so no AE Notification noise here.
 */
export async function sendTrainingExpiryReminders(): Promise<{ scanned: number; sent: number; skipped: number; errors: number }> {
  const now = new Date();
  // Pull anything expiring within ~31 days or already at/just past expiry. The
  // exact-threshold gate below decides which actually email today; this window
  // just bounds the scan. The expiresAt @@index makes this efficient.
  const horizon = new Date(now.getTime() + 31 * DAY_MS);

  const rows = await prisma.driverCourseProgress.findMany({
    where: {
      status: "PASSED",
      expiresAt: { not: null, lte: horizon },
      course: { status: "PUBLISHED" },
      driver: {
        status: { notIn: ["INACTIVE", "TERMINATED"] },
        carrierProfileId: { not: null },
        carrierProfile: { isTestAccount: false },
      },
    },
    select: {
      expiresAt: true,
      completedAt: true,
      driver: {
        select: {
          firstName: true, lastName: true,
          carrierProfile: { select: { companyName: true, contactEmail: true, user: { select: { email: true } } } },
        },
      },
      course: { select: { title: true } },
    },
  });

  let scanned = 0, sent = 0, skipped = 0, errors = 0;

  for (const r of rows) {
    scanned++;
    if (!r.expiresAt) { skipped++; continue; }
    const days = calendarDaysUntil(r.expiresAt, now);
    // Fire only on the exact threshold days. days <= 0 collapses to the "0"
    // threshold so an expired cert emails once on the day it lapses, then goes
    // silent (no daily nag — dashboard/digest carry the persistent signal).
    const matchKey = days <= 0 ? 0 : days;
    if (!REMINDER_THRESHOLDS.includes(matchKey)) { skipped++; continue; }
    // Skip already-lapsed-before-today certs (days < 0): they got their day-0
    // email when they crossed; don't re-fire on every subsequent scan.
    if (days < 0) { skipped++; continue; }

    const email = r.driver.carrierProfile?.contactEmail || r.driver.carrierProfile?.user?.email;
    if (!email) { skipped++; continue; }

    try {
      await sendCarrierTrainingRefresherEmail(email, {
        driverName: `${r.driver.firstName} ${r.driver.lastName}`.trim(),
        courseTitle: r.course.title,
        completedAt: r.completedAt,
        expiresAt: r.expiresAt,
        daysUntilExpiry: days,
        carrierName: r.driver.carrierProfile?.companyName ?? null,
        // Calendar-day basis, matching buildCarrierTrainingSummary (review fix).
        // The cron only fires at days ∈ {30,14,7,0} (days<0 is skipped above), so
        // in practice this is always false — day-0 is the "expires today" final
        // reminder, not an "expired" notice; the dashboard's persistent Expired
        // badge covers the post-lapse state.
        isExpired: days < 0,
      });
      sent++;
    } catch (e) {
      errors++;
      log.warn({ err: e }, "[DriverAcademy] training expiry reminder email failed");
    }
  }

  return { scanned, sent, skipped, errors };
}

/**
 * One-line training metrics for the daily health digest. Excludes test
 * carriers so the admin headline reflects real adoption.
 */
export async function getTrainingDigestMetrics(): Promise<{ driversTrained: number; carriersWithTraining: number; certsExpiring30: number }> {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * DAY_MS);

  const [passedRows, certsExpiring30] = await Promise.all([
    prisma.driverCourseProgress.findMany({
      where: { status: "PASSED", driver: { carrierProfile: { isTestAccount: false } } },
      select: { driverId: true, driver: { select: { carrierProfileId: true } } },
    }),
    prisma.driverCourseProgress.count({
      where: {
        status: "PASSED",
        expiresAt: { not: null, gte: now, lte: in30 },
        driver: { carrierProfile: { isTestAccount: false } },
      },
    }),
  ]);

  const driversTrained = new Set(passedRows.map((r) => r.driverId)).size;
  const carriersWithTraining = new Set(passedRows.map((r) => r.driver.carrierProfileId).filter(Boolean)).size;

  return { driversTrained, carriersWithTraining, certsExpiring30 };
}
