"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useAuthStore } from "@/hooks/useAuthStore";
import { Logo } from "@/components/ui/Logo";
import { Lock } from "lucide-react";
import LoginSplash from "@/components/auth/LoginSplash";

export default function ForcePasswordChangePage() {
  const { forceChangePassword, isLoading, error, tempToken, user } = useAuthStore();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [validationError, setValidationError] = useState("");
  const [showSplash, setShowSplash] = useState(false);

  // Redirect if no temp token
  if (typeof window !== "undefined" && !tempToken && !showSplash) {
    window.location.href = "/auth/login";
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    if (newPassword.length < 8) {
      setValidationError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setValidationError("Passwords do not match");
      return;
    }

    const success = await forceChangePassword(newPassword);
    if (success) {
      setShowSplash(true);
    }
  };

  const handleSplashComplete = useCallback(() => {
    sessionStorage.removeItem("otpEmail");
    window.location.href = "/dashboard/overview";
  }, []);

  if (showSplash && user) {
    return (
      <LoginSplash
        userRole={user.role}
        firstName={user.firstName}
        onComplete={handleSplashComplete}
      />
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur border border-white/10 rounded-2xl shadow-2xl p-8">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <Logo size="lg" />
          </Link>
          <div className="w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center mb-3">
            <Lock className="w-7 h-7 text-amber-400" />
          </div>
          <h1 className="text-2xl font-bold text-white">Password Expired</h1>
          <p className="text-sm text-slate-400 mt-2 text-center">
            Your password has expired. Please set a new password to continue.
          </p>
        </div>

        {(error || validationError) && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm text-center">
            {validationError || error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-[#d4a574]/50 focus:border-[#d4a574]/50 outline-none"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-[#d4a574]/50 focus:border-[#d4a574]/50 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !newPassword || !confirmPassword}
            className="w-full py-2.5 bg-[#d4a574] text-[#0f172a] font-semibold rounded-lg hover:bg-[#d4a574]/90 disabled:opacity-50 transition"
          >
            {isLoading ? "Updating..." : "Set New Password"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link href="/auth/login" className="text-sm text-slate-400 hover:text-white transition">
            Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
