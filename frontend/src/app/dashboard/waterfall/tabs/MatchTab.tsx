"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus } from "lucide-react";

interface Props {
  waterfall: any;
  loadId: string;
  onChange: () => void;
}

export function MatchTab({ waterfall, loadId, onChange }: Props) {
  const matches = useQuery<{ carriers: any[] }>({
    queryKey: ["wf-matches", loadId],
    queryFn: async () => (await api.get(`/waterfalls/load/${loadId}/carrier-matches`)).data,
    enabled: !!loadId,
    staleTime: 60_000,
  });

  const addPos = useMutation({
    mutationFn: async (carrierUserId: string) =>
      (await api.post(`/waterfalls/${waterfall.id}/positions`, { carrierUserId })).data,
    onSuccess: onChange,
  });

  const inWaterfall = new Set<string>(
    (waterfall.positions ?? [])
      .filter((p: any) => p.carrierId)
      .map((p: any) => p.carrierId as string)
  );

  return (
    <div className="space-y-3 text-sm">
      <p className="text-xs text-gray-500">
        All carriers eligible for this lane + equipment, sorted by composite match score.
      </p>

      {matches.isLoading && <div className="text-gray-400">Scoring carriers…</div>}

      {(matches.data?.carriers ?? []).map((c) => {
        const already = inWaterfall.has(c.userId);
        const scorePct = Math.round(c.matchScore);
        return (
          <div key={c.carrierId} className="border border-gray-200 rounded-lg p-3 bg-white">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900 truncate">{c.companyName ?? "—"}</span>
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-[#FAEEDA] text-[#BA7517]">{c.tier}</span>
                  {already && <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-200 text-gray-600">In waterfall</span>}
                </div>
                <div className="mt-1 h-1.5 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-[#BA7517]" style={{ width: `${Math.min(100, scorePct)}%` }} />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-gray-600">
                  <div>
                    <div className="text-gray-700">Lane runs</div>
                    <div>{c.breakdown.laneRunCount}</div>
                  </div>
                  <div>
                    <div className="text-gray-700">On-time</div>
                    <div>{c.breakdown.onTimePct.toFixed(0)}%</div>
                  </div>
                  <div>
                    <div className="text-gray-700">Est. rate</div>
                    <div>{c.breakdown.estimatedRate ? `$${Math.round(c.breakdown.estimatedRate).toLocaleString()}` : "—"}</div>
                  </div>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-2xl font-semibold text-[#C5A572]">{scorePct}%</div>
                {!already && (
                  <button
                    onClick={() => addPos.mutate(c.userId)}
                    className="mt-1 flex items-center gap-1 px-2 py-1 text-[11px] text-[#BA7517] border border-[#BA7517]/40 bg-[#FAEEDA] rounded hover:bg-[#FAEEDA]/80"
                  >
                    <Plus className="w-3 h-3" /> Add
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}

      <div className="text-[10px] text-gray-500 p-3 border border-dashed border-gray-200 rounded">
        Manual mode → you drag carriers. Semi-auto → ranking pre-built, you confirm. Full-auto → cascade fires immediately.
      </div>
    </div>
  );
}
