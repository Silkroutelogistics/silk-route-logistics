"use client";

import { useState } from "react";
import { User, Lock, CheckCircle, Bell, Phone, ShieldCheck, Copy } from "lucide-react";
import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CarrierCard } from "@/components/carrier";
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

  const [notifications, setNotifications] = useState({
    loadUpdates: true,
    paymentAlerts: true,
    complianceReminders: true,
    newLoadMatches: true,
    messageAlerts: true,
    emailNotifications: true,
  });
  const [notifSaved, setNotifSaved] = useState(false);

  // 2FA state
  const queryClient = useQueryClient();
  const [totpEnabled, setTotpEnabled] = useState(user?.totpEnabled || false);
  const [totpSetupData, setTotpSetupData] = useState<{ qrCodeDataUrl: string; secret: string; backupCodes: string[] } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState("");
  const [totpSuccess, setTotpSuccess] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  useEffect(() => { setTotpEnabled(user?.totpEnabled || false); }, [user?.totpEnabled]);

  const setupTotp = useMutation({
    mutationFn: () => api.post("/auth/totp/setup"),
    onSuccess: (res) => {
      const d = res.data;
      setTotpSetupData({
        qrCodeDataUrl: d.qrCodeDataUrl || d.qrCodeDataURL || d.qrCode || "",
        secret: d.secret || "",
        backupCodes: d.backupCodes || [],
      });
      setTotpError("");
    },
    onError: (err: any) => setTotpError(err.response?.data?.error || "Failed to start 2FA setup"),
  });

  const verifyTotp = useMutation({
    mutationFn: () => api.post("/auth/totp/verify", { code: totpCode }),
    onSuccess: () => {
      setTotpEnabled(true);
      setTotpSuccess("Two-factor authentication has been enabled successfully.");
      setTotpSetupData(null);
      setTotpCode("");
      queryClient.invalidateQueries();
    },
    onError: (err: any) => setTotpError(err.response?.data?.error || "Invalid verification code"),
  });

  const disableTotp = useMutation({
    mutationFn: () => api.post("/auth/totp/disable", { code: disableCode }),
    onSuccess: () => {
      setTotpEnabled(false);
      setShowDisable(false);
      setDisableCode("");
      setTotpSuccess("Two-factor authentication has been disabled.");
      queryClient.invalidateQueries();
    },
    onError: (err: any) => setTotpError(err.response?.data?.error || "Invalid code. Could not disable 2FA."),
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
      <h1 className="font-serif text-2xl text-[#0F1117] mb-1">Account Settings</h1>
      <p className="text-[13px] text-gray-500 mb-6">Manage your carrier account, notifications, and security settings</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Profile Info */}
        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0F1117] mb-4 flex items-center gap-2">
            <User size={16} className="text-[#BA7517]" /> Profile Information
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <label className="text-gray-700 block mb-1">Name</label>
              <div className="text-[#0F1117] font-medium">{user?.firstName} {user?.lastName}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">Email</label>
              <div className="text-[#0F1117] font-medium">{user?.email}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">Company</label>
              <div className="text-[#0F1117] font-medium">{profile?.companyName || user?.company || "—"}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">MC Number</label>
              <div className="text-[#0F1117] font-medium">{profile?.mcNumber || "—"}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">DOT Number</label>
              <div className="text-[#0F1117] font-medium">{profile?.dotNumber || "—"}</div>
            </div>
            <div>
              <label className="text-gray-700 block mb-1">Tier</label>
              <div className="text-[#0F1117] font-medium">{profile?.tier || "—"}</div>
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
            <div className="pt-2 border-t border-gray-100">
              <label className="text-gray-700 block mb-1">Contact Phone</label>
              <div className="flex gap-2">
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded text-xs focus:border-[#C9A84C] focus:outline-none"
                />
                <button
                  onClick={() => phoneMutation.mutate()}
                  disabled={phoneMutation.isPending}
                  className="px-3 py-2 bg-[#0F1117] text-white text-[11px] font-semibold rounded disabled:opacity-50"
                >
                  {phoneMutation.isPending ? "..." : "Save"}
                </button>
              </div>
              {phoneSaved && (
                <div className="flex items-center gap-1 text-[11px] text-emerald-700 mt-1">
                  <CheckCircle size={12} /> Saved
                </div>
              )}
              {phoneError && (
                <div className="text-[11px] text-red-500 mt-1">{phoneError}</div>
              )}
            </div>
          </div>
        </CarrierCard>

        {/* Change Password */}
        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0F1117] mb-4 flex items-center gap-2">
            <Lock size={16} className="text-amber-700" /> Change Password
          </h3>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="text-xs text-gray-700 block mb-1">Current Password</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:border-[#C9A84C] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-700 block mb-1">New Password</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:border-[#C9A84C] focus:outline-none"
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
                className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:border-[#C9A84C] focus:outline-none"
                required
                minLength={8}
              />
            </div>

            {pwError && <div className="text-xs text-red-500">{pwError}</div>}
            {pwSuccess && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-700">
                <CheckCircle size={14} /> Password changed successfully
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#0F1117] text-white text-xs font-semibold rounded-md disabled:opacity-60"
            >
              {saving ? "Saving..." : "Update Password"}
            </button>
          </form>
        </CarrierCard>

        {/* Two-Factor Authentication */}
        <CarrierCard padding="p-5" className="col-span-2">
          <h3 className="text-sm font-bold text-[#0F1117] mb-4 flex items-center gap-2">
            <ShieldCheck size={16} className="text-[#BA7517]" /> Two-Factor Authentication
          </h3>

          {totpSuccess && (
            <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-600 flex items-center gap-2">
              <CheckCircle size={14} /> {totpSuccess}
            </div>
          )}
          {totpError && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">{totpError}</div>
          )}

          {totpEnabled ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={16} className="text-emerald-700" />
                <span className="text-xs font-semibold text-emerald-600">Two-factor authentication is enabled</span>
              </div>
              {showDisable ? (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">Enter your 6-digit authenticator code to disable 2FA.</p>
                  <input
                    type="text"
                    maxLength={6}
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="000000"
                    className="w-36 px-3 py-2 border border-gray-200 rounded text-sm text-center font-mono tracking-widest focus:border-[#C9A84C] focus:outline-none"
                  />
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => disableTotp.mutate()}
                      disabled={disableTotp.isPending || disableCode.length !== 6}
                      className="px-3 py-2 bg-red-50 text-red-600 border border-red-200 text-xs font-semibold rounded disabled:opacity-50"
                    >
                      {disableTotp.isPending ? "Disabling..." : "Confirm Disable"}
                    </button>
                    <button onClick={() => { setShowDisable(false); setDisableCode(""); setTotpError(""); }} className="text-xs text-gray-700 hover:text-[#0F1117]">Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setShowDisable(true); setTotpSuccess(""); setTotpError(""); }}
                  className="px-3 py-2 bg-gray-100 text-[#0F1117] text-xs font-semibold rounded hover:bg-gray-200"
                >
                  Disable 2FA
                </button>
              )}
            </div>
          ) : totpSetupData ? (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.).</p>
              <div className="flex justify-center">
                <img src={totpSetupData.qrCodeDataUrl} alt="TOTP QR Code" width={180} height={180} className="rounded-lg" />
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">Manual entry key</label>
                <code className="block px-3 py-2 bg-gray-50 border border-gray-200 rounded text-sm text-[#C9A84C] font-mono break-all select-all">{totpSetupData.secret}</code>
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-2">Backup codes (save these somewhere safe)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                  {totpSetupData.backupCodes.map((code, i) => (
                    <div key={i} className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs font-mono text-gray-700 text-center">{code}</div>
                  ))}
                </div>
                <button
                  onClick={() => { navigator.clipboard.writeText(totpSetupData.backupCodes.join("\n")); setTotpSuccess("Backup codes copied to clipboard."); }}
                  className="flex items-center gap-1.5 text-[11px] text-gray-700 hover:text-[#BA7517]"
                >
                  <Copy size={12} /> Copy backup codes
                </button>
              </div>
              <div>
                <label className="block text-xs text-gray-700 mb-1">Enter the 6-digit code from your app</label>
                <input
                  type="text"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-36 px-3 py-2 border border-gray-200 rounded text-sm text-center font-mono tracking-widest focus:border-[#C9A84C] focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => verifyTotp.mutate()}
                  disabled={verifyTotp.isPending || totpCode.length !== 6}
                  className="px-4 py-2 bg-[#0F1117] text-white text-xs font-semibold rounded-md disabled:opacity-50"
                >
                  {verifyTotp.isPending ? "Verifying..." : "Verify & Enable"}
                </button>
                <button onClick={() => { setTotpSetupData(null); setTotpCode(""); setTotpError(""); }} className="text-xs text-gray-700 hover:text-[#0F1117]">Cancel</button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-500 mb-3">Add an extra layer of security to your account by enabling two-factor authentication.</p>
              <button
                onClick={() => { setupTotp.mutate(); setTotpSuccess(""); setTotpError(""); }}
                disabled={setupTotp.isPending}
                className="px-4 py-2 bg-[#0F1117] text-white text-xs font-semibold rounded-md disabled:opacity-50"
              >
                {setupTotp.isPending ? "Setting up..." : "Enable 2FA"}
              </button>
            </div>
          )}
        </CarrierCard>

        {/* Notification Preferences */}
        <CarrierCard padding="p-5" className="col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-[#0F1117] flex items-center gap-2">
              <Bell size={16} className="text-[#BA7517]" /> Notification Preferences
            </h3>
            <button
              onClick={() => notifMutation.mutate()}
              disabled={notifMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0F1117] text-white text-[11px] font-semibold rounded disabled:opacity-50"
            >
              {notifMutation.isPending ? "Saving..." : notifSaved ? <><CheckCircle size={12} /> Saved</> : "Save Preferences"}
            </button>
          </div>
          {notifError && (
            <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">{notifError}</div>
          )}
          <div className="grid grid-cols-2 gap-3">
            {notifOptions.map((opt) => (
              <div
                key={opt.key}
                onClick={() => toggleNotif(opt.key)}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-[#C9A84C]/30 cursor-pointer transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-[#0F1117]">{opt.label}</div>
                  <div className="text-[11px] text-gray-700">{opt.desc}</div>
                </div>
                <div className={`w-9 h-5 rounded-full flex items-center transition-colors ${notifications[opt.key] ? "bg-[#C9A84C] justify-end" : "bg-gray-200 justify-start"}`}>
                  <div className="w-4 h-4 rounded-full bg-white shadow-sm mx-0.5" />
                </div>
              </div>
            ))}
          </div>
        </CarrierCard>
      </div>
    </div>
  );
}
