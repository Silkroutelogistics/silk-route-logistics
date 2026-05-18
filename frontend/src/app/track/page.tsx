"use client";

import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { Search, MapPin, Phone, Mail, CheckCircle2, Circle, Loader2 } from "lucide-react";
import { SiteNav } from "@/components/shell/SiteNav";
import { SiteFooter } from "@/components/shell/SiteFooter";

type SearchKind = "bol" | "reference";

interface PublicTrackResponse {
  referenceNumber: string;
  status: string;
  progressPct: number;
  origin: { city: string; state: string };
  destination: { city: string; state: string };
  equipment: string;
  commodity: string | null;
  weight: number | null;
  temperatureControlled: boolean;
  pickupDate: string;
  deliveryDate: string;
  actualPickup: string | null;
  actualDelivery: string | null;
  shipperName: string | null;
  lastLocation: { city: string; state: string; updatedAt: string } | null;
  estimatedDelivery: string | null;
  milestones: { label: string; status: string; completed: boolean }[];
  podUrl: string | null;
}

const STEP_BAR = [
  { key: "LOADED",      label: "Picked up" },
  { key: "IN_TRANSIT",  label: "On the road" },
  { key: "AT_DELIVERY", label: "Arriving" },
  { key: "DELIVERED",   label: "Delivered" },
];

// Public-facing status labels. The backend returns canonical Load enum
// values (POSTED / TENDERED / BOOKED / DISPATCHED / AT_PICKUP / LOADED /
// PICKED_UP / IN_TRANSIT / AT_DELIVERY / DELIVERED / POD_RECEIVED /
// INVOICED / COMPLETED / TONU / CANCELLED / DRAFT) — internal broker-
// pipeline vocabulary. Customers don't need to see "POSTED" (load is on
// our load board awaiting a carrier) or "POD_RECEIVED" (accounting
// internal). Map 14 internal states to 8 customer-meaningful labels.
const PUBLIC_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Scheduled",
  POSTED: "Scheduled",
  TENDERED: "Scheduled",
  CONFIRMED: "Scheduled",
  BOOKED: "Scheduled",
  DISPATCHED: "Dispatched",
  AT_PICKUP: "At pickup",
  LOADED: "Picked up",
  PICKED_UP: "Picked up",
  IN_TRANSIT: "In transit",
  AT_DELIVERY: "Arriving",
  DELIVERED: "Delivered",
  POD_RECEIVED: "Delivered",
  INVOICED: "Delivered",
  COMPLETED: "Delivered",
  TONU: "Cancelled",
  CANCELLED: "Cancelled",
};

function publicStatusLabel(status: string): string {
  return PUBLIC_STATUS_LABEL[status] || status.replace(/_/g, " ");
}

export default function PublicTrackPage() {
  const [kind, setKind] = useState<SearchKind>("bol");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PublicTrackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenFromUrl, setTokenFromUrl] = useState<string | null>(null);

  // QR/email deep-link mode: _redirects rewrites /track/<token> to serve
  // this page (status 200, browser URL preserved). Detect token from
  // pathname on mount and auto-fetch so the customer who scanned a BOL
  // QR sees the result panel directly without typing into the search box.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const match = window.location.pathname.match(/^\/track\/(.+?)\/?$/);
    if (!match || !match[1]) return;
    const token = decodeURIComponent(match[1]);
    setTokenFromUrl(token);
    setLoading(true);
    api.get(`/tracking/${encodeURIComponent(token)}`)
      .then(({ data }) => setResult(data))
      .catch((err) => setError(err?.response?.data?.error ?? "Shipment not found"))
      .finally(() => setLoading(false));
  }, []);

  const onSearch = async () => {
    if (!query.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const { data } = await api.get(`/tracking/${encodeURIComponent(query.trim())}`);
      setResult(data);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Shipment not found");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col">
      <SiteNav theme="dark" />

      {/* Hero — dark navy band mirrors static-HTML public pages (shippers.html
          .hero, carriers.html .hero, index.html .hero). Playfair display H1
          + gold-accent span matches "Ship Smarter. Ship Further." pattern. */}
      <section className="bg-[#0A2540] px-6 py-20 md:py-24">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="font-serif text-4xl md:text-5xl text-[#FDFBF7] mb-4 leading-tight">
            Track your <span className="text-[#C9A84C]">shipment.</span>
          </h1>
          <p className="text-[#C9D2DE] text-base md:text-lg mb-10">
            Real-time status on every load SRL moves.
          </p>

          {!tokenFromUrl && (
            <>
              <div className="flex gap-1 justify-center mb-4">
                {(["bol", "reference"] as SearchKind[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setKind(k)}
                    className={`px-4 py-2 text-sm border-b-2 transition ${
                      kind === k
                        ? "border-[#C9A84C] text-[#FDFBF7]"
                        : "border-transparent text-[#C9D2DE] hover:text-[#FDFBF7]"
                    }`}
                  >
                    {k === "bol" ? "BOL number" : "Reference / PO #"}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 max-w-2xl mx-auto">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7685] pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && onSearch()}
                    placeholder={
                      kind === "bol" ? "e.g. BOL-7734"
                      : "e.g. PO-88421 or load reference"
                    }
                    className="w-full pl-9 pr-3 py-3 bg-[#FDFBF7] border border-transparent rounded-lg text-[#0A2540] placeholder-[#6B7685] focus:outline-none focus:ring-2 focus:ring-[#C9A84C]"
                  />
                </div>
                <button
                  onClick={onSearch}
                  disabled={loading}
                  className="px-6 py-3 bg-[#BA7517] hover:bg-[#8f5a11] text-[#FDFBF7] font-medium rounded-lg disabled:opacity-50"
                >
                  {loading ? "Searching…" : "Track"}
                </button>
              </div>
            </>
          )}

          {tokenFromUrl && loading && !result && !error && (
            <div className="flex items-center justify-center gap-2 text-[#C9D2DE]">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading shipment…</span>
            </div>
          )}

          {error && (
            <div className="mt-4 text-sm">
              <div className="text-[#F87171]">{error}</div>
              {tokenFromUrl && (
                <div className="mt-3">
                  <a href="/track" className="text-[#C9A84C] hover:underline">Track another shipment</a>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Result — cream content band, only when result is loaded. White surface
          card on cream body matches shippers/carriers content-section pattern
          (e.g. "Our Shipping Solutions" cards). */}
      {result && (
        <section className="max-w-4xl mx-auto px-6 py-12 w-full">
          <div className="bg-white border border-[#0A2540]/10 rounded-2xl p-8 shadow-sm">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
              <div>
                <div className="text-xs text-[#6B7685]">BOL / reference</div>
                <div className="text-xl font-semibold text-[#0A2540]">{result.referenceNumber}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 text-xs rounded-full bg-[#FAEEDA] text-[#BA7517] font-medium">
                  {publicStatusLabel(result.status)}
                </span>
                {result.actualDelivery && <span className="px-3 py-1 text-xs rounded-full bg-[#E6F0E9] text-[#2F7A4F] font-medium">On time</span>}
              </div>
            </div>

            {/* Route + position */}
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2 text-[#0A2540]">
                <span>{result.origin.city}, {result.origin.state}</span>
                <span>{result.destination.city}, {result.destination.state}</span>
              </div>
              <div className="relative h-1 bg-[#0A2540]/10 rounded">
                <div className="absolute inset-y-0 left-0 bg-[#BA7517] rounded" style={{ width: `${result.progressPct}%` }} />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#BA7517] border-2 border-white shadow"
                  style={{ left: `calc(${result.progressPct}% - 8px)` }}
                />
              </div>
              {result.lastLocation && (
                <div className="mt-3 text-xs text-[#6B7685] flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  Last known: {result.lastLocation.city}, {result.lastLocation.state} · {new Date(result.lastLocation.updatedAt).toLocaleString()}
                </div>
              )}
            </div>

            {/* Step bar */}
            <div className="flex justify-between mb-6">
              {STEP_BAR.map((s, i) => {
                const done = result.milestones.find((m) => m.status === s.key)?.completed;
                return (
                  <div key={s.key} className="flex flex-col items-center flex-1 relative">
                    {i > 0 && (
                      <div
                        className={`absolute top-3 right-1/2 left-0 h-[2px] ${
                          done ? "bg-[#BA7517]" : "bg-[#0A2540]/10"
                        }`}
                      />
                    )}
                    <div className="relative">
                      {done
                        ? <CheckCircle2 className="w-6 h-6 text-[#BA7517]" fill="#BA7517" strokeWidth={0} />
                        : <Circle className="w-6 h-6 text-[#A7AEB8]" />}
                    </div>
                    <div className="text-[11px] mt-1 text-[#3A4A5F]">{s.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm border-t border-[#0A2540]/10 pt-6">
              <Detail label="Shipper"          value={result.shipperName} />
              <Detail label="Equipment"        value={result.equipment} />
              <Detail label="Commodity"        value={result.commodity} />
              <Detail label="Weight"           value={result.weight ? `${result.weight} lbs` : null} />
              <Detail label="Pickup"           value={fmt(result.pickupDate)} />
              <Detail label="Estimated delivery" value={fmt(result.estimatedDelivery)} />
            </div>

            {result.podUrl && (
              <div className="mt-6 pt-6 border-t border-[#0A2540]/10">
                <a
                  href={result.podUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-[#FDFBF7] text-sm rounded-lg"
                >
                  Download POD
                </a>
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="mt-6 text-center text-sm text-[#3A4A5F] space-y-1">
            <div className="flex items-center justify-center gap-4">
              <a href="tel:+12692206760" className="inline-flex items-center gap-1 hover:text-[#0A2540]"><Phone className="w-3 h-3" /> (269) 220-6760</a>
              <a href="mailto:operations@silkroutelogistics.ai" className="inline-flex items-center gap-1 hover:text-[#0A2540]"><Mail className="w-3 h-3" /> operations@silkroutelogistics.ai</a>
            </div>
            {tokenFromUrl && (
              <div className="pt-3">
                <a href="/track" className="text-[#BA7517] hover:underline">Track another shipment →</a>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Spacer pushes footer to viewport bottom when content is short
          (no-result state on tall viewports). */}
      <div className="flex-1" />

      <SiteFooter theme="dark" />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-[#6B7685]">{label}</div>
      <div className="text-[#0A2540]">{value ?? "—"}</div>
    </div>
  );
}

function fmt(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
