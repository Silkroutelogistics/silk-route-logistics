"use client";

// v3.8.ajl — Security signals card.
//
// AE-visible surface for the geo-tracking forensics the aje + ajf
// sprints introduced. Renders:
//   * Three-point geo baseline grid (Registration / Email Verify /
//     Last Login) — country code + IP + timestamp per row
//   * Country-mismatch warning when registrationCountry differs from
//     emailVerifiedFromCountry (geoMismatch derived flag)
//   * Recent SystemLog event timeline scoped to this carrier
//     (emailVerification + carrierAuth-unusual-activity sources)
//
// Mounted at the bottom of the existing Compliance tab on
// /dashboard/carriers carrier-detail surface. Adjacent to the
// document-completeness section — natural placement since
// AE checks both during the review pass.

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Globe, AlertTriangle, ShieldCheck, MapPin, Clock } from "lucide-react";

interface SecuritySignals {
  geo: {
    registrationCountry: string | null;
    emailVerifiedAt: string | null;
    emailVerifiedFromIp: string | null;
    emailVerifiedFromCountry: string | null;
    lastLoginAt: string | null;
    lastLoginIp: string | null;
    lastLoginCountry: string | null;
    geoMismatch: boolean;
  };
  events: Array<{
    id: string;
    severity: string;
    source: string;
    message: string;
    ipAddress: string | null;
    createdAt: string;
  }>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return "—"; }
}

const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  INFO:    { bg: "bg-blue-50", text: "text-blue-700" },
  WARNING: { bg: "bg-amber-50", text: "text-amber-700" },
  ERROR:   { bg: "bg-red-50", text: "text-red-700" },
  CRITICAL:{ bg: "bg-red-100", text: "text-red-800" },
};

export function SecuritySignalsCard({ carrierId }: { carrierId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["carrier-security-signals", carrierId],
    queryFn: () => api.get<SecuritySignals>(`/carriers/${carrierId}/security-signals`).then((r) => r.data),
    enabled: !!carrierId,
  });

  if (isLoading) {
    return (
      <div className="bg-gray-100 rounded-lg p-4 text-center">
        <p className="text-sm text-gray-500 animate-pulse">Loading security signals…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-sm text-red-700">Couldn&apos;t load security signals.</p>
      </div>
    );
  }

  const { geo, events } = data;

  return (
    <div className="space-y-3">
      {/* Geo-mismatch alert pill */}
      {geo.geoMismatch && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-900">Country mismatch detected</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Registered from <strong>{geo.registrationCountry}</strong> but verified email from <strong>{geo.emailVerifiedFromCountry}</strong>. Review carefully before approving.
            </p>
          </div>
        </div>
      )}

      {/* Three-point geo grid */}
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Globe size={14} className="text-gray-500" />
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Geo baseline</h4>
        </div>
        <div className="space-y-2">
          <SignalRow
            icon={<MapPin size={11} className="text-gray-500" />}
            label="Registration"
            country={geo.registrationCountry}
            ip={null}
            timestamp={null}
          />
          <SignalRow
            icon={<ShieldCheck size={11} className={geo.emailVerifiedAt ? "text-green-600" : "text-gray-400"} />}
            label="Email verify"
            country={geo.emailVerifiedFromCountry}
            ip={geo.emailVerifiedFromIp}
            timestamp={geo.emailVerifiedAt}
          />
          <SignalRow
            icon={<Clock size={11} className="text-gray-500" />}
            label="Last login"
            country={geo.lastLoginCountry}
            ip={geo.lastLoginIp}
            timestamp={geo.lastLoginAt}
          />
        </div>
      </div>

      {/* Event timeline */}
      <div className="bg-gray-100 rounded-lg p-4">
        <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-3">
          Recent events <span className="font-normal normal-case text-gray-500">({events.length})</span>
        </h4>
        {events.length === 0 ? (
          <p className="text-xs text-gray-500">No security events recorded.</p>
        ) : (
          <ul className="space-y-2 max-h-72 overflow-auto">
            {events.map((e) => {
              const severity = SEVERITY_COLORS[e.severity] || SEVERITY_COLORS.INFO;
              return (
                <li key={e.id} className="bg-white border border-gray-200 rounded-md p-2">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${severity.bg} ${severity.text}`}>
                      {e.severity}
                    </span>
                    <span className="text-[10px] text-gray-400">{formatDate(e.createdAt)}</span>
                  </div>
                  <p className="text-[11px] text-gray-700 leading-snug">{e.message}</p>
                  {e.ipAddress && (
                    <p className="text-[10px] text-gray-400 mt-1">IP: {e.ipAddress}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function SignalRow({ icon, label, country, ip, timestamp }: {
  icon: React.ReactNode;
  label: string;
  country: string | null;
  ip: string | null;
  timestamp: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="flex items-center gap-1.5 text-gray-600">
        {icon}
        <span className="font-medium">{label}</span>
      </span>
      <span className="flex items-center gap-2 text-gray-700">
        <span className="font-semibold">{country || "—"}</span>
        {ip && <span className="text-gray-400 text-[10px] font-mono">{ip}</span>}
        {timestamp && <span className="text-gray-400 text-[10px]">{formatDate(timestamp)}</span>}
      </span>
    </div>
  );
}
