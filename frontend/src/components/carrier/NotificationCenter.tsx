"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, X, CheckCheck, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { backgroundPoll } from "@/lib/backgroundPoll";
import { resolveNotificationHref } from "@/lib/notificationTarget";
import type { Notification } from "@/types/entities";

/**
 * carrier-portal-upgrade M2 — the carrier notification center.
 *
 * Reads GET /notifications, which the server scopes to the caller's own rows
 * and, for a carrier, to the allowlisted types (lib/carrierNotificationTypes).
 * Nothing is filtered here: the browser is not where an allowlist belongs.
 *
 * Fetches on mount and when the window regains focus. There is no polling loop
 * (owner ruling M2); the old bell refetched every two minutes. staleTime is 0
 * because the app-wide 60s default would otherwise swallow a focus refetch.
 *
 * Below 768px the list opens as a bottom sheet over a backdrop; above it, as a
 * dropdown under the bell.
 */
const ICON_BTN =
  "relative inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-150 motion-reduce:transition-none " +
  "hover:bg-[#F5EEE0] active:bg-[#EFE6D3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]";

export const NOTIFICATIONS_KEY = ["carrier-notifications"] as const;

function timeAgo(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationCenter({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const router = useRouter();
  const queryClient = useQueryClient();
  const panelRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: NOTIFICATIONS_KEY,
    // A background read: it must not reset the carrier's idle clock.
    queryFn: () => api.get<Notification[]>("/notifications", backgroundPoll).then((r) => r.data),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const notifications = Array.isArray(data) ? data : [];
  const unread = notifications.filter((n) => !n.readAt).length; // Item 321: readAt is canonical

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

  const markRead = (n: Notification) => {
    if (n.readAt) return;
    api.patch(`/notifications/${n.id}/read`).then(refresh).catch(() => {}); // never block navigation on a receipt
  };

  const markAll = async () => {
    if (markingAll || unread === 0) return; // M5 — one submission at a time
    setMarkingAll(true);
    try {
      await api.patch("/notifications/read-all");
      await refresh();
    } finally {
      setMarkingAll(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={ICON_BTN}
      >
        <Bell size={19} className="text-[#5B6B7D]" aria-hidden="true" />
        {unread > 0 && (
          <span data-testid="notif-badge" className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-[#9B2C2C] text-[#FBF7F0] text-[9px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[90] bg-[#0A2540]/40 md:bg-transparent" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label="Notifications"
            className="fixed inset-x-0 bottom-0 z-[100] max-h-[80vh] flex flex-col rounded-t-xl bg-white shadow-[0_-12px_40px_rgba(10,37,64,0.18)] focus:outline-none md:absolute md:inset-x-auto md:bottom-auto md:right-0 md:top-12 md:w-96 md:max-h-[70vh] md:rounded-lg md:border md:border-[#EFE6D3] md:shadow-[0_12px_40px_rgba(10,37,64,0.15)]"
          >
            <div className="flex items-center justify-between gap-2 px-3 py-1 border-b border-[#EFE6D3]">
              <span className="text-[13px] font-bold text-[#0A2540]">Notifications</span>
              <div className="flex items-center">
                <button
                  type="button"
                  onClick={markAll}
                  disabled={markingAll || unread === 0}
                  title={unread === 0 ? "Nothing unread" : "Mark every notification read"}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 text-[12px] font-semibold text-[#854F0B] transition-colors duration-150 motion-reduce:transition-none hover:bg-[#FAEEDA] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517] disabled:cursor-not-allowed disabled:text-[#5B6B7D] disabled:hover:bg-transparent"
                >
                  <CheckCheck size={14} aria-hidden="true" /> {markingAll ? "Marking..." : "Mark all read"}
                </button>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close notifications" className={ICON_BTN}>
                  <X size={16} className="text-[#5B6B7D]" aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto">
              {isLoading ? (
                <div role="status" aria-label="Loading notifications" className="space-y-2 p-3">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 rounded bg-[#F5EEE0] animate-pulse motion-reduce:animate-none" />
                  ))}
                </div>
              ) : isError ? (
                <div role="alert" className="px-3 py-6 text-center text-xs text-[#9B2C2C]">
                  Notifications could not be loaded.
                  <button type="button" onClick={() => refetch()} className="ml-1 inline-flex min-h-[44px] items-center gap-1 font-semibold underline underline-offset-2">
                    <RefreshCw size={12} aria-hidden="true" /> Try again
                  </button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-3 py-8 text-center">
                  <div className="text-xs font-semibold text-[#0A2540]">No notifications yet</div>
                  <div className="mt-1 text-[11px] text-[#5B6B7D]">Tender offers, load updates and payment news will show up here.</div>
                </div>
              ) : (
                <ul>
                  {notifications.map((n) => {
                    const href = resolveNotificationHref(n.actionUrl, "/carrier");
                    const body = (
                      <span className="flex gap-2">
                        <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-[#BA7517]"}`} />
                        <span className="min-w-0">
                          {n.title && <span className="block text-xs font-semibold text-[#0A2540]">{n.title}</span>}
                          <span className="block text-xs text-[#3A4A5F] leading-snug break-words">{n.message}</span>
                          <span className="block text-[11px] text-[#5B6B7D] mt-1">
                            {timeAgo(n.createdAt)}
                            {!n.readAt && <span className="sr-only">, unread</span>}
                          </span>
                        </span>
                      </span>
                    );
                    const cls = `w-full text-left px-3 py-2.5 min-h-[44px] border-b border-[#F5EEE0] transition-colors duration-150 motion-reduce:transition-none hover:bg-[#FBF7F0] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#BA7517] ${n.readAt ? "" : "bg-[#FAEEDA]/40"}`;
                    return (
                      <li key={n.id}>
                        {href ? (
                          <button type="button" className={`${cls} cursor-pointer`} onClick={() => { markRead(n); setOpen(false); router.push(href); }}>
                            {body}
                          </button>
                        ) : (
                          // No safe target: the row marks itself read and goes nowhere, and says so.
                          <button type="button" className={`${cls} cursor-pointer`} onClick={() => markRead(n)} aria-label={`${n.title || n.message}. Mark as read`}>
                            {body}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
