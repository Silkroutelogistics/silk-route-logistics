"use client";

import { useState, useEffect } from "react";
import { Check, Loader2, ShieldCheck, CheckCircle, Copy, Lock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard } from "@/components/shipper";
import { useAuthStore } from "@/hooks/useAuthStore";

const settingsNav = ["Profile", "Users & Permissions", "Notifications", "Billing", "Integrations", "Security"];

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  company?: string;
  address?: string;
}

export default function ShipperSettingsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);

  // 2FA state
  const [totpEnabled, setTotpEnabled] = useState(user?.totpEnabled || false);
  const [totpSetupData, setTotpSetupData] = useState<{ qrCodeDataUrl: string; secret: string; backupCodes: string[] } | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [totpError, setTotpError] = useState("");
  const [totpSuccess, setTotpSuccess] = useState("");
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState("");
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

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

  const changePasswordMutation = useMutation({
    mutationFn: () => api.patch("/auth/password", { currentPassword: pwCurrent, newPassword: pwNew }),
    onSuccess: () => { setPwSuccess(true); setPwError(""); setPwCurrent(""); setPwNew(""); setPwConfirm(""); },
    onError: (err: any) => setPwError(err.response?.data?.error || "Failed to change password"),
  });

  const [form, setForm] = useState({
    company: "",
    mc: "",
    contact: "",
    email: "",
    phone: "",
    address: "",
    payTerms: "Net 30",
  });
  const [originalForm, setOriginalForm] = useState(form);

  // Fetch profile data
  const { data: profile } = useQuery({
    queryKey: ["shipper-profile"],
    queryFn: () => api.get<ProfileData>("/auth/profile").then((r) => r.data),
  });

  // Populate form from profile
  useEffect(() => {
    if (profile) {
      const populated = {
        company: profile.company || "",
        mc: form.mc,
        contact: profile.name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        address: profile.address || "",
        payTerms: form.payTerms,
      };
      setForm(populated);
      setOriginalForm(populated);
    }
  }, [profile]);

  const upd = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.patch("/auth/profile", {
        name: data.contact,
        email: data.email,
        phone: data.phone,
        company: data.company,
        address: data.address,
      }),
    onSuccess: () => {
      setOriginalForm(form);
    },
  });

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const handleCancel = () => {
    setForm(originalForm);
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(originalForm);

  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0F1117] mb-6">Account Settings</h1>
      <div className="grid grid-cols-[200px_1fr] gap-6">
        {/* Settings nav */}
        <div>
          {settingsNav.map((s, i) => (
            <div
              key={s}
              onClick={() => setActiveTab(i)}
              className={`px-3.5 py-2.5 rounded-md cursor-pointer text-[13px] mb-0.5 ${
                i === activeTab ? "bg-[#C9A84C]/10 text-[#C9A84C] font-semibold" : "text-gray-500 hover:bg-gray-100"
              }`}
            >{s}</div>
          ))}
        </div>

        {/* Form */}
        {activeTab === 0 && (
          <ShipperCard padding="p-7">
            <h2 className="text-lg font-bold text-[#0F1117] mb-1">Company Profile</h2>
            <p className="text-[13px] text-gray-500 mb-6">Manage your company details and preferences</p>

            {saveMutation.isSuccess && (
              <div className="mb-4 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-[13px] text-emerald-700">
                Settings saved successfully.
              </div>
            )}
            {saveMutation.isError && (
              <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-md text-[13px] text-red-700">
                Failed to save settings. Please try again.
              </div>
            )}

            <div className="grid grid-cols-2 gap-x-4">
              <SettingsField label="Company Name" value={form.company} onChange={(v) => upd("company", v)} />
              <SettingsField label="MC / DOT #" value={form.mc} onChange={(v) => upd("mc", v)} />
              <SettingsField label="Primary Contact" value={form.contact} onChange={(v) => upd("contact", v)} />
              <SettingsField label="Email" value={form.email} onChange={(v) => upd("email", v)} />
              <SettingsField label="Phone" value={form.phone} onChange={(v) => upd("phone", v)} />
              <SettingsField label="Payment Terms" value={form.payTerms} onChange={(v) => upd("payTerms", v)} options={["Net 30", "Net 45", "Net 60"]} />
            </div>
            <SettingsField label="Address" value={form.address} onChange={(v) => upd("address", v)} />
            <div className="flex gap-3 mt-2">
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending || !isDirty}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0F1117] text-xs font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] disabled:opacity-50"
              >
                {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save Changes
              </button>
              <button
                onClick={handleCancel}
                disabled={!isDirty}
                className="px-6 py-3 text-gray-500 text-xs font-semibold uppercase tracking-[1.5px] hover:text-[#BA7517] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </ShipperCard>
        )}

        {activeTab === 5 && (
          <ShipperCard padding="p-7">
            <h2 className="text-lg font-bold text-[#0F1117] mb-1">Security</h2>
            <p className="text-[13px] text-gray-500 mb-6">Manage your password and two-factor authentication</p>

            {/* Change Password */}
            <div className="mb-8 pb-6 border-b border-gray-200">
              <h3 className="text-sm font-bold text-[#0F1117] mb-4 flex items-center gap-2">
                <Lock size={16} className="text-[#BA7517]" /> Change Password
              </h3>
              <div className="space-y-3 max-w-md">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Current Password</label>
                  <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)}
                    className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">New Password</label>
                  <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)}
                    className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C]" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Confirm New Password</label>
                  <input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)}
                    className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C]" />
                </div>
                {pwError && <div className="text-xs text-red-500">{pwError}</div>}
                {pwSuccess && <div className="flex items-center gap-1.5 text-xs text-emerald-700"><CheckCircle size={14} /> Password changed successfully</div>}
                <button
                  onClick={() => {
                    if (pwNew !== pwConfirm) { setPwError("Passwords don't match"); return; }
                    if (pwNew.length < 10) { setPwError("Minimum 10 characters"); return; }
                    changePasswordMutation.mutate();
                  }}
                  disabled={changePasswordMutation.isPending || !pwCurrent || !pwNew}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F1117] text-white text-xs font-semibold rounded-md disabled:opacity-50"
                >
                  {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
                </button>
              </div>
            </div>

            {/* Two-Factor Authentication */}
            <div>
              <h3 className="text-sm font-bold text-[#0F1117] mb-4 flex items-center gap-2">
                <ShieldCheck size={16} className="text-[#BA7517]" /> Two-Factor Authentication
              </h3>

              {totpSuccess && (
                <div className="mb-3 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-md text-[13px] text-emerald-600 flex items-center gap-2">
                  <CheckCircle size={14} /> {totpSuccess}
                </div>
              )}
              {totpError && (
                <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-[13px] text-red-600">{totpError}</div>
              )}

              {totpEnabled ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle size={16} className="text-emerald-700" />
                    <span className="text-[13px] font-semibold text-emerald-600">Two-factor authentication is enabled</span>
                  </div>
                  {showDisable ? (
                    <div className="space-y-3 max-w-md">
                      <p className="text-[13px] text-gray-500">Enter your 6-digit authenticator code to disable 2FA.</p>
                      <input
                        type="text"
                        maxLength={6}
                        value={disableCode}
                        onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
                        placeholder="000000"
                        className="w-36 py-2.5 px-3.5 border border-gray-200 rounded-md text-sm text-center font-mono tracking-widest outline-none focus:border-[#C9A84C]"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => disableTotp.mutate()}
                          disabled={disableTotp.isPending || disableCode.length !== 6}
                          className="px-4 py-2.5 bg-red-50 text-red-600 border border-red-200 text-xs font-semibold rounded-md disabled:opacity-50"
                        >
                          {disableTotp.isPending ? "Disabling..." : "Confirm Disable"}
                        </button>
                        <button onClick={() => { setShowDisable(false); setDisableCode(""); setTotpError(""); }} className="text-xs text-gray-700 hover:text-[#0F1117]">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setShowDisable(true); setTotpSuccess(""); setTotpError(""); }}
                      className="px-4 py-2.5 bg-gray-100 text-[#0F1117] text-xs font-semibold rounded-md hover:bg-gray-200"
                    >
                      Disable 2FA
                    </button>
                  )}
                </div>
              ) : totpSetupData ? (
                <div className="space-y-4 max-w-md">
                  <p className="text-[13px] text-gray-500">Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.).</p>
                  <div className="flex justify-center">
                    <img src={totpSetupData.qrCodeDataUrl} alt="TOTP QR Code" width={180} height={180} className="rounded-lg" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Manual entry key</label>
                    <code className="block px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-md text-sm text-[#C9A84C] font-mono break-all select-all">{totpSetupData.secret}</code>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-2">Backup codes (save these somewhere safe)</label>
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
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Enter the 6-digit code from your app</label>
                    <input
                      type="text"
                      maxLength={6}
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="000000"
                      className="w-36 py-2.5 px-3.5 border border-gray-200 rounded-md text-sm text-center font-mono tracking-widest outline-none focus:border-[#C9A84C]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => verifyTotp.mutate()}
                      disabled={verifyTotp.isPending || totpCode.length !== 6}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0F1117] text-xs font-semibold uppercase tracking-[1.5px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] disabled:opacity-50"
                    >
                      <ShieldCheck size={14} /> {verifyTotp.isPending ? "Verifying..." : "Verify & Enable"}
                    </button>
                    <button onClick={() => { setTotpSetupData(null); setTotpCode(""); setTotpError(""); }} className="text-xs text-gray-700 hover:text-[#0F1117]">Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[13px] text-gray-500 mb-3">Add an extra layer of security to your account by enabling two-factor authentication.</p>
                  <button
                    onClick={() => { setupTotp.mutate(); setTotpSuccess(""); setTotpError(""); }}
                    disabled={setupTotp.isPending}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0F1117] text-xs font-semibold uppercase tracking-[1.5px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] disabled:opacity-50"
                  >
                    <ShieldCheck size={14} /> {setupTotp.isPending ? "Setting up..." : "Enable 2FA"}
                  </button>
                </div>
              )}
            </div>
          </ShipperCard>
        )}

        {activeTab !== 0 && activeTab !== 5 && (
          <ShipperCard padding="p-7">
            <h2 className="text-lg font-bold text-[#0F1117] mb-1">{settingsNav[activeTab]}</h2>
            <p className="text-[13px] text-gray-500">This section is coming soon.</p>
          </ShipperCard>
        )}
      </div>
    </div>
  );
}

function SettingsField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options?: string[];
}) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] appearance-none bg-white">
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C]" />
      )}
    </div>
  );
}
