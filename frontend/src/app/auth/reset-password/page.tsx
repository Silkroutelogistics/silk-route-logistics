"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { KeyRound } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const email = searchParams.get("email") || "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      await api.post("/auth/reset-password", { token, email, newPassword });
      setSuccess(true);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to reset password";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="w-full max-w-md bg-white/5 backdrop-blur border border-white/10 rounded-2xl shadow-2xl p-8 text-center">
        <p className="text-red-400 mb-4">Invalid reset link. Please request a new one.</p>
        <Link href="/auth/forgot-password" className="text-[#d4a574] hover:underline">
          Request password reset
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md bg-white/5 backdrop-blur border border-white/10 rounded-2xl shadow-2xl p-8">
      <div className="flex flex-col items-center mb-6">
        <Link href="/" className="flex items-center gap-2 mb-4">
          <Logo size="lg" />
        </Link>
        <div className="w-14 h-14 rounded-full bg-[#d4a574]/10 flex items-center justify-center mb-3">
          <KeyRound className="w-7 h-7 text-[#d4a574]" />
        </div>
        <h1 className="text-2xl font-bold text-white">Choose New Password</h1>
        <p className="text-sm text-slate-400 mt-2 text-center">
          Enter your new password below
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm text-center">
          {error}
        </div>
      )}

      {success ? (
        <div className="text-center space-y-4">
          <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
            <p className="text-green-400 text-sm">
              Your password has been reset successfully!
            </p>
          </div>
          <Link
            href="/auth/login"
            className="inline-block w-full py-2.5 bg-[#d4a574] text-[#0f172a] font-semibold rounded-lg hover:bg-[#d4a574]/90 transition text-center"
          >
            Sign In
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={8}
                placeholder="At least 8 characters"
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-[#d4a574]/50 focus:border-[#d4a574]/50 outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                placeholder="Re-enter your password"
                className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-[#d4a574]/50 focus:border-[#d4a574]/50 outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !newPassword || !confirmPassword}
              className="w-full py-2.5 bg-[#d4a574] text-[#0f172a] font-semibold rounded-lg hover:bg-[#d4a574]/90 disabled:opacity-50 transition"
            >
              {isLoading ? "Resetting..." : "Reset Password"}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/auth/login" className="text-sm text-slate-400 hover:text-white transition">
              Back to login
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4">
      <Suspense fallback={
        <div className="w-full max-w-md bg-white/5 backdrop-blur border border-white/10 rounded-2xl shadow-2xl p-8 text-center">
          <p className="text-slate-400">Loading...</p>
        </div>
      }>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
