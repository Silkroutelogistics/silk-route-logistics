"use client";

import { useState } from "react";
import { MapPin, Calendar, Weight, Ruler, DollarSign, ChevronRight } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard, CarrierBadge } from "@/components/carrier";

interface Load {
  id: string;
  referenceNumber: string;
  originCity: string;
  originState: string;
  destCity: string;
  destState: string;
  equipmentType: string;
  weight: number | null;
  distance: number | null;
  rate: number;
  carrierRate: number | null;
  pickupDate: string;
  deliveryDate: string | null;
  commodity: string | null;
  specialInstructions: string | null;
  poster?: { company: string | null; firstName: string; lastName: string };
}

export default function AvailableLoadsPage() {
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["carrier-available", page],
    queryFn: () => api.get<{ loads: Load[]; total: number; totalPages: number }>(`/carrier-loads/available?page=${page}&limit=20`).then((r) => r.data),
  });

  const { data: detail } = useQuery({
    queryKey: ["carrier-load-detail", selectedId],
    queryFn: () => api.get(`/carrier-loads/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const acceptMutation = useMutation({
    mutationFn: (loadId: string) => api.post(`/carrier-loads/${loadId}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-available"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-my-loads"] });
      setSelectedId(null);
    },
  });

  const loads = data?.loads || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Available Loads</h1>
        <p className="text-[13px] text-gray-500">
          Loads matching your equipment and operating regions &middot; {data?.total || 0} available
        </p>
      </div>

      <div className="grid grid-cols-[1fr_380px] gap-5">
        {/* Load list */}
        <div className="space-y-2">
          {isLoading ? (
            [...Array(5)].map((_, i) => (
              <CarrierCard key={i} padding="p-4">
                <div className="h-16 bg-gray-100 rounded animate-pulse" />
              </CarrierCard>
            ))
          ) : loads.length === 0 ? (
            <CarrierCard padding="p-12">
              <div className="text-center text-gray-400 text-sm">No loads available matching your profile right now. Check back soon.</div>
            </CarrierCard>
          ) : (
            loads.map((load) => (
              <CarrierCard
                key={load.id}
                hover
                padding="p-4"
                onClick={() => setSelectedId(load.id)}
                className={selectedId === load.id ? "!border-[#C9A84C]" : ""}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="font-mono text-xs font-bold text-[#0D1B2A]">{load.referenceNumber}</span>
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">{load.equipmentType}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm text-gray-700">
                      <MapPin size={14} className="text-[#C9A84C]" />
                      <span>{load.originCity}, {load.originState}</span>
                      <span className="text-gray-400">&rarr;</span>
                      <span>{load.destCity}, {load.destState}</span>
                    </div>
                    <div className="flex gap-4 mt-2 text-[11px] text-gray-400">
                      <span className="flex items-center gap-1"><Calendar size={12} /> {new Date(load.pickupDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      {load.weight && <span className="flex items-center gap-1"><Weight size={12} /> {Number(load.weight).toLocaleString()} lbs</span>}
                      {load.distance && <span className="flex items-center gap-1"><Ruler size={12} /> {load.distance} mi</span>}
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <span className="text-lg font-bold text-[#C9A84C]">${(load.carrierRate || load.rate).toLocaleString()}</span>
                    {load.distance && (
                      <span className="text-[10px] text-gray-400">${((load.carrierRate || load.rate) / load.distance).toFixed(2)}/mi</span>
                    )}
                    <ChevronRight size={16} className="text-gray-300 mt-1" />
                  </div>
                </div>
              </CarrierCard>
            ))
          )}

          {data && data.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-2">
              {page > 1 && <button onClick={() => setPage(page - 1)} className="px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200">Prev</button>}
              <span className="px-3 py-1.5 text-xs text-gray-500">Page {page} of {data.totalPages}</span>
              {page < data.totalPages && <button onClick={() => setPage(page + 1)} className="px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200">Next</button>}
            </div>
          )}
        </div>

        {/* Detail panel */}
        <div>
          {selectedId && detail ? (
            <CarrierCard padding="p-5" className="sticky top-6">
              <h3 className="text-sm font-bold text-[#0D1B2A] mb-4">Load Details</h3>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-400">Reference</span>
                  <span className="font-mono font-bold">{detail.referenceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Equipment</span>
                  <span>{detail.equipmentType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Origin</span>
                  <span>{detail.originCity}, {detail.originState} {detail.originZip || ""}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Destination</span>
                  <span>{detail.destCity}, {detail.destState} {detail.destZip || ""}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Pickup</span>
                  <span>{new Date(detail.pickupDate).toLocaleDateString()}</span>
                </div>
                {detail.deliveryDate && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Delivery</span>
                    <span>{new Date(detail.deliveryDate).toLocaleDateString()}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">Weight</span>
                  <span>{detail.weight ? `${Number(detail.weight).toLocaleString()} lbs` : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Commodity</span>
                  <span>{detail.commodity || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Rate</span>
                  <span className="text-lg font-bold text-[#C9A84C]">${(detail.carrierRate || detail.rate || 0).toLocaleString()}</span>
                </div>
                {detail.specialInstructions && (
                  <div>
                    <span className="text-gray-400 block mb-1">Special Instructions</span>
                    <p className="text-gray-600 bg-gray-50 rounded p-2">{detail.specialInstructions}</p>
                  </div>
                )}
                {detail.poster && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Posted by</span>
                    <span>{detail.poster.company || `${detail.poster.firstName} ${detail.poster.lastName}`}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => acceptMutation.mutate(selectedId)}
                disabled={acceptMutation.isPending}
                className="w-full mt-5 py-2.5 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-white text-sm font-semibold rounded-md shadow-[0_4px_20px_rgba(201,168,76,0.3)] disabled:opacity-60"
              >
                {acceptMutation.isPending ? "Accepting..." : "Accept Load"}
              </button>
              {acceptMutation.isError && (
                <p className="text-xs text-red-500 mt-2 text-center">
                  {(acceptMutation.error as any)?.response?.data?.error || "Failed to accept load"}
                </p>
              )}
            </CarrierCard>
          ) : (
            <CarrierCard padding="p-8" className="sticky top-6">
              <div className="text-center text-gray-400 text-sm">
                <MapPin size={32} className="mx-auto mb-3 text-gray-300" />
                Select a load to view details
              </div>
            </CarrierCard>
          )}
        </div>
      </div>
    </div>
  );
}
