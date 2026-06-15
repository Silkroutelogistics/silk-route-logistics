-- v3.8.ana — SRL Driver Academy Sprint T3: course content + per-driver progress.
-- Manually authored per CLAUDE.md §2.2 (no `prisma migrate dev` against the
-- prod-pointed DATABASE_URL). Applied by Render's `prisma migrate deploy`.
-- All new tables/enums; the only change to an existing table is the virtual
-- inverse relations on drivers (no column added there). Content is loaded
-- separately via scripts/seed-training-courses.ts AFTER deploy — these tables
-- ship empty.

-- CreateEnum
CREATE TYPE "public"."TrainingCourseStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "public"."DriverCourseStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."training_courses" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "summary" TEXT,
    "version" TEXT NOT NULL DEFAULT '1',
    "estMinutes" INTEGER NOT NULL DEFAULT 0,
    "passThreshold" INTEGER NOT NULL DEFAULT 80,
    "validityMonths" INTEGER,
    "status" "public"."TrainingCourseStatus" NOT NULL DEFAULT 'PUBLISHED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "disclaimer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "training_courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."training_lessons" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "estMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "training_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."training_questions" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "training_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."driver_course_progress" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "public"."DriverCourseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "lessonsCompleted" INTEGER NOT NULL DEFAULT 0,
    "lastLessonOrder" INTEGER NOT NULL DEFAULT 0,
    "bestScorePct" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "certificateDocumentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "driver_course_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."training_attempts" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "scorePct" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "answers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "training_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "training_courses_slug_key" ON "public"."training_courses"("slug");
CREATE INDEX "training_courses_status_idx" ON "public"."training_courses"("status");
CREATE INDEX "training_courses_category_idx" ON "public"."training_courses"("category");

CREATE INDEX "training_lessons_courseId_idx" ON "public"."training_lessons"("courseId");
CREATE UNIQUE INDEX "training_lessons_courseId_order_key" ON "public"."training_lessons"("courseId", "order");

CREATE INDEX "training_questions_courseId_idx" ON "public"."training_questions"("courseId");
CREATE UNIQUE INDEX "training_questions_courseId_order_key" ON "public"."training_questions"("courseId", "order");

CREATE INDEX "driver_course_progress_driverId_idx" ON "public"."driver_course_progress"("driverId");
CREATE INDEX "driver_course_progress_courseId_idx" ON "public"."driver_course_progress"("courseId");
CREATE INDEX "driver_course_progress_expiresAt_idx" ON "public"."driver_course_progress"("expiresAt");
CREATE UNIQUE INDEX "driver_course_progress_driverId_courseId_key" ON "public"."driver_course_progress"("driverId", "courseId");

CREATE INDEX "training_attempts_driverId_courseId_idx" ON "public"."training_attempts"("driverId", "courseId");

-- AddForeignKey
ALTER TABLE "public"."training_lessons" ADD CONSTRAINT "training_lessons_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."training_questions" ADD CONSTRAINT "training_questions_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."driver_course_progress" ADD CONSTRAINT "driver_course_progress_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."driver_course_progress" ADD CONSTRAINT "driver_course_progress_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."training_attempts" ADD CONSTRAINT "training_attempts_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "public"."drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."training_attempts" ADD CONSTRAINT "training_attempts_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "public"."training_courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
