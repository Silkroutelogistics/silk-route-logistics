"use client";

import { useState, useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { IconTabs } from "./IconTabs";
import { DetailsTab } from "./tabs/DetailsTab";
import { TrackingTab } from "./tabs/TrackingTab";
import { ActivityTab } from "./tabs/ActivityTab";
import { DocsTab } from "./tabs/DocsTab";
import { CheckCallsTab } from "./tabs/CheckCallsTab";
import { ExceptionsTab } from "./tabs/ExceptionsTab";
import { FinanceTab } from "./tabs/FinanceTab";
import { PhotosTab } from "./tabs/PhotosTab";
import type { DrawerTab } from "./drawer-types";

interface Props {
  loadId: string | null;
  onClose: () => void;
}

export function LoadDetailDrawer({ loadId, onClose }: Props) {
  const [tab, setTab] = useState<DrawerTab>("details");

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (loadId) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
      setTab("details");
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [loadId, handleKeyDown]);

  const query = useQuery<{ load: any }>({
    queryKey: ["tt-load-detail", loadId],
    queryFn: async () => (await api.get(`/track-trace/load/${loadId}`)).data,
    enabled: !!loadId,
    refetchInterval: 30_000,
  });

  if (!loadId) return null;
  const load = query.data?.load;

  const openExceptionCount = (load?.loadExceptions ?? []).filter((e: any) => e.status === "OPEN").length;

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      IN_TRANSIT: "bg-cyan-100 text-cyan-700",
      DELIVERED:  "bg-green-100 text-green-700",
      AT_PICKUP:  "bg-amber-100 text-amber-700",
    };
    return <span className={`px-2 py-0.5 text-[11px] rounded ${map[s] ?? "bg-gray-100 text-gray-700"}`}>{(s || "").replace(/_/g, " ")}</span>;
  };

  const distance = load?.distance ? `${Math.round(load.distance).toLocaleString()} mi` : null;
  const originCity = load?.originCity ?? "—";
  const originState = load?.originState ?? "";
  const destCity = load?.destCity ?? "—";
  const destState = load?.destState ?? "";

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute top-0 bottom-0 right-0 w-full max-w-[720px] bg-white shadow-2xl flex animate-slide-in-right"
      >
        <IconTabs active={tab} onChange={setTab} openExceptionCount={openExceptionCount} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-semibold text-gray-900 truncate">
                    {load?.loadNumber ?? load?.referenceNumber?.slice(0, 8) ?? "Loading…"}
                  </h2>
                  {load && statusBadge(load.status)}
                  {load?.urgencyLevel && load.urgencyLevel !== "STANDARD" && (
                    <span className="px-2 py-0.5 text-[11px] rounded bg-red-100 text-red-700">{load.urgencyLevel}</span>
                  )}
                  {load?.temperatureControlled && (
                    <span className="px-2 py-0.5 text-[11px] rounded bg-amber-100 text-amber-700">Reefer</span>
                  )}
                  {openExceptionCount > 0 && (
                    <span className="px-2 py-0.5 text-[11px] rounded bg-red-500 text-white">{openExceptionCount} exception{openExceptionCount === 1 ? "" : "s"}</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {originCity}, {originState} → {destCity}, {destState}
                  {distance && ` · ${distance}`}
                </div>
                {load?.bolNumber && (
                  <button
                    onClick={() => navigator.clipboard?.writeText(`BOL-${load.bolNumber}`)}
                    className="mt-1 text-[11px] text-[#854F0B] hover:underline"
                  >
                    Copy tracking link · BOL-{load.bolNumber}
                  </button>
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

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {!load && <div className="text-sm text-gray-400">Loading…</div>}
            {load && tab === "details"     && <DetailsTab     load={load} />}
            {load && tab === "tracking"    && <TrackingTab    load={load} />}
            {load && tab === "activity"    && <ActivityTab    load={load} />}
            {load && tab === "docs"        && <DocsTab        load={load} loadId={loadId} onChange={() => query.refetch()} />}
            {load && tab === "check_calls" && <CheckCallsTab  load={load} loadId={loadId} onChange={() => query.refetch()} />}
            {load && tab === "exceptions"  && <ExceptionsTab  load={load} loadId={loadId} onChange={() => query.refetch()} />}
            {load && tab === "finance"     && <FinanceTab     load={load} />}
            {load && tab === "photos"      && <PhotosTab      load={load} loadId={loadId} onChange={() => query.refetch()} />}
          </div>
        </div>
      </div>
    </div>
  );
}
