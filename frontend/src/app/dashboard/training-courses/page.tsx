"use client";

// v3.8.ane — SRL Driver Academy T7: AE course-authoring console.
// Lists every course (all statuses) and opens the full CourseEditor inline (no
// dynamic [id] route — Next.js static export can't enumerate runtime cuids, the
// §13.3 Item 31 class). "New course" creates an empty DRAFT then drops into the
// editor. Replaces the seed-script-only content model.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GraduationCap, Loader2, Plus, Pencil, BookOpen, HelpCircle, Users } from "lucide-react";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { CourseEditor } from "@/components/training/CourseEditor";

type Status = "DRAFT" | "PUBLISHED" | "ARCHIVED";

interface CourseRow {
  id: string; slug: string; title: string; category: string; status: Status;
  version: string; passThreshold: number; validityMonths: number | null; estMinutes: number;
  lessonCount: number; questionCount: number; driverCount: number; passedCount: number;
}

const STATUS_PILL: Record<Status, string> = {
  DRAFT: "bg-[#FBEFD4] text-[#B07A1A]",
  PUBLISHED: "bg-[#E6F0E9] text-[#2F7A4F]",
  ARCHIVED: "bg-white/10 text-gray-400",
};

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export default function TrainingCoursesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [newCategory, setNewCategory] = useState("");
  const [newErr, setNewErr] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["training-admin-courses"],
    queryFn: () => api.get<{ courses: CourseRow[] }>("/training-admin/courses").then((r) => r.data),
    enabled: !editingId,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post<{ id: string }>("/training-admin/courses", {
      slug: newSlug.trim(), title: newTitle.trim(), category: newCategory.trim(),
    }).then((r) => r.data),
    onSuccess: (course) => {
      queryClient.invalidateQueries({ queryKey: ["training-admin-courses"] });
      setShowNew(false);
      setNewTitle(""); setNewSlug(""); setNewCategory(""); setSlugTouched(false); setNewErr(null);
      setEditingId(course.id);
    },
    onError: (e) => {
      const anyErr = e as { response?: { data?: { error?: string; details?: { field: string; message: string }[] } } };
      const d = anyErr?.response?.data;
      setNewErr(d?.details?.length ? `${d.details[0].field}: ${d.details[0].message}` : d?.error || "Couldn't create the course.");
    },
  });

  function onTitleChange(v: string) {
    setNewTitle(v);
    if (!slugTouched) setNewSlug(slugify(v));
  }

  if (editingId) {
    return (
      <div className="p-6">
        <CourseEditor courseId={editingId} onClose={() => setEditingId(null)} />
      </div>
    );
  }

  const courses = data?.courses || [];
  const published = courses.filter((c) => c.status === "PUBLISHED").length;
  const totalPassed = courses.reduce((s, c) => s + c.passedCount, 0);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <GraduationCap className="text-[#C5A572]" size={22} /> SRL Driver Academy
          </h1>
          <p className="text-sm text-gray-400 mt-1">Author the training curriculum carriers&apos; drivers take in the portal.</p>
        </div>
        <button onClick={() => setShowNew(true)}
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#C5A572] text-[#0A2540] text-sm font-semibold rounded-lg hover:bg-[#DAC39C]">
          <Plus size={16} /> New course
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <Stat label="Courses" value={String(courses.length)} sub={`${published} published`} />
        <Stat label="Published" value={String(published)} sub="visible to drivers" />
        <Stat label="Completions" value={String(totalPassed)} sub="drivers passed" />
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading courses…</div>
      ) : isError ? (
        <div className="p-10 text-center text-red-400 text-sm">Couldn&apos;t load courses. Try again.</div>
      ) : courses.length === 0 ? (
        <div className="p-12 text-center bg-white/[0.02] border border-white/10 rounded-xl">
          <GraduationCap size={32} className="text-gray-600 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-white mb-1">No courses yet</h3>
          <p className="text-xs text-gray-500 mb-4">Create your first Driver Academy course to get started.</p>
          <button onClick={() => setShowNew(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#C5A572] hover:text-[#DAC39C]">
            <Plus size={15} /> New course
          </button>
        </div>
      ) : (
        <div className="bg-white/[0.02] border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/5 text-[11px] uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3 font-medium">Course</th>
                <th className="px-3 py-3 font-medium">Status</th>
                <th className="px-3 py-3 font-medium text-center"><BookOpen size={13} className="inline" /></th>
                <th className="px-3 py-3 font-medium text-center"><HelpCircle size={13} className="inline" /></th>
                <th className="px-3 py-3 font-medium text-center"><Users size={13} className="inline" /></th>
                <th className="px-3 py-3 font-medium text-right"></th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02] cursor-pointer" onClick={() => setEditingId(c.id)}>
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-semibold text-white">{c.title}</div>
                    <div className="text-[11px] text-gray-500">{c.category}{c.validityMonths ? ` · renews every ${c.validityMonths}mo` : ""}</div>
                  </td>
                  <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${STATUS_PILL[c.status]}`}>{c.status.toLowerCase()}</span></td>
                  <td className="px-3 py-3 text-center text-[13px] text-gray-300">{c.lessonCount}</td>
                  <td className="px-3 py-3 text-center text-[13px] text-gray-300">{c.questionCount}</td>
                  <td className="px-3 py-3 text-center text-[13px] text-gray-300">{c.passedCount}</td>
                  <td className="px-3 py-3 text-right">
                    <button onClick={(e) => { e.stopPropagation(); setEditingId(c.id); }}
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[#C5A572] hover:text-[#DAC39C]">
                      <Pencil size={13} /> Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New course drawer */}
      <SlideDrawer open={showNew} onClose={() => setShowNew(false)} title="New course" width="max-w-md">
        <div className="space-y-4">
          {newErr && <div className="px-3 py-2 bg-[#F6E3E3] border-l-4 border-[#9B2C2C] text-[#9B2C2C] text-sm rounded">{newErr}</div>}
          <div>
            <label className="block text-xs text-gray-600 mb-1">Title</label>
            <input value={newTitle} onChange={(e) => onTitleChange(e.target.value)} placeholder="e.g. Hours of Service & ELD"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0A2540] focus:border-[#BA7517] focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Category</label>
            <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="e.g. Hours of Service"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0A2540] focus:border-[#BA7517] focus:outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-1">Slug <span className="text-gray-400">(permanent — used in certificate links)</span></label>
            <input value={newSlug} onChange={(e) => { setSlugTouched(true); setNewSlug(slugify(e.target.value)); }} placeholder="hours-of-service-eld"
              className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0A2540] font-mono focus:border-[#BA7517] focus:outline-none" />
          </div>
          <p className="text-xs text-gray-500">The course is created as a draft. You&apos;ll add lessons and quiz questions next, then publish.</p>
          <button
            onClick={() => { setNewErr(null); createMutation.mutate(); }}
            disabled={createMutation.isPending || !newTitle.trim() || !newCategory.trim() || !newSlug.trim()}
            className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#BA7517] text-white text-sm font-semibold rounded-lg hover:bg-[#854F0B] disabled:opacity-50">
            {createMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create & edit
          </button>
        </div>
      </SlideDrawer>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#C5A572]">{label}</div>
      <div className="text-2xl font-semibold text-white mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}
