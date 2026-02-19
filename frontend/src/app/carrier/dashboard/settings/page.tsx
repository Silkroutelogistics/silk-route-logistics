"use client";

import { useState } from "react";
import { User, Lock, CheckCircle, Bell, Phone } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
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

  const [notifications, setNotifications] = useState({
    loadUpdates: true,
    paymentAlerts: true,
    complianceReminders: true,
    newLoadMatches: true,
    messageAlerts: true,
    emailNotifications: true,
  });
  const [notifSaved, setNotifSaved] = useState(false);

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
    onSuccess: () => { setPhoneSaved(true); setTimeout(() => setPhoneSaved(false), 3000); },
  });

  const notifMutation = useMutation({
    mutationFn: () => api.put("/carrier-auth/notifications", notifications),
    onSuccess: () => { setNotifSaved(true); setTimeout(() => setNotifSaved(false), 3000); },
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
      <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Account Settings</h1>
      <p className="text-[13px] text-gray-500 mb-6">Manage your carrier account, notifications, and security settings</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Profile Info */}
        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-4 flex items-center gap-2">
            <User size={16} className="text-[#C9A84C]" /> Profile Information
          </h3>
          <div className="space-y-3 text-xs">
            <div>
              <label className="text-gray-400 block mb-1">Name</label>
              <div className="text-[#0D1B2A] font-medium">{user?.firstName} {user?.lastName}</div>
            </div>
            <div>
              <label className="text-gray-400 block mb-1">Email</label>
              <div className="text-[#0D1B2A] font-medium">{user?.email}</div>
            </div>
            <div>
              <label className="text-gray-400 block mb-1">Company</label>
              <div className="text-[#0D1B2A] font-medium">{profile?.companyName || user?.company || "—"}</div>
            </div>
            <div>
              <label className="text-gray-400 block mb-1">MC Number</label>
              <div className="text-[#0D1B2A] font-medium">{profile?.mcNumber || "—"}</div>
            </div>
            <div>
              <label className="text-gray-400 block mb-1">DOT Number</label>
              <div className="text-[#0D1B2A] font-medium">{profile?.dotNumber || "—"}</div>
            </div>
            <div>
              <label className="text-gray-400 block mb-1">Tier</label>
              <div className="text-[#0D1B2A] font-medium">{profile?.tier || "—"}</div>
            </div>
            <div>
              <label className="text-gray-400 block mb-1">Equipment Types</label>
              <div className="flex flex-wrap gap-1">
                {(profile?.equipmentTypes || []).map((eq: string) => (
                  <span key={eq} className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{eq}</span>
                ))}
              </div>
            </div>
            <div>
              <label className="text-gray-400 block mb-1">Operating Regions</label>
              <div className="flex flex-wrap gap-1">
                {(profile?.operatingRegions || []).map((r: string) => (
                  <span key={r} className="px-2 py-0.5 bg-gray-100 rounded text-[11px] text-gray-600">{r}</span>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-gray-100">
              <label className="text-gray-400 block mb-1">Contact Phone</label>
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
                  className="px-3 py-2 bg-[#0D1B2A] text-white text-[11px] font-semibold rounded disabled:opacity-50"
                >
                  {phoneMutation.isPending ? "..." : "Save"}
                </button>
              </div>
              {phoneSaved && (
                <div className="flex items-center gap-1 text-[11px] text-emerald-500 mt-1">
                  <CheckCircle size={12} /> Saved
                </div>
              )}
            </div>
          </div>
        </CarrierCard>

        {/* Change Password */}
        <CarrierCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-4 flex items-center gap-2">
            <Lock size={16} className="text-amber-500" /> Change Password
          </h3>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">Current Password</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:border-[#C9A84C] focus:outline-none"
                required
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">New Password</label>
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
              <label className="text-xs text-gray-400 block mb-1">Confirm New Password</label>
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
              <div className="flex items-center gap-1.5 text-xs text-emerald-500">
                <CheckCircle size={14} /> Password changed successfully
              </div>
            )}

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-[#0D1B2A] text-white text-xs font-semibold rounded-md disabled:opacity-60"
            >
              {saving ? "Saving..." : "Update Password"}
            </button>
          </form>
        </CarrierCard>

        {/* Notification Preferences */}
        <CarrierCard padding="p-5" className="col-span-2">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-bold text-[#0D1B2A] flex items-center gap-2">
              <Bell size={16} className="text-[#C9A84C]" /> Notification Preferences
            </h3>
            <button
              onClick={() => notifMutation.mutate()}
              disabled={notifMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0D1B2A] text-white text-[11px] font-semibold rounded disabled:opacity-50"
            >
              {notifMutation.isPending ? "Saving..." : notifSaved ? <><CheckCircle size={12} /> Saved</> : "Save Preferences"}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {notifOptions.map((opt) => (
              <div
                key={opt.key}
                onClick={() => toggleNotif(opt.key)}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:border-[#C9A84C]/30 cursor-pointer transition-colors"
              >
                <div>
                  <div className="text-xs font-semibold text-[#0D1B2A]">{opt.label}</div>
                  <div className="text-[11px] text-gray-400">{opt.desc}</div>
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
