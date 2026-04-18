"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

interface ForgotPasswordFormProps {
  headline: string;
  subhead: string;
  backToLoginHref: string;
}

const inputClass =
  "w-full px-4 py-3 text-[14px] bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-[#C9A84C] transition-colors";
const labelClass = "block text-[13px] font-medium text-gray-700 mb-1.5";

export function ForgotPasswordForm({ headline, subhead, backToLoginHref }: ForgotPasswordFormProps) {
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
      if (status === 429) {
        setError("Too many requests. Please wait a few minutes and try again.");
      } else {
        // Backend returns 200 regardless of account existence, so non-429 errors are network/server.
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F1E8] px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.08)] p-8 sm:p-10">
        <h1 className="text-[22px] font-bold text-[#0F1117]">{headline}</h1>
        <p className="text-gray-500 text-sm mt-1.5 mb-8">{subhead}</p>

        {error && (
          <div className="mb-5 px-4 py-3 rounded-xl text-[13px] text-center leading-relaxed bg-red-50 border border-red-200 text-red-600">
            {error}
          </div>
        )}

        {submitted ? (
          <div className="mb-5 px-4 py-4 rounded-xl text-[13px] leading-relaxed bg-green-50 border border-green-200 text-green-700">
            If an account exists with that email, a password reset link has been sent. The link expires in 30 minutes.
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="mb-5">
              <label htmlFor="fp-email" className={labelClass}>
                Email Address
              </label>
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
              className="w-full py-3.5 text-[15px] font-semibold rounded-xl border-none cursor-pointer transition-all duration-200 bg-gradient-to-r from-[#C9A84C] to-[#d4b85e] text-[#0F1117] shadow-[0_4px_12px_rgba(201,168,76,0.25)] hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(201,168,76,0.35)] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:translate-y-0"
            >
              {loading ? "Sending…" : "Send Reset Link"}
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
