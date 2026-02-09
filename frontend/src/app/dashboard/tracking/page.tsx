"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, MapPin, Clock, CheckCircle2, Circle, Truck, Package, Download } from "lucide-react";

interface Shipment {
  id: string; shipmentNumber: string; proNumber: string | null; bolNumber: string | null;
  status: string; originCity: string; originState: string; destCity: string; destState: string;
  weight: number | null; commodity: string | null; equipmentType: string; rate: number;
  pickupDate: string; deliveryDate: string; lastLocation: string | null; lastLocationAt: string | null; eta: string | null;
  driver?: { firstName: string; lastName: string } | null;
  equipment?: { unitNumber: string; type: string } | null;
  customer?: { name: string } | null;
}

const statusSteps = ["PENDING", "BOOKED", "DISPATCHED", "PICKED_UP", "IN_TRANSIT", "DELIVERED"];
const statusLabels: Record<string, string> = {
  PENDING: "Pending", BOOKED: "Booked", DISPATCHED: "Dispatched", PICKED_UP: "Picked Up", IN_TRANSIT: "In Transit", DELIVERED: "Delivered", COMPLETED: "Completed",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-500/20 text-slate-400", BOOKED: "bg-blue-500/20 text-blue-400",
  DISPATCHED: "bg-orange-500/20 text-orange-400", PICKED_UP: "bg-yellow-500/20 text-yellow-400",
  IN_TRANSIT: "bg-cyan-500/20 text-cyan-400", DELIVERED: "bg-green-500/20 text-green-400",
  COMPLETED: "bg-emerald-500/20 text-emerald-400",
};

export default function TrackingPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Shipment | null>(null);

  const params = new URLSearchParams();
  if (search) params.set("search", search);

  const { data } = useQuery({
    queryKey: ["shipments", search],
    queryFn: () => api.get<{ shipments: Shipment[]; total: number }>(`/shipments?${params.toString()}`).then((r) => r.data),
  });

  const downloadBOL = async (shipmentId: string, shipmentNumber: string) => {
    const res = await api.get(`/pdf/bol/${shipmentId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url; a.download = `BOL-${shipmentNumber}.pdf`; a.click();
    window.URL.revokeObjectURL(url);
  };

  const getStepIndex = (status: string) => statusSteps.indexOf(status);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Track & Trace</h1>
        <span className="text-sm text-slate-400">{data?.total || 0} shipments</span>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by shipment #, PRO #, or BOL #..."
          className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Shipment List */}
        <div className="lg:col-span-2 space-y-3">
          {data?.shipments?.map((s) => (
            <button key={s.id} onClick={() => setSelected(s)}
              className={`w-full text-left bg-white/5 rounded-xl border p-5 transition ${selected?.id === s.id ? "border-gold" : "border-white/10 hover:border-white/20"}`}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-medium text-white">{s.shipmentNumber}</p>
                  <p className="text-xs text-slate-500">{s.proNumber && `PRO: ${s.proNumber}`} {s.bolNumber && `| BOL: ${s.bolNumber}`}</p>
                </div>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[s.status] || ""}`}>{statusLabels[s.status] || s.status}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-300 mb-2">
                <MapPin className="w-3.5 h-3.5 text-gold shrink-0" />
                <span>{s.originCity}, {s.originState}</span>
                <span className="text-slate-500">&rarr;</span>
                <span>{s.destCity}, {s.destState}</span>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-500">
                {s.driver && <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {s.driver.firstName} {s.driver.lastName}</span>}
                {s.equipment && <span className="flex items-center gap-1"><Package className="w-3 h-3" /> {s.equipment.unitNumber}</span>}
                {s.eta && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ETA: {new Date(s.eta).toLocaleDateString()}</span>}
                {s.customer && <span>Customer: {s.customer.name}</span>}
              </div>
            </button>
          ))}
          {(!data?.shipments || data.shipments.length === 0) && (
            <div className="text-center py-12 text-slate-500">No shipments found</div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="space-y-4">
          {selected ? (
            <>
              <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                <h3 className="font-semibold text-white text-sm mb-4">Status Timeline</h3>
                <div className="space-y-0">
                  {statusSteps.map((step, i) => {
                    const currentIdx = getStepIndex(selected.status);
                    const done = i <= currentIdx;
                    const active = i === currentIdx;
                    return (
                      <div key={step} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          {done ? <CheckCircle2 className={`w-5 h-5 ${active ? "text-gold" : "text-green-400"}`} /> : <Circle className="w-5 h-5 text-slate-600" />}
                          {i < statusSteps.length - 1 && <div className={`w-0.5 h-6 ${done ? "bg-green-400/50" : "bg-slate-700"}`} />}
                        </div>
                        <div className="pb-4">
                          <p className={`text-sm ${done ? "text-white font-medium" : "text-slate-500"}`}>{statusLabels[step]}</p>
                          {active && selected.lastLocation && <p className="text-xs text-gold mt-0.5">Current — {selected.lastLocation}</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                <h3 className="font-semibold text-white text-sm mb-3">Details</h3>
                <div className="space-y-2 text-sm">
                  <Row label="Shipment #" value={selected.shipmentNumber} />
                  {selected.proNumber && <Row label="PRO #" value={selected.proNumber} />}
                  {selected.bolNumber && <Row label="BOL #" value={selected.bolNumber} />}
                  {selected.driver && <Row label="Driver" value={`${selected.driver.firstName} ${selected.driver.lastName}`} />}
                  {selected.equipment && <Row label="Equipment" value={`${selected.equipment.unitNumber} — ${selected.equipment.type}`} />}
                  <Row label="Pickup" value={new Date(selected.pickupDate).toLocaleDateString()} />
                  <Row label="Delivery" value={new Date(selected.deliveryDate).toLocaleDateString()} />
                  {selected.lastLocation && <Row label="Last Location" value={selected.lastLocation} />}
                </div>
              </div>

              <button onClick={() => downloadBOL(selected.id, selected.shipmentNumber)}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
                <Download className="w-4 h-4" /> Download BOL
              </button>

              <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                <h3 className="font-semibold text-white text-sm mb-3">Live Map</h3>
                <div className="h-48 bg-white/5 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">Map integration coming soon</p>
                    {selected.lastLocation && <p className="text-xs text-slate-400">Last known: {selected.lastLocation}</p>}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
              <Truck className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Select a shipment to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between"><span className="text-slate-400">{label}</span><span className="text-white">{value}</span></div>;
}
