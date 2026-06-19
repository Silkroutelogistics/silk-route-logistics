"use client";

// v3.8.anp — SRL Driver Academy lesson player (slide-deck redesign).
//
// One lesson = one slide (LessonSlide), one quiz question = one slide
// (QuizSlide) — replaces the flat markdown + all-questions-stacked "exam"
// layout. The orchestration is unchanged: forced-sequential first read-through
// (v3.8.anf), CDL gate (403 CDL_REQUIRED, v3.8.ang), server-graded quiz with
// 409 stale-reload handling, hydrate-once resume (Sub-pattern 10), cert
// download. Canonical §2.1 tokens throughout.
//
// Reads ?slug=... (Suspense + useSearchParams, static-export pattern). Lives
// under /driver/dashboard so it inherits the layout's auth gate + header.

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, ChevronLeft, ArrowLeft, CheckCircle2, XCircle, GraduationCap, RotateCcw, Download } from "lucide-react";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
import { LessonSlide } from "@/components/driver/LessonSlide";
import { QuizSlide } from "@/components/driver/QuizSlide";

interface Lesson { id: string; order: number; title: string; bodyMarkdown: string; estMinutes: number }
interface Question { id: string; order: number; question: string; options: string[] }
interface Course {
  id: string; slug: string; title: string; category: string; summary: string | null;
  estMinutes: number; passThreshold: number; validityMonths: number | null; disclaimer: string | null;
  lessons: Lesson[]; questions: Question[];
}
interface Progress { status: "NOT_STARTED" | "IN_PROGRESS" | "PASSED" | "FAILED"; lessonsCompleted: number; lastLessonOrder: number }
interface ReviewItem { questionId: string; order: number; correctIndex: number; given: number | null; isCorrect: boolean; explanation: string | null }
interface QuizResult { scorePct: number; passed: boolean; passThreshold: number; correct: number; total: number; review: ReviewItem[] }

type Phase = "lessons" | "quiz" | "results";

const PRIMARY =
  "inline-flex items-center gap-1.5 rounded-lg bg-[#BA7517] px-5 py-2.5 text-[13.5px] font-semibold text-[#FBF7F0] shadow-[0_2px_8px_rgba(186,117,23,0.28)] transition-all hover:bg-[#a3650f] active:scale-[0.98]";

function CourseContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = searchParams.get("slug") || "";

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const [phase, setPhase] = useState<Phase>("lessons");
  const [lessonIdx, setLessonIdx] = useState(0);
  const [furthestReached, setFurthestReached] = useState(0);
  const [passed, setPassed] = useState(false);
  const [quizIdx, setQuizIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [staleReload, setStaleReload] = useState(false);

  useEffect(() => {
    if (!slug) { setError("No course specified."); setLoading(false); return; }
    let active = true;
    api
      .get(`/driver-training/courses/${slug}`)
      .then((r) => {
        if (!active) return;
        const c: Course = r.data.course;
        const pr: Progress | null = r.data.progress;
        setCourse(c);
        // Hydrate once (Sub-pattern 10) — resume point + review state from server.
        const total = c.lessons.length;
        const didPass = pr?.status === "PASSED";
        const completed = pr?.lessonsCompleted ?? 0;
        const readThrough = didPass || completed >= total;
        setPassed(!!didPass);
        setFurthestReached(readThrough ? Math.max(0, total - 1) : Math.min(Math.max(0, completed - 1), Math.max(0, total - 1)));
        setLessonIdx(!didPass && !readThrough && total > 0 ? Math.min(completed, total - 1) : 0);
        setHydrated(true);
        setLoading(false);
      })
      .catch((e) => {
        if (!active) return;
        const resp = (e as { response?: { status?: number; data?: { code?: string; error?: string } } })?.response;
        if (resp?.status === 403 && resp.data?.code === "CDL_REQUIRED") {
          setError(resp.data.error || "A valid CDL on file is required to start training. Ask your carrier to update your driver record, then refresh.");
        } else {
          setError("Could not load this course.");
        }
        setLoading(false);
      });
    return () => { active = false; };
  }, [slug]);

  if (loading || !hydrated) {
    return <div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-[#BA7517]" /></div>;
  }
  if (error && !course) {
    return (
      <div className="rounded-2xl border border-[rgba(10,37,64,0.08)] bg-white p-8 shadow-[0_4px_24px_rgba(10,37,64,0.07)]">
        <p className="mb-4 text-center text-sm text-[#9B2C2C]">{error || "Course not found."}</p>
        <div className="text-center"><button onClick={() => router.push("/driver/dashboard")} className="text-[13px] font-semibold text-[#BA7517]">← Back to courses</button></div>
      </div>
    );
  }
  if (!course) return null;

  const lessons = course.lessons;
  const questions = course.questions;
  const hasQuiz = questions.length > 0;
  const allAnswered = hasQuiz && questions.every((q) => answers[q.id] !== undefined);
  const reviewMode = passed || furthestReached >= lessons.length - 1;

  const recordProgress = (orderViewed: number) => {
    api.post(`/driver-training/courses/${slug}/lesson-progress`, { lastLessonOrder: orderViewed }).catch(() => {});
  };

  const advance = () => {
    const next = Math.min(lessons.length - 1, lessonIdx + 1);
    setLessonIdx(next);
    setFurthestReached((f) => Math.max(f, next));
    recordProgress(next + 1);
    window.scrollTo({ top: 0 });
  };

  const goToQuiz = async () => {
    // audit F3 — record full read-through server-side AND await it before the
    // quiz so the backend "complete all lessons" gate never blocks a legit driver.
    try {
      await api.post(`/driver-training/courses/${slug}/lesson-progress`, { lastLessonOrder: lessons.length });
    } catch {
      setError("Couldn't save your progress. Check your connection and tap again.");
      return;
    }
    setError(null);
    setFurthestReached(lessons.length - 1);
    setQuizIdx(0);
    setPhase("quiz");
    window.scrollTo({ top: 0 });
  };

  const finishNoQuiz = () => { recordProgress(lessons.length); router.push("/driver/dashboard"); };

  const submitQuiz = async () => {
    if (!allAnswered) { setError("Please answer every question before submitting."); return; }
    setSubmitting(true);
    setError(null);
    setStaleReload(false);
    try {
      const r = await api.post(`/driver-training/courses/${slug}/quiz`, { answers });
      setResult(r.data);
      if (r.data?.passed) setPassed(true);
      setPhase("results");
      window.scrollTo({ top: 0 });
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 409) { setError("This course was updated while you were taking it. Reload to get the latest version."); setStaleReload(true); }
      else setError("Could not submit your quiz. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const retake = () => { setAnswers({}); setResult(null); setQuizIdx(0); setPhase("quiz"); window.scrollTo({ top: 0 }); };

  const downloadCert = async () => {
    setError(null);
    try {
      await downloadFromApi(`/driver-training/courses/${slug}/certificate`, `SRL-Certificate-${slug}.pdf`);
    } catch {
      setError("Couldn't download your certificate. Try again in a moment.");
    }
  };

  // shared slim header
  const header = (
    <div className="mb-4">
      <button onClick={() => router.push("/driver/dashboard")} className="mb-2 flex items-center gap-1 text-[12px] text-[#6B7685] transition-colors hover:text-[#0A2540]">
        <ArrowLeft size={14} /> All courses
      </button>
      <h1 className="font-serif text-[17px] leading-tight text-[#0A2540]">{course.title}</h1>
    </div>
  );

  // ── Lessons ───────────────────────────────────────────────
  if (phase === "lessons") {
    const lesson = lessons[lessonIdx];
    const isLast = lessonIdx === lessons.length - 1;
    const primaryLabel = isLast ? (hasQuiz ? "Go to quiz" : "Finish") : "Next";
    const onPrimary = isLast ? (hasQuiz ? goToQuiz : finishNoQuiz) : advance;
    return (
      <div>
        {header}
        <LessonSlide
          key={lessonIdx}
          category={course.category}
          slug={course.slug}
          lessonOrder={lesson.order}
          lessonTitle={lesson.title}
          bodyMarkdown={lesson.bodyMarkdown}
          estMinutes={lesson.estMinutes}
          index={lessonIdx}
          total={lessons.length}
          furthestReached={furthestReached}
          reviewMode={reviewMode}
          onJump={(i) => { setLessonIdx(i); window.scrollTo({ top: 0 }); }}
          onBack={() => { setLessonIdx((i) => Math.max(0, i - 1)); window.scrollTo({ top: 0 }); }}
          onPrimary={onPrimary}
          primaryLabel={primaryLabel}
          error={error}
          disclaimer={course.disclaimer}
        />
      </div>
    );
  }

  // ── Quiz (one question per slide) ─────────────────────────
  if (phase === "quiz") {
    const q = questions[Math.min(quizIdx, questions.length - 1)];
    const answeredCount = questions.filter((qq) => answers[qq.id] !== undefined).length;
    return (
      <div>
        {header}
        <QuizSlide
          key={q.id}
          question={q}
          index={quizIdx}
          total={questions.length}
          selected={answers[q.id] ?? null}
          onSelect={(oi) => setAnswers((a) => ({ ...a, [q.id]: oi }))}
          onBack={() => {
            if (quizIdx === 0) { setPhase("lessons"); setLessonIdx(0); window.scrollTo({ top: 0 }); }
            else { setQuizIdx((i) => Math.max(0, i - 1)); window.scrollTo({ top: 0 }); }
          }}
          onNext={() => { setQuizIdx((i) => Math.min(questions.length - 1, i + 1)); window.scrollTo({ top: 0 }); }}
          onSubmit={submitQuiz}
          submitting={submitting}
          passThreshold={course.passThreshold}
          answeredCount={answeredCount}
          error={error}
          staleReload={staleReload}
          onReload={() => window.location.reload()}
        />
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────
  const res = result!;
  const byId = new Map(res.review.map((x) => [x.questionId, x]));
  return (
    <div>
      {header}
      <div className={`srl-slide-in overflow-hidden rounded-2xl border bg-white shadow-[0_4px_24px_rgba(10,37,64,0.07)] ${res.passed ? "border-[#2F7A4F]/30" : "border-[#B07A1A]/30"}`}>
        <div className={`px-6 py-7 text-center ${res.passed ? "bg-[#E6F0E9]" : "bg-[#FBEFD4]"}`}>
          {res.passed
            ? <CheckCircle2 size={42} className="mx-auto mb-2 text-[#2F7A4F]" />
            : <GraduationCap size={42} className="mx-auto mb-2 text-[#B07A1A]" />}
          <div className="font-serif text-[40px] leading-none text-[#0A2540]">{res.scorePct}%</div>
          <div className={`mt-1.5 text-sm font-semibold ${res.passed ? "text-[#2F7A4F]" : "text-[#B07A1A]"}`}>
            {res.passed ? "Passed — course complete" : `Not quite — you need ${res.passThreshold}%`}
          </div>
          <div className="mt-1 text-[12px] text-[#6B7685]">{res.correct} of {res.total} correct</div>
        </div>
      </div>

      <h3 className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#BA7517]">Review</h3>
      <div className="space-y-3">
        {questions.map((q, qi) => {
          const rv = byId.get(q.id);
          if (!rv) return null;
          return (
            <article key={q.id} className="rounded-xl border border-[rgba(10,37,64,0.08)] bg-white p-4 shadow-[0_1px_3px_rgba(10,37,64,0.04)]">
              <div className="mb-2 flex items-start gap-2">
                {rv.isCorrect ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#2F7A4F]" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-[#9B2C2C]" />}
                <p className="text-[14px] font-medium text-[#0A2540]">Q{qi + 1}. {q.question}</p>
              </div>
              <div className="ml-6 space-y-1.5">
                {q.options.map((opt, oi) => {
                  const isCorrect = rv.correctIndex >= 0 && rv.correctIndex < q.options.length && oi === rv.correctIndex;
                  const isGiven = rv.given != null && oi === rv.given;
                  return (
                    <div key={oi} className={`rounded-md border px-3 py-1.5 text-[12px] ${isCorrect ? "border-[#2F7A4F]/40 bg-[#E6F0E9] text-[#2F7A4F]" : isGiven ? "border-[#9B2C2C]/40 bg-[#F6E3E3] text-[#9B2C2C]" : "border-transparent text-[#6B7685]"}`}>
                      <span className="mr-1 font-semibold">{String.fromCharCode(65 + oi)}.</span>{opt}
                      {isCorrect && <span className="ml-1 text-[10px] font-semibold uppercase">✓ correct</span>}
                      {isGiven && !isCorrect && <span className="ml-1 text-[10px] font-semibold uppercase">your answer</span>}
                    </div>
                  );
                })}
              </div>
              {rv.explanation && <p className="ml-6 mt-2 text-[12px] italic text-[#6B7685]">{rv.explanation}</p>}
            </article>
          );
        })}
      </div>

      {error && <div className="mt-3 rounded-lg border-l-4 border-[#9B2C2C] bg-[#F6E3E3] px-3 py-2 text-xs text-[#9B2C2C]">{error}</div>}

      <div className="mt-5 flex items-center justify-between">
        <button onClick={() => { setPhase("lessons"); setLessonIdx(0); window.scrollTo({ top: 0 }); }} className="flex items-center gap-1 rounded-lg px-3 py-2.5 text-[13px] text-[#6B7685] transition-colors hover:bg-[#F5EEE0]">
          <ChevronLeft size={16} /> Review lessons
        </button>
        {res.passed ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={downloadCert}
              className="flex items-center gap-1.5 rounded-lg border border-[#C5A572] px-4 py-2.5 text-[13px] font-semibold text-[#BA7517] transition-colors hover:bg-[#FAEEDA]">
              <Download size={14} /> Certificate
            </button>
            <button onClick={() => router.push("/driver/dashboard")} className={PRIMARY}>Back to courses</button>
          </div>
        ) : (
          <button onClick={retake} className={PRIMARY}><RotateCcw size={14} /> Retake quiz</button>
        )}
      </div>
    </div>
  );
}

export default function DriverCoursePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><Loader2 size={28} className="animate-spin text-[#BA7517]" /></div>}>
      <CourseContent />
    </Suspense>
  );
}
