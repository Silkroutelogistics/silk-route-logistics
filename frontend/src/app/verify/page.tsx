"use client";

// Sprint 51 (Item 129) — RC verification public surface. Mirror of /track
// page pattern (Sprint 26 Item 31): single page.tsx + SPA-rewrite rule in
// _redirects routes /verify/<token> here, page reads token from
// window.location.pathname and fetches /api/verify/:token. Static-export
// compatible (no SSR; no generateStaticParams needed for runtime tokens).

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SiteNav } from "@/components/shell/SiteNav";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface VerifyResponse {
  valid: boolean;
  error?: string;
  broker?: { name: string; mc: string; dot: string; contact: string };
  load?: {
    ref: string;
    pickupDate: string;
    deliveryDate: string;
    originState: string;
    destState: string;
    equipmentType: string;
  };
  carrier?: { company: string | null; mc?: string | null; dot?: string | null } | null;
  rate?: number;
  issuedAt?: string;
}

function fmtDate(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

export default function VerifyPage() {
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const match = window.location.pathname.match(/^\/verify\/([a-f0-9]{12})\/?$/);
    if (!match) {
      setError("Verification URL missing or malformed. Expected /verify/<token>.");
      setLoading(false);
      return;
    }
    const token = match[1];
    api.get(`/verify/${token}`)
      .then((res) => {
        setData(res.data as VerifyResponse);
        setLoading(false);
      })
      .catch((err) => {
        const status = err?.response?.status;
        if (status === 404) {
          setError("Rate Confirmation not found or verification expired.");
        } else {
          setError("Could not verify Rate Confirmation. Please try again or contact operations@silkroutelogistics.ai.");
        }
        setLoading(false);
      });
  }, []);

  return (
    <div className="public-page min-h-screen bg-[#FDFBF7] flex flex-col">
      <SiteNav theme="dark" />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <div className="mb-8">
          <a href="/" className="text-sm text-[#BA7517] hover:underline">← silkroutelogistics.ai</a>
        </div>

        {loading && (
          <div className="flex items-center gap-3 text-[#3A4A5F]">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Verifying Rate Confirmation…</span>
          </div>
        )}

        {!loading && error && (
          <div className="bg-white border border-[#9B2C2C]/30 rounded-lg p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-[#9B2C2C] flex-shrink-0 mt-0.5" />
              <div>
                <h1 className="text-xl font-semibold text-[#0A2540] mb-2">Verification failed</h1>
                <p className="text-sm text-[#3A4A5F]">{error}</p>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-[#0A2540]/10 text-sm text-[#3A4A5F]">
              <p className="mb-2"><strong className="text-[#0A2540]">Suspect a fraudulent Rate Confirmation?</strong></p>
              <p>Email <a className="text-[#BA7517] hover:underline" href="mailto:operations@silkroutelogistics.ai">operations@silkroutelogistics.ai</a> with the PDF and details. Silk Route Logistics Inc. — MC# 1794414 · DOT# 4526880.</p>
            </div>
          </div>
        )}

        {!loading && !error && data?.valid && (
          <div className="space-y-6">
            <div className="bg-white border border-[#2F7A4F]/30 rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <CheckCircle2 className="w-7 h-7 text-[#2F7A4F]" />
                <h1 className="text-2xl font-semibold text-[#0A2540]">Verified</h1>
              </div>
              <p className="text-sm text-[#3A4A5F]">This Rate Confirmation was issued by Silk Route Logistics Inc.</p>
            </div>

            <div className="bg-white border border-[#0A2540]/10 rounded-lg p-6 space-y-4">
              <div>
                <div className="text-xs uppercase tracking-wider text-[#BA7517] mb-2">Broker</div>
                <div className="text-sm text-[#0A2540]">
                  <div className="font-semibold">{data.broker?.name}</div>
                  <div className="text-[#3A4A5F]">MC# {data.broker?.mc} · DOT# {data.broker?.dot}</div>
                  <div className="text-[#3A4A5F]">
                    <a className="text-[#BA7517] hover:underline" href={`mailto:${data.broker?.contact}`}>{data.broker?.contact}</a>
                  </div>
                </div>
              </div>

              <div className="border-t border-[#0A2540]/10 pt-4">
                <div className="text-xs uppercase tracking-wider text-[#BA7517] mb-2">Load</div>
                <div className="grid grid-cols-2 gap-4 text-sm text-[#0A2540]">
                  <div><div className="text-xs text-[#6B7685]">Reference</div><div className="font-mono">{data.load?.ref}</div></div>
                  <div><div className="text-xs text-[#6B7685]">Equipment</div><div>{data.load?.equipmentType || "—"}</div></div>
                  <div><div className="text-xs text-[#6B7685]">Origin</div><div>{data.load?.originState || "—"}</div></div>
                  <div><div className="text-xs text-[#6B7685]">Destination</div><div>{data.load?.destState || "—"}</div></div>
                  <div><div className="text-xs text-[#6B7685]">Pickup</div><div>{fmtDate(data.load?.pickupDate)}</div></div>
                  <div><div className="text-xs text-[#6B7685]">Delivery</div><div>{fmtDate(data.load?.deliveryDate)}</div></div>
                </div>
              </div>

              {data.carrier && data.carrier.company && (
                <div className="border-t border-[#0A2540]/10 pt-4">
                  <div className="text-xs uppercase tracking-wider text-[#BA7517] mb-2">Carrier</div>
                  <div className="text-sm text-[#0A2540]">
                    <div className="font-semibold">{data.carrier.company}</div>
                    {(data.carrier.mc || data.carrier.dot) && (
                      <div className="text-[#3A4A5F]">
                        {data.carrier.mc && <span>MC# {data.carrier.mc}</span>}
                        {data.carrier.mc && data.carrier.dot && <span> · </span>}
                        {data.carrier.dot && <span>DOT# {data.carrier.dot}</span>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {data.issuedAt && (
                <div className="border-t border-[#0A2540]/10 pt-4 text-xs text-[#6B7685]">
                  Issued {fmtDate(data.issuedAt)}
                </div>
              )}
            </div>

            <div className="bg-[#FAEEDA]/40 border border-[#BA7517]/20 rounded-lg p-4 text-sm text-[#3A4A5F]">
              <strong className="text-[#0A2540]">If this Rate Confirmation looks different from what you received</strong> — for example, the broker name, MC/DOT, carrier identity, or total rate does not match the PDF in your inbox — contact <a className="text-[#BA7517] hover:underline" href="mailto:operations@silkroutelogistics.ai">operations@silkroutelogistics.ai</a> immediately. Fraudsters routinely send fake Rate Confirmations impersonating legitimate brokers.
            </div>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
