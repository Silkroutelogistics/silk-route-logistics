"use client";

// v3.8.ajj — AE InfoRequest thread panel.
//
// Renders the full info-request history for a carrier in chronological
// order (newest first). Each thread card shows:
//   * status pill (OPEN amber / RESOLVED green / CANCELLED slate)
//   * category eyebrow + AE's original message
//   * createdBy + createdAt
//   * carrier's response (if RESOLVED) + resolvedAt
//   * attachment links (from v3.8.aji — file picker upload landed
//     in /carrier/dashboard/application-status and linked via
//     InfoRequest.attachments inline)
//   * Cancel button on OPEN requests
//
// Replaces the previous AE workflow where the AE found carrier
// responses via the resolved-request email + attachments via the
// separate documents tab. Now both surfaces unify here.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CheckCircle2, Clock, XCircle, Paperclip, ExternalLink, User as UserIcon, MessageCircle, X } from "lucide-react";
import { useState } from "react";

interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  createdAt: string;
}

interface ThreadRequest {
  id: string;
  category: string;
  categoryLabel: string;
  message: string;
  status: "OPEN" | "RESOLVED" | "CANCELLED";
  resolvedNote: string | null;
  resolvedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  createdBy: { id: string; firstName: string; lastName: string; email: string };
  cancelledBy: { id: string; firstName: string; lastName: string } | null;
  attachments: Attachment[];
}

const STATUS_META: Record<ThreadRequest["status"], { label: string; bg: string; text: string; icon: React.ReactNode }> = {
  OPEN: {
    label: "Open",
    bg: "bg-[#FBEFD4]",
    text: "text-[#B07A1A]",
    icon: <Clock size={11} className="text-[#B07A1A]" />,
  },
  RESOLVED: {
    label: "Resolved",
    bg: "bg-[#E6F0E9]",
    text: "text-[#2F7A4F]",
    icon: <CheckCircle2 size={11} className="text-[#2F7A4F]" />,
  },
  CANCELLED: {
    label: "Cancelled",
    bg: "bg-gray-200",
    text: "text-gray-600",
    icon: <XCircle size={11} className="text-gray-600" />,
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function InfoRequestThread({ carrierId, isAdmin }: { carrierId: string; isAdmin: boolean }) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["info-requests", carrierId],
    queryFn: () => api.get<{ requests: ThreadRequest[] }>(`/info-requests?carrierId=${carrierId}`).then((r) => r.data),
    enabled: !!carrierId,
  });

  if (isLoading) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-gray-500 animate-pulse">Loading info-request thread…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 text-center">
        <p className="text-sm text-red-500">Couldn&apos;t load info-request thread.</p>
      </div>
    );
  }

  const requests = data?.requests || [];

  if (requests.length === 0) {
    return (
      <div className="p-6 text-center">
        <MessageCircle size={32} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-700">No info requests yet</p>
        <p className="text-xs text-gray-500 mt-1">Use the &ldquo;Request Info&rdquo; button above to ask this carrier for additional documents or clarification.</p>
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{requests.length} request{requests.length === 1 ? "" : "s"}</p>
        <p className="text-[11px] text-gray-400">Newest first</p>
      </div>
      {requests.map((req) => (
        <ThreadCard
          key={req.id}
          request={req}
          isAdmin={isAdmin}
          onCancelled={() => {
            queryClient.invalidateQueries({ queryKey: ["info-requests", carrierId] });
            queryClient.invalidateQueries({ queryKey: ["carriers"] });
          }}
        />
      ))}
    </div>
  );
}

function ThreadCard({ request, isAdmin, onCancelled }: { request: ThreadRequest; isAdmin: boolean; onCancelled: () => void }) {
  const meta = STATUS_META[request.status];
  const [cancelError, setCancelError] = useState<string | null>(null);

  const cancelMutation = useMutation({
    mutationFn: () => api.patch(`/info-requests/${request.id}/cancel`),
    onSuccess: () => {
      setCancelError(null);
      onCancelled();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setCancelError(err.response?.data?.error || "Could not cancel request");
    },
  });

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${meta.bg} ${meta.text} text-[10px] font-semibold`}>
            {meta.icon} {meta.label}
          </span>
          <span className="text-xs font-semibold text-gray-900 truncate">{request.categoryLabel}</span>
        </div>
        <span className="text-[10px] text-gray-400 shrink-0">{formatDate(request.createdAt)}</span>
      </div>

      {/* AE message */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-400 uppercase tracking-wider mb-1">
          <UserIcon size={10} />
          {request.createdBy.firstName} {request.createdBy.lastName}
        </div>
        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{request.message}</p>
      </div>

      {/* Carrier response (RESOLVED only) */}
      {request.status === "RESOLVED" && request.resolvedNote && (
        <div className="px-3 py-2.5 bg-[#E6F0E9]/30 border-t border-[#2F7A4F]/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#2F7A4F] uppercase tracking-wider font-semibold">Carrier response</span>
            <span className="text-[10px] text-gray-400">{formatDate(request.resolvedAt)}</span>
          </div>
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{request.resolvedNote}</p>

          {request.attachments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {request.attachments.map((att) => (
                <li key={att.id} className="flex items-center gap-1.5 text-[11px]">
                  <Paperclip size={10} className="text-[#BA7517] flex-shrink-0" />
                  <a
                    href={att.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#BA7517] hover:underline truncate"
                  >
                    {att.fileName}
                  </a>
                  <span className="text-gray-400 flex-shrink-0">· {formatBytes(att.fileSize)}</span>
                  <ExternalLink size={9} className="text-gray-400 flex-shrink-0" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Cancelled metadata */}
      {request.status === "CANCELLED" && (
        <div className="px-3 py-2 bg-gray-100 border-t border-gray-200">
          <p className="text-[10px] text-gray-500">
            Cancelled {formatDate(request.cancelledAt)}
            {request.cancelledBy && <> by {request.cancelledBy.firstName} {request.cancelledBy.lastName}</>}
          </p>
        </div>
      )}

      {/* Cancel button on OPEN requests */}
      {request.status === "OPEN" && isAdmin && (
        <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-end">
          {cancelError && (
            <p className="text-[10px] text-red-500 mr-2">{cancelError}</p>
          )}
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold text-gray-600 hover:text-red-600 disabled:opacity-50"
          >
            <X size={10} />
            {cancelMutation.isPending ? "Cancelling…" : "Cancel Request"}
          </button>
        </div>
      )}
    </div>
  );
}
