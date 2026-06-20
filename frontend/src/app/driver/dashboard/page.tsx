"use client";

// v3.8.anp — SRL Driver Academy course list (canonical brand + designed cards).
// Per-course icon chip, in-progress bar, completion summary. Fetches the
// catalog + this driver's progress; links each course into the slide player.
// CDL gate (v3.8.ang) + cert download preserved. Canonical §2.1 tokens.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, Loader2, CheckCircle2, Clock, Download, ShieldAlert, ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
import { courseIcon } from "@/components/driver/courseIcon";
import { useDriverAuth } from "@/hooks/useDriverAuth";

interface CourseProgress {
  status: "NOT_STARTED" | "IN_PROGRESS" | "PASSED" | "FAILED";
  lessonsCompleted: number;
  bestScorePct: number | null;
  completedAt: string | null;
  expiresAt: string | null;
}
interface CourseCard {
  id: string; slug: string; title: string; category: string; summary: string | null;
  estMinutes: number; passThreshold: number; lessonCount: number; questionCount: number;
  progress: CourseProgress | null;
}
interface Eligibility { eligible: boolean; reason: "CDL_MISSING" | "CDL_EXPIRED" | null; licenseExpiry: string | null }

function fmtDate(s: string | null): string {
  if (!s) return "";
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusPill({ p }: { p: CourseProgress | null }) {
  const status = p?.status || "NOT_STARTED";
  const cls =
    status === "PASSED" ? "bg-[#E6F0E9] text-[#2F7A4F] border border-[#2F7A4F]/25"
      : status === "IN_PROGRESS" ? "bg-[#FBEFD4] text-[#B07A1A] border border-[#B07A1A]/25"
        : status === "FAILED" ? "bg-[#F6E3E3] text-[#9B2C2C] border border-[#9B2C2C]/25"
          : "bg-[#F5EEE0] text-[#6B7685]";
  const label =
    status === "PASSED" ? `Passed${p?.bestScorePct != null ? ` · ${p.bestScorePct}%` : ""}`
      : status === "IN_PROGRESS" ? "In progress"
        : status === "FAILED" ? "Try again" : "Not started";
  return <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cls}`}>{label}</span>;
}

export default function DriverCoursesPage() {
  const router = useRouter();
  const { driver } = useDriverAuth();
  const [courses, setCourses] = useState<CourseCard[]>([]);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [certError, setCertError] = useState<string | null>(null);

  const downloadCert = async (slug: string) => {
    setCertError(null);
    try { await downloadFromApi(`/driver-training/courses/${slug}/certificate`, `SRL-Certificate-${slug}.pdf`); }
    catch { setCertError("Couldn't download that certificate. Try again in a moment."); }
  };

  useEffect(() => {
    let active = true;
    api.get("/driver-training/courses")
      .then((r) => { if (active) { setCourses(r.data.courses || []); setEligibility(r.data.eligibility ?? null); setLoading(false); } })
      .catch(() => { if (active) { setError("Could not load your courses. Pull to refresh or try again."); setLoading(false); } });
    return () => { active = false; };
  }, []);

  const passedCount = courses.filter((c) => c.progress?.status === "PASSED").length;
  const overallPct = courses.length ? Math.round((passedCount / courses.length) * 100) : 0;
  const cdlBlocked = !!eligibility && !eligibility.eligible;

  const card = "rounded-2xl border border-[rgba(10,37,64,0.08)] bg-white p-8 shadow-[0_1px_3px_rgba(10,37,64,0.04)]";

  return (
    <div>
      <div className="mb-5">
        <h1 className="mb-1 font-serif text-[26px] leading-tight text-[#0A2540]">Welcome{driver ? `, ${driver.firstName}` : ""}</h1>
        <p className="text-[13px] text-[#6B7685]">Work through each course at your own pace. Pass the quiz to earn your certificate.</p>
      </div>

      {!loading && !error && !cdlBlocked && courses.length > 0 && (
        <div className="mb-5 rounded-2xl border border-[rgba(10,37,64,0.08)] bg-white p-4 shadow-[0_1px_3px_rgba(10,37,64,0.04)]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#0A2540]">Your progress</span>
            <span className="text-[12px] text-[#6B7685]"><span className="font-semibold text-[#0A2540]">{passedCount}</span> of {courses.length} complete</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#EFE6D3]">
            <div className="h-full rounded-full bg-gradient-to-r from-[#C5A572] to-[#BA7517] transition-all duration-500" style={{ width: `${overallPct}%` }} />
          </div>
        </div>
      )}

      {certError && <div className="mb-4 rounded-lg border-l-4 border-[#9B2C2C] bg-[#F6E3E3] px-3 py-2 text-xs text-[#9B2C2C]">{certError}</div>}

      {loading ? (
        <div className={card}><div className="flex items-center justify-center gap-2 text-sm text-[#6B7685]"><Loader2 size={16} className="animate-spin" /> Loading your courses…</div></div>
      ) : error ? (
        <div className={card}><p className="text-center text-sm text-[#9B2C2C]">{error}</p></div>
      ) : cdlBlocked ? (
        <div className={card}>
          <div className="mx-auto max-w-md text-center">
            <ShieldAlert size={32} className="mx-auto mb-3 text-[#BA7517]" />
            <h3 className="mb-2 text-sm font-bold text-[#0A2540]">
              {eligibility?.reason === "CDL_EXPIRED" ? "Your CDL on file has expired" : "A valid CDL is needed to start training"}
            </h3>
            <p className="mb-3 text-xs leading-relaxed text-[#6B7685]">
              {eligibility?.reason === "CDL_EXPIRED"
                ? <>The CDL on your driver profile expired{eligibility?.licenseExpiry ? <> on {fmtDate(eligibility.licenseExpiry)}</> : ""}. Ask your carrier to update it in your Drivers roster, then refresh this page.</>
                : <>The SRL Driver Academy is for licensed CDL drivers. Ask your carrier to add your CDL to your driver record in their Drivers roster, then refresh this page.</>}
            </p>
            <p className="text-[11px] text-[#A7AEB8]">Once your carrier updates your record, your courses appear here automatically.</p>
          </div>
        </div>
      ) : courses.length === 0 ? (
        <div className={card}>
          <div className="text-center">
            <GraduationCap size={32} className="mx-auto mb-3 text-[#C5A572]" />
            <h3 className="mb-1 text-sm font-bold text-[#0A2540]">No courses available yet</h3>
            <p className="text-xs text-[#6B7685]">Your training courses appear here once your carrier&apos;s program is live.</p>
          </div>
        </div>
      ) : (
        // v3.8.ans — group the catalog by category (foundational/compliance first,
        // SRL-specific last). Frontend-only; the API already returns category +
        // sortOrder. Unknown/new categories append last (defensive).
        <div className="space-y-7">
          {(() => {
            const order = ["Hours & Electronic Logs", "Driver Qualification & Health", "Vehicle & Cargo Safety", "On-Road Safety", "Hazardous Materials", "SRL Operational Excellence"];
            const groups = new Map<string, CourseCard[]>();
            for (const c of courses) {
              const k = c.category || "Other";
              if (!groups.has(k)) groups.set(k, []);
              groups.get(k)!.push(c);
            }
            const cats = [...order.filter((k) => groups.has(k)), ...[...groups.keys()].filter((k) => !order.includes(k))];
            return cats.map((cat) => (
              <section key={cat}>
                <div className="mb-2.5 flex items-baseline gap-2">
                  <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#BA7517]">{cat}</h2>
                  <span className="text-[11px] text-[#A7AEB8]">{groups.get(cat)!.length}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {groups.get(cat)!.map((c) => {
                    const Icon = courseIcon(c.slug, c.category);
                    const status = c.progress?.status;
                    const passed = status === "PASSED";
                    const inProgress = status === "IN_PROGRESS" || status === "FAILED";
                    const cta = passed ? "Review" : inProgress ? "Continue" : "Start";
                    const donePct = c.lessonCount > 0 ? Math.min(100, Math.round(((c.progress?.lessonsCompleted ?? 0) / c.lessonCount) * 100)) : 0;
                    return (
                      <div key={c.id} role="button" tabIndex={0}
                        onClick={() => router.push(`/driver/dashboard/course?slug=${c.slug}`)}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") router.push(`/driver/dashboard/course?slug=${c.slug}`); }}
                        className="group flex cursor-pointer flex-col rounded-2xl border border-[rgba(10,37,64,0.08)] bg-white p-5 shadow-[0_1px_3px_rgba(10,37,64,0.04)] transition-all hover:border-[#C5A572] hover:shadow-[0_8px_28px_rgba(10,37,64,0.08)]">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${passed ? "bg-[#E6F0E9] text-[#2F7A4F]" : "bg-[#0A2540] text-[#C5A572]"}`}>
                            {passed ? <CheckCircle2 size={20} /> : <Icon size={19} />}
                          </span>
                          <StatusPill p={c.progress ?? null} />
                        </div>
                        <h3 className="mb-1 font-serif text-[16px] leading-tight text-[#0A2540]">{c.title}</h3>
                        {c.summary && <p className="mb-3 line-clamp-2 text-[12px] leading-relaxed text-[#6B7685]">{c.summary}</p>}

                        {inProgress && (
                          <div className="mb-3">
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#EFE6D3]">
                              <div className="h-full rounded-full bg-gradient-to-r from-[#C5A572] to-[#BA7517]" style={{ width: `${donePct}%` }} />
                            </div>
                          </div>
                        )}

                        <div className="mt-auto flex items-center justify-between pt-1">
                          <span className="flex items-center gap-1 text-[11px] text-[#6B7685]">
                            <Clock size={11} /> {c.lessonCount} lessons · ~{c.estMinutes} min
                          </span>
                          <span className="flex items-center gap-0.5 text-[12px] font-semibold text-[#BA7517]">{cta} <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
                        </div>

                        {passed && (
                          <div className="mt-3 flex items-center justify-between border-t border-[rgba(10,37,64,0.06)] pt-3">
                            {c.progress?.expiresAt ? <span className="text-[10px] text-[#A7AEB8]">Valid until {fmtDate(c.progress.expiresAt)}</span> : <span />}
                            <button type="button" onClick={(e) => { e.stopPropagation(); downloadCert(c.slug); }}
                              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#BA7517] hover:underline">
                              <Download size={11} /> Certificate
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
