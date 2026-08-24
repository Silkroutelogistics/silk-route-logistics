"use client";

/**
 * Arc 33 — the AE invitation modal.
 *
 * Replaces a CTA that read "Invite Carriers" and navigated to /onboarding — the
 * carrier's own five-step self-registration wizard. It invited nobody: the AE
 * landed on a form asking for THEIR company name, MC number and password.
 *
 * Convention copied verbatim from InfoRequestModal and RejectCarrierModal, the
 * two extracted modals on this page: 4-prop interface, `if (!open) return null`,
 * Escape/backdrop/X close, reset-on-open, a self-owned mutation through the
 * shared api client, inline danger panel read from err.response.data.error, and
 * z-[200] over #BA7517 eyebrow + Playfair title.
 *
 * One deliberate departure: this modal keeps its result on screen after a
 * successful send instead of closing, because the copy-link is the whole point
 * of the fallback and closing would throw it away.
 */

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Loader2, Copy, Check, Mail, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
}

type Sent = { inviteUrl: string; emailSent: boolean; reissued: boolean };

export function InviteCarrierModal({ open, onClose }: Props) {
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [mcNumber, setMcNumber] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setEmail(""); setCompany(""); setMcNumber(""); setNote("");
    setError(null); setSent(null); setCopied(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const invite = useMutation({
    mutationFn: async () => {
      const body: Record<string, string> = { email: email.trim() };
      // Omit rather than send empty strings — the validator's .optional()
      // accepts absent, and an empty string is a different claim from "unknown".
      if (company.trim()) body.company = company.trim();
      if (mcNumber.trim()) body.mcNumber = mcNumber.trim();
      if (note.trim()) body.note = note.trim();
      return (await api.post("/carriers/invite", body)).data as Sent;
    },
    onSuccess: (d) => { setSent(d); setError(null); },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error ?? "Could not send the invitation.");
    },
  });

  if (!open) return null;

  const emailLooksValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-[#EFE6D3] bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-[#EFE6D3] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BA7517]">
              Carrier network
            </p>
            <h2 className="mt-1 font-serif text-xl italic font-semibold text-[#0A2540]">
              Invite a carrier to onboard
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-[#6B7685] hover:bg-[#FBF7F0]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {!sent ? (
          <>
            <div className="space-y-4 px-6 py-5">
              <p className="text-sm leading-relaxed text-[#3A4A5F]">
                We&apos;ll email them a link that opens their application with whatever you fill in
                below already filled in. <strong>Opening the link confirms their email</strong>, so
                they won&apos;t be asked for a code.
              </p>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[#6B7685]">
                  Their email <span className="text-[#9B2C2C]">*</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="dispatch@carrier.com"
                  className="w-full rounded-md border border-[#EFE6D3] bg-white px-3 py-2.5 text-sm text-[#0A2540] placeholder:text-[#A7AEB8] focus:border-[#BA7517] focus:ring-2 focus:ring-[#BA7517]/15"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[#6B7685]">
                    Company <span className="font-normal normal-case tracking-normal text-[#A7AEB8]">(optional)</span>
                  </label>
                  <input
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="Acme Trucking LLC"
                    className="w-full rounded-md border border-[#EFE6D3] bg-white px-3 py-2.5 text-sm text-[#0A2540] placeholder:text-[#A7AEB8] focus:border-[#BA7517] focus:ring-2 focus:ring-[#BA7517]/15"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[#6B7685]">
                    MC number <span className="font-normal normal-case tracking-normal text-[#A7AEB8]">(optional)</span>
                  </label>
                  <input
                    value={mcNumber}
                    onChange={(e) => setMcNumber(e.target.value)}
                    placeholder="MC-123456"
                    className="w-full rounded-md border border-[#EFE6D3] bg-white px-3 py-2.5 text-sm text-[#0A2540] placeholder:text-[#A7AEB8] focus:border-[#BA7517] focus:ring-2 focus:ring-[#BA7517]/15"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[#6B7685]">
                  A line from you <span className="font-normal normal-case tracking-normal text-[#A7AEB8]">(optional)</span>
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value.slice(0, 1000))}
                  rows={3}
                  placeholder="Good speaking today — here's the link to get set up."
                  className="w-full resize-none rounded-md border border-[#EFE6D3] bg-white px-3 py-2.5 text-sm text-[#0A2540] placeholder:text-[#A7AEB8] focus:border-[#BA7517] focus:ring-2 focus:ring-[#BA7517]/15"
                />
              </div>

              {error && (
                <div className="flex gap-2 rounded-md border-l-4 border-[#9B2C2C] bg-[#F6E3E3] px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#9B2C2C]" />
                  <p className="text-sm text-[#9B2C2C]">{error}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-[#EFE6D3] px-6 py-4">
              <button onClick={onClose} className="rounded-md px-4 py-2 text-sm font-medium text-[#3A4A5F] hover:bg-[#FBF7F0]">
                Cancel
              </button>
              <button
                onClick={() => invite.mutate()}
                disabled={!emailLooksValid || invite.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-[#BA7517] px-5 py-2 text-sm font-semibold text-[#FBF7F0] transition hover:bg-[#C5A572] disabled:opacity-40 disabled:hover:bg-[#BA7517]"
              >
                {invite.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                {invite.isPending ? "Sending…" : "Send invitation"}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4 px-6 py-5">
            <div className="rounded-md border border-[#2F7A4F]/40 bg-[#E6F0E9] px-4 py-3">
              <p className="text-sm font-medium text-[#2F7A4F]">
                {sent.reissued ? "Invitation re-sent" : "Invitation sent"}
                {sent.emailSent ? "" : " — but the email did not go out"}
              </p>
              <p className="mt-1 text-sm text-[#3A4A5F]">
                {sent.emailSent
                  ? `${email} has the link. It works for 7 days and can only be used once.`
                  : "Our mail provider rejected it. Send them the link below directly."}
              </p>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-[#6B7685]">
                Link to share
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={sent.inviteUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full rounded-md border border-[#EFE6D3] bg-[#FBF7F0] px-3 py-2.5 font-mono text-xs text-[#0A2540]"
                />
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(sent.inviteUrl);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#EFE6D3] px-3 py-2 text-sm font-medium text-[#BA7517] hover:bg-[#FBF7F0]"
                >
                  {copied ? <Check className="h-4 w-4 text-[#2F7A4F]" /> : <Copy className="h-4 w-4" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[#6B7685]">
                Returned whether or not the email sent — mail gets filtered often enough that
                being able to read it down the phone matters.
              </p>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#EFE6D3] pt-4">
              <button onClick={() => setSent(null)} className="rounded-md px-4 py-2 text-sm font-medium text-[#3A4A5F] hover:bg-[#FBF7F0]">
                Invite another
              </button>
              <button onClick={onClose} className="rounded-md bg-[#BA7517] px-5 py-2 text-sm font-semibold text-[#FBF7F0] hover:bg-[#C5A572]">
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
