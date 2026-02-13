"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useAuthStore } from "@/hooks/useAuthStore";
import { Logo } from "@/components/ui/Logo";
import { Shield } from "lucide-react";
import LoginSplash from "@/components/auth/LoginSplash";

const OTP_LENGTH = 8;
const OTP_EXPIRY_SECONDS = 5 * 60;
const RESEND_COOLDOWN_SECONDS = 60;

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (local.length <= 3) return `${local[0]}***@${domain}`;
  return `${local.slice(0, 2)}${"*".repeat(local.length - 3)}${local.slice(-1)}@${domain}`;
}

export default function VerifyOtpPage() {
  const { verifyOtp, resendOtp, isLoading, error, user } = useAuthStore();
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [countdown, setCountdown] = useState(OTP_EXPIRY_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [showSplash, setShowSplash] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const stored = sessionStorage.getItem("otpEmail");
    if (!stored) {
      window.location.href = "/auth/login";
      return;
    }
    setEmail(stored);
  }, []);

  // OTP expiry countdown
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);

    // Auto-advance
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;

    const newDigits = [...digits];
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);

    const nextEmpty = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[nextEmpty]?.focus();
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const code = digits.join("");
    if (code.length !== OTP_LENGTH) return;

    const result = await verifyOtp(email, code);
    if (result && result.success) {
      if (result.passwordExpired) {
        window.location.href = "/auth/force-password-change";
      } else {
        setShowSplash(true);
      }
    } else {
      // Clear digits on error
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
    }
  };

  // Auto-submit when all digits are filled
  useEffect(() => {
    if (digits.every((d) => d) && digits.join("").length === OTP_LENGTH) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    const ok = await resendOtp(email);
    if (ok) {
      setResendMessage("New code sent!");
      setCountdown(OTP_EXPIRY_SECONDS);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setDigits(Array(OTP_LENGTH).fill(""));
      inputRefs.current[0]?.focus();
      setTimeout(() => setResendMessage(""), 3000);
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

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  if (!email) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a] px-4">
      <div className="w-full max-w-md bg-white/5 backdrop-blur border border-white/10 rounded-2xl shadow-2xl p-8">
        <div className="flex flex-col items-center mb-6">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <Logo size="lg" />
          </Link>
          <div className="w-14 h-14 rounded-full bg-[#d4a574]/10 flex items-center justify-center mb-3">
            <Shield className="w-7 h-7 text-[#d4a574]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Enter Verification Code</h1>
          <p className="text-sm text-slate-400 mt-2 text-center">
            An 8-digit code was sent to <span className="text-[#d4a574] font-medium">{maskEmail(email)}</span>
          </p>
        </div>

        {error && <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm text-center">{error}</div>}
        {resendMessage && <div className="mb-4 p-3 bg-green-500/10 border border-green-500/20 text-green-400 rounded-lg text-sm text-center">{resendMessage}</div>}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* OTP Input Boxes */}
          <div className="flex justify-center gap-2" onPaste={handlePaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                className="w-10 h-12 text-center text-xl font-bold bg-white/5 border-2 border-white/10 rounded-xl text-white focus:border-[#d4a574] focus:ring-2 focus:ring-[#d4a574]/30 outline-none transition"
                autoFocus={i === 0}
              />
            ))}
          </div>

          {/* Countdown Timer */}
          <div className="text-center">
            {countdown > 0 ? (
              <p className="text-sm text-slate-400">
                Code expires in <span className="text-white font-medium">{minutes}:{seconds.toString().padStart(2, "0")}</span>
              </p>
            ) : (
              <p className="text-sm text-red-400">Code expired. Please request a new one.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isLoading || digits.some((d) => !d)}
            className="w-full py-2.5 bg-[#d4a574] text-[#0f172a] font-semibold rounded-lg hover:bg-[#d4a574]/90 disabled:opacity-50 transition"
          >
            {isLoading ? "Verifying..." : "Verify Code"}
          </button>
        </form>

        {/* Resend */}
        <div className="mt-6 text-center space-y-3">
          <button
            onClick={handleResend}
            disabled={resendCooldown > 0}
            className="text-sm text-[#d4a574] hover:underline disabled:text-slate-500 disabled:no-underline transition"
          >
            {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend Code"}
          </button>

          <p className="text-sm">
            <Link href="/auth/login" className="text-slate-400 hover:text-white transition">
              Back to login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
