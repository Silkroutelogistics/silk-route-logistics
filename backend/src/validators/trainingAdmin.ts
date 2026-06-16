import { z } from "zod";

/**
 * v3.8.ane — SRL Driver Academy Sprint T7: AE course-authoring validators.
 *
 * Mirrors the seed-script content rules (4-option quizzes, correctIndex 0-3,
 * passThreshold 1-100, non-empty content) so a UI-authored course is structurally
 * identical to a seeded one. The CurriculumCourse/Lesson/Question shapes in
 * backend/src/data/trainingCurriculum.ts are the canonical reference.
 */

export const lessonInputSchema = z.object({
  order: z.number().int().positive(),
  title: z.string().trim().min(1, "Lesson title is required").max(200),
  bodyMarkdown: z.string().trim().min(1, "Lesson body is required"),
  estMinutes: z.number().int().min(0).max(600).default(0),
});

export const questionInputSchema = z.object({
  order: z.number().int().positive(),
  question: z.string().trim().min(1, "Question text is required"),
  options: z.array(z.string().trim().min(1, "Option text cannot be empty")).length(4, "Each question must have exactly 4 options"),
  correctIndex: z.number().int().min(0).max(3),
  // Optional; empty strings normalize to null so an explanation is either real text or absent.
  explanation: z.string().max(2000).nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null)),
});

// Course metadata — shared by create + save. NOTE: slug is NOT here; it is set
// once at create and is immutable thereafter (it lives in certificate filenames
// + driver bookmarks, per the T7 audit guard).
export const courseMetaSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  category: z.string().min(1, "Category is required").max(100),
  summary: z.string().max(2000).nullable().optional(),
  version: z.string().min(1).max(20).default("1"),
  estMinutes: z.number().int().min(0).max(6000).default(0),
  passThreshold: z.number().int().min(1).max(100).default(80),
  validityMonths: z.number().int().min(1).max(120).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  disclaimer: z.string().max(4000).nullable().optional(),
});

// POST /courses — create an empty DRAFT (slug + meta; lessons/questions added via PUT).
export const createCourseSchema = courseMetaSchema.extend({
  slug: z.string().min(1).max(60).regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
});

// PUT /courses/:id — full transactional save (meta + complete lessons[] + questions[]).
export const saveBundleSchema = courseMetaSchema.extend({
  lessons: z.array(lessonInputSchema),
  questions: z.array(questionInputSchema),
});

export const setStatusSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
});
