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

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";
import { Logo } from "@/components/ui/Logo";
import { Clock, CheckCircle2, AlertCircle, XCircle, Mail, Phone } from "lucide-react";

interface StatusResponse {
  user: { id: string; email: string; firstName: string; lastName: string; company: string | null };
  carrier: { id: string; companyName: string | null; mcNumber: string | null; dotNumber: string | null };
  onboardingStatus: "PENDING" | "REVIEWING" | "INFO_REQUESTED" | "APPROVED" | "REJECTED" | "SUSPENDED";
  submittedAt: string;
  approvedAt: string | null;
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

  const { data, isLoading, isError } = useQuery({
    queryKey: ["carrier-application-status"],
    queryFn: () => api.get<StatusResponse>("/carrier-auth/application-status").then((r) => r.data),
    enabled: !!user,
    refetchInterval: 60_000, // 60s — pick up status flips without page reload
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

      {/* State-specific content */}
      <div className="mt-6 bg-white border border-[rgba(10,37,64,0.10)] rounded-xl p-6 sm:p-8 shadow-[0_1px_2px_rgba(10,37,64,0.06)]">
        {data.onboardingStatus === "PENDING" && <PendingSection />}
        {data.onboardingStatus === "REVIEWING" && <ReviewingSection />}
        {data.onboardingStatus === "INFO_REQUESTED" && <InfoRequestedSection />}
        {data.onboardingStatus === "REJECTED" && <RejectedSection />}
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

function InfoRequestedSection() {
  // v3.8.aje wires the actual InfoRequest list + resolve form here.
  // For v3.8.ajd we show defensive copy explaining the state.
  return (
    <div>
      <h2 className="text-lg font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
        We need a little more from you
      </h2>
      <p className="text-sm text-[#3A4A5F] leading-relaxed">
        Our compliance team has requested additional information to complete your application. Please check the email we
        sent you for specifics, and reply with the requested documents or details. Once we have what we need, your
        application returns to active review.
      </p>
      <div className="mt-5 bg-[#FBEFD4] border border-[rgba(176,122,26,0.20)] rounded-lg p-4">
        <p className="text-xs text-[#B07A1A] leading-relaxed">
          <strong className="font-semibold">In-app request resolution is coming soon.</strong> For now, please reply
          directly to the compliance email or write to{" "}
          <a href="mailto:compliance@silkroutelogistics.ai" className="font-semibold hover:underline">
            compliance@silkroutelogistics.ai
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function RejectedSection() {
  // v3.8.aje wires rejection reason + reapplyEligibleAt + reapply CTA here.
  // For v3.8.ajd we show defensive copy.
  return (
    <div>
      <h2 className="text-lg font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
        Application closed
      </h2>
      <p className="text-sm text-[#3A4A5F] leading-relaxed">
        Your application wasn&apos;t approved at this time. Our compliance team should have emailed you with the specific
        reason and, where applicable, a date when you can reapply. If you didn&apos;t receive that email or believe the
        decision was made in error, please reach out to our compliance team directly.
      </p>
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
