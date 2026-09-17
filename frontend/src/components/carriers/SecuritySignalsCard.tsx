"use client";

// v3.8.ajl — Security signals card.
//
// AE-visible surface for the geo-tracking forensics the aje + ajf
// sprints introduced. Renders:
//   * Three-point geo baseline grid (Registration / Email Verify /
//     Last Login) — country code + IP + timestamp per row
//   * Country-mismatch warning when registrationCountry differs from
//     emailVerifiedFromCountry (geoMismatch derived flag)
//   * Recent SystemLog event timeline scoped to this carrier
//     (emailVerification + carrierAuth-unusual-activity sources)
//
// Mounted at the bottom of the existing Compliance tab on
// /dashboard/carriers carrier-detail surface. Adjacent to the
// document-completeness section — natural placement since
// AE checks both during the review pass.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { useStepUp } from "@/hooks/useStepUp";
import { StepUpPrompt } from "@/components/carrier/StepUpPrompt";
import { Globe, AlertTriangle, ShieldCheck, MapPin, Clock, FileText, KeyRound, UserX, Smartphone } from "lucide-react";

interface SecuritySignals {
  geo: {
    registrationCountry: string | null;
    emailVerifiedAt: string | null;
    emailVerifiedFromIp: string | null;
    emailVerifiedFromCountry: string | null;
    lastLoginAt: string | null;
    lastLoginIp: string | null;
    lastLoginCountry: string | null;
    geoMismatch: boolean;
    rawMismatch: boolean;
    overriddenAt: string | null;
    overrideNote: string | null;
  };
  /**
   * auth_events for this address. Recorded since Arc 5 and surfaced for the
   * first time here — every verification, failed login, TOTP failure and reset
   * has been captured all along with its IP, readable only by hand.
   *
   * Keyed by EMAIL, not userId, because the most interesting entries predate
   * the account: onboarding verification happens before a User exists.
   */
  authEvents?: Array<{
    id: string;
    type: string;
    ip: string | null;
    userAgent: string | null;
    createdAt: string;
  }>;
  /** Active carrier-portal sessions. Read-only — revocation stays where it is. */
  sessions?: Array<{
    id: string;
    issuedAt: string;
    lastSeenAt: string;
    rememberMe: boolean;
  }>;
  events: Array<{
    id: string;
    type: "SYSTEM_LOG" | "DOCUMENT_UPLOAD" | "OTP_FAILURE";
    severity: string;
    source: string;
    message: string;
    ipAddress: string | null;
    createdAt: string;
  }>;
  chameleonMatches: Array<{
    id: string;
    matchType: string;
    riskScore: number;
    status: string;
    createdAt: string;
    matchedCarrier: {
      id: string;
      companyName: string | null;
      mcNumber: string | null;
      dotNumber: string | null;
      onboardingStatus: string;
    };
  }>;
  // v3.8.ajy C7 — Active unusual-OTP SMS suppression override (if any).
  // Null when no active override. AE applies via the button below the
  // override card. 24h expiry inherited from Sprint 40 ComplianceOverride.
  unusualOtpSmsOverride: {
    id: string;
    reason: string;
    expiresAt: string;
    createdAt: string;
  } | null;
  // v3.8.bcq — optional: a backend that predates it renders the honest
  // "not reported" state rather than a guess.
  security?: {
    totpEnabled: boolean;
    enrolledAt: string | null;
    lastLogin: { at: string; ip: string | null; city: string | null; region: string | null; country: string | null; flags: string[] } | null;
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  INFO:    { bg: "bg-blue-50", text: "text-blue-700" },
  WARNING: { bg: "bg-amber-50", text: "text-amber-700" },
  ERROR:   { bg: "bg-red-50", text: "text-red-700" },
  CRITICAL:{ bg: "bg-red-100", text: "text-red-800" },
};

export function SecuritySignalsCard({ carrierId, isAdmin }: { carrierId: string; isAdmin?: boolean }) {
  const queryClient = useQueryClient();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideNote, setOverrideNote] = useState("");
  const [overrideError, setOverrideError] = useState<string | null>(null);
  // v3.8.ajy C7 — Inline state for the SMS suppression override action.
  const [smsOverrideOpen, setSmsOverrideOpen] = useState(false);
  const [smsOverrideReason, setSmsOverrideReason] = useState("");
  const [smsOverrideError, setSmsOverrideError] = useState<string | null>(null);
  // v3.8.aud — per-match chameleon review. Item 228.3: the card rendered matches
  // read-only, so they accrued OPEN forever and the count an AE saw never fell.
  // A fraud signal nobody can act on decays into background noise.
  const [reviewOpenId, setReviewOpenId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [reviewError, setReviewError] = useState<string | null>(null);
  // v3.8.bck — admin unenroll (B1c-2). The endpoint (bcj) is the loud door:
  // ADMIN/CEO, a fresh step-up from the admin's OWN authenticator, a reason.
  // This is the only place the AE console can spend that step-up.
  const [mfaResetOpen, setMfaResetOpen] = useState(false);
  const [mfaResetReason, setMfaResetReason] = useState("");
  const [mfaResetError, setMfaResetError] = useState<string | null>(null);
  const [mfaResetDone, setMfaResetDone] = useState<string | null>(null);
  const [mfaResetting, setMfaResetting] = useState(false);
  const stepUp = useStepUp("mfa-reset", { endpoint: "/auth/step-up" });
  async function submitMfaReset() {
    setMfaResetError(null);
    setMfaResetting(true);
    const ok = await stepUp.run((headers) =>
      api.post(`/carriers/${carrierId}/mfa-reset`, { reason: mfaResetReason.trim() }, { headers }).catch((e) => {
        const status = e?.response?.status;
        const code = e?.response?.data?.code;
        if (!(status === 403 && code === "STEP_UP_REQUIRED")) {
          setMfaResetError(
            code === "TOTP_NOT_ENABLED"
              ? "This carrier has no authenticator enrolled — there is nothing to reset."
              : e?.response?.data?.error || "Could not reset the authenticator.",
          );
        }
        throw e;
      }),
    );
    setMfaResetting(false);
    if (ok) {
      setMfaResetOpen(false);
      setMfaResetReason("");
      setMfaResetDone("Authenticator cleared. The carrier will be asked to enrol again at their next sign-in.");
      queryClient.invalidateQueries({ queryKey: ["carrier-security-signals", carrierId] });
    }
  }

  const reviewMutation = useMutation({
    mutationFn: (v: { matchId: string; status: "DISMISSED" | "CONFIRMED_FRAUD" }) =>
      api.put(`/carriers/chameleon-matches/${v.matchId}/review`, { status: v.status, notes: reviewNote }),
    onSuccess: () => {
      setReviewOpenId(null);
      setReviewNote("");
      setReviewError(null);
      queryClient.invalidateQueries({ queryKey: ["carrier-security-signals", carrierId] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setReviewError(err.response?.data?.error || "Could not record the review");
    },
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ["carrier-security-signals", carrierId],
    queryFn: () => api.get<SecuritySignals>(`/carriers/${carrierId}/security-signals`).then((r) => r.data),
    enabled: !!carrierId,
  });

  const overrideMutation = useMutation({
    mutationFn: () => api.post(`/carriers/${carrierId}/override-mismatch`, { note: overrideNote }),
    onSuccess: () => {
      setOverrideOpen(false);
      setOverrideNote("");
      setOverrideError(null);
      queryClient.invalidateQueries({ queryKey: ["carrier-security-signals", carrierId] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setOverrideError(err.response?.data?.error || "Could not override mismatch");
    },
  });

  // v3.8.ajy C7 — Reuses the Sprint 40 ComplianceOverride endpoint with
  // checkCode=UNUSUAL_OTP_SMS_DISABLE. Inherits 24h expiry + 15/30-day
  // per-carrier quota + audit trail. Backend's carrierAuth login handler
  // consults this row before firing the SMS dispatch.
  const smsOverrideMutation = useMutation({
    mutationFn: () =>
      api.post(`/compliance/carrier/${carrierId}/override-block`, {
        reason: smsOverrideReason,
        checkCode: "UNUSUAL_OTP_SMS_DISABLE",
      }),
    onSuccess: () => {
      setSmsOverrideOpen(false);
      setSmsOverrideReason("");
      setSmsOverrideError(null);
      queryClient.invalidateQueries({ queryKey: ["carrier-security-signals", carrierId] });
    },
    onError: (err: { response?: { data?: { error?: string } } }) => {
      setSmsOverrideError(err.response?.data?.error || "Could not apply SMS suppression override");
    },
  });

  if (isLoading) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-500 animate-pulse">Loading security signals…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">Couldn&apos;t load security signals.</p>
      </div>
    );
  }

  const { geo, events, chameleonMatches, unusualOtpSmsOverride } = data;
  const security = data.security ?? null;
  // Default to [] so a backend that predates these fields renders the honest
  // empty state rather than crashing on .length of undefined.
  const authEvents = data.authEvents ?? [];
  const sessions = data.sessions ?? [];
  // The header used to count OPEN + REVIEWED together, so working the queue
  // never moved the number. Open is the only count that should drive urgency.
  const openMatchCount = chameleonMatches.filter((m) => m.status === "OPEN").length;
  const confirmedMatchCount = chameleonMatches.filter((m) => m.status === "CONFIRMED_FRAUD").length;

  return (
    <div className="space-y-3">
      {/* v3.8.ajp — Chameleon match alert. Highest-priority signal —
          renders ABOVE the geo-mismatch since identity-cluster fraud
          is more serious than country-jump. Each match shows the
          matchType (PHONE/EMAIL/ADDRESS/EIN/IP/DOT/MULTI) + risk score
          + matched carrier identity + status. Bordered red for OPEN
          (unreviewed), gray for REVIEWED. */}
      {chameleonMatches.length > 0 && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-3">
          <div className="flex items-start gap-2 mb-2">
            <UserX size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-red-900">
                {openMatchCount > 0
                  ? `${openMatchCount} chameleon match${openMatchCount === 1 ? "" : "es"} awaiting review`
                  : confirmedMatchCount > 0
                    ? `${confirmedMatchCount} confirmed chameleon risk${confirmedMatchCount === 1 ? "" : "s"}`
                    : "Chameleon matches reviewed"}
              </p>
              <p className="text-xs text-red-800 mt-0.5">
                This carrier&apos;s fingerprint overlaps with {chameleonMatches.length === 1 ? "another carrier" : "other carriers"} (phone, email, address, EIN, or IP).
                {openMatchCount > 0 ? " Review each below before approving." : " Confirmed matches stay listed here."}
              </p>
            </div>
          </div>
          <ul className="space-y-1.5 mt-2">
            {chameleonMatches.map((m) => (
              <li key={m.id} className={`rounded-md p-2 text-xs border ${m.status === "CONFIRMED_FRAUD" ? "bg-red-100 border-red-400" : m.status === "OPEN" ? "bg-white border-red-200" : "bg-gray-50 border-gray-200"}`}>
                <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700">
                      {m.matchType}
                    </span>
                    <span className="text-[11px] text-gray-500">risk {m.riskScore}/100</span>
                    {m.status === "OPEN" && (
                      <span className="text-[11px] text-red-600 font-semibold">UNREVIEWED</span>
                    )}
                    {m.status === "CONFIRMED_FRAUD" && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-red-600 text-white">CONFIRMED RISK</span>
                    )}
                    {m.status === "REVIEWED" && (
                      <span className="text-[11px] text-gray-500 font-semibold">REVIEWED</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-700 truncate">
                    Matches <strong>{m.matchedCarrier.companyName || "—"}</strong>
                    {m.matchedCarrier.mcNumber && <span className="text-gray-500"> · MC# {m.matchedCarrier.mcNumber.replace(/^MC-?/i, "")}</span>}
                    <span className="text-gray-500"> · {m.matchedCarrier.onboardingStatus}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="text-[11px] text-gray-400">{formatDate(m.createdAt)}</span>
                  {isAdmin && m.status === "OPEN" && reviewOpenId !== m.id && (
                    <button
                      onClick={() => { setReviewOpenId(m.id); setReviewNote(""); setReviewError(null); }}
                      className="text-[11px] font-semibold text-red-700 hover:text-red-900 underline"
                    >
                      Review
                    </button>
                  )}
                </div>
                </div>
                {reviewOpenId === m.id && (
                  <div className="mt-2 pt-2 border-t border-red-200">
                    <label className="block text-[11px] font-semibold text-red-900 uppercase tracking-wider mb-1">Reviewer note (required)</label>
                    <textarea
                      value={reviewNote}
                      onChange={(e) => setReviewNote(e.target.value)}
                      rows={2}
                      maxLength={1000}
                      placeholder="e.g. shared office address, unrelated companies; or same owner running a second MC..."
                      className="w-full px-2 py-1.5 bg-white border border-red-300 rounded text-xs focus:outline-none focus:border-red-500"
                    />
                    {reviewError && <p className="mt-1 text-[11px] text-red-700">{reviewError}</p>}
                    {/* Confirming records the reviewer finding. It deliberately does NOT
                        write CarrierProfile.chameleonRiskLevel: complianceMonitorService
                        reads that field as a BLOCK, and this action is a finding, not a
                        verdict. See CLAUDE.md 13.3 Item 229. */}
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setReviewOpenId(null); setReviewNote(""); setReviewError(null); }}
                        className="text-[11px] text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => reviewMutation.mutate({ matchId: m.id, status: "DISMISSED" })}
                        disabled={reviewNote.trim().length < 5 || reviewMutation.isPending}
                        className="px-2.5 py-1 bg-white border border-gray-400 text-gray-700 text-[11px] font-semibold rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Not a match
                      </button>
                      <button
                        onClick={() => reviewMutation.mutate({ matchId: m.id, status: "CONFIRMED_FRAUD" })}
                        disabled={reviewNote.trim().length < 5 || reviewMutation.isPending}
                        className="px-2.5 py-1 bg-red-600 text-white text-[11px] font-semibold rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {reviewMutation.isPending ? "Saving..." : "Confirm risk"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Geo-mismatch alert pill — suppressed when AE has overridden. */}
      {geo.geoMismatch && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-amber-900">Country mismatch detected</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Registered from <strong>{geo.registrationCountry}</strong> but verified email from <strong>{geo.emailVerifiedFromCountry}</strong>. Review carefully before approving.
              </p>
            </div>
            {isAdmin && !overrideOpen && (
              <button onClick={() => setOverrideOpen(true)} className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline whitespace-nowrap">
                Override
              </button>
            )}
          </div>
          {overrideOpen && (
            <div className="mt-3 pl-6">
              <label className="block text-[11px] font-semibold text-amber-900 uppercase tracking-wider mb-1">Justification (required)</label>
              <textarea
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="e.g. carrier confirmed they were traveling; or VPN used for ops..."
                className="w-full px-2 py-1.5 bg-white border border-amber-300 rounded text-xs focus:outline-none focus:border-amber-500"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button onClick={() => { setOverrideOpen(false); setOverrideNote(""); setOverrideError(null); }} className="text-[11px] text-amber-700 hover:text-amber-900">
                  Cancel
                </button>
                <button
                  onClick={() => overrideMutation.mutate()}
                  disabled={overrideNote.trim().length < 5 || overrideMutation.isPending}
                  className="px-3 py-1 bg-amber-600 text-white text-[11px] font-semibold rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {overrideMutation.isPending ? "Saving…" : "Confirm Override"}
                </button>
              </div>
              {overrideError && <p className="mt-1 text-[11px] text-red-600">{overrideError}</p>}
            </div>
          )}
        </div>
      )}

      {/* v3.8.ajo — Override-active note (suppressed alert with AE context). */}
      {!geo.geoMismatch && geo.rawMismatch && geo.overriddenAt && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-2">
          <ShieldCheck size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-gray-700">Country mismatch overridden by AE</p>
            {geo.overrideNote && <p className="text-[11px] text-gray-600 mt-0.5 italic whitespace-pre-wrap">&ldquo;{geo.overrideNote}&rdquo;</p>}
            <p className="text-[11px] text-gray-400 mt-0.5">{formatDate(geo.overriddenAt)}</p>
          </div>
        </div>
      )}

      {/* v3.8.ajy C7 — Unusual-activity SMS suppression override.
          Cross-border owner-ops + carriers logging in from multiple
          countries hit the dual-channel SMS gate every login until AE
          marks them as "trusted multi-country." Override is 24h
          (Sprint 40 inheritance) — AE re-applies if the carrier is on
          a multi-day cross-border trip. Active state shows the reason
          + expiry; idle state shows the apply button (ADMIN/CEO only). */}
      {unusualOtpSmsOverride ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-start gap-2">
          <Smartphone size={14} className="text-gray-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-semibold text-gray-700">Unusual-activity SMS suppressed</p>
            <p className="text-[11px] text-gray-600 mt-0.5 italic whitespace-pre-wrap">&ldquo;{unusualOtpSmsOverride.reason}&rdquo;</p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Expires {formatDate(unusualOtpSmsOverride.expiresAt)}
            </p>
          </div>
        </div>
      ) : (
        isAdmin && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <Smartphone size={14} className="text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-blue-900">Unusual-activity SMS gate</p>
                <p className="text-[11px] text-blue-800 mt-0.5">
                  Dual-channel SMS fires on logins from a new country. Suppress for trusted multi-country carriers (24h).
                </p>
              </div>
              {!smsOverrideOpen && (
                <button onClick={() => setSmsOverrideOpen(true)} className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 underline whitespace-nowrap">
                  Suppress (24h)
                </button>
              )}
            </div>
            {smsOverrideOpen && (
              <div className="mt-3 pl-6">
                <label className="block text-[11px] font-semibold text-blue-900 uppercase tracking-wider mb-1">Justification (required, min 10 chars)</label>
                <textarea
                  value={smsOverrideReason}
                  onChange={(e) => setSmsOverrideReason(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="e.g. carrier confirmed multi-country owner-op route, cross-border weekly..."
                  className="w-full px-2 py-1.5 bg-white border border-blue-300 rounded text-xs focus:outline-none focus:border-blue-500"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button onClick={() => { setSmsOverrideOpen(false); setSmsOverrideReason(""); setSmsOverrideError(null); }} className="text-[11px] text-blue-700 hover:text-blue-900">
                    Cancel
                  </button>
                  <button
                    onClick={() => smsOverrideMutation.mutate()}
                    disabled={smsOverrideReason.trim().length < 10 || smsOverrideMutation.isPending}
                    className="px-3 py-1 bg-blue-600 text-white text-[11px] font-semibold rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {smsOverrideMutation.isPending ? "Saving…" : "Apply Suppression"}
                  </button>
                </div>
                {smsOverrideError && <p className="mt-1 text-[11px] text-red-600">{smsOverrideError}</p>}
              </div>
            )}
          </div>
        )
      )}

      {/* Three-point geo grid */}
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-gray-500" />
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Geo baseline</h4>
        </div>
        <div className="space-y-2">
          <SignalRow
            icon={<MapPin size={11} className="text-gray-500" />}
            label="Registration"
            country={geo.registrationCountry}
            ip={null}
            timestamp={null}
          />
          <SignalRow
            icon={<ShieldCheck size={11} className={geo.emailVerifiedAt ? "text-green-600" : "text-gray-400"} />}
            label="Email verify"
            country={geo.emailVerifiedFromCountry}
            ip={geo.emailVerifiedFromIp}
            timestamp={geo.emailVerifiedAt}
          />
          <SignalRow
            icon={<Clock size={11} className="text-gray-500" />}
            label="Last login"
            country={geo.lastLoginCountry}
            ip={geo.lastLoginIp}
            timestamp={geo.lastLoginAt}
          />
        </div>
      </div>

      {/* Auth timeline — auth_events, surfaced for the first time. */}
      <div className="bg-gray-100 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Authentication history{" "}
          <span className="font-normal normal-case text-gray-500">({authEvents.length})</span>
        </h4>
        {authEvents.length === 0 ? (
          // Honest empty state. "No events recorded" is a fact; "no suspicious
          // activity" would be a claim this panel cannot support.
          <p className="text-xs text-gray-500">No authentication events recorded for this address.</p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-auto">
            {authEvents.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-3 text-xs border-b border-gray-200 pb-1.5 last:border-0">
                <span className="font-medium text-[#0A2540] whitespace-nowrap">{e.type}</span>
                <span className="flex items-center gap-2 text-gray-500 text-[11px] text-right">
                  {e.ip && <span className="font-mono">{e.ip}</span>}
                  <span>{formatDate(e.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Active sessions. Count and freshness only — revocation is owned by
          logout and the expiry sweep, and a second delete path here would be a
          second place for the two to disagree. */}
      <div className="bg-gray-100 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Active portal sessions{" "}
          <span className="font-normal normal-case text-gray-500">({sessions.length})</span>
        </h4>
        {sessions.length === 0 ? (
          <p className="text-xs text-gray-500">
            No active carrier-portal sessions. Sessions end after 30 minutes idle or 12 hours.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-gray-600">
                  Started {formatDate(s.issuedAt)}
                  {s.rememberMe && <span className="ml-2 text-[11px] text-gray-400">remembered</span>}
                </span>
                <span className="text-gray-500 text-[11px]">last seen {formatDate(s.lastSeenAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* v3.8.bck — Two-factor reset. A carrier cannot switch off its own
          authenticator (bce); a lost phone is reset here, by an admin, with a
          fresh code from the admin's own authenticator. */}
      {(
        <div className="bg-gray-100 rounded-lg p-4" data-testid="mfa-reset">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Sign-in security</h4>
          {/* v3.8.bcq — enrollment state and the last sign-in, from the carrier's
              own LOGIN rows. Read by every AE role; the reset below is admin-only. */}
          <div className="space-y-1 mb-3 text-xs" data-testid="signin-security">
            {security ? (
              <>
                <p className="text-gray-700">
                  {security.totpEnabled ? (
                    <><ShieldCheck className="inline w-3.5 h-3.5 text-green-600 mr-1" />Authenticator enrolled{security.enrolledAt ? ` since ${formatDate(security.enrolledAt)}` : ""}</>
                  ) : (
                    <><AlertTriangle className="inline w-3.5 h-3.5 text-amber-600 mr-1" />No authenticator enrolled — the carrier is asked to enrol at their next sign-in</>
                  )}
                </p>
                <p className="text-gray-600">
                  {security.lastLogin ? (
                    <>
                      Last sign-in {formatDate(security.lastLogin.at)}
                      {[security.lastLogin.city, security.lastLogin.region, security.lastLogin.country].filter(Boolean).length > 0 && (
                        <> from {[security.lastLogin.city, security.lastLogin.region, security.lastLogin.country].filter(Boolean).join(", ")}</>
                      )}
                      {security.lastLogin.ip && <span className="text-gray-400"> · {security.lastLogin.ip}</span>}
                      {security.lastLogin.flags.map((f) => (
                        <span key={f} data-testid="signin-flag" className="ml-1.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px] font-medium">{f.replace(/_/g, " ").toLowerCase()}</span>
                      ))}
                    </>
                  ) : (
                    <>No sign-in recorded yet</>
                  )}
                </p>
              </>
            ) : (
              <p className="text-gray-500">Sign-in security not reported by this backend.</p>
            )}
          </div>
          {isAdmin && security?.totpEnabled !== false && (
            <>
          {mfaResetDone ? (
            <p className="text-xs text-green-700">{mfaResetDone}</p>
          ) : !mfaResetOpen ? (
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-gray-600">
                A carrier cannot switch off its own authenticator. If theirs is lost, reset it here; they enrol again at their next sign-in.
              </p>
              <button onClick={() => setMfaResetOpen(true)} className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 underline whitespace-nowrap">
                Reset authenticator
              </button>
            </div>
          ) : (
            <div>
              <label className="block text-[11px] font-semibold text-amber-900 uppercase tracking-wider mb-1">Reason (required, becomes the audit note)</label>
              <textarea
                value={mfaResetReason}
                onChange={(e) => setMfaResetReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="e.g. carrier lost the phone; identity confirmed by call to the number on file"
                className="w-full px-2 py-1.5 bg-white border border-amber-300 rounded text-xs focus:outline-none focus:border-amber-500"
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <button onClick={() => { setMfaResetOpen(false); setMfaResetReason(""); setMfaResetError(null); }} className="text-[11px] text-amber-700 hover:text-amber-900">
                  Cancel
                </button>
                <button
                  onClick={submitMfaReset}
                  disabled={mfaResetReason.trim().length < 10 || mfaResetting}
                  className="px-3 py-1 bg-amber-600 text-white text-[11px] font-semibold rounded hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {mfaResetting ? "Confirming…" : "Reset and require re-enrolment"}
                </button>
              </div>
              {mfaResetError && <p className="mt-1 text-[11px] text-red-600">{mfaResetError}</p>}
            </div>
          )}
            </>
          )}
        </div>
      )}
      <StepUpPrompt
        open={stepUp.prompting}
        title="Confirm with your authenticator"
        description="Resetting a carrier's two-factor authentication needs a fresh code from your own authenticator app."
        verifying={stepUp.verifying}
        error={stepUp.error}
        onSubmit={stepUp.submitCode}
        onCancel={stepUp.cancel}
      />

      {/* Event timeline */}
      <div className="bg-gray-100 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Recent events <span className="font-normal normal-case text-gray-500">({events.length})</span>
        </h4>
        {events.length === 0 ? (
          <p className="text-xs text-gray-500">No security events recorded.</p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-auto">
            {events.map((e) => {
              const severity = SEVERITY_COLORS[e.severity] || SEVERITY_COLORS.INFO;
              // v3.8.ajo — Type-tag icon mapping for the extended timeline.
              const typeIcon = e.type === "DOCUMENT_UPLOAD"
                ? <FileText size={11} className="text-gray-500" />
                : e.type === "OTP_FAILURE"
                ? <KeyRound size={11} className="text-amber-600" />
                : null;
              return (
                <li key={e.id} className="bg-white border border-gray-200 rounded-md p-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="flex items-center gap-1.5">
                      {typeIcon}
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold ${severity.bg} ${severity.text}`}>
                        {e.severity}
                      </span>
                    </span>
                    <span className="text-[11px] text-gray-400">{formatDate(e.createdAt)}</span>
                  </div>
                  <p className="text-[11px] text-gray-700 leading-snug">{e.message}</p>
                  {e.ipAddress && (
                    <p className="text-[11px] text-gray-400 mt-1">IP: {e.ipAddress}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SignalRow({ icon, label, country, ip, timestamp }: {
  icon: React.ReactNode;
  label: string;
  country: string | null;
  ip: string | null;
  timestamp: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-gray-600">
        {icon}
        <span className="font-medium">{label}</span>
      </span>
      <span className="flex items-center gap-2 text-gray-700">
        <span className="font-semibold">{country || "—"}</span>
        {ip && <span className="text-gray-400 text-[11px] font-mono">{ip}</span>}
        {timestamp && <span className="text-gray-400 text-[11px]">{formatDate(timestamp)}</span>}
      </span>
    </div>
  );
}
