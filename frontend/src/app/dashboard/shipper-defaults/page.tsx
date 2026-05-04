"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings, Save, Search, Users, Truck, DollarSign, Clock,
  Shield, Eye, EyeOff, ToggleLeft, ToggleRight, Hash, Pencil,
  Check, X, ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, { label: string; icon: typeof Settings }> = {
  PALLET_DIMENSIONS: { label: "Pallet & Dimensions", icon: Hash },
  FREIGHT: { label: "Freight Defaults", icon: Truck },
  REEFER: { label: "Reefer Settings", icon: Settings },
  QUOTING: { label: "Quoting Settings", icon: DollarSign },
  PERFORMANCE: { label: "On Time Performance", icon: Clock },
  QUOTING_REQUIREMENTS: { label: "Quoting Requirements", icon: Shield },
  TENDERING: { label: "Tendering", icon: Users },
  CARRIER_CONTROLS: { label: "Carrier Controls", icon: Shield },
  DISPLAY: { label: "Display Settings", icon: Eye },
  QUOTING_RANGES: { label: "Quoting Date Ranges", icon: Clock },
};

export default function ShipperDefaultsPage() {
  const queryClient = useQueryClient();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<any>("");

  const { data: customers } = useQuery({
    queryKey: ["customers-for-defaults"],
    queryFn: () => api.get("/customers", { params: { limit: 200 } }).then((r) => r.data?.customers || r.data?.items || []),
  });

  const { data: schemaData, isLoading } = useQuery({
    queryKey: ["shipper-defaults-schema", selectedCustomerId],
    queryFn: () => api.get(`/shipper-defaults/${selectedCustomerId}/schema`).then((r) => r.data),
    enabled: !!selectedCustomerId,
  });

  const saveMut = useMutation({
    mutationFn: (updates: Record<string, any>) =>
      api.patch(`/shipper-defaults/${selectedCustomerId}`, updates).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shipper-defaults-schema", selectedCustomerId] });
      setEditingField(null);
    },
  });

  const schema = schemaData?.schema || [];
  const defaults = schemaData?.defaults || {};

  // Group by category
  const grouped = schema.reduce((acc: Record<string, any[]>, item: any) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {} as Record<string, any[]>);

  const handleSave = (key: string, value: any) => {
    saveMut.mutate({ [key]: value });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#C5A572]" /> Shipper Defaults
          </h1>
          <p className="text-sm text-gray-400 mt-1">Configure default values and preferences for each shipper</p>
        </div>
      </div>

      {/* Customer Selector */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 mb-6">
        <label className="block text-xs font-medium text-gray-400 mb-2">Select Shipper</label>
        <select
          value={selectedCustomerId}
          onChange={(e) => setSelectedCustomerId(e.target.value)}
          className="w-full max-w-md px-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white focus:border-[#C5A572]/50 focus:outline-none"
        >
          <option value="">Choose a customer...</option>
          {(customers || []).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Defaults Grid */}
      {selectedCustomerId && !isLoading && (
        <div className="space-y-6">
          {Object.entries(grouped).map(([category, fields]) => {
            const cat = CATEGORY_LABELS[category] || { label: category, icon: Settings };
            return (
              <div key={category}>
                <h3 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
                  <cat.icon className="w-4 h-4 text-[#C5A572]" /> {cat.label}
                </h3>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {(fields as any[]).map((field) => {
                    const currentValue = defaults[field.key];
                    const isEditing = editingField === field.key;

                    return (
                      <div key={field.key} className="bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:border-white/10 transition">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-medium text-white">{field.label}</h4>
                          {field.type === "boolean" ? (
                            <button
                              onClick={() => handleSave(field.key, !currentValue)}
                              className="shrink-0"
                            >
                              {currentValue ? (
                                <ToggleRight className="w-6 h-6 text-green-400" />
                              ) : (
                                <ToggleLeft className="w-6 h-6 text-gray-500" />
                              )}
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (isEditing) {
                                  handleSave(field.key, editValue);
                                } else {
                                  setEditingField(field.key);
                                  setEditValue(currentValue || "");
                                }
                              }}
                              className="p-1 rounded hover:bg-white/5 transition"
                            >
                              {isEditing ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Pencil className="w-3.5 h-3.5 text-gray-500" />}
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-500 mb-2">{field.description}</p>
                        {field.type === "boolean" ? (
                          <p className="text-xs text-gray-400">{currentValue ? "Yes" : "No"}</p>
                        ) : isEditing ? (
                          <div className="flex items-center gap-2">
                            <input
                              value={editValue}
                              onChange={(e) => setEditValue(field.type === "number" ? Number(e.target.value) : e.target.value)}
                              type={field.type === "number" ? "number" : "text"}
                              className="flex-1 px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:border-[#C5A572]/50 focus:outline-none"
                              autoFocus
                            />
                            <button onClick={() => setEditingField(null)} className="p-1 hover:bg-white/5 rounded">
                              <X className="w-3 h-3 text-gray-500" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-300">
                            {currentValue !== undefined && currentValue !== null && currentValue !== ""
                              ? String(currentValue)
                              : <span className="text-slate-400 italic">Not set</span>
                            }
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedCustomerId && isLoading && (
        <div className="text-center py-12 text-gray-500">Loading defaults...</div>
      )}
      {!selectedCustomerId && (
        <div className="text-center py-16 text-gray-500">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">Select a shipper to configure their defaults</p>
        </div>
      )}
    </div>
  );
}
