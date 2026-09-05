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

import { apiHref } from "@/lib/download";
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

/**
 * The CTA, defined once and rendered in both branches.
 *
 * It used to live ONLY inside the empty-state early return, so it disappeared
 * the moment any row existed — including a request answered and closed weeks
 * ago, which is a state the reported symptom ("it vanishes once a request is
 * open") does not even cover. The button was never count-gated on purpose; it
 * was gated by where it happened to be written.
 *
 * The server has never carried that limit. `info_requests` has no unique
 * constraint, `createInfoRequest` performs no count check, and the two
 * `infoRequest.count` calls in the service are the last-open detectors in
 * resolve and cancel — which exist precisely BECAUSE N concurrent requests are
 * expected. So this was a UI-only limit on a backend built without one.
 *
 * One definition, two call sites, so the empty and non-empty paths cannot drift
 * — which is exactly how the two CTAs drifted in the first place: this one
 * carried an implicit request-count gate that the Profile-tab button never had.
 */
function RequestInfoButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 text-amber-400 rounded-lg text-xs hover:bg-amber-500/30 transition"
    >
      <MessageCircle className="w-3.5 h-3.5" /> Request Info
    </button>
  );
}

/**
 * v3.8.awx — `onRequestInfo` / `canRequestInfo` added so the empty state can own
 * its own call to action.
 *
 * It used to read "Use the 'Request Info' button above", and that button lives
 * inside the Profile tab's `panelTab === "profile"` branch while this component
 * mounts under `panelTab === "info-requests"`. Those are mutually exclusive, so
 * the named control was unmounted 100% of the time the message was on screen —
 * for every role, in every carrier status. "Above" also pointed at nothing: the
 * drawer's tab rail is a LEFT sibling, and the only thing above this panel is the
 * carrier name and a close X.
 *
 * The seven empty states in this codebase that work all own their action; this
 * was the one that delegated to a control in a sibling branch it could not see,
 * so its copy had to describe the button by position and the position it guessed
 * was never true. Passing the opener in fixes the class, not just the sentence.
 */
export function InfoRequestThread({
  carrierId,
  isAdmin,
  onRequestInfo,
  canRequestInfo = true,
}: {
  carrierId: string;
  isAdmin: boolean;
  onRequestInfo?: () => void;
  canRequestInfo?: boolean;
}) {
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

  // Resolved once, above the branch, so both paths ask the identical question.
  // A boolean would not narrow `onRequestInfo` for TypeScript; holding the
  // handler itself does, and it makes the guard un-forgettable at the call site.
  const offerCta = isAdmin && canRequestInfo && onRequestInfo ? onRequestInfo : null;

  if (requests.length === 0) {
    return (
      <div className="p-6 text-center">
        <MessageCircle size={32} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm font-semibold text-gray-700">No info requests yet</p>
        {/* Role-aware, because the endpoint is. POST /info-requests is
            authorize("ADMIN","CEO"), so telling an OPERATIONS or BROKER reader to
            press a button would name a control they could never be shown. The old
            copy was rendered unguarded even though this component already
            receives isAdmin and uses it for Cancel further down. */}
        {offerCta ? (
          <>
            <p className="text-xs text-gray-500 mt-1">Ask this carrier for additional documents or clarification.</p>
            <div className="mt-3">
              <RequestInfoButton onClick={offerCta} />
            </div>
          </>
        ) : isAdmin && !canRequestInfo ? (
          // The status exclusion is a front-end product decision, not a server
          // one — POST /info-requests performs no onboardingStatus check. Say
          // which state is blocking rather than showing a button that is absent
          // for reasons the reader cannot see.
          <p className="text-xs text-gray-500 mt-1">Info requests are available while an application is under review.</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">An admin can request additional documents or clarification from this carrier.</p>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 py-4 space-y-3">
      {/* The CTA sits opposite the count. "Newest first" stays — it is the only
          thing telling the reader why a resolved request can appear above an
          open one, and dropping it to make room would trade one confusion for
          another. */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{requests.length} request{requests.length === 1 ? "" : "s"}</p>
        <div className="flex items-center gap-2 shrink-0">
          <p className="text-[11px] text-gray-400">Newest first</p>
          {offerCta && <RequestInfoButton onClick={offerCta} />}
        </div>
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
          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${meta.bg} ${meta.text} text-[11px] font-semibold`}>
            {meta.icon} {meta.label}
          </span>
          <span className="text-xs font-semibold text-gray-900 truncate">{request.categoryLabel}</span>
        </div>
        <span className="text-[11px] text-gray-400 shrink-0">{formatDate(request.createdAt)}</span>
      </div>

      {/* AE message */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 uppercase tracking-wider mb-1">
          <UserIcon size={10} />
          {request.createdBy.firstName} {request.createdBy.lastName}
        </div>
        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{request.message}</p>
      </div>

      {/* Carrier response (RESOLVED only) */}
      {request.status === "RESOLVED" && request.resolvedNote && (
        <div className="px-3 py-2.5 bg-[#E6F0E9]/30 border-t border-[#2F7A4F]/20">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-[#2F7A4F] uppercase tracking-wider font-semibold">Carrier response</span>
            <span className="text-[11px] text-gray-400">{formatDate(request.resolvedAt)}</span>
          </div>
          <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{request.resolvedNote}</p>

          {request.attachments.length > 0 && (
            <ul className="mt-2 space-y-1">
              {request.attachments.map((att) => (
                <li key={att.id} className="flex items-center gap-1.5 text-[11px]">
                  <Paperclip size={10} className="text-[#BA7517] flex-shrink-0" />
                  <a
                    href={apiHref(`/documents/${att.id}/download`)}
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
          <p className="text-[11px] text-gray-500">
            Cancelled {formatDate(request.cancelledAt)}
            {request.cancelledBy && <> by {request.cancelledBy.firstName} {request.cancelledBy.lastName}</>}
          </p>
        </div>
      )}

      {/* Cancel button on OPEN requests */}
      {request.status === "OPEN" && isAdmin && (
        <div className="px-3 py-2 border-t border-gray-200 flex items-center justify-end">
          {cancelError && (
            <p className="text-[11px] text-red-500 mr-2">{cancelError}</p>
          )}
          <button
            onClick={() => cancelMutation.mutate()}
            disabled={cancelMutation.isPending}
            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-gray-600 hover:text-red-600 disabled:opacity-50"
          >
            <X size={10} />
            {cancelMutation.isPending ? "Cancelling…" : "Cancel Request"}
          </button>
        </div>
      )}
    </div>
  );
}
