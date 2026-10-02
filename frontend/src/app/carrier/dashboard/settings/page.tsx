"use client";

import { useState } from "react";
import { User, Lock, CheckCircle, Bell, ShieldCheck, Compass } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CarrierCard } from "@/components/carrier";
import { CarrierWelcomeTour } from "@/components/carrier/CarrierWelcomeTour";
import { LockedFeature } from "@/components/carrier/LockedFeature";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";
import { api } from "@/lib/api";
import { mcDigits } from "@/lib/mcNumber";
import { featureReason, isFeatureEnabled } from "@/lib/carrierPortalFeatures";
import { BTN, TEXT_MUTED, useUnsavedChangesWarning } from "@/lib/carrierUi";

const NOT_ON_FILE = "Not on file";

// carrier-portal-upgrade M1 — what a carrier receives today. Shown as a list,
// not as toggles: the toggles saved to a route that does not exist and no
// column stores the choices, so they promised a control nobody could honour.
const NOTICE_TYPES = [
  { label: "Load status updates", desc: "When your loads change status" },
  { label: "Payment alerts", desc: "Payment processed, Quick Pay decisions" },
  { label: "Compliance reminders", desc: "Document expiration warnings" },
  { label: "Tender offers", desc: "Loads offered to you by SRL" },
  { label: "Messages", desc: "New messages from the SRL team" },
  { label: "Email", desc: "The same notices by email" },
];

const INPUT =
  "w-full min-h-[44px] px-3 py-2 border border-[#EFE6D3] rounded text-sm transition-colors duration-150 motion-reduce:transition-none " +
  "focus:border-[#BA7517] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]/40";

export default function CarrierSettingsPage() {
  const { user, changePassword } = useCarrierAuth();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  // v3.8.bei — replaying the welcome tour never restamps portalTourCompletedAt.
  const [replayTour, setReplayTour] = useState(false);

  // M5 — a half-typed password change is worth a warning before the tab closes.
  useUnsavedChangesWarning(!saving && !!(currentPw || newPw || confirmPw));

  // 2FA is read-only here. Enrollment lives on /carrier/dashboard/security, the
  // screen the portal already sends an unenrolled carrier to. B1b (2026-09-17):
  // this card used to call the AE-side /auth/totp/{setup,verify,disable} routes, and because /me
  // never returned totpEnabled it always rendered "not enabled" — so an
  // enrolled carrier who clicked Enable rotated its own secret and backup codes
  // with no record, and a Disable button switched the mandatory factor off
  // with no record. Same query key as the Security page, so enrolling there
  // updates this card without a reload.
  const { data: totpStatus } = useQuery({
    queryKey: ["carrier-totp-status"],
    queryFn: () => api.get<{ enrolled: boolean; required: boolean }>("/carrier-auth/totp/status").then((r) => r.data),
  });

  const profile = user?.carrierProfile;

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return; // M5 — one submission at a time
    setPwError("");
    setPwSuccess(false);

    if (newPw !== confirmPw) { setPwError("Passwords do not match"); return; }
    if (newPw.length < 8) { setPwError("Password must be at least 8 characters"); return; }

    setSaving(true);
    const ok = await changePassword(currentPw, newPw);
    setSaving(false);

    if (ok) {
      setPwSuccess(true);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } else {
      setPwError("Failed to change password. Check your current password.");
    }
  };

  const field = (label: string, value: React.ReactNode) => (
    <div>
      <div className={`${TEXT_MUTED} mb-1`}>{label}</div>
      <div className="text-[#0A2540] font-medium break-words">{value}</div>
    </div>
  );

  return (
    <div>
      <h1 className="font-serif font-bold text-2xl text-[#0A2540] mb-1">Account Settings</h1>
      <p className={`text-[13px] ${TEXT_MUTED} mb-6`}>Manage your carrier account, notifications, and security settings</p>

      {replayTour && <CarrierWelcomeTour mode="replay" onClose={() => setReplayTour(false)} />}
      {/* M4 — one column under 768px. */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Profile Info */}
        <CarrierCard padding="p-5">
          <h2 className="text-sm font-bold text-[#0A2540] mb-4 flex items-center gap-2">
            <User size={16} className="text-[#854F0B]" aria-hidden="true" /> Profile Information
          </h2>
          <div className="space-y-3 text-xs">
            {field("Name", `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim() || NOT_ON_FILE)}
            {field("Email", user?.email || NOT_ON_FILE)}
            {field("Company", profile?.companyName || user?.company || NOT_ON_FILE)}
            {field("MC Number", mcDigits(profile?.mcNumber) || NOT_ON_FILE)}
            {field("DOT Number", profile?.dotNumber || NOT_ON_FILE)}
            {field("Tier", profile?.tier || NOT_ON_FILE)}
            <div>
              <div className={`${TEXT_MUTED} mb-1`}>Equipment Types</div>
              <div className="flex flex-wrap gap-1">
                {(profile?.equipmentTypes || []).map((eq: string) => (
                  <span key={eq} className="px-2 py-0.5 bg-[#F5EEE0] rounded text-[11px] text-[#3A4A5F]">{eq}</span>
                ))}
              </div>
            </div>
            <div>
              <div className={`${TEXT_MUTED} mb-1`}>Operating Regions</div>
              <div className="flex flex-wrap gap-1">
                {(profile?.operatingRegions || []).map((r: string) => (
                  <span key={r} className="px-2 py-0.5 bg-[#F5EEE0] rounded text-[11px] text-[#3A4A5F]">{r}</span>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-[#F5EEE0]">
              <div className={`${TEXT_MUTED} mb-1`}>Contact Phone</div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {user?.phone ? (
                  <a href={`tel:${user.phone}`} className="text-[#0A2540] font-medium underline-offset-2 hover:underline">{user.phone}</a>
                ) : (
                  <span className="text-[#0A2540] font-medium">{NOT_ON_FILE}</span>
                )}
                {/* M1 — locked: Save PUT /carrier-auth/profile, which does not exist. */}
                {!isFeatureEnabled("contactPhoneEdit") && (
                  <LockedFeature label="Edit phone" reason={featureReason("contactPhoneEdit")} />
                )}
              </div>
            </div>
          </div>
        </CarrierCard>

        {/* Change Password */}
        <CarrierCard padding="p-5">
          <h2 className="text-sm font-bold text-[#0A2540] mb-4 flex items-center gap-2">
            <Lock size={16} className="text-[#854F0B]" aria-hidden="true" /> Change Password
          </h2>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label htmlFor="pw-current" className="text-xs text-[#3A4A5F] block mb-1">Current Password</label>
              <input id="pw-current" type="password" autoComplete="current-password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} className={INPUT} required />
            </div>
            <div>
              <label htmlFor="pw-new" className="text-xs text-[#3A4A5F] block mb-1">New Password</label>
              <input id="pw-new" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} className={INPUT} required minLength={8} />
            </div>
            <div>
              <label htmlFor="pw-confirm" className="text-xs text-[#3A4A5F] block mb-1">Confirm New Password</label>
              <input id="pw-confirm" type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className={INPUT} required minLength={8} />
            </div>

            {pwError && <div role="alert" className="text-xs text-[#9B2C2C]">{pwError}</div>}
            {pwSuccess && (
              <div role="status" className="flex items-center gap-1.5 text-xs text-[#2F7A4F]">
                <CheckCircle size={14} aria-hidden="true" /> Password changed successfully
              </div>
            )}

            <button type="submit" disabled={saving} className={BTN.primary}>
              {saving ? "Saving..." : "Update Password"}
            </button>
          </form>
        </CarrierCard>

        {/* Two-Factor Authentication */}
        <CarrierCard padding="p-5" className="md:col-span-2">
          <h2 className="text-sm font-bold text-[#0A2540] mb-4 flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#854F0B]" aria-hidden="true" /> Two-Factor Authentication
          </h2>
          {totpStatus === undefined ? (
            <div role="status" aria-label="Checking enrollment" className="h-4 w-48 mb-3 rounded bg-[#F5EEE0] animate-pulse motion-reduce:animate-none" />
          ) : totpStatus.enrolled ? (
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} className="text-[#2F7A4F]" aria-hidden="true" />
              <span className="text-xs font-semibold text-[#2F7A4F]">Authenticator app enrolled</span>
            </div>
          ) : (
            <p className="text-xs font-semibold text-[#9B2C2C] mb-3">No authenticator app enrolled. Enrollment is required to use the portal.</p>
          )}
          <p className={`text-xs ${TEXT_MUTED} mb-3`}>
            Two-factor authentication is required on every carrier account and cannot be switched off from this page.
            Lost your authenticator or backup codes? Email{" "}
            <a href="mailto:compliance@silkroutelogistics.ai" className="underline underline-offset-2">compliance@silkroutelogistics.ai</a>{" "}
            and we will reset it after verifying your identity.
          </p>
          <Link href="/carrier/dashboard/security" className={BTN.secondary}>
            Manage on the Security page
          </Link>
        </CarrierCard>

        {/* Notification Preferences, locked (M1) */}
        <CarrierCard padding="p-5" className="md:col-span-2">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <h2 className="text-sm font-bold text-[#0A2540] flex items-center gap-2">
              <Bell size={16} className="text-[#854F0B]" aria-hidden="true" /> Notification Preferences
            </h2>
            {!isFeatureEnabled("notificationPreferences") && (
              <LockedFeature label="Choose notices" reason={featureReason("notificationPreferences")} />
            )}
          </div>
          <p className={`text-xs ${TEXT_MUTED} mb-3`}>You receive all of these notices today.</p>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {NOTICE_TYPES.map((opt) => (
              <li key={opt.label} className="p-3 rounded-lg border border-[#F5EEE0]">
                <div className="text-xs font-semibold text-[#0A2540]">{opt.label}</div>
                <div className="text-[11px] text-[#3A4A5F]">{opt.desc}</div>
              </li>
            ))}
          </ul>
        </CarrierCard>

        {/* v3.8.bei — the welcome tour again, on request. The first showing is
            recorded on the profile; this one is not. */}
        <CarrierCard padding="p-5">
          <h2 className="text-sm font-bold text-[#0A2540] mb-2 flex items-center gap-2">
            <Compass size={16} className="text-[#854F0B]" aria-hidden="true" /> Portal tour
          </h2>
          <p className="text-xs text-[#3A4A5F] mb-3">
            Six short slides covering tenders, loads, documents, payments, drivers and training. Shown once when you were approved; replay it here whenever you like.
          </p>
          <button type="button" onClick={() => setReplayTour(true)} className={BTN.primary} data-testid="replay-tour">
            Replay the tour
          </button>
        </CarrierCard>
      </div>
    </div>
  );
}
