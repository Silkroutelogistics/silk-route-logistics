/**
 * v3.8.ana — SRL Driver Academy Sprint T3: seed the starter curriculum.
 *
 * Idempotent upsert of CURRICULUM (src/data/trainingCurriculum.ts) into the
 * training_courses / training_lessons / training_questions tables, keyed by
 * course slug and (courseId, order). Re-running re-applies edits and prunes
 * lessons/questions that were removed from the module. Per-driver progress +
 * attempts are never touched.
 *
 *   Validate content only (no DB connection):
 *     npx tsx scripts/seed-training-courses.ts --dry-run
 *   Seed (writes to the DB in DATABASE_URL — run AFTER content review):
 *     npx tsx scripts/seed-training-courses.ts
 *
 * Reads DATABASE_URL from the environment, falling back to backend/.env (same
 * pattern as the other backend/scripts diagnostics). --dry-run never connects.
 */
import fs from "fs";
import path from "path";
import { CURRICULUM } from "../src/data/trainingCurriculum";

const DRY = process.argv.includes("--dry-run");

function validate(): { lessons: number; questions: number } {
  let lessons = 0;
  let questions = 0;
  const slugs = new Set<string>();
  for (const c of CURRICULUM) {
    if (slugs.has(c.slug)) throw new Error(`Duplicate course slug: ${c.slug}`);
    slugs.add(c.slug);
    if (c.passThreshold < 1 || c.passThreshold > 100) throw new Error(`${c.slug}: passThreshold out of range`);

    const lessonOrders = new Set<number>();
    for (const l of c.lessons) {
      if (lessonOrders.has(l.order)) throw new Error(`${c.slug}: duplicate lesson order ${l.order}`);
      lessonOrders.add(l.order);
      if (!l.title.trim() || !l.bodyMarkdown.trim()) throw new Error(`${c.slug} lesson ${l.order}: empty title/body`);
    }

    const qOrders = new Set<number>();
    for (const q of c.questions) {
      if (qOrders.has(q.order)) throw new Error(`${c.slug}: duplicate question order ${q.order}`);
      qOrders.add(q.order);
      if (q.options.length !== 4) throw new Error(`${c.slug} q${q.order}: expected 4 options, got ${q.options.length}`);
      if (q.correctIndex < 0 || q.correctIndex > 3) throw new Error(`${c.slug} q${q.order}: correctIndex ${q.correctIndex} out of range`);
    }
    lessons += c.lessons.length;
    questions += c.questions.length;
    console.log(`  ${c.slug.padEnd(26)} ${c.lessons.length} lessons, ${c.questions.length} questions`);
  }
  return { lessons, questions };
}

function loadDbUrl(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) process.env.DATABASE_URL = m[1];
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set (env or backend/.env)");
}

async function main(): Promise<void> {
  console.log("SRL Driver Academy — curriculum seed\n");
  const { lessons, questions } = validate();
  console.log(`\nTotal: ${CURRICULUM.length} courses, ${lessons} lessons, ${questions} questions`);

  if (DRY) {
    console.log("\nDRY RUN — content valid. No database writes performed.");
    return;
  }

  loadDbUrl();
  // Lazy import so --dry-run never loads the client / connects.
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    for (const c of CURRICULUM) {
      const courseData = {
        title: c.title,
        category: c.category,
        summary: c.summary,
        version: c.version,
        estMinutes: c.estMinutes,
        passThreshold: c.passThreshold,
        validityMonths: c.validityMonths,
        status: "PUBLISHED" as const,
        sortOrder: c.sortOrder,
        disclaimer: c.disclaimer,
      };
      const course = await prisma.trainingCourse.upsert({
        where: { slug: c.slug },
        create: { slug: c.slug, ...courseData },
        update: courseData,
      });

      for (const l of c.lessons) {
        const data = { title: l.title, bodyMarkdown: l.bodyMarkdown, estMinutes: l.estMinutes };
        await prisma.trainingLesson.upsert({
          where: { courseId_order: { courseId: course.id, order: l.order } },
          create: { courseId: course.id, order: l.order, ...data },
          update: data,
        });
      }
      await prisma.trainingLesson.deleteMany({
        where: { courseId: course.id, order: { notIn: c.lessons.map((l) => l.order) } },
      });

      for (const q of c.questions) {
        const data = { question: q.question, options: q.options, correctIndex: q.correctIndex, explanation: q.explanation };
        await prisma.trainingQuestion.upsert({
          where: { courseId_order: { courseId: course.id, order: q.order } },
          create: { courseId: course.id, order: q.order, ...data },
          update: data,
        });
      }
      await prisma.trainingQuestion.deleteMany({
        where: { courseId: course.id, order: { notIn: c.questions.map((q) => q.order) } },
      });

      console.log(`  upserted ${c.slug}`);
    }
    console.log("\nSeed complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
