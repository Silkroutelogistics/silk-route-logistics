"use client";

// v3.8.anb — SRL Driver Academy Sprint T4: the lesson player + quiz.
// Reads ?slug=... (Suspense + useSearchParams, static-export pattern). Lessons
// stepper → quiz (all questions, server-graded on submit) → results with
// per-question review + retake. Lives under /driver/dashboard so it inherits
// the layout's auth gate + header.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Loader2, ChevronLeft, ChevronRight, ArrowLeft, CheckCircle2, XCircle, GraduationCap, RotateCcw, Download,
} from "lucide-react";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
import { CarrierCard } from "@/components/carrier";
import { LessonMarkdown } from "@/components/driver/LessonMarkdown";

interface Lesson { id: string; order: number; title: string; bodyMarkdown: string; estMinutes: number }
interface Question { id: string; order: number; question: string; options: string[] }
interface Course {
  id: string; slug: string; title: string; category: string; summary: string | null;
  estMinutes: number; passThreshold: number; validityMonths: number | null; disclaimer: string | null;
  lessons: Lesson[]; questions: Question[];
}
interface ReviewItem { questionId: string; order: number; correctIndex: number; given: number | null; isCorrect: boolean; explanation: string | null }
interface QuizResult { scorePct: number; passed: boolean; passThreshold: number; correct: number; total: number; review: ReviewItem[] }

type Phase = "lessons" | "quiz" | "results";

function CourseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = searchParams.get("slug") || "";

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [phase, setPhase] = useState<Phase>("lessons");
  const [lessonIdx, setLessonIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    if (!slug) { setError("No course specified."); setLoading(false); return; }
    let active = true;
    api
      .get(`/driver-training/courses/${slug}`)
      .then((r) => { if (active) { setCourse(r.data.course); setLoading(false); } })
      .catch(() => { if (active) { setError("Could not load this course."); setLoading(false); } });
    return () => { active = false; };
  }, [slug]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 size={28} className="text-[#BA7517] animate-spin" /></div>;
  }
  if (error || !course) {
    return (
      <CarrierCard padding="p-8">
        <p className="text-center text-sm text-red-600 mb-4">{error || "Course not found."}</p>
        <div className="text-center"><button onClick={() => router.push("/driver/dashboard")} className="text-[13px] font-medium text-[#BA7517]">← Back to courses</button></div>
      </CarrierCard>
    );
  }

  const lessons = course.lessons;
  const questions = course.questions;
  const hasQuiz = questions.length > 0;
  const allAnswered = hasQuiz && questions.every((q) => answers[q.id] !== undefined);

  const goToQuiz = async () => {
    // Mark reading progress (best-effort; never blocks the quiz).
    api.post(`/driver-training/courses/${slug}/lesson-progress`, { lastLessonOrder: lessons.length }).catch(() => {});
    setPhase("quiz");
    window.scrollTo({ top: 0 });
  };

  const submitQuiz = async () => {
    if (!allAnswered) { setError("Please answer all questions before submitting."); return; }
    setSubmitting(true);
    try {
      const r = await api.post(`/driver-training/courses/${slug}/quiz`, { answers });
      setResult(r.data);
      setPhase("results");
      window.scrollTo({ top: 0 });
    } catch {
      setError("Could not submit your quiz. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => { setAnswers({}); setResult(null); setPhase("quiz"); window.scrollTo({ top: 0 }); };

  const downloadCert = async () => {
    setError(null);
    try {
      await downloadFromApi(`/driver-training/courses/${slug}/certificate`, `SRL-Certificate-${slug}.pdf`);
    } catch {
      setError("Couldn't download your certificate. Try again in a moment.");
    }
  };

  // ── Header (shared) ───────────────────────────────────────
  const header = (
    <div className="mb-4">
      <button onClick={() => router.push("/driver/dashboard")} className="flex items-center gap-1 text-[12px] text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft size={14} /> All courses
      </button>
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BA7517]">{course.category}</span>
      <h1 className="font-serif text-2xl text-[#0F1117]">{course.title}</h1>
    </div>
  );

  // ── Lessons phase ─────────────────────────────────────────
  if (phase === "lessons") {
    const lesson = lessons[lessonIdx];
    const isLast = lessonIdx === lessons.length - 1;
    return (
      <div>
        {header}
        {/* step dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {lessons.map((l, i) => (
            <button key={l.id} onClick={() => setLessonIdx(i)} aria-label={`Lesson ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === lessonIdx ? "w-6 bg-[#C9A84C]" : i < lessonIdx ? "w-3 bg-[#C9A84C]/50" : "w-3 bg-gray-200"}`} />
          ))}
        </div>
        <CarrierCard padding="p-5">
          <div className="text-[11px] text-gray-400 mb-1">Lesson {lesson.order} of {lessons.length} · ~{lesson.estMinutes} min</div>
          <h2 className="font-serif text-lg text-[#0F1117] mb-3">{lesson.title}</h2>
          <LessonMarkdown text={lesson.bodyMarkdown} />
        </CarrierCard>

        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setLessonIdx((i) => Math.max(0, i - 1))} disabled={lessonIdx === 0}
            className="flex items-center gap-1 px-3 py-2 text-[13px] text-gray-500 hover:text-gray-800 disabled:opacity-30 disabled:cursor-not-allowed">
            <ChevronLeft size={16} /> Back
          </button>
          {isLast ? (
            hasQuiz ? (
              <button onClick={goToQuiz}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0A2540] text-[13px] font-semibold rounded-md hover:shadow-lg transition-shadow">
                Go to quiz <ChevronRight size={16} />
              </button>
            ) : (
              <button onClick={() => { api.post(`/driver-training/courses/${slug}/lesson-progress`, { lastLessonOrder: lessons.length }).catch(() => {}); router.push("/driver/dashboard"); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0A2540] text-[13px] font-semibold rounded-md hover:shadow-lg transition-shadow">
                Finish <ChevronRight size={16} />
              </button>
            )
          ) : (
            <button onClick={() => setLessonIdx((i) => Math.min(lessons.length - 1, i + 1))}
              className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0A2540] text-[13px] font-semibold rounded-md hover:shadow-lg transition-shadow">
              Next <ChevronRight size={16} />
            </button>
          )}
        </div>

        {course.disclaimer && <p className="mt-5 text-[10px] text-gray-400 italic leading-relaxed">{course.disclaimer}</p>}
      </div>
    );
  }

  // ── Quiz phase ────────────────────────────────────────────
  if (phase === "quiz") {
    return (
      <div>
        {header}
        <div className="mb-4 px-3 py-2 bg-[#C9A84C]/5 border border-[#C9A84C]/20 rounded-lg text-[12px] text-gray-600">
          Answer all {questions.length} questions. You need <span className="font-semibold text-[#0F1117]">{course.passThreshold}%</span> to pass. You can retake it as many times as you need.
        </div>
        <div className="space-y-3">
          {questions.map((q, qi) => (
            <CarrierCard key={q.id} padding="p-5">
              <div className="text-[11px] text-gray-400 mb-1">Question {qi + 1} of {questions.length}</div>
              <p className="text-[14px] font-medium text-[#0F1117] mb-3">{q.question}</p>
              <div className="space-y-2">
                {q.options.map((opt, oi) => {
                  const selected = answers[q.id] === oi;
                  return (
                    <button key={oi} onClick={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                      className={`w-full text-left px-3 py-2.5 rounded-lg border text-[13px] transition-colors ${selected ? "border-[#C9A84C] bg-[#C9A84C]/10 text-[#0F1117] font-medium" : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"}`}>
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full border mr-2 text-[10px] font-semibold ${selected ? "border-[#C9A84C] bg-[#C9A84C] text-white" : "border-gray-300 text-gray-400"}`}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </CarrierCard>
          ))}
        </div>

        {error && <div className="mt-3 px-3 py-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">{error}</div>}

        <div className="flex items-center justify-between mt-4">
          <button onClick={() => setPhase("lessons")} className="flex items-center gap-1 px-3 py-2 text-[13px] text-gray-500 hover:text-gray-800">
            <ChevronLeft size={16} /> Review lessons
          </button>
          <button onClick={submitQuiz} disabled={!allAnswered || submitting}
            className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0A2540] text-[13px] font-semibold rounded-md hover:shadow-lg transition-shadow disabled:opacity-40 disabled:cursor-not-allowed">
            {submitting && <Loader2 size={14} className="animate-spin" />} Submit quiz
          </button>
        </div>
        {!allAnswered && <p className="text-right text-[11px] text-gray-400 mt-1">Answer all questions to submit</p>}
      </div>
    );
  }

  // ── Results phase ─────────────────────────────────────────
  const r = result!;
  const byId = new Map(r.review.map((x) => [x.questionId, x]));
  return (
    <div>
      {header}
      <CarrierCard padding="p-6" className={r.passed ? "border-green-200" : "border-amber-200"}>
        <div className="text-center">
          {r.passed
            ? <CheckCircle2 size={40} className="mx-auto text-green-600 mb-2" />
            : <GraduationCap size={40} className="mx-auto text-[#BA7517] mb-2" />}
          <div className="font-serif text-3xl text-[#0F1117]">{r.scorePct}%</div>
          <div className={`text-sm font-semibold mt-1 ${r.passed ? "text-green-700" : "text-amber-700"}`}>
            {r.passed ? "Passed — course complete" : `Not quite — you need ${r.passThreshold}%`}
          </div>
          <div className="text-[12px] text-gray-500 mt-1">{r.correct} of {r.total} correct</div>
        </div>
      </CarrierCard>

      {/* per-question review */}
      <div className="space-y-3 mt-4">
        {questions.map((q, qi) => {
          const rv = byId.get(q.id);
          if (!rv) return null;
          return (
            <CarrierCard key={q.id} padding="p-5">
              <div className="flex items-start gap-2 mb-2">
                {rv.isCorrect ? <CheckCircle2 size={16} className="text-green-600 shrink-0 mt-0.5" /> : <XCircle size={16} className="text-red-500 shrink-0 mt-0.5" />}
                <p className="text-[14px] font-medium text-[#0F1117]">Q{qi + 1}. {q.question}</p>
              </div>
              <div className="space-y-1.5 ml-6">
                {q.options.map((opt, oi) => {
                  // bounds-guard the server-sent indices so a corrupted response degrades gracefully
                  const isCorrect = rv.correctIndex >= 0 && rv.correctIndex < q.options.length && oi === rv.correctIndex;
                  const isGiven = rv.given != null && oi === rv.given;
                  return (
                    <div key={oi} className={`px-3 py-1.5 rounded-md text-[12px] border ${isCorrect ? "border-green-300 bg-green-50 text-green-800" : isGiven ? "border-red-300 bg-red-50 text-red-700" : "border-transparent text-gray-500"}`}>
                      <span className="font-semibold mr-1">{String.fromCharCode(65 + oi)}.</span>{opt}
                      {isCorrect && <span className="ml-1 text-[10px] font-semibold uppercase">✓ correct</span>}
                      {isGiven && !isCorrect && <span className="ml-1 text-[10px] font-semibold uppercase">your answer</span>}
                    </div>
                  );
                })}
              </div>
              {rv.explanation && <p className="ml-6 mt-2 text-[12px] text-gray-500 italic">{rv.explanation}</p>}
            </CarrierCard>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-5">
        <button onClick={() => { setPhase("lessons"); setLessonIdx(0); }} className="flex items-center gap-1 px-3 py-2 text-[13px] text-gray-500 hover:text-gray-800">
          <ChevronLeft size={16} /> Review lessons
        </button>
        {r.passed ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={downloadCert}
              className="flex items-center gap-1.5 px-4 py-2 border border-[#C9A84C]/50 text-[#BA7517] text-[13px] font-semibold rounded-md hover:bg-[#C9A84C]/10 transition-colors">
              <Download size={14} /> Certificate
            </button>
            <button onClick={() => router.push("/driver/dashboard")}
              className="px-5 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0A2540] text-[13px] font-semibold rounded-md hover:shadow-lg transition-shadow">
              Back to courses
            </button>
          </div>
        ) : (
          <button onClick={retake}
            className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0A2540] text-[13px] font-semibold rounded-md hover:shadow-lg transition-shadow">
            <RotateCcw size={14} /> Retake quiz
          </button>
        )}
      </div>
    </div>
  );
}

export default function DriverCoursePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-16"><Loader2 size={28} className="text-[#BA7517] animate-spin" /></div>}>
      <CourseContent />
    </Suspense>
  );
}
