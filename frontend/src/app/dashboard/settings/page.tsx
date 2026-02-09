"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isCarrier } from "@/lib/roles";
import { TierBadge } from "@/components/ui/TierBadge";
import { Save, Lock, Bell, User, Shield } from "lucide-react";

export default function SettingsPage() {
  const { user } = useAuthStore();
  const carrier = isCarrier(user?.role);

  const [profile, setProfile] = useState({ firstName: user?.firstName || "", lastName: user?.lastName || "", phone: "", company: "" });
  const [passwords, setPasswords] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [profileSaved, setProfileSaved] = useState(false);
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");

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

  const [notifications, setNotifications] = useState({ loads: true, payments: true, scorecard: true, announcements: true });

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
                onClick={() => setNotifications((n) => ({ ...n, [pref.key]: !n[pref.key as keyof typeof n] }))}>
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
    </div>
  );
}
