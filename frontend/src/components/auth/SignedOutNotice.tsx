"use client";

/**
 * Tells a person WHY they are looking at a sign-in screen.
 *
 * Landing back on login with no explanation is the worst version of a session
 * expiring: it reads as "something broke" or "my password stopped working". The
 * server already distinguishes four cases and the API interceptor already puts
 * the reason on the URL — this is the last mile that turns that into a sentence.
 *
 * SUSPENSE IS INTERNAL, deliberately. `useSearchParams` requires a Suspense
 * boundary under Next static export, and this repo has shipped that mistake
 * before (§13.3 Item 194 F-class). Wrapping it here means a caller cannot get it
 * wrong by forgetting — dropping <SignedOutNotice /> into a page is always safe.
 *
 * UNKNOWN REASONS RENDER NOTHING. A wrong explanation is worse than none: being
 * told "you were idle" when you were signed out by a policy change sends someone
 * looking for a problem that does not exist.
 */

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SIGNED_OUT_COPY } from "@/lib/sessionPolicy";

function Notice({ className }: { className?: string }) {
  const params = useSearchParams();
  const reason = params.get("reason");
  const copy = reason ? SIGNED_OUT_COPY[reason] : undefined;
  if (!copy) return null;

  return (
    <div
      role="status"
      className={`rounded-lg border px-4 py-3 mb-4 ${className || ""}`}
      style={{ background: "#FBEFD4", borderColor: "rgba(176,122,26,0.4)" }}
    >
      <p className="text-sm font-semibold" style={{ color: "#B07A1A" }}>
        {copy.title}
      </p>
      <p className="text-xs mt-1" style={{ color: "#3A4A5F" }}>
        {copy.body}
      </p>
    </div>
  );
}

export function SignedOutNotice({ className }: { className?: string }) {
  return (
    <Suspense fallback={null}>
      <Notice className={className} />
    </Suspense>
  );
}
