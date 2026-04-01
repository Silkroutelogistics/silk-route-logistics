"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isCarrier } from "@/lib/roles";
import { TierBadge } from "@/components/ui/TierBadge";
import { Save, Lock, Bell, User, Shield, CheckCircle, Copy, ShieldCheck, Info } from "lucide-react";
import { VersionFooter } from "@/components/ui/VersionFooter";
import { useToast } from "@/components/ui/Toast";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsPage() {
  const { user } = useAuthStore();
  const carrier = isCarrier(user?.role);

  const [profile, setProfile] = useState({ firstName: user?.firstName || "", lastName: user?.lastName || "", phone: "", company: "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [profileSaved, setProfileSaved] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

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

  const isAdminOrCeo = user?.role === "ADMIN" || user?.role === "CEO";

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

  const { data: carrierProfile } = useQuery({
    queryKey: ["carrier-onboarding"],
    queryFn: () => api.get("/carrier/onboarding-status").then((r) => r.data),
    enabled: carrier,
  });

  const updateProfile = useMutation({
    mutationFn: () => api.patch("/auth/profile", profile),
    onSuccess: () => { setProfileSaved(true); setTimeout(() => setProfileSaved(false), 3000); },
  });

  const changePassword = useMutation({
    mutationFn: () => api.patch("/auth/password", { currentPassword: passwords.currentPassword, newPassword: passwords.newPassword }),
    onSuccess: () => { setPwSaved(true); setPwError(""); setPasswords({ currentPassword: "", newPassword: "", confirm: "" }); setTimeout(() => setPwSaved(false), 3000); },
    onError: (err: any) => { setPwError(err.response?.data?.error || "Failed to change password"); },
  });

  const { toast } = useToast();
  const [notifications, setNotifications] = useState({ loads: true, payments: true, scorecard: true, announcements: true });
  const notifDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist notification preferences to backend with debounce
  const savePrefs = useMutation({
    mutationFn: (prefs: typeof notifications) => api.patch("/auth/preferences", { notifications: prefs }),
    onSuccess: () => toast("Notification preferences saved", "success"),
    onError: () => toast("Failed to save preferences", "error"),
  });

  const handleNotifToggle = (key: string) => {
    setNotifications((n) => {
      const updated = { ...n, [key]: !n[key as keyof typeof n] };
      // Debounce save: wait 800ms after last toggle
      if (notifDebounce.current) clearTimeout(notifDebounce.current);
      notifDebounce.current = setTimeout(() => savePrefs.mutate(updated), 800);
      return updated;
    });
  };

  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* Profile */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <User className="w-5 h-5 text-gold" />
          <h2 className="font-semibold text-white">Profile</h2>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">First Name</label>
            <input value={profile.firstName} onChange={(e) => setProfile((p) => ({ ...p, firstName: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Last Name</label>
            <input value={profile.lastName} onChange={(e) => setProfile((p) => ({ ...p, lastName: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Email</label>
            <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-400">{user?.email}</div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Role</label>
            <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-slate-400 capitalize">{user?.role?.toLowerCase()}</div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Phone</label>
            <input value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} placeholder="(xxx) xxx-xxxx"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Company</label>
            <input value={profile.company} onChange={(e) => setProfile((p) => ({ ...p, company: e.target.value }))} placeholder="Company name"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => updateProfile.mutate()} disabled={updateProfile.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
            <Save className="w-4 h-4" /> Save Changes
          </button>
          {profileSaved && <span className="text-sm text-green-400">Saved!</span>}
        </div>
      </div>

      {/* Password */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-5 h-5 text-gold" />
          <h2 className="font-semibold text-white">Change Password</h2>
        </div>
        <div className="space-y-3 max-w-md">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Current Password</label>
            <input type="password" value={passwords.currentPassword} onChange={(e) => setPasswords((p) => ({ ...p, currentPassword: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">New Password</label>
            <input type="password" value={passwords.newPassword} onChange={(e) => setPasswords((p) => ({ ...p, newPassword: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Confirm New Password</label>
            <input type="password" value={passwords.confirm} onChange={(e) => setPasswords((p) => ({ ...p, confirm: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          {pwError && <p className="text-sm text-red-400">{pwError}</p>}
          <div className="flex items-center gap-3">
            <button onClick={() => {
              if (passwords.newPassword !== passwords.confirm) { setPwError("Passwords don't match"); return; }
              if (passwords.newPassword.length < 8) { setPwError("Min 8 characters"); return; }
              changePassword.mutate();
            }} disabled={changePassword.isPending || !passwords.currentPassword || !passwords.newPassword}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 disabled:opacity-50">
              <Lock className="w-4 h-4" /> Update Password
            </button>
            {pwSaved && <span className="text-sm text-green-400">Password updated!</span>}
          </div>
        </div>
      </div>

      {/* Two-Factor Authentication */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-gold" />
          <h2 className="font-semibold text-white">Two-Factor Authentication</h2>
        </div>

        {totpSuccess && (
          <div className="mb-4 px-3 py-2 bg-green-500/10 border border-green-500/20 rounded-lg text-sm text-green-400 flex items-center gap-2">
            <CheckCircle className="w-4 h-4" /> {totpSuccess}
          </div>
        )}
        {totpError && (
          <div className="mb-4 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">{totpError}</div>
        )}

        {totpEnabled ? (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-sm text-green-400 font-medium">Two-factor authentication is enabled</span>
            </div>
            {isAdminOrCeo ? (
              <p className="text-sm text-slate-400">2FA is mandatory for administrators and cannot be disabled.</p>
            ) : showDisable ? (
              <div className="space-y-3 max-w-md">
                <p className="text-sm text-slate-400">Enter your 6-digit authenticator code to disable 2FA.</p>
                <input
                  type="text"
                  maxLength={6}
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                  className="w-40 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white tracking-widest text-center font-mono focus:outline-none focus:border-gold/50"
                />
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => disableTotp.mutate()}
                    disabled={disableTotp.isPending || disableCode.length !== 6}
                    className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm hover:bg-red-500/30 disabled:opacity-50"
                  >
                    {disableTotp.isPending ? "Disabling..." : "Confirm Disable"}
                  </button>
                  <button onClick={() => { setShowDisable(false); setDisableCode(""); setTotpError(""); }} className="text-sm text-slate-400 hover:text-white">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setShowDisable(true); setTotpSuccess(""); setTotpError(""); }}
                className="px-4 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20"
              >
                Disable 2FA
              </button>
            )}
          </div>
        ) : totpSetupData ? (
          <div className="space-y-4 max-w-md">
            <p className="text-sm text-slate-400">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.).</p>
            <div className="flex justify-center">
              <img src={totpSetupData.qrCodeDataUrl} alt="TOTP QR Code" width={180} height={180} className="rounded-lg" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Manual entry key</label>
              <code className="block px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gold font-mono break-all select-all">{totpSetupData.secret}</code>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-2">Backup codes (save these somewhere safe)</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {totpSetupData.backupCodes.map((code, i) => (
                  <div key={i} className="px-3 py-1.5 bg-white/5 border border-white/10 rounded text-sm font-mono text-slate-300 text-center">{code}</div>
                ))}
              </div>
              <button
                onClick={() => { navigator.clipboard.writeText(totpSetupData.backupCodes.join("\n")); setTotpSuccess("Backup codes copied to clipboard."); }}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-gold"
              >
                <Copy className="w-3.5 h-3.5" /> Copy backup codes
              </button>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Enter the 6-digit code from your app</label>
              <input
                type="text"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-40 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white tracking-widest text-center font-mono focus:outline-none focus:border-gold/50"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => verifyTotp.mutate()}
                disabled={verifyTotp.isPending || totpCode.length !== 6}
                className="flex items-center gap-2 px-4 py-2 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4" /> {verifyTotp.isPending ? "Verifying..." : "Verify & Enable"}
              </button>
              <button onClick={() => { setTotpSetupData(null); setTotpCode(""); setTotpError(""); }} className="text-sm text-slate-400 hover:text-white">Cancel</button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-slate-400 mb-3">Add an extra layer of security to your account by enabling two-factor authentication.</p>
            <button
              onClick={() => { setupTotp.mutate(); setTotpSuccess(""); setTotpError(""); }}
              disabled={setupTotp.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50"
            >
              <ShieldCheck className="w-4 h-4" /> {setupTotp.isPending ? "Setting up..." : "Enable 2FA"}
            </button>
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-5 h-5 text-gold" />
          <h2 className="font-semibold text-white">Notification Preferences</h2>
        </div>
        <div className="space-y-3">
          {[
            { key: "loads", label: "New load tenders" },
            { key: "payments", label: "Payment updates" },
            { key: "scorecard", label: "Scorecard reports" },
            { key: "announcements", label: "Platform announcements" },
          ].map((pref) => (
            <label key={pref.key} className="flex items-center justify-between p-3 bg-white/5 rounded-lg cursor-pointer">
              <span className="text-sm text-slate-300">{pref.label}</span>
              <div className={`w-8 h-4 rounded-full transition relative cursor-pointer ${notifications[pref.key as keyof typeof notifications] ? "bg-gold" : "bg-white/10"}`}
                onClick={() => handleNotifToggle(pref.key)}>
                <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${notifications[pref.key as keyof typeof notifications] ? "left-4" : "left-0.5"}`} />
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Carrier-specific sections */}
      {carrier && carrierProfile && (
        <>
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-gold" />
              <h2 className="font-semibold text-white">Carrier Documents</h2>
            </div>
            <div className="space-y-3">
              {[
                { label: "W-9 Form", uploaded: carrierProfile.w9Uploaded },
                { label: "Insurance Certificate", uploaded: carrierProfile.insuranceCertUploaded },
                { label: "Authority Document", uploaded: carrierProfile.authorityDocUploaded },
              ].map((doc) => (
                <div key={doc.label} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <span className="text-sm text-slate-300">{doc.label}</span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${doc.uploaded ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                    {doc.uploaded ? "Uploaded" : "Missing"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {carrierProfile.tier && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
              <h2 className="font-semibold text-white mb-3">Carrier Tier</h2>
              <TierBadge tier={carrierProfile.tier} />
              {carrierProfile.onboardingStatus && (
                <div className="mt-3">
                  <span className={`px-3 py-1 rounded text-sm ${carrierProfile.onboardingStatus === "APPROVED" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                    {carrierProfile.onboardingStatus}
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
      {/* System */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-gold" />
          <h2 className="font-semibold text-white">System</h2>
        </div>
        <VersionFooter />
      </div>
    </div>
  );
}
