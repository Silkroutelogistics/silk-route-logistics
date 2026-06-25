"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { LoginBrandPanel, type LoginVariant } from "./LoginBrandPanel";

interface ForgotPasswordFormProps {
  variant: LoginVariant;
  headline: string;
  subhead: string;
  backToLoginHref: string;
}

const inputClass =
  "w-full bg-white border border-[#EFE6D3] rounded-xl px-4 py-3.5 text-sm text-[#0A2540] outline-none transition-all placeholder:text-gray-400 focus:border-[#BA7517] focus:ring-[#BA7517]/15 focus:shadow-[0_0_0_3px_rgba(186,117,23,0.1)]";
const labelClass = "block text-xs font-medium text-gray-600 uppercase tracking-wider mb-1.5";

export function ForgotPasswordForm({ variant, headline, subhead, backToLoginHref }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setError(status === 429 ? "Too many requests. Please wait a few minutes and try again." : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      <LoginBrandPanel variant={variant} />

      <div className="w-full lg:w-[45%] flex items-center justify-center overflow-y-auto relative" style={{ backgroundColor: "#FBF7F0" }}>
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-black/5 to-transparent pointer-events-none hidden lg:block" />
        <div className="w-full max-w-[400px] mx-auto px-8 py-12">
          <div className="flex justify-center mb-10 lg:hidden">
            <Link href="/">
              <Logo size="lg" />
            </Link>
          </div>

          <h2 className="font-serif text-2xl text-[#0A2540]">{headline}</h2>
          <p className="text-gray-500 text-sm mt-1.5 mb-8">{subhead}</p>

          {error && (
            <div className="mb-5 px-4 py-3 rounded-xl text-[13px] text-center leading-relaxed bg-[#F6E3E3] border border-[#9B2C2C] text-[#9B2C2C]">
              {error}
            </div>
          )}

          {submitted ? (
            <div className="mb-5 px-4 py-4 rounded-xl text-[13px] leading-relaxed bg-[#E6F0E9] border border-[#2F7A4F] text-[#2F7A4F]">
              If an account exists with that email, a password reset link has been sent. The link expires in 30 minutes.
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div className="mb-5">
                <label htmlFor="fp-email" className={labelClass}>Email Address</label>
                <input
                  id="fp-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  autoComplete="email"
                  required
                  className={inputClass}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-[#BA7517] text-[#FBF7F0] shadow-[0_4px_12px_rgba(186,117,23,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(186,117,23,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
              >
                {loading ? "Sending…" : "Send Reset Link"}
              </button>
            </form>
          )}

          <div className="text-center mt-6">
            <Link href={backToLoginHref} className="text-[13px] text-[#BA7517] font-medium hover:opacity-80 transition-opacity">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
