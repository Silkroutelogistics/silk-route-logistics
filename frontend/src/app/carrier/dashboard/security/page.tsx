"use client";

// Carrier two-factor enrollment (Arc 11 B1-ENROLLMENT).
//
// This is a wall, not a settings page. Until the authenticator is armed the
// layout sends every carrier here and the backend refuses every other carrier
// route, so this screen has to carry the whole explanation of why — a carrier
// who lands here confused and leaves is a carrier who cannot work.
//
// THREE STEPS, AND THE ORDER IS THE POINT:
//   1. explain, then hand over a QR and a typed key
//   2. prove the pairing with a real code — nothing is armed before this
//   3. show the backup codes, once
//
// Step 3 is last for a reason worth stating where the code is. Since v3.8.atl
// the codes are bcrypt hashes and cannot be read back, so the only moment they
// can be displayed is the moment they are created — and creating them before
// the pairing is proven hands the carrier recovery codes for a factor they may
// never have successfully armed.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Smartphone,
  KeyRound,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier";

interface TotpStatus {
  enrolled: boolean;
  emailVerified: boolean;
  required: boolean;
}

interface SetupPayload {
  qrCode: string;
  manualKey: string;
  appHint: string;
}

export default function CarrierSecurityPage() {
  const qc = useQueryClient();
  const [setup, setSetup] = useState<SetupPayload | null>(null);
  const [code, setCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ["carrier-totp-status"],
    queryFn: () => api.get<TotpStatus>("/carrier-auth/totp/status").then((r) => r.data),
  });

  const startSetup = useMutation({
    mutationFn: () => api.post<SetupPayload>("/carrier-auth/totp/setup").then((r) => r.data),
    onSuccess: (d) => {
      setSetup(d);
      setError(null);
    },
    onError: (e: any) =>
      setError(
        e?.response?.data?.error ||
          "We could not start setup just now. Try again, or contact operations@silkroutelogistics.ai.",
      ),
  });

  const confirm = useMutation({
    mutationFn: () =>
      api
        .post<{ enabled: boolean; backupCodes: string[] }>("/carrier-auth/totp/confirm", {
          code: code.trim(),
        })
        .then((r) => r.data),
    onSuccess: (d) => {
      setBackupCodes(d.backupCodes);
      setError(null);
      // Deliberately NOT invalidating carrier-totp-status yet. Doing so would
      // flip this screen to the enrolled state and take the backup codes off
      // the page — the one and only time they can ever be shown. The carrier
      // dismisses them explicitly below, and that is what refetches.
    },
    onError: (e: any) => {
      setError(e?.response?.data?.error || "That code did not match. Try the current one.");
      setCode("");
    },
  });

  function finish() {
    qc.invalidateQueries({ queryKey: ["carrier-totp-status"] });
    qc.invalidateQueries({ queryKey: ["carrier-activation"] });
    setBackupCodes(null);
    setSetup(null);
  }

  function copyCodes() {
    if (!backupCodes) return;
    navigator.clipboard?.writeText(backupCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#C5A572]" />
      </div>
    );
  }

  // ── Already armed ────────────────────────────────────────────────────────
  if (status?.enrolled && !backupCodes) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <CarrierCard>
          <div className="flex items-start gap-4">
            <div className="w-11 h-11 rounded-full bg-[#E6F0E9] flex items-center justify-center flex-shrink-0">
              <ShieldCheck className="w-6 h-6 text-[#2F7A4F]" />
            </div>
            <div>
              <h1 className="font-serif text-xl font-bold text-[#0A2540]">
                Two-factor authentication is on
              </h1>
              <p className="mt-2 text-sm text-[#3A4A5F] leading-relaxed">
                Your authenticator app is paired with this account. You will be asked for a
                six-digit code when you sign in.
              </p>
              <p className="mt-3 text-sm text-[#6B7685] leading-relaxed">
                Lost your phone, or run out of backup codes? Email{" "}
                <a
                  href="mailto:operations@silkroutelogistics.ai"
                  className="text-[#BA7517] underline underline-offset-2"
                >
                  operations@silkroutelogistics.ai
                </a>{" "}
                and we will verify you before resetting it. We will never reset it on a phone
                call alone.
              </p>
            </div>
          </div>
        </CarrierCard>
      </div>
    );
  }

  // ── Backup codes, shown once ─────────────────────────────────────────────
  if (backupCodes) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <CarrierCard>
          <div className="flex items-start gap-3 mb-5">
            <CheckCircle2 className="w-6 h-6 text-[#2F7A4F] flex-shrink-0" />
            <div>
              <h1 className="font-serif text-xl font-bold text-[#0A2540]">
                Two-factor authentication is on
              </h1>
              <p className="mt-1 text-sm text-[#3A4A5F]">
                One thing left. Save these backup codes.
              </p>
            </div>
          </div>

          <div className="rounded-md border border-[#B07A1A]/40 bg-[#FBEFD4] p-4 mb-5">
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-[#B07A1A] flex-shrink-0 mt-0.5" />
              <p className="text-sm text-[#B07A1A] leading-relaxed">
                <strong>This is the only time these are shown.</strong> They are stored
                scrambled, so we cannot look them up or send them again — not even if you ask.
                Each one works once, and they are the only way back in if you lose your phone.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-5">
            {backupCodes.map((c) => (
              <div
                key={c}
                className="font-mono text-sm tracking-wider text-[#0A2540] bg-[#F5EEE0] border border-[#EFE6D3] rounded px-3 py-2 text-center"
              >
                {c}
              </div>
            ))}
          </div>

          <button
            onClick={copyCodes}
            className="w-full mb-3 flex items-center justify-center gap-2 rounded-md border border-[#EFE6D3] px-4 py-2.5 text-sm font-medium text-[#0A2540] hover:bg-[#FBF7F0] transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-[#2F7A4F]" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" /> Copy all eight
              </>
            )}
          </button>

          <label className="flex items-start gap-2.5 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
              className="mt-0.5 accent-[#BA7517] w-4 h-4"
            />
            <span className="text-sm text-[#3A4A5F] leading-relaxed">
              I have saved these somewhere I can reach without my phone.
            </span>
          </label>

          <button
            onClick={finish}
            disabled={!saved}
            className="w-full rounded-md bg-[#BA7517] px-4 py-2.5 text-sm font-semibold text-[#FBF7F0] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#A5680F] transition-colors"
          >
            Continue to the portal
          </button>
        </CarrierCard>
      </div>
    );
  }

  // ── Enrollment ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto p-6">
      <CarrierCard>
        <div className="flex items-start gap-4 mb-6">
          <div className="w-11 h-11 rounded-full bg-[#FAEEDA] flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-6 h-6 text-[#BA7517]" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BA7517]">
              Required
            </p>
            <h1 className="mt-1 font-serif text-xl font-bold text-[#0A2540]">
              Set up two-factor authentication
            </h1>
            <p className="mt-2 text-sm text-[#3A4A5F] leading-relaxed">
              {/* Says what the account actually holds. An earlier draft claimed
                  "bank details", which is not true — SRL stores no account or
                  routing columns anywhere, and a carrier reading that would
                  reasonably conclude we hold something we do not. Overstating
                  what is at risk to justify a security control is still a false
                  statement about their data. */}
              Your account holds your payment records, rate confirmations, load details
              and compliance documents. A
              password alone is not enough to protect it, so every carrier account needs an
              authenticator app before using the portal.
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-md border border-[#9B2C2C] bg-[#F6E3E3] px-4 py-3 text-sm text-[#9B2C2C]">
            {error}
          </div>
        )}

        {!setup ? (
          <>
            <div className="rounded-md bg-[#FBF7F0] border border-[#EFE6D3] p-4 mb-5">
              <div className="flex gap-3">
                <Smartphone className="w-5 h-5 text-[#BA7517] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-[#0A2540]">
                    You will need an authenticator app on your phone
                  </p>
                  <p className="mt-1 text-sm text-[#6B7685] leading-relaxed">
                    Google Authenticator, Microsoft Authenticator, Authy or any equivalent.
                    They are free. If you already use one for another account, the same app
                    works here.
                  </p>
                </div>
              </div>
            </div>

            <button
              onClick={() => startSetup.mutate()}
              disabled={startSetup.isPending}
              className="w-full flex items-center justify-center gap-2 rounded-md bg-[#BA7517] px-4 py-2.5 text-sm font-semibold text-[#FBF7F0] hover:bg-[#A5680F] disabled:opacity-50 transition-colors"
            >
              {startSetup.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Starting
                </>
              ) : (
                "Begin setup"
              )}
            </button>
          </>
        ) : (
          <ol className="space-y-5 mb-6">
            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0A2540] text-[#FBF7F0] text-xs font-semibold flex items-center justify-center flex-shrink-0">
                1
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium text-[#0A2540]">
                  Scan this with your authenticator app
                </p>
                <div className="mt-3 inline-block rounded-md border border-[#C5A572] p-2 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={setup.qrCode} alt="Two-factor setup QR code" className="w-40 h-40" />
                </div>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0A2540] text-[#FBF7F0] text-xs font-semibold flex items-center justify-center flex-shrink-0">
                2
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#0A2540]">
                  Or type this key in by hand
                </p>
                <p className="mt-1 text-sm text-[#6B7685] leading-relaxed">
                  Use this if you are reading this page on the same phone that has the app, so
                  there is no second screen to scan.
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 font-mono text-xs tracking-wider text-[#0A2540] bg-[#F5EEE0] border border-[#EFE6D3] rounded px-3 py-2 break-all">
                    {setup.manualKey}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(setup.manualKey);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="rounded-md border border-[#EFE6D3] p-2 hover:bg-[#FBF7F0] transition-colors"
                    aria-label="Copy setup key"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-[#2F7A4F]" />
                    ) : (
                      <Copy className="w-4 h-4 text-[#6B7685]" />
                    )}
                  </button>
                </div>
              </div>
            </li>

            <li className="flex gap-3">
              <span className="w-6 h-6 rounded-full bg-[#0A2540] text-[#FBF7F0] text-xs font-semibold flex items-center justify-center flex-shrink-0">
                3
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#0A2540]">
                  Enter the six-digit code it shows
                </p>
                <p className="mt-1 text-sm text-[#6B7685] leading-relaxed">
                  Nothing is switched on until this code checks out, so you cannot get locked
                  behind an app that never paired properly.
                </p>
                <div className="mt-3 flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A7AEB8]" />
                    <input
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && code.length === 6 && !confirm.isPending) {
                          confirm.mutate();
                        }
                      }}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      placeholder="000000"
                      className="w-full pl-9 pr-3 py-2.5 font-mono tracking-[0.3em] text-center text-[#0A2540] bg-white border border-[#EFE6D3] rounded-md focus:border-[#BA7517] focus:ring-2 focus:ring-[#BA7517]/15 outline-none placeholder:text-[#A7AEB8]"
                    />
                  </div>
                  <button
                    onClick={() => confirm.mutate()}
                    disabled={code.length !== 6 || confirm.isPending}
                    className="rounded-md bg-[#BA7517] px-5 py-2.5 text-sm font-semibold text-[#FBF7F0] hover:bg-[#A5680F] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    {confirm.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Turn it on"
                    )}
                  </button>
                </div>
              </div>
            </li>
          </ol>
        )}
      </CarrierCard>
    </div>
  );
}
