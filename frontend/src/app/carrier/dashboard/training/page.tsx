"use client";

// v3.8.anc — SRL Driver Academy Sprint T5: carrier Training dashboard.
// Roster × course completion matrix + "% trained" + per-cell certificate
// downloads. Replaces the T1/T2 teaser strip's promise with the real screen
// answering "how many of my drivers have been trained?".

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { GraduationCap, Loader2, CheckCircle2, Download, Users } from "lucide-react";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/download";
import { CarrierCard } from "@/components/carrier";

interface Course { id: string; slug: string; title: string; category: string }
interface CellProgress { status: "NOT_STARTED" | "IN_PROGRESS" | "PASSED" | "FAILED"; bestScorePct: number | null; completedAt: string | null; expiresAt: string | null; isExpired?: boolean; daysUntilExpiry?: number | null }
interface DriverRow {
  id: string;
  firstName: string;
  lastName: string;
  activated: boolean;
  passedCount: number;
  progress: Record<string, CellProgress>;
}
interface Summary { driverCount: number; courseCount: number; passedCells: number; totalCells: number; pctTrained: number; expiredCells?: number; expiringCells?: number }

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <CarrierCard padding="p-4">
      <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#BA7517]">{label}</div>
      <div className="font-serif text-3xl text-[#0F1117] mt-1">{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </CarrierCard>
  );
}

export default function CarrierTrainingPage() {
  const [hoverCol, setHoverCol] = useState<string | null>(null);
  const [certError, setCertError] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["carrier-training"],
    queryFn: () => api.get("/carrier-drivers/training-summary").then((r) => r.data),
  });

  const downloadCert = async (driverId: string, slug: string) => {
    setCertError(null);
    try {
      await downloadFromApi(`/carrier-drivers/${driverId}/certificate/${slug}`, `SRL-Certificate-${slug}.pdf`);
    } catch {
      setCertError("Couldn't download that certificate. Try again in a moment.");
    }
  };

  const courses: Course[] = data?.courses || [];
  const drivers: DriverRow[] = data?.drivers || [];
  const summary: Summary | undefined = data?.summary;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0F1117] mb-1">Driver Training</h1>
        <p className="text-[13px] text-gray-500">
          SRL Driver Academy completion across your roster. Download a certificate from any completed cell.
        </p>
      </div>

      {certError && (
        <div className="mb-4 px-3 py-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">{certError}</div>
      )}

      {isLoading ? (
        <CarrierCard padding="p-8">
          <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
            <Loader2 size={16} className="animate-spin" /> Loading training progress...
          </div>
        </CarrierCard>
      ) : error ? (
        <CarrierCard padding="p-8"><p className="text-center text-sm text-red-600">Could not load training progress. Try again.</p></CarrierCard>
      ) : (
        <>
          {/* Summary */}
          {summary && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              <StatCard label="Trained" value={`${summary.pctTrained}%`} sub={`${summary.passedCells} of ${summary.totalCells} course completions`} />
              <StatCard label="Drivers" value={String(summary.driverCount)} sub="active on roster" />
              <StatCard label="Courses" value={String(summary.courseCount)} sub="published" />
            </div>
          )}

          {/* Refresher nudge — certs due/expired (T6 v3.8.and) */}
          {summary && (summary.expiredCells || summary.expiringCells) ? (
            <div className="mb-4 px-3 py-2.5 bg-[#FBEFD4] border-l-4 border-[#B07A1A] rounded text-[13px] text-[#0A2540]">
              {summary.expiredCells ? <><span className="font-semibold text-[#9B2C2C]">{summary.expiredCells} certification{summary.expiredCells === 1 ? "" : "s"} expired</span>{summary.expiringCells ? " · " : ". Have the driver re-take in the Academy to renew."}</> : null}
              {summary.expiringCells ? <><span className="font-semibold text-[#B07A1A]">{summary.expiringCells} expiring within 30 days</span>. Plan a refresher before they lapse.</> : null}
            </div>
          ) : null}

          {drivers.length === 0 ? (
            <CarrierCard padding="p-10">
              <div className="text-center">
                <Users size={32} className="mx-auto text-[#C9A84C] mb-3" />
                <h3 className="text-sm font-bold text-[#0F1117] mb-1">No active drivers yet</h3>
                <p className="text-xs text-gray-500">Add drivers and send them training invites from the Drivers page.</p>
              </div>
            </CarrierCard>
          ) : (
            <CarrierCard padding="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400">
                      <th className="px-4 py-3 font-medium sticky left-0 bg-white z-10">Driver</th>
                      {courses.map((c) => (
                        <th key={c.id} className={`px-3 py-3 font-medium text-center min-w-[120px] ${hoverCol === c.id ? "bg-[#C9A84C]/5" : ""}`}
                          onMouseEnter={() => setHoverCol(c.id)} onMouseLeave={() => setHoverCol(null)} title={c.category}>
                          {c.title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {drivers.map((d) => (
                      <tr key={d.id} className="border-b border-gray-50 last:border-0">
                        <td className="px-4 py-3 sticky left-0 bg-white z-10">
                          <div className="text-[13px] font-semibold text-[#0F1117]">{d.firstName} {d.lastName}</div>
                          {!d.activated
                            ? <div className="text-[10px] text-amber-600">Not activated</div>
                            : <div className="text-[10px] text-gray-400">{d.passedCount}/{courses.length} done</div>}
                        </td>
                        {courses.map((c) => {
                          const p = d.progress[c.id];
                          const status = p?.status || "NOT_STARTED";
                          return (
                            <td key={c.id} className={`px-3 py-3 text-center align-middle ${hoverCol === c.id ? "bg-[#C9A84C]/5" : ""}`}>
                              {status === "PASSED" ? (
                                <button type="button" onClick={() => downloadCert(d.id, c.slug)}
                                  className="inline-flex flex-col items-center gap-0.5 group" title="Download certificate">
                                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-green-700">
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
                              ) : status === "IN_PROGRESS" ? (
                                <span className="text-[11px] text-amber-600">In progress</span>
                              ) : status === "FAILED" ? (
                                <span className="text-[11px] text-red-500">Retry</span>
                              ) : (
                                <span className="text-[12px] text-gray-300">—</span>
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

          <div className="mt-5 px-4 py-3 bg-[#C9A84C]/5 border border-[#C9A84C]/20 rounded-lg flex items-center gap-3">
            <GraduationCap size={18} className="text-[#BA7517] shrink-0" />
            <p className="text-xs text-gray-600">
              Drivers complete courses at their own pace in SRL Driver Academy. Each pass records a completion you can
              show on a roadside audit or to a shipper. Manage your roster and send invites from the Drivers page.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
