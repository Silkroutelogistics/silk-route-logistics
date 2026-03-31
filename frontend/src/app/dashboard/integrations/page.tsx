"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import {
  Plug, CheckCircle2, XCircle, RefreshCw, Search, Truck, DollarSign,
  Globe, Shield, AlertTriangle, ExternalLink, Zap,
} from "lucide-react";

interface IntegrationStatus {
  provider: string;
  name: string;
  configured: boolean;
  category: "compliance" | "brokerage" | "tracking";
  lastSync?: string;
  description: string;
}

const PROVIDER_META: Record<string, { name: string; category: "compliance" | "brokerage" | "tracking"; description: string; icon: any }> = {
  fmcsa: { name: "FMCSA SAFER System", category: "compliance", description: "Authority, safety ratings, insurance status, CSA BASICs", icon: Shield },
  ofac: { name: "OFAC SDN Screening", category: "compliance", description: "Sanctions list screening for carriers and contacts", icon: Shield },
  nhtsa: { name: "NHTSA VIN Decoder", category: "compliance", description: "Fleet vehicle verification via VIN", icon: Truck },
  carrier_ok: { name: "CarrierOk", category: "compliance", description: "300+ field carrier intelligence, A-F scoring", icon: Search },
  dat: { name: "DAT Freight & Analytics", category: "brokerage", description: "Load board, rate data, carrier search", icon: Globe },
  truckstop: { name: "Truckstop / RMIS", category: "brokerage", description: "Load board, carrier monitoring, COI tracking", icon: Globe },
  ch_robinson: { name: "CH Robinson (Navisphere)", category: "brokerage", description: "Load posting, capacity, rate quotes", icon: Globe },
  echo: { name: "Echo Global Logistics", category: "brokerage", description: "Capacity, pricing, shipment management", icon: Globe },
  uber_freight: { name: "Uber Freight", category: "brokerage", description: "Load matching, rate quotes, tracking", icon: Globe },
  project44: { name: "project44", category: "tracking", description: "Multi-carrier real-time visibility", icon: Zap },
  samsara: { name: "Samsara ELD", category: "tracking", description: "GPS tracking, HOS, driver safety", icon: Truck },
  motive: { name: "Motive (KeepTruckin)", category: "tracking", description: "ELD tracking, DVIR, fleet management", icon: Truck },
};

export default function IntegrationsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lookupDot, setLookupDot] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);

  const { data: status, isLoading } = useQuery({
    queryKey: ["integration-status"],
    queryFn: () => api.get("/external-integrations/status").then((r) => r.data),
  });

  const bulkMonitor = useMutation({
    mutationFn: () => api.post("/external-integrations/fmcsa/bulk-monitor"),
    onSuccess: (res) => {
      toast(`FMCSA monitor complete: ${res.data?.checked || 0} carriers checked, ${res.data?.changes || 0} changes found`, "success");
      queryClient.invalidateQueries({ queryKey: ["integration-status"] });
    },
    onError: () => toast("FMCSA monitoring failed", "error"),
  });

  const carrierLookup = useMutation({
    mutationFn: (dot: string) => api.get(`/external-integrations/carrier-lookup/${dot}`).then((r) => r.data),
    onSuccess: (data) => setLookupResult(data),
    onError: () => toast("Carrier lookup failed", "error"),
  });

  // Build integration list from status + known providers
  const integrations: IntegrationStatus[] = Object.entries(PROVIDER_META).map(([key, meta]) => ({
    provider: key,
    name: meta.name,
    category: meta.category,
    configured: ["fmcsa", "ofac", "nhtsa"].includes(key) ? true : (status?.configured || []).includes(key),
    lastSync: status?.lastSync?.[key],
    description: meta.description,
  }));

  const freeApis = integrations.filter((i) => ["fmcsa", "ofac", "nhtsa"].includes(i.provider));
  const complianceApis = integrations.filter((i) => i.category === "compliance" && !["fmcsa", "ofac", "nhtsa"].includes(i.provider));
  const brokerageApis = integrations.filter((i) => i.category === "brokerage");
  const trackingApis = integrations.filter((i) => i.category === "tracking");

  const IntegrationCard = ({ item }: { item: IntegrationStatus }) => {
    const meta = PROVIDER_META[item.provider];
    const Icon = meta?.icon || Globe;
    return (
      <div className="bg-white/5 rounded-xl border border-white/10 p-5 flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${item.configured ? "bg-green-500/10" : "bg-white/5"}`}>
          <Icon className={`w-5 h-5 ${item.configured ? "text-green-400" : "text-slate-500"}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-white">{item.name}</h3>
            {item.configured ? (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-green-500/10 text-green-400 rounded-full text-[10px] font-medium">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2 py-0.5 bg-white/5 text-slate-500 rounded-full text-[10px] font-medium">
                <XCircle className="w-3 h-3" /> Not Configured
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400">{item.description}</p>
          {item.lastSync && <p className="text-[10px] text-slate-500 mt-1">Last sync: {new Date(item.lastSync).toLocaleString()}</p>}
          {!item.configured && !["fmcsa", "ofac", "nhtsa"].includes(item.provider) && (
            <p className="text-[10px] text-slate-500 mt-1">Add API key in environment variables to enable</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Plug className="w-6 h-6 text-gold" /> External Integrations
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {integrations.filter((i) => i.configured).length} of {integrations.length} integrations active
          </p>
        </div>
        <button onClick={() => bulkMonitor.mutate()} disabled={bulkMonitor.isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${bulkMonitor.isPending ? "animate-spin" : ""}`} />
          {bulkMonitor.isPending ? "Monitoring..." : "Run FMCSA Monitor"}
        </button>
      </div>

      {/* Quick Carrier Lookup */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Search className="w-4 h-4 text-gold" /> Quick Carrier Lookup
        </h2>
        <div className="flex gap-3">
          <input value={lookupDot} onChange={(e) => setLookupDot(e.target.value.replace(/\D/g, ""))}
            placeholder="Enter DOT number" className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          <button onClick={() => lookupDot && carrierLookup.mutate(lookupDot)} disabled={!lookupDot || carrierLookup.isPending}
            className="px-6 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm disabled:opacity-50">
            {carrierLookup.isPending ? "Looking up..." : "Lookup"}
          </button>
        </div>
        {lookupResult && (
          <div className="mt-4 p-4 bg-white/5 rounded-lg text-sm">
            <div className="grid grid-cols-2 gap-3">
              {lookupResult.fmcsa && (
                <>
                  <div><span className="text-slate-500 text-xs">Legal Name</span><p className="text-white font-medium">{lookupResult.fmcsa.legalName || "—"}</p></div>
                  <div><span className="text-slate-500 text-xs">Operating Status</span><p className={`font-medium ${lookupResult.fmcsa.operatingStatus === "AUTHORIZED" ? "text-green-400" : "text-red-400"}`}>{lookupResult.fmcsa.operatingStatus || "—"}</p></div>
                  <div><span className="text-slate-500 text-xs">Safety Rating</span><p className="text-white">{lookupResult.fmcsa.safetyRating || "Not Rated"}</p></div>
                  <div><span className="text-slate-500 text-xs">Power Units</span><p className="text-white">{lookupResult.fmcsa.totalPowerUnits || "—"}</p></div>
                  <div><span className="text-slate-500 text-xs">Insurance on File</span><p className={lookupResult.fmcsa.insuranceOnFile ? "text-green-400" : "text-red-400"}>{lookupResult.fmcsa.insuranceOnFile ? "Yes" : "No"}</p></div>
                  <div><span className="text-slate-500 text-xs">Entity Type</span><p className="text-white">{lookupResult.fmcsa.entityType || "—"}</p></div>
                </>
              )}
              {lookupResult.carrierOk && (
                <div className="col-span-2 pt-2 mt-2 border-t border-white/10">
                  <span className="text-xs text-gold font-medium">CarrierOk Score: {lookupResult.carrierOk.grade || "—"}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Free Government APIs */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-green-400" /> Government APIs (Free — Always Active)
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {freeApis.map((i) => <IntegrationCard key={i.provider} item={i} />)}
        </div>
      </div>

      {/* Compliance Integrations */}
      {complianceApis.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Search className="w-4 h-4 text-blue-400" /> Compliance Intelligence
          </h2>
          <div className="grid md:grid-cols-2 gap-4">
            {complianceApis.map((i) => <IntegrationCard key={i.provider} item={i} />)}
          </div>
        </div>
      )}

      {/* Brokerage APIs */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Globe className="w-4 h-4 text-purple-400" /> Brokerage Partnerships
        </h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {brokerageApis.map((i) => <IntegrationCard key={i.provider} item={i} />)}
        </div>
      </div>

      {/* Tracking Integrations */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
          <Zap className="w-4 h-4 text-yellow-400" /> Tracking & Visibility
        </h2>
        <div className="grid md:grid-cols-3 gap-4">
          {trackingApis.map((i) => <IntegrationCard key={i.provider} item={i} />)}
        </div>
      </div>
    </div>
  );
}
