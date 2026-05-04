"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Pause, SkipForward, Plus } from "lucide-react";

interface Props {
  waterfall: any;
  onChange: () => void;
}

function Countdown({ expiresAt }: { expiresAt: string | null }) {
  const [remaining, setRemaining] = useState(() =>
    expiresAt ? Math.max(0, new Date(expiresAt).getTime() - Date.now()) : 0
  );
  useEffect(() => {
    if (!expiresAt) return;
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  if (!expiresAt) return null;
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const cls = m < 5 ? "text-red-600" : m < 10 ? "text-amber-600" : "text-[#C5A572]";
  return (
    <span className={`font-mono font-semibold tabular-nums ${cls}`}>
      {remaining === 0 ? "Expired" : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`}
    </span>
  );
}

export function CascadeTab({ waterfall, onChange }: Props) {
  const pause = useMutation({
    mutationFn: async () => (await api.patch(`/waterfalls/${waterfall.id}`, { action: "pause" })).data,
    onSuccess: onChange,
  });
  const resume = useMutation({
    mutationFn: async () => (await api.patch(`/waterfalls/${waterfall.id}`, { action: "resume" })).data,
    onSuccess: onChange,
  });
  const skip = useMutation({
    mutationFn: async (posId: string) =>
      (await api.patch(`/waterfalls/${waterfall.id}/positions/${posId}/skip`)).data,
    onSuccess: onChange,
  });

  const positions: any[] = waterfall.positions ?? [];
  const currentPos = positions.find((p) => p.status === "tendered");

  return (
    <div className="space-y-4 text-sm">
      {/* Control strip */}
      <div className="flex items-center gap-2">
        {waterfall.status === "active" ? (
          <button onClick={() => pause.mutate()} className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50">
            <Pause className="w-3 h-3" /> Pause
          </button>
        ) : waterfall.status === "paused" ? (
          <button onClick={() => resume.mutate()} className="flex items-center gap-1 px-3 py-1.5 text-xs text-[#BA7517] border border-[#BA7517]/40 bg-[#FAEEDA] rounded">
            Resume
          </button>
        ) : null}
        {currentPos && (
          <button
            onClick={() => skip.mutate(currentPos.id)}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border border-gray-200 rounded hover:bg-gray-50"
          >
            <SkipForward className="w-3 h-3" /> Skip current
          </button>
        )}
        <div className="ml-auto text-xs text-gray-500">
          Mode: <span className="font-medium text-gray-700">{waterfall.mode}</span> · {waterfall.status}
        </div>
      </div>

      {/* Cascade */}
      <div className="space-y-2">
        {positions.map((p) => {
          const isActive = p.status === "tendered";
          const isDeclined = p.status === "declined" || p.status === "expired";
          const isSkipped = p.status === "skipped";
          const carrier = p.carrier?.carrierProfile;
          const cls =
            isActive ? "border-[#BA7517] bg-[#FAEEDA]/30" :
            p.status === "accepted" ? "border-green-200 bg-green-50/40" :
            isDeclined || isSkipped ? "border-gray-200 bg-gray-50 opacity-60" :
            "border-gray-200 bg-white";
          const scoreNum = p.matchScore ? Number(p.matchScore) : 0;
          return (
            <div key={p.id} className={`border rounded-lg p-3 ${cls}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                    isActive ? "bg-[#BA7517] text-white"
                    : p.status === "accepted" ? "bg-green-500 text-white"
                    : "bg-gray-200 text-gray-600"
                  }`}>
                    {p.isFallback ? "D" : p.position}
                  </div>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">
                      {p.isFallback ? "DAT fallback" : carrier?.companyName ?? p.carrier?.email ?? "Unknown carrier"}
                    </div>
                    {!p.isFallback && carrier && (
                      <div className="text-[11px] text-gray-500 mt-0.5 flex flex-wrap gap-2">
                        <span>{carrier.cppTier}</span>
                        {p.offeredRate && <span>· ${Number(p.offeredRate).toLocaleString()}</span>}
                        {p.matchScore && <span>· Match {Math.round(scoreNum)}%</span>}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase text-gray-500">{p.status}</div>
                  {isActive && <Countdown expiresAt={p.tenderExpiresAt} />}
                  {isDeclined && p.declineReason && (
                    <div className="text-[10px] text-red-500 mt-0.5">{p.declineReason}</div>
                  )}
                </div>
              </div>
              {/* Score bar */}
              {!p.isFallback && p.matchScore && (
                <div className="mt-2 h-1 bg-gray-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${isActive ? "bg-[#BA7517]" : isDeclined ? "bg-gray-300" : "bg-[#BA7517]/60"}`}
                    style={{ width: `${Math.min(100, scoreNum)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-gray-500 p-3 border border-dashed border-gray-200 rounded">
        <strong>Match score formula:</strong> Lane history 30% + SRCPP tier 25% + Rate competitiveness 20% + On-time 15% + Equipment 10%
      </div>
    </div>
  );
}
