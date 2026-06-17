import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/database";
import { authenticateDriver, DriverRequest } from "../middleware/driverAuth";
import { validateBody } from "../middleware/validate";
import { generateTrainingCertificate, buildCertificateData } from "../services/certificatePdfService";
import { sendCarrierTrainingCompletionEmail } from "../services/emailService";
import { log } from "../lib/logger";

/**
 * v3.8.anb — SRL Driver Academy Sprint T4: the training player API.
 *
 * Driver-facing, behind authenticateDriver (Driver lookup, srl_token_driver
 * cookie). Only PUBLISHED courses are visible. Quiz answers are graded
 * SERVER-SIDE: the course-detail endpoint never returns correctIndex /
 * explanation, and the score is computed from the DB, never trusted from the
 * client. All progress + attempts are scoped to req.driver.id.
 */

const router = Router();
router.use(authenticateDriver);

// v3.8.and (T6 review fix) — UTC-safe + day-clamped. The prior local-time
// setMonth() form was (a) timezone-fragile (Jan 31 expiry would shift if the
// container TZ ever moved off UTC) and (b) day-overflowed on month-end (Jan 31
// + 1mo rolled to Mar 3, not Feb 28). expiresAt feeds the whole T6 expiry
// lifecycle, so it must be correct: clamp the day to the target month's last
// day and compute in UTC.
function addMonths(d: Date, n: number): Date {
  const m = d.getUTCMonth() + n;
  const targetYear = d.getUTCFullYear() + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const lastDayOfTarget = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDayOfTarget);
  return new Date(Date.UTC(targetYear, targetMonth, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
}

// v3.8.ang — CDL eligibility gate. The Academy is for working CDL drivers, so
// training requires a CDL on the driver's roster record (present, and not past
// its expiry if an expiry is on file). There is NO free CDL-verification API a
// broker can lawfully use (CDLIS/AAMVA is DPPA-restricted; real verification is a
// paid MVR vendor + driver consent, and the CARRIER owns driver qualification) —
// so we gate on the CDL data the carrier already captures at roster-add rather
// than an external check. Computed on read (no migration, no backfill): a driver
// whose carrier hasn't entered a CDL sees a clear, fixable blocker, not a crash;
// the carrier fills it in the Drivers roster and the driver is in. Expiry uses a
// calendar-day floor (valid THROUGH the expiry day). A null expiry with a number
// on file is allowed (number present is the signal; expiry may be unknown).
type CdlEligibility = { eligible: boolean; reason: "CDL_MISSING" | "CDL_EXPIRED" | null; licenseExpiry: Date | null };

async function getCdlEligibility(driverId: string): Promise<CdlEligibility> {
  const d = await prisma.driver.findUnique({
    where: { id: driverId },
    select: { licenseNumber: true, licenseExpiry: true },
  });
  const num = (d?.licenseNumber ?? "").trim();
  const expiry = d?.licenseExpiry ?? null;
  if (!num) return { eligible: false, reason: "CDL_MISSING", licenseExpiry: expiry };
  if (expiry) {
    const now = new Date();
    const startOfTodayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (expiry.getTime() < startOfTodayUtc) return { eligible: false, reason: "CDL_EXPIRED", licenseExpiry: expiry };
  }
  return { eligible: true, reason: null, licenseExpiry: expiry };
}

// Returns true if eligible; otherwise writes a 403 CDL_REQUIRED and returns false.
async function assertCdlEligible(driverId: string, res: Response): Promise<boolean> {
  const e = await getCdlEligibility(driverId);
  if (e.eligible) return true;
  res.status(403).json({
    error:
      e.reason === "CDL_EXPIRED"
        ? "The CDL on your driver profile has expired. Ask your carrier to update it in your roster before continuing training."
        : "Your driver profile needs a valid CDL on file. Ask your carrier to add it in your roster before you can start training.",
    code: "CDL_REQUIRED",
    reason: e.reason,
  });
  return false;
}

// GET /api/driver-training/courses — catalog + this driver's progress per course.
// NOTE: all PUBLISHED courses are globally visible to every authenticated driver
// regardless of carrier — courses are platform-shared educational content, not
// per-carrier variants (locked design, §13.3 Item 193). If carrier-specific
// courses are ever needed, add a nullable carrierProfileId to TrainingCourse and
// filter here + in GET /:slug + the quiz/lesson-progress endpoints.
router.get("/courses", async (req: DriverRequest, res: Response) => {
  const driverId = req.driver!.id;

  const courses = await prisma.trainingCourse.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, slug: true, title: true, category: true, summary: true,
      estMinutes: true, passThreshold: true,
      _count: { select: { lessons: true, questions: true } },
    },
  });

  const progress = await prisma.driverCourseProgress.findMany({
    where: { driverId },
    select: { courseId: true, status: true, lessonsCompleted: true, lastLessonOrder: true, bestScorePct: true, attemptCount: true, completedAt: true, expiresAt: true },
  });
  const pMap = new Map(progress.map((p) => [p.courseId, p]));

  // The list endpoint never 403s on CDL — the dashboard must still render so it
  // can show the friendly "ask your carrier to add your CDL" blocker. The actual
  // training endpoints (detail / lesson-progress / quiz) enforce the gate.
  const eligibility = await getCdlEligibility(driverId);

  res.json({
    eligibility,
    courses: courses.map((c) => {
      const { _count, ...rest } = c;
      return { ...rest, lessonCount: _count.lessons, questionCount: _count.questions, progress: pMap.get(c.id) || null };
    }),
  });
});

// GET /api/driver-training/courses/:slug — full lessons + quiz questions WITHOUT
// the correct answers (correctIndex/explanation are never sent to the client).
router.get("/courses/:slug", async (req: DriverRequest, res: Response) => {
  const driverId = req.driver!.id;
  if (!(await assertCdlEligible(driverId, res))) return;

  const course = await prisma.trainingCourse.findFirst({
    where: { slug: req.params.slug, status: "PUBLISHED" },
    select: {
      id: true, slug: true, title: true, category: true, summary: true,
      version: true, estMinutes: true, passThreshold: true, validityMonths: true, disclaimer: true,
      lessons: { orderBy: { order: "asc" }, select: { id: true, order: true, title: true, bodyMarkdown: true, estMinutes: true } },
      questions: { orderBy: { order: "asc" }, select: { id: true, order: true, question: true, options: true } },
    },
  });
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  const progress = await prisma.driverCourseProgress.findUnique({
    where: { driverId_courseId: { driverId, courseId: course.id } },
  });

  res.json({ course, progress: progress || null });
});

// POST /api/driver-training/courses/:slug/lesson-progress — mark reading progress.
// Low-stakes / self-reported; never regresses, never overrides a PASSED status.
// No upper bound here — the handler clamps lastLessonOrder to the course's
// actual lesson count, so a hardcoded cap would only reject valid progress on
// a future long course (review fix).
const lessonProgressSchema = z.object({ lastLessonOrder: z.number().int().min(0) });
router.post("/courses/:slug/lesson-progress", validateBody(lessonProgressSchema), async (req: DriverRequest, res: Response) => {
  const driverId = req.driver!.id;
  if (!(await assertCdlEligible(driverId, res))) return;
  const course = await prisma.trainingCourse.findFirst({
    where: { slug: req.params.slug, status: "PUBLISHED" },
    select: { id: true, _count: { select: { lessons: true } } },
  });
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }

  const { lastLessonOrder } = req.body as z.infer<typeof lessonProgressSchema>;
  const existing = await prisma.driverCourseProgress.findUnique({
    where: { driverId_courseId: { driverId, courseId: course.id } },
  });

  const lessonsCompleted = Math.max(existing?.lessonsCompleted ?? 0, Math.min(lastLessonOrder, course._count.lessons));
  const data = {
    status: existing?.status === "PASSED" ? ("PASSED" as const) : ("IN_PROGRESS" as const),
    lessonsCompleted,
    lastLessonOrder: Math.max(existing?.lastLessonOrder ?? 0, lastLessonOrder),
    startedAt: existing?.startedAt ?? new Date(),
  };

  const progress = await prisma.driverCourseProgress.upsert({
    where: { driverId_courseId: { driverId, courseId: course.id } },
    create: { driverId, courseId: course.id, ...data },
    update: data,
  });
  res.json({ progress });
});

// POST /api/driver-training/courses/:slug/quiz — server-graded quiz submission.
// answers is { [questionId]: selectedOptionIndex }. Score is computed from the
// DB; an unanswered question is wrong. Once PASSED, the course stays PASSED.
const quizSchema = z.object({ answers: z.record(z.string(), z.number().int().min(0).max(3)) });
router.post("/courses/:slug/quiz", validateBody(quizSchema), async (req: DriverRequest, res: Response) => {
  const driverId = req.driver!.id;
  if (!(await assertCdlEligible(driverId, res))) return;
  const course = await prisma.trainingCourse.findFirst({
    where: { slug: req.params.slug, status: "PUBLISHED" },
    select: {
      id: true, title: true, passThreshold: true, validityMonths: true,
      questions: { orderBy: { order: "asc" }, select: { id: true, order: true, correctIndex: true, explanation: true } },
    },
  });
  if (!course) {
    res.status(404).json({ error: "Course not found" });
    return;
  }
  if (course.questions.length === 0) {
    res.status(400).json({ error: "This course has no quiz." });
    return;
  }

  const { answers } = req.body as z.infer<typeof quizSchema>;

  // Defense-in-depth (the client also gates this): reject unknown question ids
  // (audit-trail hygiene) and require every question answered, so a direct or
  // truncated POST gets a clear 400 instead of a silent low score.
  // Unknown question ids mean the answer set is stale — most commonly because an
  // admin re-saved (re-authored) the course while the driver was mid-quiz (T7
  // delete-and-recreates questions, so the ids change). 409 + a clear message so
  // the player can tell the driver to reload, rather than a cryptic 400.
  const validIds = new Set(course.questions.map((q) => q.id));
  if (Object.keys(answers).some((id) => !validIds.has(id))) {
    res.status(409).json({ error: "This course was updated while you were taking it. Please reload the course and start the quiz again." });
    return;
  }
  const missing = course.questions.filter((q) => !Object.prototype.hasOwnProperty.call(answers, q.id));
  if (missing.length > 0) {
    res.status(400).json({ error: "Please answer all questions before submitting." });
    return;
  }

  const total = course.questions.length;
  let correct = 0;
  const review = course.questions.map((q) => {
    const given = Object.prototype.hasOwnProperty.call(answers, q.id) ? answers[q.id] : null;
    const isCorrect = given === q.correctIndex;
    if (isCorrect) correct++;
    return { questionId: q.id, order: q.order, correctIndex: q.correctIndex, given, isCorrect, explanation: q.explanation };
  });
  const scorePct = Math.round((correct / total) * 100);
  const passed = scorePct >= course.passThreshold;

  const now = new Date();
  // Attempt + progress written atomically so an attempt can't be recorded
  // without its progress update (or vice versa). The bestScorePct read-modify-
  // write is a theoretical race only under concurrent same-driver submits,
  // which the single-submit UI prevents; not worth Serializable here.
  const { progress, firstPass } = await prisma.$transaction(async (tx) => {
    await tx.trainingAttempt.create({
      data: { driverId, courseId: course.id, scorePct, passed, answers },
    });

    const existing = await tx.driverCourseProgress.findUnique({
      where: { driverId_courseId: { driverId, courseId: course.id } },
    });
    const wasPassed = existing?.status === "PASSED";
    const nowPassed = wasPassed || passed;
    // completedAt + expiresAt are stamped on the FIRST pass and preserved after.
    // (A later change to the course's validityMonths does NOT retroactively move
    // an already-passed driver's expiresAt — that's a deliberate immutability.)
    const completedAt = wasPassed ? existing!.completedAt : passed ? now : existing?.completedAt ?? null;
    const expiresAt = wasPassed
      ? existing!.expiresAt
      : passed
        ? course.validityMonths
          ? addMonths(now, course.validityMonths)
          : null
        : existing?.expiresAt ?? null;

    const data = {
      status: nowPassed ? ("PASSED" as const) : ("FAILED" as const),
      attemptCount: (existing?.attemptCount ?? 0) + 1,
      bestScorePct: Math.max(existing?.bestScorePct ?? 0, scorePct),
      startedAt: existing?.startedAt ?? now,
      completedAt,
      expiresAt,
    };

    const upserted = await tx.driverCourseProgress.upsert({
      where: { driverId_courseId: { driverId, courseId: course.id } },
      create: { driverId, courseId: course.id, lessonsCompleted: existing?.lessonsCompleted ?? 0, lastLessonOrder: existing?.lastLessonOrder ?? 0, ...data },
      update: data,
    });
    return { progress: upserted, firstPass: passed && !wasPassed };
  });

  // On the FIRST pass only, notify the carrier (fire-and-forget; never blocks
  // the quiz response). Carrier email = contactEmail ?? linked user.email.
  if (firstPass) {
    void (async () => {
      const d = await prisma.driver.findUnique({
        where: { id: driverId },
        select: {
          firstName: true, lastName: true,
          carrierProfile: { select: { companyName: true, contactEmail: true, user: { select: { email: true } } } },
        },
      });
      const carrierEmail = d?.carrierProfile?.contactEmail || d?.carrierProfile?.user?.email;
      if (carrierEmail && d) {
        await sendCarrierTrainingCompletionEmail(carrierEmail, {
          driverName: `${d.firstName} ${d.lastName}`.trim(),
          courseTitle: course.title,
          scorePct,
          completedAt: progress.completedAt ?? now,
          expiresAt: progress.expiresAt,
          carrierName: d.carrierProfile?.companyName ?? null,
        });
      }
    })().catch((e) => log.warn({ err: e, driverId }, "[DriverAcademy] completion email failed"));
  }

  res.json({ scorePct, passed, passThreshold: course.passThreshold, correct, total, review, progress });
});

// GET /api/driver-training/courses/:slug/certificate — the driver's own
// completion certificate PDF (404 unless they have PASSED this course).
router.get("/courses/:slug/certificate", async (req: DriverRequest, res: Response) => {
  const data = await buildCertificateData(req.driver!.id, req.params.slug);
  if (!data) {
    res.status(404).json({ error: "No certificate available — you haven't completed this course yet." });
    return;
  }
  const doc = generateTrainingCertificate(data);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="SRL-Certificate-${req.params.slug}.pdf"`);
  doc.pipe(res);
});

export default router;
