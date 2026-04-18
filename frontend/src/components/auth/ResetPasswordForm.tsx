"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";

interface ResetPasswordFormProps {
  headline: string;
  backToLoginHref: string;
}

const inputClass =
  "w-full px-4 py-3 text-[14px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#C9A84C] transition-colors";
const labelClass = "block text-[13px] font-medium text-gray-700 mb-1.5";

export function ResetPasswordForm({ headline, backToLoginHref }: ResetPasswordFormProps) {
  const search = useSearchParams();
  const token = search.get("token") ?? "";
  const email = search.get("email") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const [requires2FA, setRequires2FA] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const missingParams = !token || !email;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setLoading(true);
    try {
      const body: Record<string, string> = { token, email, newPassword: password };
      if (requires2FA && totpCode) body.totpCode = totpCode;
      await api.post("/auth/reset-password", body);
      setSuccess(true);
    } catch (err: unknown) {
      const resp = (err as { response?: { status?: number; data?: { error?: string; requires2FA?: boolean } } })?.response;
      if (resp?.data?.requires2FA) {
        setRequires2FA(true);
        setError(resp.data.error ?? "Two-factor authentication code required.");
      } else if (resp?.status === 429) {
        setError("Too many attempts. Please wait and try again.");
      } else {
        setError(resp?.data?.error ?? "Reset failed. The link may have expired.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F1E8] px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-8 sm:p-10">
        <h1 className="text-[22px] font-bold text-[#0F1117]">{headline}</h1>
        <p className="text-gray-500 text-sm mt-1.5 mb-8">Choose a new password for {email || "your account"}.</p>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl text-[13px] text-center leading-relaxed bg-red-50 border border-red-200 text-red-600">
            {error}
          </div>
        )}

        {missingParams ? (
          <div className="mb-5 px-4 py-4 rounded-xl text-[13px] leading-relaxed bg-red-50 border border-red-200 text-red-600">
            This reset link is invalid or incomplete. Please request a new one.
          </div>
        ) : success ? (
          <div className="mb-5 px-4 py-4 rounded-xl text-[13px] leading-relaxed bg-green-50 border border-green-200 text-green-700">
            Password reset successfully. You can now sign in with your new password.
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-4">
              <label htmlFor="rp-password" className={labelClass}>
                New Password
              </label>
              <div className="relative">
                <input
                  id="rp-password"
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 bg-transparent border-none cursor-pointer transition-colors text-sm"
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
              <p className="text-[11px] text-gray-400 mt-1.5">Minimum 12 characters.</p>
            </div>

            <div className="mb-5">
              <label htmlFor="rp-confirm" className={labelClass}>
                Confirm Password
              </label>
              <input
                id="rp-confirm"
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                minLength={12}
                required
                className={inputClass}
              />
            </div>

            {requires2FA && (
              <div className="mb-5">
                <label htmlFor="rp-totp" className={labelClass}>
                  Authenticator Code
                </label>
                <input
                  id="rp-totp"
                  type="text"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  maxLength={6}
                  className={inputClass}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-gradient-to-r from-[#C9A84C] to-[#d4b85e] text-[#0F1117] shadow-[0_4px_12px_rgba(201,168,76,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(201,168,76,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? "Resetting…" : "Reset Password"}
            </button>
          </form>
        )}

        <div className="text-center mt-6">
          <Link
            href={backToLoginHref}
            className="text-[13px] text-[#C9A84C] font-medium hover:opacity-80 transition-opacity"
          >
            ← Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
