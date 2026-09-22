"use client";

import { useState } from "react";
import { User, Lock, CheckCircle, Bell, Phone, ShieldCheck, Compass } from "lucide-react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CarrierCard } from "@/components/carrier";
import { CarrierWelcomeTour } from "@/components/carrier/CarrierWelcomeTour";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";
import { api } from "@/lib/api";

export default function CarrierSettingsPage() {
  const { user, changePassword } = useCarrierAuth();
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contactPhone, setContactPhone] = useState(user?.phone || "");
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [notifError, setNotifError] = useState("");
  // v3.8.bei — replaying the welcome tour never restamps portalTourCompletedAt.
  const [replayTour, setReplayTour] = useState(false);

  const [notifications, setNotifications] = useState({
    loadUpdates: true,
    paymentAlerts: true,
    complianceReminders: true,
    newLoadMatches: true,
    messageAlerts: true,
    emailNotifications: true,
  });
  const [notifSaved, setNotifSaved] = useState(false);

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
    setPwError("");
    setPwSuccess(false);

    if (newPw !== confirmPw) { setPwError("Passwords don't match"); return; }
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

  const phoneMutation = useMutation({
    mutationFn: () => api.put("/carrier-auth/profile", { phone: contactPhone }),
    onSuccess: () => { setPhoneError(""); setPhoneSaved(true); setTimeout(() => setPhoneSaved(false), 3000); },
    onError: (error: any) => { setPhoneSaved(false); setPhoneError(error?.response?.data?.error || "Failed to save phone number"); setTimeout(() => setPhoneError(""), 5000); },
  });

  const notifMutation = useMutation({
    mutationFn: () => api.put("/carrier-auth/notifications", notifications),
    onSuccess: () => { setNotifError(""); setNotifSaved(true); setTimeout(() => setNotifSaved(false), 3000); },
    onError: (error: any) => { setNotifSaved(false); setNotifError(error?.response?.data?.error || "Failed to save notification preferences"); setTimeout(() => setNotifError(""), 5000); },
  });

  const toggleNotif = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const notifOptions = [
    { key: "loadUpdates" as const, label: "Load Status Updates", desc: "When your loads change status" },
    { key: "paymentAlerts" as const, label: "Payment Alerts", desc: "Payment processed, QuickPay available" },
    { key: "complianceReminders" as const, label: "Compliance Reminders", desc: "Document expiration warnings" },
    { key: "newLoadMatches" as const, label: "New Load Matches", desc: "Loads matching your equipment & regions" },
    { key: "messageAlerts" as const, label: "Message Alerts", desc: "New messages from dispatchers" },
    { key: "emailNotifications" as const, label: "Email Notifications", desc: "Receive alerts via email" },
  ];

  return (
    <div>
      <h1 className="font-serif font-bold text-2xl text-[#0A2540] mb-1">Account Settings</h1>
      <p className="text-[13px] text-gray-500 mb-6">Manage your carrier account, notifications, and security settings</p>

      {replayTour && <CarrierWelcomeTour mode="replay" onClose={() => setReplayTour(false)} />}
      <div className="grid grid-cols-2 gap-4">
        {/* Profile Info */}
        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0A2540] mb-4 flex items-center gap-2">
            <User size={16} className="text-[#BA7517]" /> Profile Information
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <label className="text-gray-700 block mb-1">Name</label>
              <div className="text-[#0A2540] font-medium">{user?.firstName} {user?.lastName}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">Email</label>
              <div className="text-[#0A2540] font-medium">{user?.email}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">Company</label>
              <div className="text-[#0A2540] font-medium">{profile?.companyName || user?.company || "—"}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">MC Number</label>
              <div className="text-[#0A2540] font-medium">{profile?.mcNumber || "—"}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">DOT Number</label>
              <div className="text-[#0A2540] font-medium">{profile?.dotNumber || "—"}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">Tier</label>
              <div className="text-[#0A2540] font-medium">{profile?.tier || "—"}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">Equipment Types</label>
              <div className="flex flex-wrap gap-1">
                {(profile?.equipmentTypes || []).map((eq: string) => (
                  <span key={eq} className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{eq}</span>
                ))}
              </div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">Operating Regions</label>
              <div className="flex flex-wrap gap-1">
                {(profile?.operatingRegions || []).map((r: string) => (
                  <span key={r} className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{r}</span>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-[#F5EEE0]">
              <label className="text-gray-700 block mb-1">Contact Phone</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="flex-1 px-3 py-2 border border-[#EFE6D3] rounded text-xs focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none"
                />
                <button
                  onClick={() => phoneMutation.mutate()}
                  disabled={phoneMutation.isPending}
                  className="px-3 py-2 bg-[#BA7517] text-[#FBF7F0] text-[11px] font-semibold rounded disabled:opacity-50"
                >
                  {phoneMutation.isPending ? "..." : "Save"}
                </button>
              </div>
              {phoneSaved && (
                <div className="flex items-center gap-1 text-[11px] text-[#2F7A4F] mt-1">
                  <CheckCircle size={12} /> Saved
                </div>
              )}
              {phoneError && (
                <div className="text-[11px] text-[#9B2C2C] mt-1">{phoneError}</div>
              )}
            </div>
          </div>
        </CarrierCard>

        {/* Change Password */}
        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0A2540] mb-4 flex items-center gap-2">
            <Lock size={16} className="text-[#B07A1A]" /> Change Password
          </h3>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="text-xs text-gray-700 block mb-1">Current Password</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full px-3 py-2 border border-[#EFE6D3] rounded text-sm focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-700 block mb-1">New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full px-3 py-2 border border-[#EFE6D3] rounded text-sm focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none"
                required
                minLength={8}
              />
            </div>
            <div>
              <label className="text-xs text-gray-700 block mb-1">Confirm New Password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="w-full px-3 py-2 border border-[#EFE6D3] rounded text-sm focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:outline-none"
                required
                minLength={8}
              />
            </div>

            {pwError && <div className="text-xs text-[#9B2C2C]">{pwError}</div>}
            {pwSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-[#2F7A4F]">
                <CheckCircle size={14} /> Password changed successfully
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#BA7517] text-[#FBF7F0] text-xs font-semibold rounded-md disabled:opacity-60"
            >
              {saving ? "Saving..." : "Update Password"}
            </button>
          </form>
        </CarrierCard>

        {/* Two-Factor Authentication */}
        <CarrierCard padding="p-5" className="col-span-2">
          <h3 className="text-sm font-bold text-[#0A2540] mb-4 flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#BA7517]" /> Two-Factor Authentication
          </h3>
          {totpStatus === undefined ? (
            <p className="text-xs text-gray-500 mb-3">Checking enrollment…</p>
          ) : totpStatus.enrolled ? (
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle size={16} className="text-[#2F7A4F]" />
              <span className="text-xs font-semibold text-[#2F7A4F]">Authenticator app enrolled</span>
            </div>
          ) : (
            <p className="text-xs font-semibold text-[#9B2C2C] mb-3">No authenticator app enrolled. Enrollment is required to use the portal.</p>
          )}
          <p className="text-xs text-gray-500 mb-3">
            Two-factor authentication is required on every carrier account and cannot be switched off from this page.
            Lost your authenticator or backup codes? Email compliance@silkroutelogistics.ai and we will reset it after verifying your identity.
          </p>
          <Link href="/carrier/dashboard/security" className="inline-block px-3 py-2 bg-gray-100 text-[#0A2540] text-xs font-semibold rounded hover:bg-gray-200">
            Manage on the Security page
          </Link>
        </CarrierCard>

        {/* Notification Preferences */}
        <CarrierCard padding="p-5" className="col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-[#0A2540] flex items-center gap-2">
              <Bell size={16} className="text-[#BA7517]" /> Notification Preferences
            </h3>
            <button
              onClick={() => notifMutation.mutate()}
              disabled={notifMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#BA7517] text-[#FBF7F0] text-[11px] font-semibold rounded disabled:opacity-50"
            >
              {notifMutation.isPending ? "Saving..." : notifSaved ? <><CheckCircle size={12} /> Saved</> : "Save Preferences"}
            </button>
          </div>
          {notifError && (
            <div className="mb-3 px-3 py-2 bg-[#F6E3E3] border border-[#9B2C2C]/30 rounded text-xs text-[#9B2C2C]">{notifError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {notifOptions.map((opt) => (
              <div
                key={opt.key}
                onClick={() => toggleNotif(opt.key)}
                className="flex items-center justify-between p-3 rounded-lg border border-[#F5EEE0] hover:border-[#C5A572]/30 cursor-pointer transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-[#0A2540]">{opt.label}</div>
                  <div className="text-[11px] text-gray-700">{opt.desc}</div>
                </div>
                <div className={`w-9 h-5 rounded-full flex items-center transition-colors ${notifications[opt.key] ? "bg-[#BA7517] justify-end" : "bg-gray-200 justify-start"}`}>
                  <div className="w-4 h-4 rounded-full bg-white shadow-sm mx-0.5" />
                </div>
              </div>
            ))}
          </div>
        </CarrierCard>

        {/* v3.8.bei — the welcome tour again, on request. The first showing is
            recorded on the profile; this one is not. */}
        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0A2540] mb-2 flex items-center gap-2">
            <Compass size={16} className="text-[#BA7517]" /> Portal tour
          </h3>
          <p className="text-xs text-[#3A4A5F] mb-3">
            Six short slides covering tenders, loads, documents, payments, drivers and training. Shown once when you were approved; replay it here whenever you like.
          </p>
          <button
            type="button"
            onClick={() => setReplayTour(true)}
            className="text-xs font-semibold text-[#FBF7F0] bg-[#BA7517] hover:brightness-95 rounded px-3.5 py-1.5"
            data-testid="replay-tour"
          >
            Replay the tour
          </button>
        </CarrierCard>
      </div>
    </div>
  );
}
