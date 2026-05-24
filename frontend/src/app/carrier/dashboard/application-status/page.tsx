"use client";

// v3.8.ajd Sprint 1 — Carrier application status page.
// Renders state-specific content for non-APPROVED carriers who logged in.
// The carrier dashboard layout (carrier/dashboard/layout.tsx) routes any
// non-APPROVED carrier here and routes APPROVED carriers OFF this page;
// this page therefore renders for PENDING / REVIEWING / INFO_REQUESTED /
// REJECTED states. SUSPENDED never reaches here — login is blocked at
// the OTP/TOTP gates in backend/src/routes/carrierAuth.ts.
//
// State sections wire in incrementally:
//   * v3.8.ajd (this commit): PENDING + REVIEWING + APPROVED-defensive
//     read-only display. REJECTED + INFO_REQUESTED render placeholder
//     "waiting for v3.8.aje" copy.
//   * v3.8.aje: INFO_REQUESTED open requests list + carrier-resolve form,
//     REJECTED reason + reapply-eligible date + reapply CTA.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";
import { Logo } from "@/components/ui/Logo";
import { Clock, CheckCircle2, AlertCircle, XCircle, Mail, Phone, MailCheck, RefreshCw, Paperclip, X as XIcon } from "lucide-react";

interface StatusResponse {
  user: { id: string; email: string; firstName: string; lastName: string; company: string | null };
  carrier: { id: string; companyName: string | null; mcNumber: string | null; dotNumber: string | null };
  onboardingStatus: "PENDING" | "REVIEWING" | "INFO_REQUESTED" | "APPROVED" | "REJECTED" | "SUSPENDED";
  submittedAt: string;
  approvedAt: string | null;
  emailVerifiedAt: string | null; // v3.8.aje
  // v3.8.ajk — Rejection fields surfaced on RejectedSection.
  rejectionReason: string | null;
  rejectedAt: string | null;
  rejectionNote: string | null;
  reapplyEligibleAt: string | null;
}

// Brand-canonical status palette per CLAUDE.md §2.1.
const STATUS_META: Record<
  StatusResponse["onboardingStatus"],
  { label: string; tagBg: string; tagText: string; icon: React.ReactNode }
> = {
  PENDING: {
    label: "Application Received",
    tagBg: "bg-[#FBEFD4]",
    tagText: "text-[#B07A1A]",
    icon: <Clock size={18} className="text-[#B07A1A]" />,
  },
  REVIEWING: {
    label: "Under Review",
    tagBg: "bg-[#E2EAF2]",
    tagText: "text-[#2A5B8B]",
    icon: <Clock size={18} className="text-[#2A5B8B]" />,
  },
  INFO_REQUESTED: {
    label: "Additional Info Requested",
    tagBg: "bg-[#FBEFD4]",
    tagText: "text-[#B07A1A]",
    icon: <AlertCircle size={18} className="text-[#B07A1A]" />,
  },
  APPROVED: {
    label: "Approved",
    tagBg: "bg-[#E6F0E9]",
    tagText: "text-[#2F7A4F]",
    icon: <CheckCircle2 size={18} className="text-[#2F7A4F]" />,
  },
  REJECTED: {
    label: "Application Closed",
    tagBg: "bg-[#F6E3E3]",
    tagText: "text-[#9B2C2C]",
    icon: <XCircle size={18} className="text-[#9B2C2C]" />,
  },
  SUSPENDED: {
    label: "Account Suspended",
    tagBg: "bg-[#F6E3E3]",
    tagText: "text-[#9B2C2C]",
    icon: <XCircle size={18} className="text-[#9B2C2C]" />,
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return "—";
  }
}

export default function ApplicationStatusPage() {
  const { user } = useCarrierAuth();
  const queryClient = useQueryClient();
  const [resendMessage, setResendMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["carrier-application-status"],
    queryFn: () => api.get<StatusResponse>("/carrier-auth/application-status").then((r) => r.data),
    enabled: !!user,
    refetchInterval: 60_000, // 60s — pick up status flips without page reload
  });

  // v3.8.aje — Resend verification email mutation. 60s cooldown enforced
  // server-side at otpService.ts — frontend surfaces the 429 message
  // verbatim (which includes the countdown in seconds).
  const resendMutation = useMutation({
    mutationFn: () => api.post("/carrier-auth/resend-verification"),
    onSuccess: () => {
      setResendMessage({ kind: "success", text: `Verification email sent to ${data?.user.email}. Check your inbox.` });
      queryClient.invalidateQueries({ queryKey: ["carrier-application-status"] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setResendMessage({ kind: "error", text: err.response?.data?.error || "Could not send verification email. Please try again in a moment." });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center">
        <Logo size="md" />
        <p className="mt-4 text-sm text-[#6B7685] animate-pulse">Loading your application status…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center">
        <p className="text-sm text-[#9B2C2C]">We couldn&apos;t load your application status right now. Please try again in a moment.</p>
      </div>
    );
  }

  const meta = STATUS_META[data.onboardingStatus];
  const submittedDisplay = formatDate(data.submittedAt);

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 sm:px-6">
      {/* Header card */}
      <div className="bg-white border border-[rgba(10,37,64,0.10)] rounded-xl p-6 sm:p-8 shadow-[0_1px_2px_rgba(10,37,64,0.06)]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-[#BA7517] uppercase mb-1">Caravan Partner Program</p>
            <h1 className="text-2xl font-bold text-[#0A2540]" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
              Application Status
            </h1>
            <p className="mt-1 text-sm text-[#3A4A5F]">
              {data.carrier.companyName || data.user.company || "Your carrier application"}
              {data.carrier.mcNumber && (
                <span className="text-[#6B7685]"> · MC# {data.carrier.mcNumber.replace(/^MC-?/i, "")}</span>
              )}
              {data.carrier.dotNumber && (
                <span className="text-[#6B7685]"> · DOT# {data.carrier.dotNumber}</span>
              )}
            </p>
          </div>
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${meta.tagBg}`}>
            {meta.icon}
            <span className={`text-xs font-semibold ${meta.tagText}`}>{meta.label}</span>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-[rgba(10,37,64,0.10)]">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7685]">Submitted</dt>
              <dd className="mt-1 text-[#0A2540] font-medium">{submittedDisplay}</dd>
            </div>
            {data.approvedAt && (
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-[#6B7685]">Approved</dt>
                <dd className="mt-1 text-[#0A2540] font-medium">{formatDate(data.approvedAt)}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* v3.8.aje — Email verification banner.
          Renders above the state-specific content when emailVerifiedAt is
          null. Contains a Resend Verification button (60s cooldown enforced
          server-side; the 429 message includes the countdown verbatim).
          Banner disappears the moment the carrier clicks the email link
          and the 60-second polling refetches. */}
      {!data.emailVerifiedAt && (
        <div className="mt-6 bg-[#FBEFD4] border border-[rgba(176,122,26,0.30)] rounded-xl p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-[#FBF7F0] flex items-center justify-center flex-shrink-0">
              <MailCheck size={20} className="text-[#B07A1A]" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-sm font-bold text-[#0A2540] mb-1">Verify your email to continue</h2>
              <p className="text-xs text-[#3A4A5F] leading-relaxed">
                We sent a verification link to <strong className="font-semibold">{data.user.email}</strong>. Please click the link in that email to confirm this is your address. Your application stays in queue until your email is verified.
              </p>
              {resendMessage && (
                <p className={`mt-2 text-xs font-medium ${resendMessage.kind === "success" ? "text-[#2F7A4F]" : "text-[#9B2C2C]"}`}>
                  {resendMessage.text}
                </p>
              )}
              <button
                onClick={() => { setResendMessage(null); resendMutation.mutate(); }}
                disabled={resendMutation.isPending}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#BA7517] text-[#FBF7F0] rounded-md text-xs font-semibold hover:bg-[#854F0B] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {resendMutation.isPending ? (
                  <>
                    <RefreshCw size={12} className="animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Mail size={12} />
                    Resend verification email
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* State-specific content */}
      <div className="mt-6 bg-white border border-[rgba(10,37,64,0.10)] rounded-xl p-6 sm:p-8 shadow-[0_1px_2px_rgba(10,37,64,0.06)]">
        {data.onboardingStatus === "PENDING" && <PendingSection />}
        {data.onboardingStatus === "REVIEWING" && <ReviewingSection />}
        {data.onboardingStatus === "INFO_REQUESTED" && <InfoRequestedSection />}
        {data.onboardingStatus === "REJECTED" && <RejectedSection data={data} />}
        {data.onboardingStatus === "APPROVED" && <ApprovedSection />}
      </div>

      {/* Footer contact card */}
      <div className="mt-6 bg-[#F5EEE0] border border-[rgba(10,37,64,0.10)] rounded-xl p-5 sm:p-6">
        <h2 className="text-sm font-bold text-[#0A2540] mb-2">Need to reach us?</h2>
        <p className="text-xs text-[#3A4A5F] mb-3">
          Our compliance team handles every application personally. We respond within one business day.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 text-xs">
          <a href="mailto:compliance@silkroutelogistics.ai" className="inline-flex items-center gap-1.5 text-[#BA7517] hover:underline font-medium">
            <Mail size={13} />
            compliance@silkroutelogistics.ai
          </a>
          <a href="tel:+12692206760" className="inline-flex items-center gap-1.5 text-[#BA7517] hover:underline font-medium">
            <Phone size={13} />
            (269) 220-6760
          </a>
        </div>
      </div>
    </div>
  );
}

function PendingSection() {
  return (
    <div>
      <h2 className="text-lg font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
        Your application is in the queue
      </h2>
      <p className="text-sm text-[#3A4A5F] leading-relaxed">
        We received your application and it&apos;s queued for our compliance team. Most applications are picked up within one
        business day. You&apos;ll receive an email when a compliance reviewer begins your review — and another email when
        we approve you or need additional information.
      </p>
      <div className="mt-5 bg-[#FBF7F0] border border-[rgba(186,117,23,0.20)] rounded-lg p-4">
        <p className="text-xs font-semibold text-[#0A2540] mb-1">What happens next</p>
        <ol className="text-xs text-[#3A4A5F] space-y-1.5 list-decimal list-inside">
          <li>Compliance reviewer opens your application (status changes to &ldquo;Under Review&rdquo;).</li>
          <li>FMCSA authority, insurance, and identity checks complete automatically.</li>
          <li>You&apos;re approved to operate — or we email you for additional details.</li>
        </ol>
      </div>
    </div>
  );
}

function ReviewingSection() {
  return (
    <div>
      <h2 className="text-lg font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
        A reviewer is on your application
      </h2>
      <p className="text-sm text-[#3A4A5F] leading-relaxed">
        Your application is being actively reviewed. We&apos;re verifying your FMCSA authority, insurance certificates, and
        identity. If everything clears, you&apos;ll be approved and onboarded onto the Caravan Partner Program. If we need
        anything additional, you&apos;ll receive an email with specifics — please respond on this page when you do.
      </p>
      <div className="mt-5 bg-[#E2EAF2] border border-[rgba(42,91,139,0.20)] rounded-lg p-4">
        <p className="text-xs text-[#2A5B8B] leading-relaxed">
          <strong className="font-semibold">No action needed right now.</strong> Most reviews complete within a few business
          days. Check back here for updates or watch your email.
        </p>
      </div>
    </div>
  );
}

interface InfoRequest {
  id: string;
  category: string;
  categoryLabel: string;
  message: string;
  createdAt: string;
}

function InfoRequestedSection() {
  // v3.8.ajh — Real InfoRequest workflow.
  // Lists all OPEN requests with per-request resolve forms. Each carrier
  // response POSTs to /carrier-auth/info-requests/:id/resolve which:
  //   (a) records the resolvedNote + flips status to RESOLVED
  //   (b) auto-flips onboardingStatus INFO_REQUESTED → REVIEWING when this
  //       was the last open request (the parent status query refetches
  //       every 60s + on mutation success, so the section re-renders
  //       into the REVIEWING state automatically without page reload)
  //   (c) emails the AE who created the request with the response
  const queryClient = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["carrier-info-requests"],
    queryFn: () => api.get<{ requests: InfoRequest[] }>("/carrier-auth/info-requests").then((r) => r.data),
    refetchInterval: 60_000,
  });

  return (
    <div>
      <h2 className="text-lg font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
        We need a little more from you
      </h2>
      <p className="text-sm text-[#3A4A5F] leading-relaxed">
        Our compliance team has requested additional information to complete your application. Respond to each item below.
        Once you respond to all open requests, your application returns to active review.
      </p>

      {isLoading && (
        <div className="mt-5 text-center py-6">
          <p className="text-sm text-[#6B7685] animate-pulse">Loading your open requests…</p>
        </div>
      )}

      {isError && (
        <div className="mt-5 bg-[#F6E3E3] border border-[#9B2C2C]/40 rounded-lg p-4">
          <p className="text-xs text-[#9B2C2C]">
            We couldn&apos;t load your open requests right now. Please refresh the page in a moment, or email{" "}
            <a href="mailto:compliance@silkroutelogistics.ai" className="font-semibold hover:underline">
              compliance@silkroutelogistics.ai
            </a>
            .
          </p>
        </div>
      )}

      {data && data.requests.length === 0 && (
        <div className="mt-5 bg-[#E6F0E9] border border-[#2F7A4F]/40 rounded-lg p-4">
          <p className="text-xs text-[#2F7A4F]">
            <strong className="font-semibold">All caught up.</strong> You&apos;ve responded to every open request. Your
            application is back in active review — we&apos;ll email you when the status changes.
          </p>
        </div>
      )}

      {data && data.requests.length > 0 && (
        <div className="mt-5 space-y-4">
          {data.requests.map((request) => (
            <InfoRequestCard
              key={request.id}
              request={request}
              onResolved={() => {
                queryClient.invalidateQueries({ queryKey: ["carrier-info-requests"] });
                queryClient.invalidateQueries({ queryKey: ["carrier-application-status"] });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function InfoRequestCard({ request, onResolved }: { request: InfoRequest; onResolved: () => void }) {
  const [resolvedNote, setResolvedNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // v3.8.aji — Staged file attachments. Max 5 files, max 25MB each
  // (matches backend MAX_FILE_SIZE default), MIME-validated client-side
  // against the same set the multer fileFilter accepts on the backend.
  const [files, setFiles] = useState<File[]>([]);

  const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25MB
  const MAX_FILES = 5;

  function addFiles(incoming: FileList | File[]) {
    const list = Array.from(incoming);
    const errors: string[] = [];
    const ok: File[] = [];
    for (const f of list) {
      if (files.length + ok.length >= MAX_FILES) {
        errors.push(`Maximum ${MAX_FILES} files per response`);
        break;
      }
      if (!ALLOWED_TYPES.includes(f.type)) {
        errors.push(`${f.name}: only PDF, JPEG, PNG, DOC, DOCX allowed`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        errors.push(`${f.name}: file exceeds 25MB`);
        continue;
      }
      ok.push(f);
    }
    if (errors.length > 0) setError(errors.join(" · "));
    else setError(null);
    setFiles((prev) => [...prev, ...ok]);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  const mutation = useMutation({
    mutationFn: () => {
      // v3.8.aji — Multipart body for the upgraded endpoint. axios sets
      // Content-Type to multipart/form-data automatically when a FormData
      // object is passed.
      const fd = new FormData();
      fd.append("resolvedNote", resolvedNote);
      for (const f of files) {
        fd.append("files", f, f.name);
      }
      return api.post(`/carrier-auth/info-requests/${request.id}/resolve`, fd);
    },
    onSuccess: () => {
      setError(null);
      setResolvedNote("");
      setFiles([]);
      onResolved();
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setError(err.response?.data?.error || "Could not send your response. Please try again.");
    },
  });

  const canSubmit = resolvedNote.trim().length >= 1 && !mutation.isPending;

  function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  return (
    <div className="bg-[#FBF7F0] border border-[rgba(176,122,26,0.30)] rounded-lg p-4">
      <p className="text-[11px] font-semibold tracking-widest text-[#BA7517] uppercase mb-1">{request.categoryLabel}</p>
      <p className="text-sm text-[#0A2540] leading-relaxed mb-3 whitespace-pre-wrap">{request.message}</p>
      <p className="text-[11px] text-[#6B7685] mb-3">
        Requested {formatDate(request.createdAt)}
      </p>

      <div className="bg-white border border-[#EFE6D3] rounded-md p-3">
        <label className="block text-xs font-semibold text-[#3A4A5F] uppercase tracking-wider mb-1.5">
          Your response
        </label>
        <textarea
          value={resolvedNote}
          onChange={(e) => { setResolvedNote(e.target.value); if (error) setError(null); }}
          rows={4}
          maxLength={5000}
          placeholder="Type your response here. Attach any supporting documents below."
          className="w-full px-3 py-2 bg-white border border-[#EFE6D3] rounded text-sm text-[#0A2540] focus:outline-none focus:border-[#BA7517] resize-y"
        />
        <p className="mt-1 text-[11px] text-[#6B7685]">{resolvedNote.length}/5000</p>

        {/* v3.8.aji — File attachments. Up to 5 files, 25MB each.
            Same MIME set the backend multer fileFilter accepts. */}
        <div className="mt-3">
          <label className="block text-xs font-semibold text-[#3A4A5F] uppercase tracking-wider mb-1.5">
            Attach documents <span className="font-normal normal-case text-[#6B7685]">(optional, up to {MAX_FILES} files, 25 MB each)</span>
          </label>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FBF7F0] border border-[#EFE6D3] rounded-md text-xs font-semibold text-[#BA7517] hover:bg-[#F5EEE0] cursor-pointer">
              <Paperclip size={12} />
              Choose files
              <input
                type="file"
                multiple
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,application/pdf,image/jpeg,image/png,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
                className="hidden"
                disabled={mutation.isPending || files.length >= MAX_FILES}
              />
            </label>
            <span className="text-[11px] text-[#6B7685]">PDF, JPG, PNG, DOC, DOCX</span>
          </div>

          {files.length > 0 && (
            <ul className="mt-2 space-y-1">
              {files.map((f, idx) => (
                <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2 px-2 py-1.5 bg-[#FBF7F0] border border-[#EFE6D3] rounded-md text-xs">
                  <span className="flex items-center gap-1.5 min-w-0 flex-1">
                    <Paperclip size={11} className="text-[#BA7517] flex-shrink-0" />
                    <span className="text-[#0A2540] truncate">{f.name}</span>
                    <span className="text-[#6B7685] flex-shrink-0">· {formatBytes(f.size)}</span>
                  </span>
                  <button
                    onClick={() => removeFile(idx)}
                    disabled={mutation.isPending}
                    className="text-[#6B7685] hover:text-[#9B2C2C] disabled:opacity-50"
                    aria-label={`Remove ${f.name}`}
                  >
                    <XIcon size={12} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex items-center justify-end">
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="px-4 py-1.5 bg-[#BA7517] text-[#FBF7F0] rounded-md text-xs font-semibold hover:bg-[#854F0B] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {mutation.isPending ? (
              <>
                <RefreshCw size={11} className="animate-spin" />
                Sending…
              </>
            ) : (
              "Send Response"
            )}
          </button>
        </div>

        {error && (
          <p className="mt-2 text-[11px] text-[#9B2C2C]">{error}</p>
        )}
      </div>
    </div>
  );
}

// v3.8.ajk — Real RejectedSection. Renders reason + AE note + reapply
// date countdown + reapply CTA when eligibility passes. Permanent
// rejections (FRAUD_DETECTED / IDENTITY_FRAUD per backend service) have
// null reapplyEligibleAt → show "decision is final" copy without CTA.
const REJECTION_REASON_LABELS: Record<string, string> = {
  MISSING_DOCUMENTS: "Missing required documents",
  EXPIRED_INSURANCE: "Insurance coverage expired or insufficient",
  AUTHORITY_NOT_ACTIVE: "FMCSA operating authority not active",
  SAFETY_RATING_UNSATISFACTORY: "Safety rating unsatisfactory",
  COMPLIANCE_VIOLATION: "Compliance violation",
  FRAUD_DETECTED: "Application could not be approved",
  IDENTITY_FRAUD: "Identity verification could not be completed",
  DUPLICATE_APPLICATION: "Duplicate application detected",
  OTHER: "Other",
};

function RejectedSection({ data }: { data: StatusResponse }) {
  const reasonLabel = data.rejectionReason ? (REJECTION_REASON_LABELS[data.rejectionReason] || data.rejectionReason) : null;

  // Reapply eligibility logic: null → permanent; future date → not yet
  // eligible (show countdown); past/now → reapply CTA active.
  const reapplyDate = data.reapplyEligibleAt ? new Date(data.reapplyEligibleAt) : null;
  const now = new Date();
  const isPermanent = !reapplyDate;
  const isEligibleNow = reapplyDate && reapplyDate <= now;
  const daysUntilReapply = reapplyDate && reapplyDate > now
    ? Math.ceil((reapplyDate.getTime() - now.getTime()) / 86400000)
    : 0;

  return (
    <div>
      <h2 className="text-lg font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
        Application closed
      </h2>
      <p className="text-sm text-[#3A4A5F] leading-relaxed">
        After review, we were unable to approve your carrier application at this time.
      </p>

      {reasonLabel && (
        <div className="mt-4 bg-[#F6E3E3] border border-[#9B2C2C]/30 rounded-lg p-4">
          <p className="text-[11px] font-semibold tracking-widest text-[#9B2C2C] uppercase mb-1">Reason</p>
          <p className="text-sm font-semibold text-[#0A2540]">{reasonLabel}</p>
          {data.rejectionNote && (
            <div className="mt-3 pt-3 border-t border-[#9B2C2C]/15">
              <p className="text-[11px] font-semibold tracking-widest text-[#9B2C2C] uppercase mb-1">Additional context</p>
              <p className="text-sm text-[#3A4A5F] leading-relaxed whitespace-pre-wrap">{data.rejectionNote}</p>
            </div>
          )}
        </div>
      )}

      {!reasonLabel && (
        <div className="mt-4 bg-[#FBEFD4] border border-[#B07A1A]/30 rounded-lg p-4">
          <p className="text-xs text-[#B07A1A]">
            No reason was recorded with this decision. Please contact our compliance team for clarification.
          </p>
        </div>
      )}

      {isPermanent && (
        <div className="mt-4 bg-[#FBF7F0] border border-[#EFE6D3] rounded-lg p-4">
          <p className="text-sm text-[#3A4A5F]">
            This decision is final. If you believe it was made in error, contact our compliance team directly.
          </p>
        </div>
      )}

      {!isPermanent && reapplyDate && !isEligibleNow && (
        <div className="mt-4 bg-[#FBF7F0] border border-[#EFE6D3] rounded-lg p-4">
          <p className="text-[11px] font-semibold tracking-widest text-[#BA7517] uppercase mb-1">Reapply eligibility</p>
          <p className="text-sm text-[#0A2540]">
            You can reapply after <strong>{reapplyDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</strong>
            <span className="text-[#6B7685]"> ({daysUntilReapply} day{daysUntilReapply === 1 ? "" : "s"} from now)</span>.
          </p>
          <p className="mt-2 text-xs text-[#6B7685]">
            We&apos;ll send you a reminder email when you&apos;re eligible to reapply.
          </p>
        </div>
      )}

      {!isPermanent && isEligibleNow && (
        <div className="mt-4 bg-[#E6F0E9] border border-[#2F7A4F]/30 rounded-lg p-4">
          <p className="text-[11px] font-semibold tracking-widest text-[#2F7A4F] uppercase mb-1">Eligible to reapply</p>
          <p className="text-sm text-[#0A2540] mb-3">
            Your reapply window opened on <strong>{reapplyDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</strong>. Start a new application below.
          </p>
          <a
            href="/onboarding"
            className="inline-block bg-[#BA7517] text-[#FBF7F0] px-5 py-2 rounded-md text-sm font-semibold hover:bg-[#854F0B]"
          >
            Start New Application
          </a>
        </div>
      )}
    </div>
  );
}

function ApprovedSection() {
  // Defensive — APPROVED carriers should be routed off this page by the
  // layout, but rendering something sensible avoids a blank panel if a
  // stale browser tab lands here during the redirect cycle.
  return (
    <div>
      <h2 className="text-lg font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
        You&apos;re approved
      </h2>
      <p className="text-sm text-[#3A4A5F] leading-relaxed">
        Welcome to the Caravan Partner Program. You&apos;ll be redirected to your carrier dashboard in a moment.
      </p>
    </div>
  );
}
