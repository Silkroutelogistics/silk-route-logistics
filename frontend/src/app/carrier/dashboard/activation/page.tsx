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
import { FileSignature, CheckCircle2, Loader2, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier";
import {
  BCA_VERSION,
  BCA_ARTICLES,
  QP_VERSION,
  QP_SUMMARY,
  QP_TIER_TERMS,
  QP_SAME_DAY_NOTE,
} from "@/lib/carrierAgreements";

interface ActivationStatus {
  onboardingStatus: string;
  requiresActivation: boolean;
  bca: { signed: boolean; signedAt: string | null; signedByName: string | null; version: string | null };
  quickPay: { enabled: boolean; agreedAt: string | null; version: string | null };
  activatedAt: string | null;
}

function extractError(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return e?.response?.data?.error || e?.response?.data?.message || e?.message || fallback;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const inputCls = "w-full px-3 py-2 border border-gray-200 rounded text-xs focus:border-[#C9A84C] focus:outline-none bg-white";
const labelCls = "text-xs text-gray-700 block mb-1";
const errorBox = "mb-3 px-3 py-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded";
const goldCta =
  "flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0A2540] text-xs font-semibold rounded-md hover:shadow-lg transition-shadow disabled:opacity-40 disabled:cursor-not-allowed";

export default function CarrierActivationPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<ActivationStatus>({
    queryKey: ["carrier-activation"],
    queryFn: () => api.get("/carrier-auth/activation-status").then((r) => r.data),
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
        bcaVersion: BCA_VERSION,
      }),
    onSuccess: () => {
      setBcaError(null);
      queryClient.invalidateQueries({ queryKey: ["carrier-activation"] });
    },
    onError: (err) => setBcaError(extractError(err, "Couldn't record your signature. Please try again.")),
  });

  // Quick Pay election
  const [showQpEnable, setShowQpEnable] = useState(false);
  const [qpAgreed, setQpAgreed] = useState(false);
  const [qpError, setQpError] = useState<string | null>(null);

  const qpMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.post(
        "/carrier-auth/quickpay-election",
        enabled ? { enabled: true, agreedToQpTerms: true, qpVersion: QP_VERSION } : { enabled: false },
      ),
    onSuccess: () => {
      setQpError(null);
      setShowQpEnable(false);
      setQpAgreed(false);
      queryClient.invalidateQueries({ queryKey: ["carrier-activation"] });
    },
    onError: (err) => setQpError(extractError(err, "Couldn't update Quick Pay. Please try again.")),
  });

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
  const canSign = name.trim().length >= 2 && agreed && !signBca.isPending;

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0F1117] mb-1">Activate your account</h1>
        <p className="text-[13px] text-gray-500">
          You&apos;re approved. Sign your Broker-Carrier Agreement to start hauling, and choose whether you want Quick Pay.
        </p>
      </div>

      {/* Fully-activated banner */}
      {bcaSigned && (
        <CarrierCard padding="p-4" className="mb-5 border-green-200 bg-green-50/40">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 size={18} className="text-green-600 shrink-0" />
            <p className="text-[13px] text-[#0F1117]">
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
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-green-50 text-green-700 border border-green-200">
              Signed
            </span>
          )}
        </div>
        <h2 className="font-serif text-lg text-[#0F1117] mb-1 flex items-center gap-2">
          <FileSignature size={18} className="text-[#BA7517]" /> Broker-Carrier Agreement
        </h2>

        {bcaSigned ? (
          <p className="text-[13px] text-gray-600">
            Signed by <span className="font-semibold text-[#0F1117]">{data.bca.signedByName}</span> on {fmtDate(data.bca.signedAt)}
            {data.bca.version ? <> (version {data.bca.version})</> : null}.
          </p>
        ) : (
          <>
            <p className="text-[13px] text-gray-500 mb-3">
              Review the agreement, then sign with your full legal name. This is the agreement between your company and Silk Route Logistics that governs every load.
            </p>

            {/* Review pane */}
            <div className="max-h-72 overflow-auto rounded-lg border border-gray-200 bg-[#F5EEE0] p-4 mb-4">
              {BCA_ARTICLES.map((a) => (
                <div key={a.title} className="mb-3 last:mb-0">
                  <p className="text-xs font-bold text-[#0F1117] mb-0.5">{a.title}</p>
                  <p className="text-[11px] text-gray-600 leading-relaxed">{a.body}</p>
                </div>
              ))}
              <p className="text-[10px] text-gray-400 mt-3 pt-3 border-t border-gray-300/60">
                Broker-Carrier Agreement v{BCA_VERSION}. The full executed agreement governs.
              </p>
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
                I have read and agree to the Broker-Carrier Agreement (v{BCA_VERSION}) on behalf of my company. Typing my name above is my electronic signature.
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
          {qpEnabled && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-green-50 text-green-700 border border-green-200">
              Enabled
            </span>
          )}
        </div>
        <h2 className="font-serif text-lg text-[#0F1117] mb-1 flex items-center gap-2">
          <Zap size={18} className="text-[#BA7517]" /> Quick Pay
        </h2>

        {qpEnabled ? (
          <>
            <p className="text-[13px] text-gray-600 mb-3">
              Quick Pay is <span className="font-semibold text-green-700">enabled</span>
              {data.quickPay.agreedAt ? <> since {fmtDate(data.quickPay.agreedAt)}</> : null}. You can elect Quick Pay on completed loads.
            </p>
            {qpError && <div className={errorBox}>{qpError}</div>}
            <button
              onClick={() => qpMutation.mutate(false)}
              disabled={qpMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 text-xs text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40"
            >
              {qpMutation.isPending && <Loader2 size={13} className="animate-spin" />} Switch to standard terms
            </button>
          </>
        ) : (
          <>
            <p className="text-[13px] text-gray-500 mb-3">{QP_SUMMARY}</p>

            <div className="rounded-lg border border-gray-200 overflow-hidden mb-3">
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
                    <tr key={t.tier} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-semibold text-[#0F1117]">{t.tier}</td>
                      <td className="px-3 py-2 text-gray-600">{t.standard}</td>
                      <td className="px-3 py-2 text-gray-600">{t.sevenDay}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-gray-400 mb-4">{QP_SAME_DAY_NOTE}</p>

            {!showQpEnable ? (
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={() => setShowQpEnable(true)} className={goldCta}>
                  <Zap size={13} /> Enable Quick Pay
                </button>
                <span className="text-xs text-gray-400">or stay on standard terms — nothing to do.</span>
              </div>
            ) : (
              <>
                <div className="max-h-48 overflow-auto rounded-lg border border-gray-200 bg-[#F5EEE0] p-4 mb-3 text-[11px] text-gray-600 leading-relaxed">
                  <p className="font-bold text-[#0F1117] mb-1 text-xs">Caravan Quick Pay Agreement v{QP_VERSION}</p>
                  <p>
                    By enabling Quick Pay you agree to the Caravan Quick Pay Agreement: SRL advances payment on eligible completed loads after a clean proof of delivery, less the flat Quick Pay fee for your tier shown above. Quick Pay does not require a factoring contract, is applied per load at your election, and can be turned off at any time. The full Caravan Quick Pay Agreement governs.
                  </p>
                </div>
                <label className="flex items-start gap-2 mb-3 cursor-pointer">
                  <input type="checkbox" checked={qpAgreed} onChange={(e) => setQpAgreed(e.target.checked)} className="mt-0.5 accent-[#BA7517]" />
                  <span className="text-xs text-gray-600">
                    I agree to the Caravan Quick Pay Agreement (v{QP_VERSION}) and want Quick Pay enabled on my account.
                  </span>
                </label>
                {qpError && <div className={errorBox}>{qpError}</div>}
                <div className="flex gap-2">
                  <button onClick={() => qpMutation.mutate(true)} disabled={!qpAgreed || qpMutation.isPending} className={goldCta}>
                    {qpMutation.isPending && <Loader2 size={13} className="animate-spin" />} Enable Quick Pay
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
