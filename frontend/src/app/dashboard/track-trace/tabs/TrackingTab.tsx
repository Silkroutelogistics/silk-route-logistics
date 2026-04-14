"use client";

import { MapPin, Bell, Clock, Navigation } from "lucide-react";

export function TrackingTab({ load }: { load: any }) {
  const pickup = load.loadStops?.find((s: any) => s.stopType === "PICKUP") ?? {};
  const delivery = [...(load.loadStops ?? [])].reverse().find((s: any) => s.stopType === "DELIVERY") ?? {};
  const latestEvent = load.trackingEvents?.[0];

  const activeDetention = load.detentionRecords?.find((r: any) => !r.departedAt);
  const geofenceEvents = load.geofenceEvents ?? [];
  const geofenceIndex = ["entered_origin", "departed_origin", "entered_destination", "departed_destination"];
  const geofenceMap: Record<string, any> = {};
  for (const e of geofenceEvents) geofenceMap[e.eventType] = e;

  const token = load.shipperTrackingTokens?.[0];

  return (
    <div className="space-y-6 text-sm">
      {/* Route map placeholder */}
      <div className="border border-gray-200 rounded-lg bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Route</h3>
          <span className="text-xs text-gray-500">{load.distance ? `${Math.round(load.distance)} mi` : "—"}</span>
        </div>
        <div className="relative h-32 bg-gray-50 rounded overflow-hidden">
          <svg viewBox="0 0 400 120" className="w-full h-full">
            {/* dashed route */}
            <line x1="40" y1="60" x2="360" y2="60" stroke="#d1d5db" strokeWidth="2" strokeDasharray="6 4" />
            {/* driven portion (approximate 60%) */}
            <line x1="40" y1="60" x2="240" y2="60" stroke="#BA7517" strokeWidth="3" />
            {/* origin */}
            <circle cx="40" cy="60" r="7" fill="#22c55e" />
            <text x="40" y="90" textAnchor="middle" fontSize="10" fill="#374151">{pickup.city ?? load.originCity}</text>
            {/* dest */}
            <circle cx="360" cy="60" r="7" fill="#9ca3af" stroke="#fff" strokeWidth="2" />
            <text x="360" y="90" textAnchor="middle" fontSize="10" fill="#374151">{delivery.city ?? load.destCity}</text>
            {/* current pos */}
            <circle cx="240" cy="60" r="8" fill="#BA7517" stroke="#fff" strokeWidth="3" />
          </svg>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] text-gray-500">Current position</div>
            <div className="text-sm text-gray-900">
              {latestEvent?.locationCity ? `${latestEvent.locationCity}, ${latestEvent.locationState}` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-gray-500">ETA</div>
            <div className="text-sm text-gray-900">{fmtDate(latestEvent?.etaDestination)}</div>
          </div>
        </div>
      </div>

      {/* ETA alert */}
      <div className="border border-gray-200 rounded-lg bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <Bell className="w-4 h-4 text-[#BA7517]" />
          <h3 className="text-sm font-semibold text-gray-900">ETA alert</h3>
          <span className="ml-auto px-2 py-0.5 text-[11px] rounded bg-green-100 text-green-700">Armed</span>
        </div>
        <p className="text-xs text-gray-600">Notifies AE + shipper if ETA slips past the delivery window.</p>
      </div>

      {/* Detention timer */}
      <div className="border border-gray-200 rounded-lg bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-[#BA7517]" />
          <h3 className="text-sm font-semibold text-gray-900">Detention</h3>
        </div>
        {activeDetention ? (
          <>
            <div className="text-xs text-gray-500">{activeDetention.locationType === "origin" ? "At pickup" : "At delivery"} — {activeDetention.facilityName ?? "—"}</div>
            <div className="text-xl font-semibold mt-1">{Math.round((Date.now() - new Date(activeDetention.enteredAt).getTime()) / 60000)}m</div>
            <div className="text-xs text-gray-600 mt-1">
              {activeDetention.billable ? "Over 2h — billable" : "Under 2h — no charge"}
            </div>
          </>
        ) : (
          <div className="text-xs text-gray-500">No active detention.</div>
        )}
      </div>

      {/* GPS details */}
      <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Navigation className="w-4 h-4 text-[#BA7517]" />
          <h3 className="text-sm font-semibold text-gray-900">GPS</h3>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Info label="Truck GPS"   value={latestEvent?.latitude ? `${latestEvent.latitude}, ${latestEvent.longitude}` : "—"} />
          <Info label="Last ping"   value={fmtDate(latestEvent?.createdAt)} />
          <Info label="Source"      value={latestEvent?.locationSource ?? "—"} />
          <Info label="Alert level" value={latestEvent?.alertLevel ?? "GREEN"} />
        </div>
      </div>

      {/* Geofence events */}
      <div className="border border-gray-200 rounded-lg bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="w-4 h-4 text-[#BA7517]" />
          <h3 className="text-sm font-semibold text-gray-900">Geofence</h3>
        </div>
        <ol className="space-y-1.5 text-xs">
          {geofenceIndex.map((key) => {
            const evt = geofenceMap[key];
            const label = key.replace(/_/g, " ");
            return (
              <li key={key} className="flex justify-between">
                <span className="capitalize text-gray-700">{label}</span>
                <span className="text-gray-500">{evt ? fmtDate(evt.occurredAt) : "Pending"}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Shipper link */}
      {token && (
        <div className="p-3 border border-[#FAEEDA] bg-[#FAEEDA]/30 rounded-lg text-xs text-[#854F0B]">
          Shipper tracking: <code>track.silkroutelogistics.ai/s/{token.token}</code>
          {load.bolNumber && <> · BOL-{load.bolNumber}</>}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-gray-900">{value ?? "—"}</div>
    </div>
  );
}

function fmtDate(d: any) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
