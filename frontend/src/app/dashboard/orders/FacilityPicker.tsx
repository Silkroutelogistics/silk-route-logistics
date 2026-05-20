"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MapPin, Star, Plus } from "lucide-react";

/**
 * Facility picker — shows the CRM facilities for a customer as
 * selectable cards. Used on both Origin and Destination in Section 2
 * of the Order Builder. Cards filter by facility type (pickup/delivery/both).
 *
 * When a card is clicked, the parent gets the full facility object back
 * so it can auto-fill address, dock info, contact, load type, etc.
 */

interface Facility {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  facilityType: string;
  isPrimary: boolean;
  contactName: string | null;
  contactPhone: string | null;
  dockInfo: string | null;
  loadType: string;
  estimatedLoadTimeMinutes: number | null;
  appointmentRequired: boolean;
  specialInstructions: string | null;
  lumperInfo: string | null;
}

interface Props {
  customerId: string | null;
  side: "pickup" | "delivery";
  selectedFacilityId: string | null;
  onSelect: (facility: Facility) => void;
  onAddNew: () => void;
}

export function FacilityPicker({ customerId, side, selectedFacilityId, onSelect, onAddNew }: Props) {
  const q = useQuery<{ facilities: Facility[] }>({
    queryKey: ["ob-facilities", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/facilities`)).data,
    enabled: !!customerId,
  });

  const facilities = (q.data?.facilities ?? []).filter((f) => f.facilityType === "both" || f.facilityType === side);

  if (!customerId) {
    return (
      <div className="p-3 text-[11px] text-[#6B7685] text-center border border-dashed border-slate-300 rounded-lg bg-white">
        Select a customer to load saved facilities
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {facilities.map((f) => {
        const isSelected = selectedFacilityId === f.id;
        return (
          <button
            key={f.id}
            type="button"
            onClick={() => onSelect(f)}
            className={`w-full text-left p-2.5 rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40 ${
              isSelected
                ? "border-[#BA7517] bg-[#FAEEDA]"
                : "border-slate-200 bg-white hover:border-[#C5A572]/40 hover:bg-[#FAEEDA]/30"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <MapPin className={`w-3 h-3 shrink-0 ${isSelected ? "text-[#BA7517]" : "text-[#6B7685]"}`} />
                  <span className="text-xs font-semibold text-[#0A2540] truncate">{f.name}</span>
                  {f.isPrimary && (
                    <span className="inline-flex items-center gap-0.5 px-1 py-0.5 text-[9px] rounded bg-[#FAEEDA] text-[#BA7517]">
                      <Star className="w-2 h-2" /> Primary {side === "pickup" ? "PU" : "DEL"}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-[#6B7685] mt-0.5 truncate">
                  {f.address ? `${f.address}, ` : ""}{f.city}, {f.state} {f.zip ?? ""}
                </div>
                <div className="text-[10px] text-[#6B7685] mt-0.5 flex gap-2">
                  <span className="uppercase">{f.loadType}</span>
                  {f.estimatedLoadTimeMinutes && <span>· {f.estimatedLoadTimeMinutes}m est</span>}
                  {f.appointmentRequired && <span>· Appt</span>}
                </div>
              </div>
            </div>
          </button>
        );
      })}
      {facilities.length === 0 && !q.isLoading && (
        <div className="p-3 text-[11px] text-[#6B7685] text-center border border-dashed border-slate-300 rounded-lg bg-white">
          No saved {side} facilities for this customer
        </div>
      )}
      <button
        type="button"
        onClick={onAddNew}
        className="w-full flex items-center justify-center gap-1 p-2 text-[11px] text-[#BA7517] border border-dashed border-[#BA7517]/40 rounded-lg hover:bg-[#FAEEDA]/40 transition focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40"
      >
        <Plus className="w-3 h-3" /> Add new {side}
      </button>
    </div>
  );
}

export type { Facility };
