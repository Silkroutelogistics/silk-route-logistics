"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { TierBadge } from "@/components/ui/TierBadge";

export default function SettingsPage() {
  const { user } = useAuthStore();

  const { data: profile } = useQuery({
    queryKey: ["carrier-onboarding"],
    queryFn: () => api.get("/carrier/onboarding-status").then((r) => r.data),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Profile</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Name</label>
            <p className="font-medium">{user?.firstName} {user?.lastName}</p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Email</label>
            <p className="font-medium">{user?.email}</p>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Role</label>
            <p className="font-medium capitalize">{user?.role?.toLowerCase()}</p>
          </div>
          {profile?.tier && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Current Tier</label>
              <TierBadge tier={profile.tier} />
            </div>
          )}
        </div>
      </div>

      {/* Documents Status */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Documents</h2>
        <div className="space-y-3">
          {[
            { label: "W-9 Form", uploaded: profile?.w9Uploaded },
            { label: "Insurance Certificate", uploaded: profile?.insuranceCertUploaded },
            { label: "Authority Document", uploaded: profile?.authorityDocUploaded },
          ].map((doc) => (
            <div key={doc.label} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
              <span className="text-sm">{doc.label}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${doc.uploaded ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"}`}>
                {doc.uploaded ? "Uploaded" : "Missing"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Notification Preferences</h2>
        <div className="space-y-3">
          {["New load tenders", "Payment updates", "Scorecard reports", "Platform announcements"].map((pref) => (
            <label key={pref} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer">
              <span className="text-sm">{pref}</span>
              <input type="checkbox" defaultChecked
                className="w-4 h-4 rounded border-slate-300 text-gold focus:ring-gold" />
            </label>
          ))}
        </div>
      </div>

      {/* Onboarding Status */}
      {profile?.onboardingStatus && (
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Onboarding Status</h2>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              profile.onboardingStatus === "APPROVED" ? "bg-green-50 text-green-700" :
              profile.onboardingStatus === "REJECTED" ? "bg-red-50 text-red-700" :
              "bg-yellow-50 text-yellow-700"
            }`}>{profile.onboardingStatus}</span>
            {profile.approvedAt && (
              <span className="text-sm text-slate-500">Approved on {new Date(profile.approvedAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
