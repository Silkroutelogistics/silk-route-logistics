import { prisma } from "../config/database";

/**
 * v3.8.ane — SRL Driver Academy Sprint T7: AE course-authoring service.
 *
 * Backs the /api/training-admin endpoints. The keystone is saveCourseBundle:
 * a transactional delete-and-recreate of a course's lessons + questions. The
 * T7 audit confirmed this is SAFE — no FK from TrainingAttempt/DriverCourseProgress
 * to individual lesson/question ids (attempts store answers as JSON; progress is
 * order-based via lastLessonOrder), and delete-then-recreate is the only way to
 * reorder past the @@unique([courseId, order]) constraint.
 */

class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface LessonInput { order: number; title: string; bodyMarkdown: string; estMinutes: number }
interface QuestionInput { order: number; question: string; options: string[]; correctIndex: number; explanation?: string | null }
interface CourseMeta {
  title: string; category: string; summary?: string | null; version: string;
  estMinutes: number; passThreshold: number; validityMonths?: number | null;
  sortOrder: number; disclaimer?: string | null;
}

// List all courses (every status) for the AE authoring grid, with content +
// adoption counts.
export async function listCoursesForAdmin() {
  const courses = await prisma.trainingCourse.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, slug: true, title: true, category: true, status: true, version: true,
      passThreshold: true, validityMonths: true, estMinutes: true, updatedAt: true,
      _count: { select: { lessons: true, questions: true, progress: true } },
    },
  });

  const passedGroups = await prisma.driverCourseProgress.groupBy({
    by: ["courseId"],
    where: { status: "PASSED" },
    _count: { _all: true },
  });
  const passedMap = new Map(passedGroups.map((g) => [g.courseId, g._count._all]));

  return courses.map((c) => ({
    id: c.id, slug: c.slug, title: c.title, category: c.category, status: c.status,
    version: c.version, passThreshold: c.passThreshold, validityMonths: c.validityMonths,
    estMinutes: c.estMinutes, updatedAt: c.updatedAt,
    lessonCount: c._count.lessons, questionCount: c._count.questions,
    driverCount: c._count.progress, passedCount: passedMap.get(c.id) ?? 0,
  }));
}

// Full course for the editor — lessons + questions WITH correctIndex/explanation
// (the AE authors the answers; the driver-facing endpoint omits them).
export async function getCourseForAdmin(id: string) {
  return prisma.trainingCourse.findUnique({
    where: { id },
    include: {
      lessons: { orderBy: { order: "asc" } },
      questions: { orderBy: { order: "asc" } },
    },
  });
}

export async function createCourse(data: CourseMeta & { slug: string }) {
  const existing = await prisma.trainingCourse.findUnique({ where: { slug: data.slug }, select: { id: true } });
  if (existing) throw new HttpError("A course with this slug already exists.", 409);
  // Always DRAFT on create — content is added via the editor, then published.
  return prisma.trainingCourse.create({
    data: { ...data, status: "DRAFT" },
    include: { lessons: { orderBy: { order: "asc" } }, questions: { orderBy: { order: "asc" } } },
  });
}

function assertUniqueOrders(lessons: LessonInput[], questions: QuestionInput[]) {
  const seenL = new Set<number>();
  for (const l of lessons) {
    if (seenL.has(l.order)) throw new HttpError(`Duplicate lesson order ${l.order} — each lesson needs a unique position.`, 400);
    seenL.add(l.order);
  }
  const seenQ = new Set<number>();
  for (const q of questions) {
    if (seenQ.has(q.order)) throw new HttpError(`Duplicate question order ${q.order} — each question needs a unique position.`, 400);
    seenQ.add(q.order);
  }
}

// Transactional full-replace of a course's content. Returns null if the course
// doesn't exist (caller 404s).
export async function saveCourseBundle(
  id: string,
  body: CourseMeta & { lessons: LessonInput[]; questions: QuestionInput[] },
) {
  const existing = await prisma.trainingCourse.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return null;

  assertUniqueOrders(body.lessons, body.questions);

  const { lessons, questions, ...meta } = body;

  return prisma.$transaction(async (tx) => {
    await tx.trainingCourse.update({ where: { id }, data: meta });
    // Delete-then-recreate — the only reorder-safe path past @@unique([courseId, order]).
    await tx.trainingLesson.deleteMany({ where: { courseId: id } });
    for (const l of lessons) {
      await tx.trainingLesson.create({
        data: { courseId: id, order: l.order, title: l.title, bodyMarkdown: l.bodyMarkdown, estMinutes: l.estMinutes },
      });
    }
    await tx.trainingQuestion.deleteMany({ where: { courseId: id } });
    for (const q of questions) {
      await tx.trainingQuestion.create({
        data: { courseId: id, order: q.order, question: q.question, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation ?? null },
      });
    }
    return tx.trainingCourse.findUnique({
      where: { id },
      include: { lessons: { orderBy: { order: "asc" } }, questions: { orderBy: { order: "asc" } } },
    });
  });
}

export async function setCourseStatus(id: string, status: "DRAFT" | "PUBLISHED" | "ARCHIVED") {
  const course = await prisma.trainingCourse.findUnique({
    where: { id },
    select: { id: true, _count: { select: { lessons: true, questions: true } } },
  });
  if (!course) return null;

  // A course can't go live empty — drivers would see a course with nothing to do.
  if (status === "PUBLISHED" && (course._count.lessons < 1 || course._count.questions < 1)) {
    throw new HttpError("A course needs at least one lesson and one quiz question before it can be published.", 400);
  }

  return prisma.trainingCourse.update({
    where: { id },
    data: { status },
    include: { lessons: { orderBy: { order: "asc" } }, questions: { orderBy: { order: "asc" } } },
  });
}

// Hard-delete is allowed ONLY for a truly-unused course (no driver progress and
// no attempts). Anything a driver has touched must be ARCHIVED instead, so the
// training history (+ certificates) survives.
export async function deleteCourse(id: string): Promise<{ notFound?: true; blocked?: true; deleted?: true }> {
  // The count-check and the delete run in ONE transaction so a quiz submitted in
  // the window between them can't slip an attempt past the guard and get silently
  // cascade-deleted (review fix). The check is re-read inside the tx immediately
  // before the delete.
  return prisma.$transaction(async (tx) => {
    const course = await tx.trainingCourse.findUnique({
      where: { id },
      select: { id: true, _count: { select: { progress: true, attempts: true } } },
    });
    if (!course) return { notFound: true as const };
    if (course._count.progress > 0 || course._count.attempts > 0) return { blocked: true as const };
    await tx.trainingCourse.delete({ where: { id } }); // cascade drops lessons + questions
    return { deleted: true as const };
  });
}

export { HttpError };
