"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, Play } from "lucide-react";
import { WaterfallIconTabs, type WfTab } from "./IconTabs";
import { CascadeTab } from "./tabs/CascadeTab";
import { DetailsTab } from "./tabs/DetailsTab";
import { MatchTab } from "./tabs/MatchTab";
import { MarketTab } from "./tabs/MarketTab";
import { TendersTab } from "./tabs/TendersTab";
import { NotesTab } from "./tabs/NotesTab";
import { ActivityTab } from "./tabs/ActivityTab";

interface Props {
  loadId: string | null;
  onClose: () => void;
}

export function WaterfallDrawer({ loadId, onClose }: Props) {
  const [tab, setTab] = useState<WfTab>("waterfall");

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (loadId) {
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
      setTab("waterfall");
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [loadId, handleKey]);

  // v3.4.u — direct lookup via /waterfalls/load/:loadId/current.
  // Previously we round-tripped through the board list to resolve the
  // active waterfall for a load; the new shortcut returns it directly.
  const lookupQuery = useQuery<{ waterfall: { id: string } | null }>({
    queryKey: ["wf-load-lookup", loadId],
    queryFn: async () => (await api.get(`/waterfalls/load/${loadId}/current`)).data,
    enabled: !!loadId,
  });

  const waterfallId = lookupQuery.data?.waterfall?.id ?? null;

  const detail = useQuery<{ waterfall: any }>({
    queryKey: ["wf-detail", waterfallId],
    queryFn: async () => (await api.get(`/waterfalls/${waterfallId}`)).data,
    enabled: !!waterfallId,
    refetchInterval: 10_000,
  });

  const build = useMutation({
    mutationFn: async () =>
      (await api.post("/waterfalls", { loadId, mode: "semi_auto" })).data,
    onSuccess: () => lookupQuery.refetch(),
  });

  const start = useMutation({
    mutationFn: async () => {
      if (!waterfallId) return;
      return (await api.post(`/waterfalls/${waterfallId}/start`)).data;
    },
    onSuccess: () => detail.refetch(),
  });

  if (!loadId) return null;

  const wf = detail.data?.waterfall;
  const load = wf?.load;
  const refetchAll = () => { detail.refetch(); lookupQuery.refetch(); };

  const currentPos = wf?.positions?.find((p: any) => p.status === "tendered");
  const posLabel = wf ? `Pos ${wf.currentPosition || 0}/${wf.totalPositions}` : null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute top-0 bottom-0 right-0 w-full max-w-[720px] bg-white shadow-2xl flex animate-slide-in-right"
      >
        <WaterfallIconTabs active={tab} onChange={setTab} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">
                    {load?.loadNumber ?? load?.referenceNumber?.slice(0, 8) ?? "Loading…"}
                  </h2>
                  {wf && (
                    <span className={`px-2 py-0.5 text-[11px] rounded ${
                      wf.status === "active" ? "bg-[#FAEEDA] text-[#BA7517]"
                      : wf.status === "completed" ? "bg-green-100 text-green-700"
                      : wf.status === "exhausted" ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-700"
                    }`}>
                      Waterfall {wf.status}
                    </span>
                  )}
                  {posLabel && (
                    <span className="px-2 py-0.5 text-[11px] rounded bg-gray-100 text-gray-700">{posLabel}</span>
                  )}
                </div>
                {load && (
                  <div className="text-xs text-gray-500 mt-1">
                    {load.originCity}, {load.originState} → {load.destCity}, {load.destState}
                    {load.distance && ` · ${Math.round(load.distance).toLocaleString()} mi`}
                    {" · "}{load.equipmentType}
                    {" · PU "}{new Date(load.pickupDate).toLocaleDateString()}
                  </div>
                )}
                {load && (
                  <div className="text-[11px] text-gray-500 mt-0.5">
                    Customer ${(load.customerRate ?? load.rate ?? 0).toLocaleString()} ·
                    Target cost ${(load.carrierRate ?? 0).toLocaleString()} ·
                    Margin ${((load.customerRate ?? load.rate ?? 0) - (load.carrierRate ?? 0)).toLocaleString()}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Empty state: no waterfall yet */}
          {!waterfallId && !lookupQuery.isLoading && (
            <div className="flex-1 flex items-center justify-center p-6">
              <div className="text-center max-w-xs space-y-3">
                <p className="text-sm text-gray-600">No active waterfall for this load yet.</p>
                <button
                  onClick={() => build.mutate()}
                  disabled={build.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-white text-sm font-medium rounded disabled:opacity-40"
                >
                  <Play className="w-4 h-4" />
                  {build.isPending ? "Building…" : "Build waterfall"}
                </button>
              </div>
            </div>
          )}

          {/* Tab content */}
          {waterfallId && (
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {!wf && <div className="text-sm text-gray-400">Loading cascade…</div>}
              {wf && tab === "waterfall" && (
                <div className="space-y-4">
                  {wf.status === "building" && (
                    <button
                      onClick={() => start.mutate()}
                      disabled={start.isPending}
                      className="w-full flex items-center justify-center gap-2 py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-white text-sm font-medium rounded disabled:opacity-40"
                    >
                      <Play className="w-4 h-4" /> Start cascade
                    </button>
                  )}
                  <CascadeTab waterfall={wf} onChange={refetchAll} />
                </div>
              )}
              {wf && load && tab === "details"   && <DetailsTab  load={load} />}
              {wf && load && tab === "match"     && <MatchTab    waterfall={wf} loadId={loadId} onChange={refetchAll} />}
              {wf && load && tab === "market"    && <MarketTab   load={load} />}
              {wf && tab === "tenders"           && <TendersTab  waterfall={wf} />}
              {wf && load && tab === "notes"     && <NotesTab    load={load} loadId={loadId} onChange={refetchAll} />}
              {wf && load && tab === "activity"  && <ActivityTab load={load} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
