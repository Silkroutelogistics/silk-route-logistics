"use client";

// v3.8.aje — Email verification landing page.
// Carrier clicks the link in their verification email; lands here with
// ?token=<64-char-hex> in the URL. This page POSTs the token to
// /api/carrier-auth/verify-email (public endpoint — token IS the auth)
// and renders success/error state.
//
// Outside the /carrier/dashboard/* tree because the carrier may not be
// logged in when they click the link — first time most carriers see
// the portal will be via this exact link. After verification success
// they're prompted to log in.
//
// Click-IP and country are captured server-side from the POST request,
// not from this page. Geo-mismatch (registered from US, verified from
// KR) lands as a SystemLog warning row for AE review; not shown here.

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Logo } from "@/components/ui/Logo";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || null;
  const [state, setState] = useState<"loading" | "success" | "alreadyVerified" | "invalid" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    let cancelled = false;
    api.post<{ verified: boolean; alreadyVerified: boolean }>("/carrier-auth/verify-email", { token })
      .then((res) => {
        if (cancelled) return;
        if (res.data.alreadyVerified) setState("alreadyVerified");
        else setState("success");
      })
      .catch((err) => {
        if (cancelled) return;
        const status = err?.response?.status;
        if (status === 400) {
          setErrorMessage(err.response?.data?.error || "This verification link is invalid or has expired.");
          setState("invalid");
        } else {
          setErrorMessage(err.response?.data?.error || "Verification could not be completed. Please try again.");
          setState("error");
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <div className="min-h-screen bg-[#FBF7F0] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Logo size="lg" />
        </div>

        <div className="bg-white border border-[rgba(10,37,64,0.10)] rounded-xl p-8 shadow-[0_4px_12px_rgba(10,37,64,0.08)]">
          {state === "loading" && (
            <div className="text-center">
              <Loader2 size={36} className="text-[#BA7517] animate-spin mx-auto mb-4" />
              <h1 className="text-lg font-bold text-[#0A2540] mb-2" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
                Verifying your email…
              </h1>
              <p className="text-sm text-[#6B7685]">One moment while we confirm your address.</p>
            </div>
          )}

          {state === "success" && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#E6F0E9] flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-[#2F7A4F]" />
              </div>
              <p className="text-[11px] font-semibold tracking-widest text-[#BA7517] uppercase mb-1">Email verified</p>
              <h1 className="text-2xl font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
                You&apos;re all set
              </h1>
              <p className="text-sm text-[#3A4A5F] leading-relaxed mb-6">
                Thank you for confirming your email address. Your carrier application will continue through compliance review. We&apos;ll email you when there&apos;s a status change.
              </p>
              <Link
                href="/carrier/login"
                className="inline-block bg-[#BA7517] text-[#FBF7F0] px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#854F0B] transition-colors"
              >
                Continue to Carrier Portal
              </Link>
            </div>
          )}

          {state === "alreadyVerified" && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#E2EAF2] flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-[#2A5B8B]" />
              </div>
              <p className="text-[11px] font-semibold tracking-widest text-[#2A5B8B] uppercase mb-1">Already verified</p>
              <h1 className="text-2xl font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
                Email already confirmed
              </h1>
              <p className="text-sm text-[#3A4A5F] leading-relaxed mb-6">
                This email address has already been verified. You can log in to your carrier portal at any time.
              </p>
              <Link
                href="/carrier/login"
                className="inline-block bg-[#BA7517] text-[#FBF7F0] px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#854F0B] transition-colors"
              >
                Sign In
              </Link>
            </div>
          )}

          {state === "invalid" && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#FBEFD4] flex items-center justify-center mx-auto mb-4">
                <XCircle size={32} className="text-[#B07A1A]" />
              </div>
              <p className="text-[11px] font-semibold tracking-widest text-[#B07A1A] uppercase mb-1">Link not valid</p>
              <h1 className="text-2xl font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
                Verification link expired
              </h1>
              <p className="text-sm text-[#3A4A5F] leading-relaxed mb-6">
                {errorMessage || "This verification link is no longer valid. Verification links expire after 24 hours. Log in to your carrier portal and request a new link from your application status page."}
              </p>
              <Link
                href="/carrier/login"
                className="inline-block bg-[#BA7517] text-[#FBF7F0] px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#854F0B] transition-colors"
              >
                Sign In to Request New Link
              </Link>
            </div>
          )}

          {state === "error" && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-[#F6E3E3] flex items-center justify-center mx-auto mb-4">
                <XCircle size={32} className="text-[#9B2C2C]" />
              </div>
              <p className="text-[11px] font-semibold tracking-widest text-[#9B2C2C] uppercase mb-1">Verification failed</p>
              <h1 className="text-2xl font-bold text-[#0A2540] mb-3" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
                We couldn&apos;t complete verification
              </h1>
              <p className="text-sm text-[#3A4A5F] leading-relaxed mb-6">
                {errorMessage || "Something went wrong on our end. Please try again in a moment, or contact compliance@silkroutelogistics.ai if the problem persists."}
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => window.location.reload()}
                  className="bg-[#BA7517] text-[#FBF7F0] px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-[#854F0B] transition-colors"
                >
                  Try Again
                </button>
                <a
                  href="mailto:compliance@silkroutelogistics.ai"
                  className="text-xs text-[#6B7685] hover:underline"
                >
                  Contact compliance@silkroutelogistics.ai
                </a>
              </div>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-[#6B7685] mt-6">
          Silk Route Logistics Inc. &middot; Galesburg, MI &middot; (269) 220-6760
        </p>
      </div>
    </div>
  );
}

// Suspense wrapper required because useSearchParams() is a client-side
// hook that Next.js's static export needs to render under a boundary.
export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FBF7F0] flex items-center justify-center">
        <Loader2 size={36} className="text-[#BA7517] animate-spin" />
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
