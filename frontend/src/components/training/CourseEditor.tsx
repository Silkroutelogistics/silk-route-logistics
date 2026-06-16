"use client";

// v3.8.ane — SRL Driver Academy T7: full course editor (meta + lessons + quiz).
// Loaded as a state-toggle on /dashboard/training-courses (no dynamic [id] route
// — Next.js static export can't enumerate runtime cuids). Saves the whole course
// in one transactional PUT (the backend delete-and-recreates lessons + questions).
//
// Guard rules from the T7 audit: slug is immutable after create; publish needs
// ≥1 lesson + ≥1 question; archiving warns (it hides the course + breaks cert
// downloads until restored); delete only succeeds for a course no driver has
// touched (else the API 409s → archive instead).

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowLeft, Loader2, Save, Send, Archive, RotateCcw, Trash2, AlertTriangle } from "lucide-react";
import { LessonsSection, type LessonForm } from "./LessonsSection";
import { QuestionsSection, type QuestionForm } from "./QuestionsSection";

type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";

interface FetchedCourse {
  id: string; slug: string; title: string; category: string; summary: string | null;
  version: string; estMinutes: number; passThreshold: number; validityMonths: number | null;
  status: Status; sortOrder: number; disclaimer: string | null;
  lessons: { order: number; title: string; bodyMarkdown: string; estMinutes: number }[];
  questions: { order: number; question: string; options: string[]; correctIndex: number; explanation: string | null }[];
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "bg-[#FBEFD4] text-[#B07A1A]" },
  PUBLISHED: { label: "Published", cls: "bg-[#E6F0E9] text-[#2F7A4F]" },
  ARCHIVED: { label: "Archived", cls: "bg-white/10 text-gray-400" },
};

export function CourseEditor({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["training-admin-course", courseId],
    queryFn: () => api.get<FetchedCourse>(`/training-admin/courses/${courseId}`).then((r) => r.data),
  });

  // Local form state, hydrated ONCE per course (Sub-pattern 10 — never clobber
  // the AE's in-progress edits on a background refetch).
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState<Status>("DRAFT");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [summary, setSummary] = useState("");
  const [version, setVersion] = useState("1");
  const [passThreshold, setPassThreshold] = useState(80);
  const [validityMonths, setValidityMonths] = useState<string>(""); // "" = no expiry
  const [sortOrder, setSortOrder] = useState(0);
  const [disclaimer, setDisclaimer] = useState("");
  const [lessons, setLessons] = useState<LessonForm[]>([]);
  const [questions, setQuestions] = useState<QuestionForm[]>([]);
  const [banner, setBanner] = useState<{ kind: "error" | "ok"; msg: string } | null>(null);

  useEffect(() => {
    if (data && hydratedFor !== courseId) {
      setSlug(data.slug); setStatus(data.status); setTitle(data.title); setCategory(data.category);
      setSummary(data.summary ?? ""); setVersion(data.version); setPassThreshold(data.passThreshold);
      setValidityMonths(data.validityMonths == null ? "" : String(data.validityMonths));
      setSortOrder(data.sortOrder); setDisclaimer(data.disclaimer ?? "");
      setLessons(data.lessons.map((l) => ({ order: l.order, title: l.title, bodyMarkdown: l.bodyMarkdown, estMinutes: l.estMinutes })));
      setQuestions(data.questions.map((q) => ({ order: q.order, question: q.question, options: [...q.options], correctIndex: q.correctIndex, explanation: q.explanation ?? "" })));
      setHydratedFor(courseId);
    }
  }, [data, courseId, hydratedFor]);

  function validate(): string | null {
    if (!title.trim()) return "Course title is required.";
    if (!category.trim()) return "Category is required.";
    for (const l of lessons) {
      if (!l.title.trim()) return `Lesson ${l.order} needs a title.`;
      if (!l.bodyMarkdown.trim()) return `Lesson ${l.order} needs a body.`;
    }
    for (const q of questions) {
      if (!q.question.trim()) return `Question ${q.order} needs question text.`;
      if (q.options.length !== 4 || q.options.some((o) => !o.trim())) return `Question ${q.order} needs all four answer options filled in.`;
      if (q.correctIndex < 0 || q.correctIndex > 3) return `Question ${q.order} needs a correct answer selected.`;
    }
    return null;
  }

  function buildPayload() {
    return {
      title: title.trim(), category: category.trim(),
      summary: summary.trim() || null,
      version: version.trim() || "1",
      estMinutes: lessons.reduce((s, l) => s + (l.estMinutes || 0), 0), // derived from lessons
      passThreshold, sortOrder,
      validityMonths: validityMonths.trim() === "" ? null : Math.max(1, parseInt(validityMonths) || 0),
      disclaimer: disclaimer.trim() || null,
      lessons: lessons.map((l) => ({ order: l.order, title: l.title.trim(), bodyMarkdown: l.bodyMarkdown.trim(), estMinutes: l.estMinutes })),
      questions: questions.map((q) => ({ order: q.order, question: q.question.trim(), options: q.options.map((o) => o.trim()), correctIndex: q.correctIndex, explanation: q.explanation.trim() || null })),
    };
  }

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/training-admin/courses/${courseId}`, buildPayload()).then((r) => r.data),
    onSuccess: () => {
      setBanner({ kind: "ok", msg: "Saved." });
      queryClient.invalidateQueries({ queryKey: ["training-admin-courses"] });
      setTimeout(() => setBanner(null), 4000);
    },
    onError: (e) => setBanner({ kind: "error", msg: extractErr(e, "Couldn't save the course.") }),
  });

  const statusMutation = useMutation({
    mutationFn: (next: Status) => api.patch(`/training-admin/courses/${courseId}/status`, { status: next }).then((r) => r.data),
    onSuccess: (_d, next) => {
      setStatus(next);
      setBanner({ kind: "ok", msg: next === "PUBLISHED" ? "Course published — drivers can now take it." : next === "ARCHIVED" ? "Course archived." : "Moved to draft." });
      queryClient.invalidateQueries({ queryKey: ["training-admin-courses"] });
      setTimeout(() => setBanner(null), 4000);
    },
    onError: (e) => setBanner({ kind: "error", msg: extractErr(e, "Couldn't change the course status.") }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/training-admin/courses/${courseId}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["training-admin-courses"] });
      onClose();
    },
    onError: (e) => setBanner({ kind: "error", msg: extractErr(e, "Couldn't delete the course.") }),
  });

  function onSave() {
    const err = validate();
    if (err) { setBanner({ kind: "error", msg: err }); return; }
    setBanner(null);
    saveMutation.mutate();
  }

  function onPublish() {
    const err = validate();
    if (err) { setBanner({ kind: "error", msg: err }); return; }
    if (lessons.length < 1 || questions.length < 1) { setBanner({ kind: "error", msg: "Add at least one lesson and one quiz question before publishing." }); return; }
    // Save first so published content matches what's on screen, then publish.
    saveMutation.mutate(undefined, { onSuccess: () => statusMutation.mutate("PUBLISHED") });
  }

  function onArchive() {
    if (!window.confirm("Archive this course? It will be hidden from drivers, the training matrix, and reminder emails. Drivers who completed it won't be able to download their certificate until it's restored.")) return;
    statusMutation.mutate("ARCHIVED");
  }

  function onDelete() {
    if (!window.confirm("Permanently delete this course? This can't be undone. (Only works if no driver has any progress on it — otherwise archive it.)")) return;
    deleteMutation.mutate();
  }

  const busy = saveMutation.isPending || statusMutation.isPending || deleteMutation.isPending;

  if (isLoading) {
    return <div className="p-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading course…</div>;
  }
  if (isError || !data) {
    return (
      <div className="p-10 text-center">
        <p className="text-sm text-red-400 mb-3">Couldn&apos;t load this course.</p>
        <button onClick={onClose} className="text-xs text-[#C5A572] hover:underline">← Back to courses</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-white">
          <ArrowLeft size={16} /> Courses
        </button>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wide ${STATUS_META[status].cls}`}>{STATUS_META[status].label}</span>
      </div>

      {banner && (
        <div className={`mb-4 px-3 py-2 rounded text-sm border-l-4 ${banner.kind === "error" ? "bg-[#F6E3E3] border-[#9B2C2C] text-[#9B2C2C]" : "bg-[#E6F0E9] border-[#2F7A4F] text-[#2F7A4F]"}`}>
          {banner.msg}
        </div>
      )}

      {/* Meta */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[#C5A572] mb-3">Course details</h3>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Title">
            <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="e.g. Hours of Service & ELD" />
          </Field>
          <Field label="Category">
            <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} placeholder="e.g. Hours of Service" />
          </Field>
          <Field label="Summary" full>
            <input value={summary} onChange={(e) => setSummary(e.target.value)} className={inputCls} placeholder="One line shown on the course card" />
          </Field>
          <Field label="Pass threshold (%)">
            <input type="number" min={1} max={100} value={passThreshold} onChange={(e) => setPassThreshold(Math.min(100, Math.max(1, parseInt(e.target.value) || 1)))} className={inputCls} />
          </Field>
          <Field label="Validity (months — blank = never expires)">
            <input type="number" min={1} max={120} value={validityMonths} onChange={(e) => setValidityMonths(e.target.value)} className={inputCls} placeholder="e.g. 12" />
          </Field>
          <Field label="Version">
            <input value={version} onChange={(e) => setVersion(e.target.value)} className={inputCls} placeholder="1" />
          </Field>
          <Field label="Sort order">
            <input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(Math.max(0, parseInt(e.target.value) || 0))} className={inputCls} />
          </Field>
          <Field label="Disclaimer" full>
            <textarea value={disclaimer} onChange={(e) => setDisclaimer(e.target.value)} rows={2} className={inputCls} placeholder="Educational-completion notice shown in the player + on the certificate" />
          </Field>
        </div>
        <p className="text-[11px] text-gray-500 mt-2">Slug <span className="font-mono text-gray-400">{slug}</span> is fixed (it&apos;s in certificate links). Total time is computed from lesson minutes.</p>
      </div>

      {/* Lessons */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 mb-4">
        <LessonsSection lessons={lessons} onChange={setLessons} />
      </div>

      {/* Questions */}
      <div className="bg-white/[0.02] border border-white/10 rounded-xl p-4 mb-4">
        <QuestionsSection questions={questions} onChange={setQuestions} />
      </div>

      {status === "PUBLISHED" && (
        <div className="mb-4 px-3 py-2 bg-[#FBEFD4]/10 border border-[#B07A1A]/30 rounded text-[12px] text-[#DAC39C] flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5 text-[#B07A1A]" />
          This course is live. Editing a quiz answer changes grading for future submissions only — drivers who already passed keep their result.
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 pb-8">
        <button onClick={onSave} disabled={busy}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#C5A572] text-[#0A2540] text-sm font-semibold rounded-lg hover:bg-[#DAC39C] disabled:opacity-50">
          {saveMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Save
        </button>

        {status === "DRAFT" && (
          <button onClick={onPublish} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2F7A4F] text-white text-sm font-semibold rounded-lg hover:bg-[#2F7A4F]/85 disabled:opacity-50">
            <Send size={15} /> Save & Publish
          </button>
        )}
        {status === "PUBLISHED" && (
          <>
            <button onClick={() => statusMutation.mutate("DRAFT")} disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 text-white text-sm font-medium rounded-lg hover:bg-white/10 disabled:opacity-50">
              <RotateCcw size={15} /> Unpublish
            </button>
            <button onClick={onArchive} disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 text-gray-300 text-sm font-medium rounded-lg hover:bg-white/10 disabled:opacity-50">
              <Archive size={15} /> Archive
            </button>
          </>
        )}
        {status === "ARCHIVED" && (
          <button onClick={() => statusMutation.mutate("DRAFT")} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white/5 border border-white/10 text-white text-sm font-medium rounded-lg hover:bg-white/10 disabled:opacity-50">
            <RotateCcw size={15} /> Restore to draft
          </button>
        )}

        {status !== "PUBLISHED" && (
          <button onClick={onDelete} disabled={busy}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[#F87171] text-sm font-medium rounded-lg hover:bg-white/5 disabled:opacity-50 ml-auto">
            <Trash2 size={15} /> Delete
          </button>
        )}
      </div>
    </div>
  );
}

const inputCls = "w-full bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-sm text-white placeholder:text-gray-500 focus:border-[#C5A572]/60 focus:outline-none";

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-[11px] text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function extractErr(e: unknown, fallback: string): string {
  const anyErr = e as { response?: { data?: { error?: string; details?: { field: string; message: string }[] } }; message?: string };
  const d = anyErr?.response?.data;
  if (d?.details?.length) return `${d.details[0].field}: ${d.details[0].message}`;
  return d?.error || anyErr?.message || fallback;
}
