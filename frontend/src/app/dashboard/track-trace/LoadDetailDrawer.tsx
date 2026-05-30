"use client";

import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, BellOff, Bell } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getNextStatusAction } from "@/lib/loadStatusActions";
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
  const [statusError, setStatusError] = useState<string | null>(null);
  const queryClient = useQueryClient();

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

  // Sprint 42 (Item 63 P1-1) — browser-back close. Trigger-dep variant.
  useEffect(() => {
    if (!loadId) return;
    window.history.pushState({ loadDetailDrawer: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [loadId, onClose]);

  const query = useQuery<{ load: any }>({
    queryKey: ["tt-load-detail", loadId],
    queryFn: async () => (await api.get(`/track-trace/load/${loadId}`)).data,
    enabled: !!loadId,
    refetchInterval: 30_000,
  });

  // v3.8.e — Status advancement from inside the T&T drawer. Mirrors the
  // Load Board's mutation (PATCH /loads/:id/status) so dispatchers don't
  // have to bounce between surfaces. VALID_TRANSITIONS gating happens
  // server-side; this mutation just trusts the next-status helper map.
  const updateStatus = useMutation({
    mutationFn: async (vars: { loadId: string; status: string }) =>
      (await api.patch(`/loads/${vars.loadId}/status`, { status: vars.status })).data,
    onSuccess: () => {
      setStatusError(null);
      // Refetch this drawer's load + invalidate the Load Board list query
      // so a dispatcher who has both surfaces open sees the change reflected.
      queryClient.invalidateQueries({ queryKey: ["tt-load-detail", loadId] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error ?? err?.message ?? "Failed to update status";
      setStatusError(msg);
    },
  });

  // v3.8.ali §13.3 Item 192 — per-load risk-email kill switch. Toggles
  // the external risk-alert email for THIS load. Email-only: the in-app
  // RED/AMBER notification + RiskLog are unaffected; only the Gmail-bound
  // alert is silenced. Optimistically refetches the drawer so the button
  // state flips immediately.
  const toggleRiskMute = useMutation({
    mutationFn: async (vars: { loadId: string; muted: boolean }) =>
      (await api.patch(`/loads/${vars.loadId}/risk-email-mute`, { muted: vars.muted })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tt-load-detail", loadId] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
    },
  });

  if (!loadId) return null;
  const load = query.data?.load;
  const statusAction = load ? getNextStatusAction(load.status) : null;

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
                    className="mt-1 text-[11px] text-[#C5A572] hover:underline"
                  >
                    Copy tracking link · BOL-{load.bolNumber}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* v3.8.ali §13.3 Item 192 — per-load risk-email kill
                    switch. Email-only mute: silences the external
                    risk-alert email for this load while keeping the
                    in-app RED/AMBER notification + RiskLog intact. Muted
                    state shows BellOff in amber; active state shows Bell
                    in muted gray. Tooltip surfaces who/when when muted. */}
                {load && (
                  <button
                    onClick={() =>
                      toggleRiskMute.mutate({ loadId: load.id, muted: !load.riskEmailMuted })
                    }
                    disabled={toggleRiskMute.isPending}
                    className={`p-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ${
                      load.riskEmailMuted
                        ? "bg-amber-500/10 text-amber-700 border-amber-500/30 hover:bg-amber-500/20"
                        : "bg-gray-100 text-gray-500 border-gray-200 hover:bg-gray-200"
                    }`}
                    title={
                      load.riskEmailMuted
                        ? `Risk emails muted${load.riskEmailMutedAt ? ` since ${new Date(load.riskEmailMutedAt).toLocaleDateString()}` : ""} — click to resume`
                        : "Mute risk-alert emails for this load (in-app alerts stay on)"
                    }
                  >
                    {load.riskEmailMuted ? <BellOff className="w-3.5 h-3.5" /> : <Bell className="w-3.5 h-3.5" />}
                    {load.riskEmailMuted ? "Muted" : "Risk email"}
                  </button>
                )}
                {/* v3.8.e — status advancement button. Shown only when the
                    current status has a next-status entry (i.e. not terminal).
                    Same affordance as Load Board, same backend mutation. */}
                {statusAction && (
                  <button
                    onClick={() =>
                      updateStatus.mutate({ loadId: load!.id, status: statusAction.nextStatus })
                    }
                    disabled={updateStatus.isPending}
                    className="px-3 py-1.5 bg-blue-500/10 text-blue-700 hover:bg-blue-500/20 border border-blue-500/30 rounded-lg text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    title={`Advance to ${statusAction.nextStatus.replace(/_/g, " ")}`}
                  >
                    <ChevronRight className="w-3 h-3" />
                    {updateStatus.isPending ? "Updating…" : statusAction.label}
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-700 hover:text-gray-600"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            {statusError && (
              <div className="mt-2 px-2 py-1 rounded text-[11px] bg-red-50 text-red-700 border border-red-200">
                {statusError}
              </div>
            )}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {!load && <div className="text-sm text-gray-700">Loading…</div>}
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
