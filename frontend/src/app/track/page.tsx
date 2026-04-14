"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Search, MapPin, Phone, Mail, CheckCircle2, Circle } from "lucide-react";

type SearchKind = "bol" | "code" | "reference";

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
  { key: "IN_TRANSIT",  label: "Departed" },
  { key: "AT_DELIVERY", label: "In transit" },
  { key: "DELIVERED",   label: "Delivered" },
];

export default function PublicTrackPage() {
  const [kind, setKind] = useState<SearchKind>("bol");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<PublicTrackResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div className="min-h-screen bg-[#0f172a] text-white">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#0f172a]">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <div className="text-xl font-bold text-[#BA7517]">Silk Route Logistics</div>
            <div className="text-xs text-gray-400">Where Trust Travels.</div>
          </div>
          <nav className="flex gap-6 text-sm text-gray-300">
            <a href="/" className="hover:text-white">Home</a>
            <a href="/track" className="text-[#BA7517]">Track shipment</a>
            <a href="/contact" className="hover:text-white">Contact</a>
          </nav>
        </div>
      </header>

      {/* Search */}
      <section className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold mb-2">Track your shipment</h1>
        <p className="text-gray-400 mb-8">Real-time status on every load SRL moves.</p>

        <div className="flex gap-1 justify-center mb-4">
          {(["bol", "code", "reference"] as SearchKind[]).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-4 py-2 text-sm border-b-2 transition ${
                kind === k ? "border-[#BA7517] text-white" : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {k === "bol" ? "BOL number" : k === "code" ? "Tracking code" : "Reference / PO #"}
            </button>
          ))}
        </div>

        <div className="flex gap-2 max-w-2xl mx-auto">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
              placeholder={
                kind === "bol" ? "e.g. BOL-7734"
                : kind === "code" ? "e.g. aB3xK9"
                : "e.g. PO-88421"
              }
              className="w-full pl-9 pr-3 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#BA7517]"
            />
          </div>
          <button
            onClick={onSearch}
            disabled={loading}
            className="px-6 py-3 bg-[#BA7517] hover:bg-[#8f5a11] text-white font-medium rounded-lg disabled:opacity-50"
          >
            {loading ? "Searching…" : "Track"}
          </button>
        </div>

        {error && <div className="mt-4 text-red-400 text-sm">{error}</div>}
      </section>

      {/* Result */}
      {result && (
        <section className="max-w-4xl mx-auto px-6 pb-16">
          <div className="bg-white/5 backdrop-blur border border-white/10 rounded-2xl p-8">
            <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
              <div>
                <div className="text-xs text-gray-400">BOL / reference</div>
                <div className="text-xl font-semibold">{result.referenceNumber}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 text-xs rounded-full bg-[#FAEEDA] text-[#854F0B] font-medium">
                  {result.status.replace(/_/g, " ")}
                </span>
                {result.actualDelivery && <span className="px-3 py-1 text-xs rounded-full bg-green-500/20 text-green-400">On time</span>}
              </div>
            </div>

            {/* Route + position */}
            <div className="mb-6">
              <div className="flex justify-between text-sm mb-2">
                <span>{result.origin.city}, {result.origin.state}</span>
                <span>{result.destination.city}, {result.destination.state}</span>
              </div>
              <div className="relative h-1 bg-white/10 rounded">
                <div className="absolute inset-y-0 left-0 bg-[#BA7517] rounded" style={{ width: `${result.progressPct}%` }} />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#BA7517] border-2 border-white shadow"
                  style={{ left: `calc(${result.progressPct}% - 8px)` }}
                />
              </div>
              {result.lastLocation && (
                <div className="mt-3 text-xs text-gray-400 flex items-center gap-1">
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
                          done ? "bg-[#BA7517]" : "bg-white/10"
                        }`}
                      />
                    )}
                    <div className="relative">
                      {done
                        ? <CheckCircle2 className="w-6 h-6 text-[#BA7517]" fill="#BA7517" strokeWidth={0} />
                        : <Circle className="w-6 h-6 text-white/30" />}
                    </div>
                    <div className="text-[11px] mt-1 text-gray-400">{s.label}</div>
                  </div>
                );
              })}
            </div>

            {/* Detail grid */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm border-t border-white/10 pt-6">
              <Detail label="Shipper"          value={result.shipperName} />
              <Detail label="Equipment"        value={result.equipment} />
              <Detail label="Commodity"        value={result.commodity} />
              <Detail label="Weight"           value={result.weight ? `${result.weight} lbs` : null} />
              <Detail label="Pickup"           value={fmt(result.pickupDate)} />
              <Detail label="Estimated delivery" value={fmt(result.estimatedDelivery)} />
            </div>

            {result.podUrl && (
              <div className="mt-6 pt-6 border-t border-white/10">
                <a
                  href={result.podUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-white text-sm rounded-lg"
                >
                  Download POD
                </a>
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="mt-6 text-center text-sm text-gray-400 space-y-1">
            <div className="flex items-center justify-center gap-4">
              <a href="tel:+12692206760" className="inline-flex items-center gap-1 hover:text-white"><Phone className="w-3 h-3" /> (269) 220-6760</a>
              <a href="mailto:operations@silkroutelogistics.ai" className="inline-flex items-center gap-1 hover:text-white"><Mail className="w-3 h-3" /> operations@silkroutelogistics.ai</a>
            </div>
          </div>
        </section>
      )}

      <footer className="border-t border-white/10 text-center py-6 text-xs text-gray-500">
        © 2026 Silk Route Logistics Inc. · MC# 1794414 · USDOT# 4526880 · 2317 S 35th St, Galesburg, MI 49053
      </footer>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[11px] uppercase text-gray-500">{label}</div>
      <div className="text-white">{value ?? "—"}</div>
    </div>
  );
}

function fmt(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
