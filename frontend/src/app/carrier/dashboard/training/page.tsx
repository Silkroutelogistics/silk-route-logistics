"use client";

// v3.8.anc — SRL Driver Academy Sprint T5: carrier Training dashboard.
// Roster × course completion matrix + "% trained" + per-cell certificate
// downloads. Replaces the T1/T2 teaser strip's promise with the real screen
// answering "how many of my drivers have been trained?".
//
// v3.8.aoa — Sprint D: turns it into a program. Carrier sets a required-course
// set (with a due window), the matrix flags overdue drivers, and an audit-ready
// CSV transcript exports the whole roster's training record.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GraduationCap, Loader2, CheckCircle2, Download, Users, ClipboardList, FileDown, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
import { CarrierCard } from "@/components/carrier";

interface Course { id: string; slug: string; title: string; category: string; required?: boolean; dueDays?: number | null }
interface CellProgress { status: "NOT_STARTED" | "IN_PROGRESS" | "PASSED" | "FAILED"; bestScorePct: number | null; completedAt: string | null; expiresAt: string | null; isExpired?: boolean; daysUntilExpiry?: number | null }
interface DriverRow {
  id: string;
  firstName: string;
  lastName: string;
  activated: boolean;
  passedCount: number;
  progress: Record<string, CellProgress>;
  requiredDue?: Record<string, string>;
  requiredOverdueCourseIds?: string[];
}
interface Summary { driverCount: number; courseCount: number; passedCells: number; totalCells: number; pctTrained: number; expiredCells?: number; expiringCells?: number; requiredCourseCount?: number; overdueCells?: number }

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) {
  return (
    <CarrierCard padding="p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BA7517]">{label}</div>
      <div className={`font-serif text-3xl mt-1 ${tone === "danger" ? "text-[#9B2C2C]" : "text-[#0A2540]"}`}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </CarrierCard>
  );
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function CarrierTrainingPage() {
  const qc = useQueryClient();
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reqEdit, setReqEdit] = useState<Record<string, { required: boolean; dueDays: number }>>({});
  const [seeded, setSeeded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["carrier-training"],
    queryFn: () => api.get("/carrier-drivers/training-summary").then((r) => r.data),
  });

  const courses: Course[] = useMemo(() => data?.courses || [], [data]);
  const drivers: DriverRow[] = data?.drivers || [];
  const summary: Summary | undefined = data?.summary;

  // Seed the editable required-set from the summary's course flags once data
  // arrives; re-seed after a save (seeded reset in the mutation onSuccess).
  useEffect(() => {
    if (data && !seeded) {
      const m: Record<string, { required: boolean; dueDays: number }> = {};
      for (const c of courses) m[c.id] = { required: !!c.required, dueDays: c.dueDays ?? 30 };
      setReqEdit(m);
      setSeeded(true);
    }
  }, [data, seeded, courses]);

  const saveReq = useMutation({
    mutationFn: () => {
      const requirements = Object.entries(reqEdit)
        .filter(([, v]) => v.required)
        .map(([courseId, v]) => ({ courseId, dueDays: Math.min(365, Math.max(1, v.dueDays || 30)) }));
      return api.put("/carrier-drivers/requirements", { requirements }).then((r) => r.data);
    },
    onSuccess: () => {
      setSaveError(null);
      setEditing(false);
      setSeeded(false); // re-seed from refetched data
      qc.invalidateQueries({ queryKey: ["carrier-training"] });
    },
    onError: () => setSaveError("Couldn't save required courses. Try again."),
  });

  const downloadCert = async (driverId: string, slug: string) => {
    setCertError(null);
    try {
      await downloadFromApi(`/carrier-drivers/${driverId}/certificate/${slug}`, `SRL-Certificate-${slug}.pdf`);
    } catch {
      setCertError("Couldn't download that certificate. Try again in a moment.");
    }
  };

  const downloadTranscript = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      await downloadFromApi("/carrier-drivers/compliance-export", `SRL-training-transcript-${today}.csv`);
    } catch {
      setExportError("Couldn't export the transcript. Try again in a moment.");
    } finally {
      setExporting(false);
    }
  };

  const requiredCount = summary?.requiredCourseCount ?? 0;
  const overdueCells = summary?.overdueCells ?? 0;
  const requiredTitles = courses.filter((c) => c.required).map((c) => c.title);
  const editSelectedCount = Object.values(reqEdit).filter((v) => v.required).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl text-[#0A2540] mb-1">Driver Training</h1>
          <p className="text-[13px] text-gray-500">
            SRL Driver Academy completion across your roster. Set required courses, track who&apos;s due, and export an audit-ready transcript.
          </p>
        </div>
        {drivers.length > 0 && (
          <button type="button" onClick={downloadTranscript} disabled={exporting}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#C5A572]/40 bg-white px-3 py-2 text-[12px] font-semibold text-[#BA7517] hover:bg-[#FAEEDA] disabled:opacity-50">
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />} Download transcript (CSV)
          </button>
        )}
      </div>

      {certError && <div className="mb-4 px-3 py-2 bg-[#F6E3E3] border-l-4 border-[#9B2C2C] text-[#9B2C2C] text-xs rounded">{certError}</div>}
      {exportError && <div className="mb-4 px-3 py-2 bg-[#F6E3E3] border-l-4 border-[#9B2C2C] text-[#9B2C2C] text-xs rounded">{exportError}</div>}

      {isLoading ? (
        <CarrierCard padding="p-8">
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading training progress...
          </div>
        </CarrierCard>
      ) : error ? (
        <CarrierCard padding="p-8"><p className="text-center text-sm text-[#9B2C2C]">Could not load training progress. Try again.</p></CarrierCard>
      ) : (
        <>
          {/* Summary */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
              <StatCard label="Trained" value={`${summary.pctTrained}%`} sub={`${summary.passedCells} of ${summary.totalCells} completions`} />
              <StatCard label="Drivers" value={String(summary.driverCount)} sub="active on roster" />
              <StatCard label="Required" value={String(requiredCount)} sub={requiredCount ? "courses set" : "none set yet"} />
              <StatCard label="Overdue" value={String(overdueCells)} sub="required & past due" tone={overdueCells ? "danger" : undefined} />
            </div>
          )}

          {/* Required-courses manager */}
          <CarrierCard padding="p-4 mb-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <ClipboardList size={18} className="text-[#BA7517] shrink-0 mt-0.5" />
                <div>
                  <div className="text-[13px] font-semibold text-[#0A2540]">Required training</div>
                  {requiredCount === 0 ? (
                    <p className="text-[12px] text-gray-500 mt-0.5">No required courses set. Pick the courses every driver on your roster must complete, with a due window.</p>
                  ) : (
                    <p className="text-[12px] text-gray-500 mt-0.5">{requiredCount} course{requiredCount === 1 ? "" : "s"} required of every driver: <span className="text-[#3A4A5F]">{requiredTitles.join(", ")}</span></p>
                  )}
                </div>
              </div>
              {!editing && (
                <button type="button" onClick={() => setEditing(true)}
                  className="rounded-lg bg-[#BA7517] px-3 py-1.5 text-[12px] font-semibold text-[#FBF7F0] hover:bg-[#854F0B] shrink-0">
                  {requiredCount ? "Edit" : "Set required courses"}
                </button>
              )}
            </div>

            {editing && (
              <div className="mt-4 border-t border-[#F5EEE0] pt-4">
                <p className="text-[11px] text-gray-500 mb-3">Check each course to require it, and set how many days a driver has to complete it (counted from when they&apos;re added to your roster, or when you set the requirement, whichever is later).</p>
                <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                  {courses.map((c) => {
                    const row = reqEdit[c.id] || { required: false, dueDays: 30 };
                    return (
                      <div key={c.id} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-[#FBF7F0]">
                        <label className="flex items-center gap-2.5 cursor-pointer min-w-0">
                          <input type="checkbox" checked={row.required}
                            onChange={(e) => setReqEdit((m) => ({ ...m, [c.id]: { ...row, required: e.target.checked } }))}
                            className="h-4 w-4 shrink-0 accent-[#BA7517]" />
                          <span className="min-w-0">
                            <span className="block text-[13px] text-[#0A2540] truncate">{c.title}</span>
                            <span className="block text-[10px] text-gray-400">{c.category}</span>
                          </span>
                        </label>
                        <div className={`flex items-center gap-1.5 shrink-0 ${row.required ? "" : "opacity-40"}`}>
                          <span className="text-[11px] text-gray-500">due in</span>
                          <input type="number" min={1} max={365} value={row.dueDays} disabled={!row.required}
                            onChange={(e) => setReqEdit((m) => ({ ...m, [c.id]: { ...row, dueDays: parseInt(e.target.value || "0", 10) } }))}
                            className="w-16 rounded border border-[#EFE6D3] px-2 py-1 text-[12px] text-right disabled:bg-gray-50" />
                          <span className="text-[11px] text-gray-500">days</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {saveError && <div className="mt-3 text-[12px] text-[#9B2C2C]">{saveError}</div>}
                <div className="mt-4 flex items-center gap-2">
                  <button type="button" onClick={() => saveReq.mutate()} disabled={saveReq.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#BA7517] px-4 py-2 text-[12px] font-semibold text-[#FBF7F0] hover:bg-[#854F0B] disabled:opacity-50">
                    {saveReq.isPending ? <Loader2 size={14} className="animate-spin" /> : null} Save{editSelectedCount ? ` (${editSelectedCount} required)` : ""}
                  </button>
                  <button type="button" onClick={() => { setEditing(false); setSeeded(false); setSaveError(null); }}
                    className="rounded-lg border border-[#EFE6D3] px-4 py-2 text-[12px] font-medium text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}
          </CarrierCard>

          {/* Refresher nudge — certs due/expired (T6 v3.8.and) */}
          {summary && (summary.expiredCells || summary.expiringCells) ? (
            <div className="mb-4 px-3 py-2.5 bg-[#FBEFD4] border-l-4 border-[#B07A1A] rounded text-[13px] text-[#0A2540]">
              {summary.expiredCells ? <><span className="font-semibold text-[#9B2C2C]">{summary.expiredCells} certification{summary.expiredCells === 1 ? "" : "s"} expired</span>{summary.expiringCells ? " · " : ". Have the driver re-take in the Academy to renew."}</> : null}
              {summary.expiringCells ? <><span className="font-semibold text-[#B07A1A]">{summary.expiringCells} expiring within 30 days</span>. Plan a refresher before they lapse.</> : null}
            </div>
          ) : null}

          {/* Overdue nudge (Sprint D) */}
          {overdueCells > 0 ? (
            <div className="mb-4 px-3 py-2.5 bg-[#F6E3E3] border-l-4 border-[#9B2C2C] rounded text-[13px] text-[#0A2540] flex items-start gap-2">
              <AlertTriangle size={15} className="text-[#9B2C2C] shrink-0 mt-0.5" />
              <span><span className="font-semibold text-[#9B2C2C]">{overdueCells} required course{overdueCells === 1 ? "" : "s"} overdue</span> across your roster. Overdue cells are flagged below — have those drivers complete them in the Academy.</span>
            </div>
          ) : null}

          {drivers.length === 0 ? (
            <CarrierCard padding="p-10">
              <div className="text-center">
                <Users size={32} className="mx-auto text-[#BA7517] mb-3" />
                <h3 className="text-sm font-bold text-[#0A2540] mb-1">No active drivers yet</h3>
                <p className="text-xs text-gray-500">Add drivers and send them training invites from the Drivers page.</p>
              </div>
            </CarrierCard>
          ) : (
            <CarrierCard padding="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#F5EEE0] text-[11px] uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3 font-medium sticky left-0 bg-white z-10">Driver</th>
                      {courses.map((c) => (
                        <th key={c.id} className={`px-3 py-3 font-medium text-center min-w-[120px] ${hoverCol === c.id ? "bg-[#BA7517]/5" : ""}`}
                          onMouseEnter={() => setHoverCol(c.id)} onMouseLeave={() => setHoverCol(null)} title={c.category}>
                          {c.title}
                          {c.required ? <span className="block text-[9px] font-semibold text-[#BA7517] normal-case tracking-normal">Required · {c.dueDays}d</span> : null}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map((d) => (
                      <tr key={d.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 sticky left-0 bg-white z-10">
                          <div className="text-[13px] font-semibold text-[#0A2540]">{d.firstName} {d.lastName}</div>
                          {!d.activated
                            ? <div className="text-[10px] text-[#B07A1A]">Not activated</div>
                            : <div className="text-[10px] text-gray-400">{d.passedCount}/{courses.length} done</div>}
                        </td>
                        {courses.map((c) => {
                          const p = d.progress[c.id];
                          const status = p?.status || "NOT_STARTED";
                          const overdue = !!c.required && (d.requiredOverdueCourseIds || []).includes(c.id);
                          const dueIso = c.required ? d.requiredDue?.[c.id] : undefined;
                          return (
                            <td key={c.id} className={`px-3 py-3 text-center align-middle ${overdue ? "bg-[#F6E3E3]/50" : hoverCol === c.id ? "bg-[#BA7517]/5" : ""}`}>
                              {status === "PASSED" ? (
                                <button type="button" onClick={() => downloadCert(d.id, c.slug)}
                                  className="inline-flex flex-col items-center gap-0.5 group" title="Download certificate">
                                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#2F7A4F]">
                                    <CheckCircle2 size={13} /> {p?.bestScorePct ?? 0}%
                                  </span>
                                  {p?.isExpired ? (
                                    <span className="text-[10px] font-semibold text-[#9B2C2C]">Expired</span>
                                  ) : p && p.daysUntilExpiry != null && p.daysUntilExpiry <= 30 ? (
                                    <span className="text-[10px] font-semibold text-[#B07A1A]">{p.daysUntilExpiry}d left</span>
                                  ) : null}
                                  <span className="inline-flex items-center gap-0.5 text-[10px] text-[#BA7517] group-hover:underline">
                                    <Download size={10} /> cert
                                  </span>
                                </button>
                              ) : (
                                <div className="inline-flex flex-col items-center gap-0.5">
                                  {status === "IN_PROGRESS" ? (
                                    <span className="text-[11px] text-[#B07A1A]">In progress</span>
                                  ) : status === "FAILED" ? (
                                    <span className="text-[11px] text-[#9B2C2C]">Retry</span>
                                  ) : (
                                    <span className="text-[12px] text-gray-300">—</span>
                                  )}
                                  {overdue ? (
                                    <span className="text-[10px] font-semibold text-[#9B2C2C]">Overdue</span>
                                  ) : dueIso ? (
                                    <span className="text-[10px] text-[#B07A1A]">Due {fmtDate(dueIso)}</span>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CarrierCard>
          )}

          <div className="mt-5 px-4 py-3 bg-[#BA7517]/5 border border-[#C5A572]/20 rounded-lg flex items-center gap-3">
            <GraduationCap size={18} className="text-[#BA7517] shrink-0" />
            <p className="text-xs text-gray-600">
              Drivers complete courses at their own pace in SRL Driver Academy. Each pass records a completion you can
              show on a roadside audit, to a shipper, or to your insurer. Manage your roster and send invites from the Drivers page.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
