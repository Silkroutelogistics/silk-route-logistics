"use client";

/**
 * v3.8.avo — the two configuration gaps that lose or blind carrier paperwork.
 *
 * WHY THIS IS ON A SCREEN AND NOT JUST IN A LOG. Until 2026-08-30 the production
 * `documents` table held ZERO rows across every carrier that had ever applied.
 * Object storage refuses uploads when it is unconfigured — deliberately and
 * loudly at its own layer — and the caller swallowed the refusal, so the AE saw
 * `DOCUMENTS (0)`, which reads as "they sent nothing" (§13.3 Item 248).
 *
 * The loss is no longer silent in the code. This makes it not silent to the
 * person who would otherwise chase a carrier for paperwork the carrier already
 * sent.
 *
 * It reads /api/health, which reports both flags from the SAME checks the upload
 * path and the reader branch on — so a green banner means the feature works, not
 * that a variable exists somewhere.
 */

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";

interface Health {
  storage?: { configured: boolean; provider: string };
  parser?: { configured: boolean };
}

export function PlatformConfigBanner() {
  const { data } = useQuery<Health>({
    queryKey: ["platform-health"],
    queryFn: async () => {
      const base = process.env.NEXT_PUBLIC_API_URL || "";
      const r = await fetch(`${base}/api/health`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    },
    // Configuration changes on a deploy, not on a page view.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // A backend that predates these fields returns neither. Render nothing rather
  // than claiming a problem we cannot actually see — an unreadable check is not
  // a failed check.
  if (!data?.storage && !data?.parser) return null;

  const storageDown = data.storage?.configured === false;
  const parserDown = data.parser?.configured === false;
  if (!storageDown && !parserDown) return null;

  return (
    <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-red-300">
            Platform configuration is incomplete
          </p>

          {storageDown && (
            <p className="text-xs text-red-200/90 leading-relaxed">
              <strong>Document uploads WILL fail.</strong> Object storage is not
              configured, so every W-9, COI and authority letter a carrier sends is
              refused. Their application still succeeds and the failure is recorded —
              you will see the files named on the carrier&apos;s Documents tab — but
              nothing is retained. Do not ask carriers to re-upload until this is set.
            </p>
          )}

          {parserDown && (
            <p className="text-xs text-red-200/90 leading-relaxed">
              <strong>COI parsing WILL NOT run.</strong> Certificates are stored and
              shown to you, and nothing reads them: no coverage amounts, no expiry, no
              agent details are extracted. Insurance figures are whatever the carrier
              typed.
            </p>
          )}

          <p className="text-[11px] text-red-200/70">
            Both are Render environment variables, not code.
            See <span className="font-mono">docs/internal/render-env-checklist.md</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
