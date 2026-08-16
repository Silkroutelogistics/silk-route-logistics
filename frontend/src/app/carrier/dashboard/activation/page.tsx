"use client";

// Track 1.1b — Post-approval carrier Activation screen.
// Reached after an AE approves the carrier. Two steps:
//   Step 1 (REQUIRED) — sign the Broker-Carrier Agreement. The POST creates a
//     CarrierAgreement{status:"SIGNED"} row that the complianceMonitorService
//     gate enforces, which is what actually unlocks load tendering.
//   Step 2 (OPTIONAL, reversible) — elect Quick Pay. Default off = standard Net
//     terms, fully operational. Never a hauling gate.
// Mirrors the drivers-page idiom (CarrierCard, gold-gradient CTA, TanStack).

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileSignature, FileText, CheckCircle2, Loader2, Zap, Clock, XCircle, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier";
import {
  // QP_TIER_TERMS + QP_SAME_DAY_NOTE are pure §8 economics and the pilot did
  // not touch them, so they stay imported.
  //
  // QP_SUMMARY is deliberately NOT imported any more. It ends "Turn it on or
  // off anytime", which stopped being true when Quick Pay became a pilot — the
  // carrier can always turn it OFF, but turning it ON now needs an approved
  // enrolment. The replacement summary is written inline below against the
  // carrier's actual pilot state, because one fixed sentence cannot be true for
  // a carrier who has not asked, one waiting on a decision, and one who was
  // declined. lib/carrierAgreements.ts is outside this partition; the orphaned
  // constant is reported rather than edited here.
  QP_TIER_TERMS,
  QP_SAME_DAY_NOTE,
} from "@/lib/carrierAgreements";

// v3.8.asb — the carrier's standing in the Quick Pay pilot. Mirrors
// QuickPayEnrollmentStatus, plus null for "never asked", which is a real and
// common state and not an error.
type PilotStatus = "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN" | null;

interface ActivationStatus {
  onboardingStatus: string;
  requiresActivation: boolean;
  bca: { signed: boolean; signedAt: string | null; signedByName: string | null; version: string | null };
  quickPay: {
    enabled: boolean;
    signed: boolean;
    signedByName: string | null;
    agreedAt: string | null;
    version: string | null;
    // v3.8.asb — pilot state from GET /carrier-auth/activation-status.
    // Optional on the type so a frontend deployed ahead of the backend renders
    // the carrier's real position instead of crashing on a missing field.
    pilotStatus?: PilotStatus;
    pilotRequestedAt?: string | null;
    pilotDecidedAt?: string | null;
    pilotWithdrawnAt?: string | null;
    pilotReason?: string | null;
    pilotApproved?: boolean;
  };
  activatedAt: string | null;
}

// Canonical BCA content fetched from the backend (single source) — the review
// pane renders this, and the signed version is always the backend's.
interface AgreementContent {
  title: string;
  subtitle: string;
  version: string;
  effectiveNote: string;
  preamble: string[];
  sections: { heading: string; clauses: string[] }[];
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || fallback;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const inputCls = "w-full px-3 py-2 border border-[#EFE6D3] rounded text-xs focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none bg-white";
const labelCls = "text-xs text-gray-700 block mb-1";
const errorBox = "mb-3 px-3 py-2 bg-[#F6E3E3] border-l-4 border-[#9B2C2C] text-[#9B2C2C] text-xs rounded";
const goldCta =
  "flex items-center gap-1.5 px-5 py-2.5 bg-[#BA7517] text-[#FBF7F0] text-xs font-semibold rounded-md hover:shadow-lg transition-shadow disabled:opacity-40 disabled:cursor-not-allowed";

export default function CarrierActivationPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ActivationStatus>({
    queryKey: ["carrier-activation"],
    queryFn: () => api.get("/carrier-auth/activation-status").then((r) => r.data),
  });

  // Canonical Broker-Carrier Agreement content (backend single source).
  const { data: bca } = useQuery<AgreementContent>({
    queryKey: ["agreement", "broker-carrier"],
    queryFn: () => api.get("/carrier-auth/agreement/broker-carrier").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  // v3.8.asa — canonical Caravan Quick Pay Agreement content, fetched the same
  // way the BCA already was. Pre-asa this pane showed a ~90-word paraphrase and
  // stamped a locally-mirrored version string, so the carrier signed a binding
  // document containing set-off, recoupment against future loads, and survival
  // clauses they were never shown. Click-wrap turns on reasonable notice; the
  // signer now sees the body they are signing, and the version stamped is the
  // one the backend served with that body.
  const { data: qp, isLoading: qpLoading } = useQuery<AgreementContent>({
    queryKey: ["agreement", "quick-pay"],
    queryFn: () => api.get("/carrier-auth/agreement/quick-pay").then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  // BCA signature
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [bcaError, setBcaError] = useState<string | null>(null);

  const signBca = useMutation({
    mutationFn: () =>
      api.post("/carrier-auth/sign-bca", {
        signedByName: name.trim(),
        signedByTitle: title.trim() || undefined,
        agreed: true,
        bcaVersion: bca?.version ?? "",
      }),
    onSuccess: () => {
      setBcaError(null);
      queryClient.invalidateQueries({ queryKey: ["carrier-activation"] });
    },
    onError: (err) => setBcaError(extractError(err, "Couldn't record your signature. Please try again.")),
  });

  // Quick Pay election — v3.8.aqi: enabling requires a typed-name e-signature
  // (parity with the BCA), not just a checkbox.
  const [showQpEnable, setShowQpEnable] = useState(false);
  const [qpAgreed, setQpAgreed] = useState(false);
  const [qpName, setQpName] = useState("");
  const [qpTitle, setQpTitle] = useState("");
  const [qpError, setQpError] = useState<string | null>(null);

  const qpMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.post(
        "/carrier-auth/quickpay-election",
        enabled
          ? {
              enabled: true,
              agreedToQpTerms: true,
              // The version served WITH the body above, never a local mirror.
              qpVersion: qp?.version ?? "",
              signedByName: qpName.trim(),
              signedByTitle: qpTitle.trim() || undefined,
            }
          : { enabled: false },
      ),
    onSuccess: () => {
      setQpError(null);
      setShowQpEnable(false);
      setQpAgreed(false);
      setQpName("");
      setQpTitle("");
      queryClient.invalidateQueries({ queryKey: ["carrier-activation"] });
    },
    onError: (err) => setQpError(extractError(err, "Couldn't update Quick Pay. Please try again.")),
  });

  // v3.8 — ask to join the Quick Pay pilot from the portal.
  //
  // POST /carrier-auth/quickpay-pilot-request has existed since the pilot
  // shipped and had no caller, while this page carried a comment saying there
  // was no such endpoint and offered a mailto instead. So a carrier who did not
  // tick the box on their application had no way to ask, and one who was
  // declined had no way to ask again — both were told to send an email into an
  // inbox. The endpoint records a PENDING enrolment and nothing else: it
  // enables nothing, signs nothing and changes no price.
  const [pilotError, setPilotError] = useState<string | null>(null);
  const requestPilot = useMutation({
    mutationFn: () => api.post("/carrier-auth/quickpay-pilot-request", {}),
    onSuccess: () => {
      setPilotError(null);
      // Re-reads activation-status, which flips this pane to the PENDING
      // branch. The endpoint is idempotent while a request is open, so a
      // double tap is not an error.
      queryClient.invalidateQueries({ queryKey: ["carrier-activation"] });
    },
    onError: (err) => setPilotError(extractError(err, "Couldn't send your request. Please try again.")),
  });

  // Open the branded agreement PDF in a new tab (review copy pre-sign, executed
  // copy once signed). Uses the api client so the httpOnly cookie is sent.
  // v3.8.asa — takes the agreement type; the Quick Pay PDF route is live now.
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [qpPdfError, setQpPdfError] = useState<string | null>(null);
  const openAgreementPdf = async (type: "broker-carrier" | "quick-pay", setErr: (m: string | null) => void) => {
    setErr(null);
    try {
      const res = await api.get(`/carrier-auth/agreement/${type}/pdf`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data as Blob);
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setErr(extractError(err, "Couldn't open the agreement PDF."));
    }
  };
  const viewAgreementPdf = () => openAgreementPdf("broker-carrier", setPdfError);
  const viewQuickPayPdf = () => openAgreementPdf("quick-pay", setQpPdfError);

  if (isLoading || !data) {
    return (
      <CarrierCard padding="p-10">
        <div className="flex items-center justify-center gap-2 text-gray-400 text-sm">
          <Loader2 size={16} className="animate-spin" /> Loading activation...
        </div>
      </CarrierCard>
    );
  }

  const bcaSigned = data.bca.signed;
  const qpEnabled = data.quickPay.enabled;

  // v3.8.asb — pilot standing.
  //
  // The `??` covers two cases with one expression. A backend that predates the
  // pilot sends no pilotStatus at all; a carrier enabled before the pilot
  // existed has a live flag and no enrolment row. Both should render the
  // switched-on state, which is what they are, and both must keep the
  // turn-it-off control, which always succeeds.
  const pilot: PilotStatus = data.quickPay.pilotStatus ?? (qpEnabled ? "APPROVED" : null);
  const pilotReason = data.quickPay.pilotReason ?? null;
  // The ONE state where an enable control exists. Every other branch renders
  // status and no switch: POST /quickpay-election answers 403 with a distinct
  // code for not-requested, pending, declined and withdrawn, so a button in
  // those states is a button that cannot succeed.
  const canOfferEnable = !qpEnabled && pilot === "APPROVED";

  const PILOT_BADGE: Record<string, { label: string; cls: string }> = {
    ON: { label: "On", cls: "bg-[#E6F0E9] text-[#2F7A4F] border-[#2F7A4F]/30" },
    APPROVED: { label: "Approved · sign to turn on", cls: "bg-[#E6F0E9] text-[#2F7A4F] border-[#2F7A4F]/30" },
    PENDING: { label: "Requested", cls: "bg-[#FBEFD4] text-[#B07A1A] border-[#B07A1A]/30" },
    DECLINED: { label: "Not approved", cls: "bg-[#F6E3E3] text-[#9B2C2C] border-[#9B2C2C]/30" },
    WITHDRAWN: { label: "Withdrawn", cls: "bg-[#F6E3E3] text-[#9B2C2C] border-[#9B2C2C]/30" },
  };
  const badge = qpEnabled ? PILOT_BADGE.ON : pilot ? PILOT_BADGE[pilot] : null;

  // Shown in every branch. A carrier deciding whether to ask, waiting on an
  // answer, or reading a decline is entitled to the same published prices as
  // one already in it. Nothing here is gated on standing.
  const feeLadder = (
    <>
      <div className="rounded-lg border border-[#EFE6D3] overflow-hidden mb-3">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-400">
              <th className="px-3 py-2 font-medium">Tier</th>
              <th className="px-3 py-2 font-medium">Standard pay</th>
              <th className="px-3 py-2 font-medium">7-day Quick Pay</th>
            </tr>
          </thead>
          <tbody>
            {QP_TIER_TERMS.map((t) => (
              <tr key={t.tier} className="border-t border-[#F5EEE0]">
                <td className="px-3 py-2 font-semibold text-[#0A2540]">{t.tier}</td>
                <td className="px-3 py-2 text-gray-600">{t.standard}</td>
                <td className="px-3 py-2 text-gray-600">{t.sevenDay}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-400 mb-4">{QP_SAME_DAY_NOTE}</p>
    </>
  );

  // Standard terms are free and unaffected in every pilot state. Said once,
  // rendered wherever the carrier is being told they do not have Quick Pay, so
  // no branch reads as a penalty.
  const standardTermsLine = (
    <p className="text-[12px] text-gray-500">
      Your standard tier pay terms are unchanged and always free — Silver Net-30, Gold Net-21, Platinum Net-14. Quick Pay
      is never required to haul and has no effect on your tier, your Compass Score, or the loads you are offered.
    </p>
  );
  const canSign = name.trim().length >= 2 && agreed && !!bca?.version && !signBca.isPending;
  // v3.8.asa — fail CLOSED. No agreement body loaded means no version to stamp
  // and nothing the carrier can be said to have read, so there is nothing to
  // sign. Declining to sign costs the carrier nothing: standard tier terms are
  // free and Quick Pay is never a hauling gate.
  const canSignQp = qpAgreed && qpName.trim().length >= 2 && !!qp?.version && !qpMutation.isPending;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0A2540] mb-1">Activate your account</h1>
        <p className="text-[13px] text-gray-500">
          You&apos;re approved. Sign your Broker-Carrier Agreement to start hauling, and choose whether you want Quick Pay.
        </p>
      </div>

      {/* Fully-activated banner */}
      {bcaSigned && (
        <CarrierCard padding="p-4" className="mb-5 border-[#2F7A4F]/30 bg-[#E6F0E9]/40">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-[#2F7A4F] shrink-0" />
            <p className="text-[13px] text-[#0A2540]">
              <span className="font-semibold">You&apos;re activated and cleared to haul.</span> Your dashboard is open and you can receive load tenders.
            </p>
          </div>
        </CarrierCard>
      )}

      {/* Step 1 — Broker-Carrier Agreement (required) */}
      <CarrierCard padding="p-6" className="mb-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-[#BA7517]">Step 1 · Required</span>
          {bcaSigned && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-[#E6F0E9] text-[#2F7A4F] border border-[#2F7A4F]/30">
              Signed
            </span>
          )}
        </div>
        <h2 className="font-serif text-lg text-[#0A2540] mb-1 flex items-center gap-2">
          <FileSignature size={18} className="text-[#BA7517]" /> Broker-Carrier Agreement
        </h2>

        <button onClick={viewAgreementPdf} className="text-[11px] text-[#BA7517] hover:underline mb-2 inline-flex items-center gap-1">
          <FileText size={12} /> View the {bcaSigned ? "executed " : ""}agreement (PDF, opens in a new tab)
        </button>
        {pdfError && <div className={errorBox}>{pdfError}</div>}

        {bcaSigned ? (
          <p className="text-[13px] text-gray-600">
            Signed by <span className="font-semibold text-[#0A2540]">{data.bca.signedByName}</span> on {fmtDate(data.bca.signedAt)}
            {data.bca.version ? <> (version {data.bca.version})</> : null}.
          </p>
        ) : (
          <>
            <p className="text-[13px] text-gray-500 mb-3">
              Review the agreement, then sign with your full legal name. This is the agreement between your company and Silk Route Logistics that governs every load.
            </p>

            {/* Review pane — canonical BCA content fetched from the backend */}
            <div className="max-h-72 overflow-auto rounded-lg border border-[#EFE6D3] bg-[#F5EEE0] p-4 mb-4">
              {!bca ? (
                <div className="flex items-center gap-2 text-gray-400 text-xs py-4">
                  <Loader2 size={14} className="animate-spin" /> Loading the agreement...
                </div>
              ) : (
                <>
                  {bca.preamble.map((p, i) => (
                    <p key={`pre-${i}`} className="text-[11px] text-gray-600 leading-relaxed mb-2">{p}</p>
                  ))}
                  {bca.sections.map((s) => (
                    <div key={s.heading} className="mb-3 last:mb-0">
                      <p className="text-xs font-bold text-[#0A2540] mb-0.5">{s.heading}</p>
                      {s.clauses.map((c, i) => (
                        <p key={i} className="text-[11px] text-gray-600 leading-relaxed">{c}</p>
                      ))}
                    </div>
                  ))}
                  <p className="text-[10px] text-gray-400 mt-3 pt-3 border-t border-gray-300/60">
                    {bca.title} v{bca.version}. The full executed agreement governs.
                  </p>
                </>
              )}
            </div>

            {/* Signature */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>Your full legal name *</label>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith" autoComplete="name" />
              </div>
              <div>
                <label className={labelCls}>Title (optional)</label>
                <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Owner" />
              </div>
            </div>
            <label className="flex items-start gap-2 mb-3 cursor-pointer">
              <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-[#BA7517]" />
              <span className="text-xs text-gray-600">
                I have read and agree to the Broker-Carrier Agreement (v{bca?.version}) on behalf of my company. Typing my name above is my electronic signature.
              </span>
            </label>

            {bcaError && <div className={errorBox}>{bcaError}</div>}

            <button onClick={() => signBca.mutate()} disabled={!canSign} className={goldCta}>
              {signBca.isPending && <Loader2 size={13} className="animate-spin" />} Sign &amp; Activate
            </button>
          </>
        )}
      </CarrierCard>

      {/* Step 2 — Quick Pay (optional) */}
      <CarrierCard padding="p-6">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wide font-semibold text-[#BA7517]">Step 2 · Optional</span>
          {badge && (
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border ${badge.cls}`}>
              {badge.label}
            </span>
          )}
        </div>
        <h2 className="font-serif text-lg text-[#0A2540] mb-1 flex items-center gap-2">
          <Zap size={18} className="text-[#BA7517]" /> Quick Pay
          <span className="text-[10px] font-sans uppercase tracking-wide font-semibold text-[#B07A1A] bg-[#FBEFD4] border border-[#B07A1A]/30 rounded-full px-2 py-0.5">
            Limited pilot
          </span>
        </h2>

        {qpEnabled ? (
          <>
            <p className="text-[13px] text-gray-600 mb-3">
              Quick Pay is <span className="font-semibold text-[#2F7A4F]">on</span>
              {data.quickPay.agreedAt ? <> since {fmtDate(data.quickPay.agreedAt)}</> : null}. The speed and the fee for
              a load are recorded on that load when we issue its rate confirmation, before you haul it. Ask your rep
              which speed is on a load and they will tell you.
            </p>

            {feeLadder}

            {/* Re-admission is not automatic and the agreement now says so, so
                the carrier is told before they switch off, not after they try
                to switch back on. */}
            <div className="rounded-lg border border-[#EFE6D3] bg-[#FBF7F0] p-3 mb-3">
              <p className="text-[12px] text-gray-600">
                You can stop Quick Pay at any time. Loads we have already funded keep their fee and payment date; loads
                we have not funded go back to your standard terms at no fee. While Quick Pay is a pilot, switching it
                back on takes a new request, so stop it only if you mean to.
              </p>
            </div>

            {qpError && <div className={errorBox}>{qpError}</div>}
            <button
              onClick={() => qpMutation.mutate(false)}
              disabled={qpMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-xs text-gray-600 border border-[#EFE6D3] rounded-md hover:bg-gray-50 disabled:opacity-40"
            >
              {qpMutation.isPending && <Loader2 size={13} className="animate-spin" />} Stop using Quick Pay
            </button>
          </>
        ) : (
          <>
            <p className="text-[13px] text-gray-500 mb-3">
              Quick Pay pays you early on a load you choose, for a flat fee by tier, once we have your complete and
              accurate paperwork. It is running as a limited pilot: you ask to join, we approve or decline, and we can
              withdraw it on notice. Any load that already has a Quick Pay fee on its rate confirmation keeps that
              fee and that payment date, whether or not we have paid it yet.
            </p>

            {feeLadder}

            {/* ── Never asked ──────────────────────────────────────────────── */}
            {pilot === null && (
              <div className="rounded-lg border border-[#EFE6D3] bg-[#FBF7F0] p-4 mb-3">
                <p className="text-[13px] text-[#0A2540] font-semibold mb-1">You have not asked to join the pilot</p>
                <p className="text-[12px] text-gray-600 mb-3">
                  Carriers ask for the pilot on their application. Yours did not, which costs you nothing. Ask here and
                  your request goes straight to our team. Nothing turns on and no fee applies until we approve it and you
                  sign the agreement.
                </p>
                {pilotError && <div className={errorBox}>{pilotError}</div>}
                <button
                  onClick={() => requestPilot.mutate()}
                  disabled={requestPilot.isPending}
                  className={goldCta}
                >
                  {requestPilot.isPending && <Loader2 size={13} className="animate-spin" />} Ask to join the pilot
                </button>
              </div>
            )}

            {/* ── Requested, awaiting a decision ──────────────────────────── */}
            {pilot === "PENDING" && (
              <div className="rounded-lg border border-[#B07A1A]/30 bg-[#FBEFD4]/50 p-4 mb-3">
                <p className="text-[13px] text-[#0A2540] font-semibold mb-1 flex items-center gap-1.5">
                  <Clock size={14} className="text-[#B07A1A]" /> Your request is with our team
                </p>
                <p className="text-[12px] text-gray-600">
                  You asked to join the Quick Pay pilot
                  {data.quickPay.pilotRequestedAt ? <> on {fmtDate(data.quickPay.pilotRequestedAt)}</> : null}. We will
                  let you know as soon as it is decided. There is nothing for you to do in the meantime.
                </p>
              </div>
            )}

            {/* ── Declined ───────────────────────────────────────────────────
                The reason is the AE's own words, shown verbatim. A carrier is
                owed the reason they were given, not a status. */}
            {pilot === "DECLINED" && (
              <div className="rounded-lg border border-[#9B2C2C]/30 bg-[#F6E3E3]/50 p-4 mb-3">
                <p className="text-[13px] text-[#0A2540] font-semibold mb-1 flex items-center gap-1.5">
                  <XCircle size={14} className="text-[#9B2C2C]" /> Your pilot request was not approved
                </p>
                {data.quickPay.pilotDecidedAt && (
                  <p className="text-[11px] text-gray-500 mb-1.5">Decided {fmtDate(data.quickPay.pilotDecidedAt)}</p>
                )}
                {pilotReason && (
                  <p className="text-[12px] text-gray-700 mb-2 italic">&ldquo;{pilotReason}&rdquo;</p>
                )}
                {/* A declined attempt is terminal for that attempt, not for the
                    carrier: the one-live index covers only PENDING and
                    APPROVED, so a new request is allowed and keeps its own
                    row and its own reason. */}
                <p className="text-[12px] text-gray-600 mb-3">
                  If something has changed, ask us to look again. You can also email{" "}
                  <a href="mailto:operations@silkroutelogistics.ai" className="text-[#BA7517] hover:underline">
                    operations@silkroutelogistics.ai
                  </a>{" "}
                  if you want to tell us what changed first.
                </p>
                {pilotError && <div className={errorBox}>{pilotError}</div>}
                <button
                  onClick={() => requestPilot.mutate()}
                  disabled={requestPilot.isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 border border-[#BA7517] text-[#BA7517] text-xs font-semibold rounded-md hover:bg-[#FAEEDA] transition disabled:opacity-40"
                >
                  {requestPilot.isPending ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />} Ask us to
                  look again
                </button>
              </div>
            )}

            {/* ── Withdrawn after approval ──────────────────────────────────
                Distinct from declined on purpose. Money may already have moved
                here, so the funded-loads promise is stated in the branch that
                needs it. */}
            {pilot === "WITHDRAWN" && (
              <div className="rounded-lg border border-[#9B2C2C]/30 bg-[#F6E3E3]/50 p-4 mb-3">
                <p className="text-[13px] text-[#0A2540] font-semibold mb-1 flex items-center gap-1.5">
                  <XCircle size={14} className="text-[#9B2C2C]" /> Quick Pay has been withdrawn from your account
                </p>
                {data.quickPay.pilotWithdrawnAt && (
                  <p className="text-[11px] text-gray-500 mb-1.5">Withdrawn {fmtDate(data.quickPay.pilotWithdrawnAt)}</p>
                )}
                {pilotReason && (
                  <p className="text-[12px] text-gray-700 mb-2 italic">&ldquo;{pilotReason}&rdquo;</p>
                )}
                {/* Matches integrationService: a frozen election survives an
                    SRL withdrawal. The test is a fee already recorded on the
                    load, not whether we have paid it. Distinct from the
                    carrier's OWN opt-out above, which does withdraw the
                    election on anything not yet funded — that one is their
                    choice and pays them more. */}
                <p className="text-[12px] text-gray-600">
                  Any load that already has a Quick Pay fee on its rate confirmation keeps that fee and that payment
                  date, whether or not we have paid it yet. Loads with no Quick Pay fee recorded pay your standard terms
                  at no fee. Talk to your rep about rejoining the pilot.
                </p>
              </div>
            )}

            {/* ── Approved, signature outstanding ────────────────────────── */}
            {canOfferEnable && !showQpEnable && (
              <div className="rounded-lg border border-[#2F7A4F]/30 bg-[#E6F0E9]/40 p-4 mb-3">
                <p className="text-[13px] text-[#0A2540] font-semibold mb-1 flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-[#2F7A4F]" /> You are approved for the Quick Pay pilot
                </p>
                <p className="text-[12px] text-gray-600">
                  One step left. Read and sign the Caravan Quick Pay Agreement and Quick Pay turns on for your loads.
                </p>
              </div>
            )}

            {!canOfferEnable && <div className="mb-1">{standardTermsLine}</div>}

            {/* Guarded on canOfferEnable as well as the local toggle: if an AE
                withdraws or declines while this pane is open, the signature
                form has to disappear with the entitlement, not stay on screen
                collecting a name for a POST that now 403s. */}
            {!(showQpEnable && canOfferEnable) ? (
              canOfferEnable ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button onClick={() => setShowQpEnable(true)} className={goldCta}>
                    <Zap size={13} /> Review and sign
                  </button>
                  <span className="text-xs text-gray-400">or stay on standard terms — nothing to do.</span>
                </div>
              ) : null
            ) : (
              <>
                <p className="text-[13px] text-gray-500 mb-3">
                  Read the agreement below, then sign with your full legal name. It covers how the fee is applied, when you get paid, approval limits, and what happens if a load is later disputed.
                </p>

                <button onClick={viewQuickPayPdf} className="text-[11px] text-[#BA7517] hover:underline mb-2 inline-flex items-center gap-1">
                  <FileText size={12} /> View the agreement (PDF, opens in a new tab)
                </button>
                {qpPdfError && <div className={errorBox}>{qpPdfError}</div>}

                {/* Review pane — canonical Quick Pay body fetched from the backend */}
                <div className="max-h-72 overflow-auto rounded-lg border border-[#EFE6D3] bg-[#F5EEE0] p-4 mb-3">
                  {qpLoading ? (
                    <div className="flex items-center gap-2 text-gray-400 text-xs py-4">
                      <Loader2 size={14} className="animate-spin" /> Loading the agreement...
                    </div>
                  ) : !qp ? (
                    <p className="text-[11px] text-[#9B2C2C] py-4">
                      The Quick Pay Agreement could not be loaded, so it cannot be signed right now. Reload the page, or email operations@silkroutelogistics.ai. Your standard tier pay terms are unaffected.
                    </p>
                  ) : (
                    <>
                      <p className="text-xs font-bold text-[#0A2540] mb-0.5">{qp.title}</p>
                      <p className="text-[10px] text-gray-400 mb-2">{qp.effectiveNote}</p>
                      {qp.preamble.map((p, i) => (
                        <p key={`qp-pre-${i}`} className="text-[11px] text-gray-600 leading-relaxed mb-2">{p}</p>
                      ))}
                      {qp.sections.map((s) => (
                        <div key={s.heading} className="mb-3 last:mb-0">
                          <p className="text-xs font-bold text-[#0A2540] mb-0.5">{s.heading}</p>
                          {s.clauses.map((c, i) => (
                            <p key={i} className="text-[11px] text-gray-600 leading-relaxed">{c}</p>
                          ))}
                        </div>
                      ))}
                      <p className="text-[10px] text-gray-400 mt-3 pt-3 border-t border-gray-300/60">
                        {qp.title} v{qp.version}. The full executed agreement governs.
                      </p>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className={labelCls}>Your full legal name *</label>
                    <input className={inputCls} value={qpName} onChange={(e) => setQpName(e.target.value)} placeholder="John Smith" autoComplete="name" />
                  </div>
                  <div>
                    <label className={labelCls}>Title (optional)</label>
                    <input className={inputCls} value={qpTitle} onChange={(e) => setQpTitle(e.target.value)} placeholder="Owner" />
                  </div>
                </div>
                <label className="flex items-start gap-2 mb-3 cursor-pointer">
                  <input type="checkbox" checked={qpAgreed} onChange={(e) => setQpAgreed(e.target.checked)} disabled={!qp} className="mt-0.5 accent-[#BA7517] disabled:opacity-40" />
                  <span className="text-xs text-gray-600">
                    I have read and agree to the Caravan Quick Pay Agreement{qp ? ` (v${qp.version})` : ""} on behalf of my company. Typing my name above is my electronic signature.
                  </span>
                </label>
                {qpError && <div className={errorBox}>{qpError}</div>}
                <div className="flex gap-2">
                  {/* Fail CLOSED: no body loaded, no signature. */}
                  <button onClick={() => qpMutation.mutate(true)} disabled={!canSignQp} className={goldCta}>
                    {qpMutation.isPending && <Loader2 size={13} className="animate-spin" />} Sign &amp; turn on Quick Pay
                  </button>
                  <button
                    onClick={() => {
                      setShowQpEnable(false);
                      setQpAgreed(false);
                      setQpError(null);
                    }}
                    className="px-4 py-2 text-xs text-gray-500 hover:text-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </CarrierCard>

      <p className="mt-5 text-[11px] text-gray-400">
        Questions about the agreement or Quick Pay? Email{" "}
        <a href="mailto:operations@silkroutelogistics.ai" className="text-[#BA7517] hover:underline">operations@silkroutelogistics.ai</a>.
      </p>
    </div>
  );
}
