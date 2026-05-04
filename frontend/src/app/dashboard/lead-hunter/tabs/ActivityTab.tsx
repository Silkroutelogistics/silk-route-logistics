"use client";

import { useQuery } from "@tanstack/react-query";
import { PhoneCall, Mail, MessageSquare, ArrowRight, Upload, Inbox } from "lucide-react";
import { api } from "@/lib/api";
import type { ActivityEvent } from "../types";

interface Props {
  prospectId: string;
}

const INTENT_LABEL: Record<string, { label: string; cls: string }> = {
  INTERESTED: { label: "Hot", cls: "bg-green-100 text-green-700" },
  NEUTRAL:    { label: "Warm", cls: "bg-amber-100 text-amber-700" },
  OBJECTION:  { label: "Cold", cls: "bg-orange-100 text-orange-700" },
  UNSUBSCRIBE: { label: "Not Interested", cls: "bg-red-100 text-red-700" },
  OUT_OF_OFFICE: { label: "Out of Office", cls: "bg-blue-100 text-blue-700" },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function iconFor(kind: ActivityEvent["kind"]) {
  switch (kind) {
    case "call": return <PhoneCall className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case "email": return <Mail className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case "note": return <MessageSquare className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case "stage_change": return <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />;
    case "import": return <Upload className="w-3.5 h-3.5" strokeWidth={1.75} />;
  }
}

function ringFor(kind: ActivityEvent["kind"]) {
  return {
    call: "bg-blue-50 text-blue-600",
    email: "bg-amber-50 text-amber-600",
    note: "bg-gray-100 text-gray-600",
    stage_change: "bg-green-50 text-green-600",
    import: "bg-[#FAEEDA] text-[#BA7517]",
  }[kind];
}

export function ActivityTab({ prospectId }: Props) {
  const q = useQuery<{ events: (ActivityEvent & { metadata?: { intent?: string } })[] }>({
    queryKey: ["lead-hunter-prospect-feed", prospectId],
    queryFn: () =>
      api
        .get(`/customers/activity-feed?customerId=${prospectId}&limit=100`)
        .then((r) => r.data),
    refetchInterval: 60_000,
  });

  const events = q.data?.events ?? [];
  const visible = events.slice(0, 20);
  const hasMore = events.length > visible.length;

  if (q.isLoading) {
    return <div className="text-sm text-gray-400">Loading activity…</div>;
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-8">
        <Inbox className="w-8 h-8 mx-auto mb-2 text-gray-300" strokeWidth={1.5} />
        <p className="text-sm text-gray-500">No activity yet</p>
        <p className="text-xs text-gray-400 mt-1">Logged calls, emails, and stage changes will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {visible.map((e) => {
        const isInbound = e.kind === "email" && (e.summary?.toLowerCase().includes("re:") || e.actor === "—");
        const intent = (e as any).metadata?.intent || null;
        const intentBadge = intent && INTENT_LABEL[intent];
        return (
          <div key={e.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0">
            <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${ringFor(e.kind)}`}>
              {iconFor(e.kind)}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-medium text-white uppercase tracking-wider">
                  {e.kind === "stage_change" ? "Stage change" :
                   e.kind === "email" && isInbound ? "Reply received" :
                   e.kind === "email" ? "Email sent" :
                   e.kind === "call" ? "Call logged" :
                   e.kind === "note" ? "Note" :
                   e.kind === "import" ? "Imported" : e.kind}
                </span>
                {intentBadge && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${intentBadge.cls}`}>
                    {intentBadge.label}
                  </span>
                )}
                <span className="text-[10px] text-gray-400 ml-auto">{relativeTime(e.timestamp)}</span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">
                {e.summary}
                {e.detail && e.kind === "stage_change" && <span className="text-gray-500"> ({e.detail})</span>}
              </p>
              {e.actor && e.actor !== "—" && (
                <p className="text-[10px] text-gray-400 mt-0.5">by {e.actor}</p>
              )}
            </div>
          </div>
        );
      })}
      {hasMore && (
        <p className="text-center text-xs text-gray-400 pt-2">Showing {visible.length} of {events.length} — full feed in Activity Log tab</p>
      )}
    </div>
  );
}
