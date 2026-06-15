"use client";

// v3.8.anb — SRL Driver Academy Sprint T4: real course list (replaces the T2
// placeholder). Fetches the catalog + this driver's progress and links each
// course into the player at /driver/dashboard/course?slug=...

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2, BookOpen, CheckCircle2, Clock, Download } from "lucide-react";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
import { CarrierCard } from "@/components/carrier";
import { useDriverAuth } from "@/hooks/useDriverAuth";

interface CourseProgress {
  status: "NOT_STARTED" | "IN_PROGRESS" | "PASSED" | "FAILED";
  lessonsCompleted: number;
  bestScorePct: number | null;
  completedAt: string | null;
  expiresAt: string | null;
}
interface CourseCard {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary: string | null;
  estMinutes: number;
  passThreshold: number;
  lessonCount: number;
  questionCount: number;
  progress: CourseProgress | null;
}

function fmtDate(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusPill({ p }: { p: CourseProgress | null }) {
  const status = p?.status || "NOT_STARTED";
  const cls =
    status === "PASSED"
      ? "bg-green-50 text-green-700 border border-green-200"
      : status === "IN_PROGRESS"
        ? "bg-amber-50 text-amber-700 border border-amber-200"
        : status === "FAILED"
          ? "bg-red-50 text-red-600 border border-red-200"
          : "bg-gray-100 text-gray-500";
  const label =
    status === "PASSED" ? `Passed${p?.bestScorePct != null ? ` · ${p.bestScorePct}%` : ""}`
      : status === "IN_PROGRESS" ? "In progress"
        : status === "FAILED" ? "Try again"
          : "Not started";
  return <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{label}</span>;
}

export default function DriverCoursesPage() {
  const router = useRouter();
  const { driver } = useDriverAuth();
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [certError, setCertError] = useState<string | null>(null);

  const downloadCert = async (slug: string) => {
    setCertError(null);
    try {
      await downloadFromApi(`/driver-training/courses/${slug}/certificate`, `SRL-Certificate-${slug}.pdf`);
    } catch {
      setCertError("Couldn't download that certificate. Try again in a moment.");
    }
  };

  useEffect(() => {
    let active = true;
    api
      .get("/driver-training/courses")
      .then((r) => { if (active) { setCourses(r.data.courses || []); setLoading(false); } })
      .catch(() => { if (active) { setError("Could not load your courses. Pull to refresh or try again."); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const passedCount = courses.filter((c) => c.progress?.status === "PASSED").length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0F1117] mb-1">
          Welcome{driver ? `, ${driver.firstName}` : ""}
        </h1>
        <p className="text-[13px] text-gray-500">
          Work through each course at your own pace. Pass the quiz to complete it.
          {courses.length > 0 && <> You&apos;ve completed <span className="font-semibold text-[#0F1117]">{passedCount} of {courses.length}</span>.</>}
        </p>
      </div>

      {certError && (
        <div className="mb-4 px-3 py-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">{certError}</div>
      )}

      {loading ? (
        <CarrierCard padding="p-8">
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading your courses...
          </div>
        </CarrierCard>
      ) : error ? (
        <CarrierCard padding="p-8">
          <p className="text-center text-sm text-red-600">{error}</p>
        </CarrierCard>
      ) : courses.length === 0 ? (
        <CarrierCard padding="p-10">
          <div className="text-center">
            <GraduationCap size={32} className="mx-auto text-[#C9A84C] mb-3" />
            <h3 className="text-sm font-bold text-[#0F1117] mb-1">No courses available yet</h3>
            <p className="text-xs text-gray-500">Your training courses will appear here once your carrier&apos;s program is live.</p>
          </div>
        </CarrierCard>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {courses.map((c) => {
            const passed = c.progress?.status === "PASSED";
            const inProgress = c.progress?.status === "IN_PROGRESS" || c.progress?.status === "FAILED";
            const cta = passed ? "Review" : inProgress ? "Continue" : "Start";
            return (
              <CarrierCard key={c.id} padding="p-5" hover onClick={() => router.push(`/driver/dashboard/course?slug=${c.slug}`)}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BA7517]">{c.category}</span>
                  <StatusPill p={c.progress} />
                </div>
                <h3 className="font-semibold text-[15px] text-[#0F1117] mb-1 flex items-center gap-1.5">
                  {passed ? <CheckCircle2 size={15} className="text-green-600 shrink-0" /> : <BookOpen size={15} className="text-[#C9A84C] shrink-0" />}
                  {c.title}
                </h3>
                {c.summary && <p className="text-[12px] text-gray-500 leading-relaxed mb-3">{c.summary}</p>}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] text-gray-400">
                    <Clock size={11} /> {c.lessonCount} lessons · {c.questionCount} questions · ~{c.estMinutes} min
                  </span>
                  <span className="text-[12px] font-semibold text-[#BA7517]">{cta} →</span>
                </div>
                {passed && (
                  <div className="mt-2 flex items-center justify-between">
                    {c.progress?.expiresAt
                      ? <span className="text-[10px] text-gray-400">Valid until {fmtDate(c.progress.expiresAt)}</span>
                      : <span />}
                    <button type="button"
                      onClick={(e) => { e.stopPropagation(); downloadCert(c.slug); }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[#BA7517] hover:underline">
                      <Download size={11} /> Certificate
                    </button>
                  </div>
                )}
              </CarrierCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
