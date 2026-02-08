"use client";

import { useState } from "react";
import { Search, MapPin, Clock, CheckCircle2, Circle, Truck, Package, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Shipment {
  id: string;
  loadNumber: string;
  proNumber: string;
  bolNumber: string;
  origin: string;
  destination: string;
  status: "BOOKED" | "DISPATCHED" | "PICKED_UP" | "IN_TRANSIT" | "DELIVERED";
  driver: string;
  equipment: string;
  eta: string;
  lastUpdate: string;
  lastLocation: string;
}

const mockShipments: Shipment[] = [
  { id: "1", loadNumber: "SRL-10042", proNumber: "PRO-88201", bolNumber: "BOL-55012", origin: "Toronto, ON", destination: "Chicago, IL", status: "IN_TRANSIT", driver: "Mike Johnson", equipment: "53' Dry Van", eta: "Feb 8, 2026 14:00", lastUpdate: "2 hrs ago", lastLocation: "Detroit, MI" },
  { id: "2", loadNumber: "SRL-10043", proNumber: "PRO-88202", bolNumber: "BOL-55013", origin: "Montreal, QC", destination: "New York, NY", status: "PICKED_UP", driver: "Sarah Lee", equipment: "53' Reefer", eta: "Feb 9, 2026 08:00", lastUpdate: "45 min ago", lastLocation: "Burlington, VT" },
  { id: "3", loadNumber: "SRL-10044", proNumber: "PRO-88203", bolNumber: "BOL-55014", origin: "Vancouver, BC", destination: "Seattle, WA", status: "DISPATCHED", driver: "James Park", equipment: "Flatbed", eta: "Feb 8, 2026 18:00", lastUpdate: "1 hr ago", lastLocation: "Abbotsford, BC" },
  { id: "4", loadNumber: "SRL-10045", proNumber: "PRO-88204", bolNumber: "BOL-55015", origin: "Calgary, AB", destination: "Denver, CO", status: "DELIVERED", driver: "Alex Turner", equipment: "53' Dry Van", eta: "Feb 7, 2026 10:00", lastUpdate: "5 hrs ago", lastLocation: "Denver, CO" },
  { id: "5", loadNumber: "SRL-10046", proNumber: "PRO-88205", bolNumber: "BOL-55016", origin: "Mississauga, ON", destination: "Atlanta, GA", status: "BOOKED", driver: "TBD", equipment: "53' Dry Van", eta: "Feb 10, 2026 12:00", lastUpdate: "Just now", lastLocation: "—" },
  { id: "6", loadNumber: "SRL-10047", proNumber: "PRO-88206", bolNumber: "BOL-55017", origin: "Winnipeg, MB", destination: "Minneapolis, MN", status: "IN_TRANSIT", driver: "Chris Hall", equipment: "Step Deck", eta: "Feb 8, 2026 22:00", lastUpdate: "30 min ago", lastLocation: "Grand Forks, ND" },
];

const statusSteps = ["BOOKED", "DISPATCHED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"] as const;
const statusLabels: Record<string, string> = {
  BOOKED: "Booked", DISPATCHED: "Dispatched", PICKED_UP: "Picked Up", IN_TRANSIT: "In Transit", DELIVERED: "Delivered",
};
const statusColors: Record<string, string> = {
  BOOKED: "bg-slate-100 text-slate-700",
  DISPATCHED: "bg-blue-50 text-blue-700",
  PICKED_UP: "bg-indigo-50 text-indigo-700",
  IN_TRANSIT: "bg-amber-50 text-amber-700",
  DELIVERED: "bg-green-50 text-green-700",
};

export default function TrackingPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Shipment | null>(null);

  const filtered = mockShipments.filter((s) =>
    !search || s.loadNumber.toLowerCase().includes(search.toLowerCase()) ||
    s.proNumber.toLowerCase().includes(search.toLowerCase()) ||
    s.bolNumber.toLowerCase().includes(search.toLowerCase())
  );

  const getStepIndex = (status: string) => statusSteps.indexOf(status as typeof statusSteps[number]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Track & Trace</h1>
        <span className="text-sm text-slate-500">{filtered.length} shipment(s)</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by Load #, PRO #, or BOL #..."
          className="w-full pl-10 pr-4 py-3 bg-white border rounded-xl focus:ring-2 focus:ring-gold outline-none text-sm"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Shipment List */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={cn(
                "w-full text-left bg-white rounded-xl border p-5 hover:border-gold/30 transition",
                selected?.id === s.id && "border-gold ring-1 ring-gold/20"
              )}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold">{s.loadNumber}</p>
                  <p className="text-xs text-slate-500">PRO: {s.proNumber} | BOL: {s.bolNumber}</p>
                </div>
                <span className={cn("px-2.5 py-1 rounded-full text-xs font-medium", statusColors[s.status])}>
                  {statusLabels[s.status]}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600 mb-2">
                <MapPin className="w-3.5 h-3.5 text-gold shrink-0" />
                <span>{s.origin}</span>
                <span className="text-slate-300">→</span>
                <span>{s.destination}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {s.driver}</span>
                <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {s.equipment}</span>
                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ETA: {s.eta}</span>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="bg-white rounded-xl border p-12 text-center">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No shipments found matching &quot;{search}&quot;</p>
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="space-y-4">
          {selected ? (
            <>
              {/* Status Timeline */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold text-sm mb-4">Status Timeline</h3>
                <div className="space-y-0">
                  {statusSteps.map((step, i) => {
                    const currentIdx = getStepIndex(selected.status);
                    const done = i <= currentIdx;
                    const active = i === currentIdx;
                    return (
                      <div key={step} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          {done ? (
                            <CheckCircle2 className={cn("w-5 h-5 shrink-0", active ? "text-gold" : "text-green-500")} />
                          ) : (
                            <Circle className="w-5 h-5 text-slate-200 shrink-0" />
                          )}
                          {i < statusSteps.length - 1 && (
                            <div className={cn("w-0.5 h-6", done ? "bg-green-300" : "bg-slate-100")} />
                          )}
                        </div>
                        <div className="pb-4">
                          <p className={cn("text-sm font-medium", done ? "text-slate-900" : "text-slate-400")}>
                            {statusLabels[step]}
                          </p>
                          {active && (
                            <p className="text-xs text-gold mt-0.5">Current — {selected.lastUpdate}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Shipment Details */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold text-sm mb-3">Shipment Details</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Load #</span><span className="font-medium">{selected.loadNumber}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">PRO #</span><span className="font-medium">{selected.proNumber}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">BOL #</span><span className="font-medium">{selected.bolNumber}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Driver</span><span className="font-medium">{selected.driver}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Equipment</span><span className="font-medium">{selected.equipment}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">ETA</span><span className="font-medium">{selected.eta}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Last Location</span><span className="font-medium">{selected.lastLocation}</span></div>
                </div>
              </div>

              {/* Map Placeholder */}
              <div className="bg-white rounded-xl border p-5">
                <h3 className="font-semibold text-sm mb-3">Live Map</h3>
                <div className="h-48 bg-slate-100 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">Map integration coming soon</p>
                    <p className="text-xs text-slate-400">Last known: {selected.lastLocation}</p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white rounded-xl border p-12 text-center">
              <Truck className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Select a shipment to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
