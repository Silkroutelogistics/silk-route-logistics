"use client";

/**
 * Arc 32 — where the one-click verification link lands.
 *
 * The carrier is usually on a DIFFERENT DEVICE from the one holding their
 * half-finished application: they opened the email on a phone. So this page
 * cannot continue the wizard, and does not pretend to. It confirms, then tells
 * them to go back to the tab they left open — where the 5-second poll has
 * already noticed and moved them on.
 *
 * Suspense wrapper is mandatory: useSearchParams in a statically exported app
 * fails the build without it (the class banked at §13.3 Item 193 T4).
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type State =
  | { kind: "working" }
  | { kind: "ok"; email?: string }
  | { kind: "bad"; message: string };

function VerifyBody() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ kind: "working" });

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL;
    if (!token) {
      setState({ kind: "bad", message: "This link is missing its confirmation code." });
      return;
    }
    if (!apiBase) {
      setState({
        kind: "bad",
        message:
          "We couldn't reach our server to confirm this. Email operations@silkroutelogistics.ai and we'll confirm it for you.",
      });
      return;
    }
    let live = true;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/carrier/onboarding/verify-link`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const d = await r.json().catch(() => ({}));
        if (!live) return;
        if (r.ok && d.verified) setState({ kind: "ok", email: d.email });
        else setState({ kind: "bad", message: d.error || "This link is no longer valid." });
      } catch {
        if (live) {
          setState({
            kind: "bad",
            message: "We couldn't reach our server. Check your connection and open the link again.",
          });
        }
      }
    })();
    return () => { live = false; };
  }, [token]);

  return (
    <div className="mx-auto max-w-lg px-6 py-20">
      <div className="rounded-xl border border-[#EFE6D3] bg-white p-8 shadow-sm">
        {state.kind === "working" && (
          <div className="flex items-center gap-3 text-[#3A4A5F]">
            <Loader2 className="h-5 w-5 animate-spin text-[#BA7517]" />
            <p className="text-sm">Confirming your email…</p>
          </div>
        )}

        {state.kind === "ok" && (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#E6F0E9]">
              <CheckCircle2 className="h-6 w-6 text-[#2F7A4F]" />
            </div>
            <h1 className="mt-5 font-serif text-2xl italic font-semibold text-[#0A2540]">
              Email confirmed
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#3A4A5F]">
              {state.email ? <><strong>{state.email}</strong> is confirmed. </> : null}
              Go back to the tab where you were filling in your application — it has already
              moved on to the next step. You can close this one.
            </p>
            <p className="mt-4 text-xs leading-relaxed text-[#6B7685]">
              Closed that tab? Start again at{" "}
              <a href="/onboarding" className="font-medium text-[#BA7517] underline underline-offset-2">
                silkroutelogistics.ai/onboarding
              </a>
              . What you entered was saved, so you will not be retyping it.
            </p>
          </>
        )}

        {state.kind === "bad" && (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F6E3E3]">
              <XCircle className="h-6 w-6 text-[#9B2C2C]" />
            </div>
            <h1 className="mt-5 font-serif text-2xl italic font-semibold text-[#0A2540]">
              This link didn&apos;t work
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#3A4A5F]">{state.message}</p>
            <p className="mt-4 text-sm leading-relaxed text-[#3A4A5F]">
              Links can only be used once, and they expire after ten minutes. Go back to your
              application and choose <strong>Resend the code</strong> — or type the six digits
              from the email instead.
            </p>
            <a
              href="/onboarding"
              className="mt-6 inline-block rounded-md bg-[#BA7517] px-6 py-2.5 text-sm font-semibold text-[#FBF7F0] transition hover:bg-[#C5A572]"
            >
              Back to my application
            </a>
            <p className="mt-4 text-xs text-[#6B7685]">
              Still stuck? Email{" "}
              <a href="mailto:operations@silkroutelogistics.ai" className="font-medium text-[#BA7517]">
                operations@silkroutelogistics.ai
              </a>{" "}
              and we will confirm it for you.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function OnboardingVerifyPage() {
  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      <Suspense
        fallback={
          <div className="mx-auto max-w-lg px-6 py-20">
            <div className="rounded-xl border border-[#EFE6D3] bg-white p-8 text-sm text-[#3A4A5F] shadow-sm">
              Loading…
            </div>
          </div>
        }
      >
        <VerifyBody />
      </Suspense>
    </div>
  );
}
