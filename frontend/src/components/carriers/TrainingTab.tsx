"use client";

// v3.8.and — SRL Driver Academy T6: AE carrier-detail Training tab.
//
// Read-only visibility for the AE/admin into a single carrier's driver training:
// the roster × published-course completion matrix + % trained + expired/expiring
// headline. Mirrors the carrier's own /carrier/dashboard/training screen (same
// shared trainingService.buildCarrierTrainingSummary source) but on the AE panel
// register (white surface, gray text), and with NO cert downloads — the carrier
// owns certificate distribution; the AE just needs to see who's trained and what
// needs a refresher. Expiry is a computed property (status PASSED + expiresAt <
// now), never a status — so an expired cert still shows as completed, flagged for
// renewal.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { GraduationCap, CheckCircle2 } from "lucide-react";

interface Course { id: string; slug: string; title: string; category: string }
interface Cell {
  status: "NOT_STARTED" | "IN_PROGRESS" | "PASSED" | "FAILED";
  bestScorePct: number | null;
  completedAt: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  daysUntilExpiry: number | null;
}
interface DriverRow {
  id: string;
  firstName: string;
  lastName: string;
  activated: boolean;
  passedCount: number;
  progress: Record<string, Cell>;
}
interface Summary {
  driverCount: number;
  courseCount: number;
  passedCells: number;
  totalCells: number;
  pctTrained: number;
  expiredCells: number;
  expiringCells: number;
}

export function TrainingTab({ carrierId }: { carrierId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ae-carrier-training", carrierId],
    queryFn: () => api.get<{ courses: Course[]; drivers: DriverRow[]; summary: Summary }>(`/carriers/${carrierId}/training-summary`).then((r) => r.data),
    enabled: !!carrierId,
  });

  if (isLoading) {
    return <div className="p-6 text-center"><p className="text-sm text-gray-500 animate-pulse">Loading training progress…</p></div>;
  }
  if (isError) {
    return <div className="p-6 text-center"><p className="text-sm text-red-500">Couldn&apos;t load training progress.</p></div>;
  }

  const courses = data?.courses || [];
  const drivers = data?.drivers || [];
  const summary = data?.summary;

  if (drivers.length === 0) {
    return (
      <div className="p-6 text-center">
        <GraduationCap size={32} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-700">No active drivers</p>
        <p className="text-xs text-gray-500 mt-1">This carrier has no active drivers on their training roster yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4">
      {/* Summary row */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <Stat label="Trained" value={`${summary.pctTrained}%`} sub={`${summary.passedCells}/${summary.totalCells} completions`} />
          <Stat label="Drivers" value={String(summary.driverCount)} sub="active" />
          <Stat label="Expiring" value={String(summary.expiringCells)} sub="within 30d" tone={summary.expiringCells > 0 ? "warn" : undefined} />
          <Stat label="Expired" value={String(summary.expiredCells)} sub="refresher due" tone={summary.expiredCells > 0 ? "danger" : undefined} />
        </div>
      )}

      {/* Matrix */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-100 text-[11px] uppercase tracking-wide text-gray-400 bg-gray-50">
              <th className="px-3 py-2.5 font-medium sticky left-0 bg-gray-50 z-10">Driver</th>
              {courses.map((c) => (
                <th key={c.id} className="px-2.5 py-2.5 font-medium text-center min-w-[104px]" title={c.category}>{c.title}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2.5 sticky left-0 bg-white z-10">
                  <div className="text-[13px] font-semibold text-[#0A2540]">{d.firstName} {d.lastName}</div>
                  {!d.activated
                    ? <div className="text-[10px] text-amber-600">Not activated</div>
                    : <div className="text-[10px] text-gray-400">{d.passedCount}/{courses.length} done</div>}
                </td>
                {courses.map((c) => {
                  const p = d.progress[c.id];
                  const status = p?.status || "NOT_STARTED";
                  return (
                    <td key={c.id} className="px-2.5 py-2.5 text-center align-middle">
                      {status === "PASSED" ? (
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-green-700">
                            <CheckCircle2 size={13} /> {p?.bestScorePct ?? 0}%
                          </span>
                          {p?.isExpired ? (
                            <span className="text-[10px] font-semibold text-[#9B2C2C]">Expired</span>
                          ) : p && p.daysUntilExpiry != null && p.daysUntilExpiry <= 30 ? (
                            <span className="text-[10px] font-semibold text-[#B07A1A]">{p.daysUntilExpiry}d left</span>
                          ) : null}
                        </div>
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

      <p className="text-[11px] text-gray-400 mt-3">
        SRL Driver Academy completion across this carrier&apos;s active roster. The carrier downloads certificates and sends invites from their portal; certifications are flagged here when due for a refresher.
      </p>
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "warn" | "danger" }) {
  const valueColor = tone === "danger" ? "text-[#9B2C2C]" : tone === "warn" ? "text-[#B07A1A]" : "text-[#0A2540]";
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#BA7517]">{label}</div>
      <div className={`text-2xl font-semibold mt-0.5 ${valueColor}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}
