"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Truck, CheckCircle } from "lucide-react";

const EQUIPMENT_OPTIONS = ["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler", "Tanker", "Lowboy", "Conestoga"];
const US_REGION_OPTIONS = ["Great Lakes", "Upper Midwest", "Southeast", "Northeast", "South Central", "West"];
const CA_REGION_OPTIONS = ["Eastern Canada", "Western Canada", "Central Canada"];
const REGION_OPTIONS = [...US_REGION_OPTIONS, ...CA_REGION_OPTIONS, "Cross-Border"];

export function CarrierSetupWizard({ onComplete }: { onComplete: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    dotNumber: "",
    mcNumber: "",
    company: "",
    equipmentTypes: [] as string[],
    operatingRegions: [] as string[],
    address: "",
    city: "",
    state: "",
    zip: "",
    numberOfTrucks: "1",
  });

  const setup = useMutation({
    mutationFn: () => api.post("/carrier/admin-setup", form).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-dashboard"] });
      onComplete();
    },
  });

  const toggleEquipment = (type: string) => {
    setForm((f) => ({
      ...f,
      equipmentTypes: f.equipmentTypes.includes(type)
        ? f.equipmentTypes.filter((t) => t !== type)
        : [...f.equipmentTypes, type],
    }));
  };

  const toggleRegion = (region: string) => {
    setForm((f) => ({
      ...f,
      operatingRegions: f.operatingRegions.includes(region)
        ? f.operatingRegions.filter((r) => r !== region)
        : [...f.operatingRegions, region],
    }));
  };

  const isValid = form.dotNumber && form.mcNumber && form.equipmentTypes.length > 0;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <div className="w-14 h-14 bg-gold/10 rounded-xl flex items-center justify-center mx-auto">
          <Truck className="w-7 h-7 text-gold" />
        </div>
        <h2 className="text-xl font-bold text-white">Set Up Carrier Profile</h2>
        <p className="text-sm text-slate-400">Configure your carrier identity for the carrier view</p>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <div className="grid md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">DOT Number *</label>
            <input value={form.dotNumber} onChange={(e) => setForm((f) => ({ ...f, dotNumber: e.target.value }))}
              placeholder="e.g. 3401201" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">MC Number *</label>
            <input value={form.mcNumber} onChange={(e) => setForm((f) => ({ ...f, mcNumber: e.target.value }))}
              placeholder="e.g. MC-891201" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1 block">Company Name</label>
          <input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
            placeholder="e.g. Silk Route Logistics" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-2 block">Equipment Types *</label>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((type) => (
              <button key={type} onClick={() => toggleEquipment(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  form.equipmentTypes.includes(type)
                    ? "bg-gold text-navy"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-2 block">Operating Regions</label>
          <div className="flex flex-wrap gap-2">
            {REGION_OPTIONS.map((region) => (
              <button key={region} onClick={() => toggleRegion(region)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                  form.operatingRegions.includes(region)
                    ? "bg-gold/20 text-gold border border-gold/30"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                {region}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-3">
          <div className="md:col-span-2">
            <label className="text-xs text-slate-500 mb-1 block">Address</label>
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Street address" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">City</label>
            <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">State</label>
              <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase().slice(0, 2) }))}
                maxLength={2} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">ZIP</label>
              <input value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
          </div>
        </div>

        <div>
          <label className="text-xs text-slate-500 mb-1 block">Number of Trucks</label>
          <input value={form.numberOfTrucks} onChange={(e) => setForm((f) => ({ ...f, numberOfTrucks: e.target.value }))}
            type="number" min="1" className="w-32 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
      </div>

      <button
        onClick={() => setup.mutate()}
        disabled={!isValid || setup.isPending}
        className="w-full px-6 py-3 bg-gold text-navy font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50 transition cursor-pointer"
      >
        {setup.isPending ? "Setting up..." : "Complete Setup"}
      </button>

      {setup.isError && (
        <p className="text-red-400 text-sm text-center">Failed to set up carrier profile. Please try again.</p>
      )}
    </div>
  );
}
