"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import {
  Search, Plus, X, ChevronDown, ChevronUp, Target, Users, DollarSign,
  TrendingUp, Building2, MapPin, Phone, Mail, Crosshair, Map, Route,
} from "lucide-react";

interface Customer {
  id: string; name: string; contactName: string | null; email: string | null; phone: string | null;
  state: string | null; status: string; notes: string | null; creditLimit: number | null;
  paymentTerms: string | null; annualRevenue: number | null; industryType: string | null;
}

interface CustomerStats { totalCustomers: number; activeCustomers: number; totalRevenue: number; totalShipments: number; }
interface RegionStat { region: string; states: string[]; loadCount: number; avgRate: number; avgRatePerMile: number; availableCarriers: number; }
interface Lane { origin: string; dest: string; avgRate: number; avgRatePerMile: number; loadCount: number; avgTransitDays: number; topEquipment: string; trend: string; }

type Tab = "pipeline" | "regions" | "lanes";

const STATUS_COLORS: Record<string, string> = {
  PROSPECT: "bg-blue-500/20 text-blue-400",
  ACTIVE: "bg-green-500/20 text-green-400",
  INACTIVE: "bg-slate-500/20 text-slate-400",
};

const INDUSTRIES = [
  "Manufacturing", "Retail", "Agriculture", "Automotive", "Food & Beverage",
  "Construction", "Chemical", "Pharmaceutical", "E-Commerce", "Other",
];

const EMPTY_FORM = {
  name: "", contactName: "", email: "", phone: "", industryType: "", state: "",
  annualRevenue: "", notes: "", status: "Prospect", type: "SHIPPER", paymentTerms: "Net 30",
};

export default function LeadHunterPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("pipeline");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [laneRegion, setLaneRegion] = useState("");

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter) params.set("status", statusFilter);
  params.set("page", "1");
  params.set("limit", "50");

  const { data: stats } = useQuery({
    queryKey: ["customer-stats"],
    queryFn: () => api.get<CustomerStats>("/customers/stats").then((r) => r.data),
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers", search, statusFilter],
    queryFn: () => api.get<{ customers: Customer[] }>(`/customers?${params}`).then((r) => r.data),
  });

  const { data: regions } = useQuery({
    queryKey: ["market-regions"],
    queryFn: () => api.get<RegionStat[]>("/market/regions").then((r) => r.data),
    enabled: tab === "regions",
  });

  const { data: lanesData } = useQuery({
    queryKey: ["market-lanes", laneRegion],
    queryFn: () => api.get<{ lanes: Lane[] }>(`/market/lanes?region=${laneRegion}`).then((r) => r.data),
    enabled: tab === "lanes",
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/customers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      toast("Prospect created successfully", "success");
      setShowModal(false);
      setForm(EMPTY_FORM);
    },
    onError: () => toast("Failed to create prospect", "error"),
  });

  const convertMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/customers/${id}`, { status: "Active" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      toast("Prospect converted to active customer!", "success");
    },
    onError: () => toast("Failed to convert prospect", "error"),
  });

  const customers = customersData?.customers ?? [];
  const prospects = stats ? stats.totalCustomers - stats.activeCustomers : 0;
  const conversionRate = stats && stats.totalCustomers > 0 ? ((stats.activeCustomers / stats.totalCustomers) * 100).toFixed(1) : "0";

  const handleCreate = () => {
    const payload: Record<string, unknown> = { ...form };
    if (form.annualRevenue) payload.annualRevenue = parseFloat(form.annualRevenue);
    createMutation.mutate(payload);
  };

  const tabs: { key: Tab; label: string; icon: typeof Target }[] = [
    { key: "pipeline", label: "Prospect Pipeline", icon: Crosshair },
    { key: "regions", label: "Regional Intelligence", icon: Map },
    { key: "lanes", label: "Lane Opportunities", icon: Route },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Target className="w-7 h-7 text-gold" /> Lead Hunter
        </h1>
        <p className="text-slate-400 mt-1">Shipper Prospecting &amp; Intelligence</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Prospects", value: prospects, icon: Users, color: "text-blue-400" },
          { label: "Active Customers", value: stats?.activeCustomers ?? 0, icon: Building2, color: "text-green-400" },
          { label: "Revenue Pipeline", value: `$${((stats?.totalRevenue ?? 0) / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-gold" },
          { label: "Conversion Rate", value: `${conversionRate}%`, icon: TrendingUp, color: "text-purple-400" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white/5 border border-white/10 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <span className="text-slate-400 text-sm">{kpi.label}</span>
              <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
            </div>
            <p className="text-2xl font-bold text-white mt-2">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === t.key ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {/* Prospect Pipeline Tab */}
      {tab === "pipeline" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies..."
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold/50" />
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none">
              <option value="" className="bg-[#0F1117] text-white">All Statuses</option>
              <option value="Prospect" className="bg-[#0F1117] text-white">Prospect</option>
              <option value="Active" className="bg-[#0F1117] text-white">Active</option>
              <option value="Inactive" className="bg-[#0F1117] text-white">Inactive</option>
            </select>
            <button onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 font-medium text-sm">
              <Plus className="w-4 h-4" /> Add Prospect
            </button>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">Company</th>
                  <th className="text-left px-4 py-3 font-medium">Contact</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Industry</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">State</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Est. Revenue</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium w-10" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-white/5 hover:bg-white/5 cursor-pointer"
                    onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                    <td className="px-4 py-3 text-white font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-slate-300">{c.contactName ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{c.industryType ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{c.state ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-300 hidden lg:table-cell">
                      {c.annualRevenue ? `$${(c.annualRevenue / 1000).toFixed(0)}K` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] ?? "bg-slate-500/20 text-slate-400"}`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">{expanded === c.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}</td>
                  </tr>
                ))}
                {customers.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No prospects found</td></tr>
                )}
              </tbody>
            </table>
            {expanded && (() => {
              const c = customers.find((x) => x.id === expanded);
              if (!c) return null;
              return (
                <div className="border-t border-white/10 bg-[#0F1117] px-6 py-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <p className="text-slate-400 text-xs uppercase font-semibold">Contact Info</p>
                    {c.email && <p className="text-slate-300 text-sm flex items-center gap-2"><Mail className="w-3.5 h-3.5" />{c.email}</p>}
                    {c.phone && <p className="text-slate-300 text-sm flex items-center gap-2"><Phone className="w-3.5 h-3.5" />{c.phone}</p>}
                    {c.state && <p className="text-slate-300 text-sm flex items-center gap-2"><MapPin className="w-3.5 h-3.5" />{c.state}</p>}
                  </div>
                  <div className="space-y-2">
                    <p className="text-slate-400 text-xs uppercase font-semibold">Details</p>
                    <p className="text-slate-300 text-sm">Credit Limit: {c.creditLimit ? `$${c.creditLimit.toLocaleString()}` : "—"}</p>
                    <p className="text-slate-300 text-sm">Payment Terms: {c.paymentTerms ?? "—"}</p>
                    <p className="text-slate-300 text-sm">Notes: {c.notes ?? "—"}</p>
                  </div>
                  <div className="flex items-end justify-end">
                    {c.status === "Prospect" && (
                      <button onClick={(e) => { e.stopPropagation(); convertMutation.mutate(c.id); }}
                        className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 text-sm font-medium">
                        Convert to Customer
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Regional Intelligence Tab */}
      {tab === "regions" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(regions ?? []).map((r) => (
            <div key={r.region} className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-3">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Map className="w-4 h-4 text-gold" /> {r.region.replace(/_/g, " ")}
              </h3>
              <p className="text-slate-500 text-xs">{r.states.join(", ")}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-gold text-lg font-bold">${r.avgRatePerMile.toFixed(2)}</p>
                  <p className="text-slate-500 text-xs">Avg $/mi</p>
                </div>
                <div>
                  <p className="text-white text-lg font-bold">{r.loadCount}</p>
                  <p className="text-slate-500 text-xs">Loads</p>
                </div>
                <div>
                  <p className="text-blue-400 text-lg font-bold">{r.availableCarriers}</p>
                  <p className="text-slate-500 text-xs">Carriers</p>
                </div>
              </div>
            </div>
          ))}
          {(regions ?? []).length === 0 && (
            <p className="text-slate-500 col-span-full text-center py-12">No regional data available</p>
          )}
        </div>
      )}

      {/* Lane Opportunities Tab */}
      {tab === "lanes" && (
        <div className="space-y-4">
          <select value={laneRegion} onChange={(e) => setLaneRegion(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none">
            <option value="" className="bg-[#0F1117] text-white">All Regions</option>
            {(regions ?? []).map((r) => <option key={r.region} value={r.region} className="bg-[#0F1117] text-white">{r.region.replace(/_/g, " ")}</option>)}
          </select>
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="text-left px-4 py-3 font-medium">Origin</th>
                  <th className="text-left px-4 py-3 font-medium">Destination</th>
                  <th className="text-left px-4 py-3 font-medium">Volume</th>
                  <th className="text-left px-4 py-3 font-medium">Avg Rate</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">$/Mile</th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Equipment</th>
                </tr>
              </thead>
              <tbody>
                {(lanesData?.lanes ?? []).map((l, i) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="px-4 py-3 text-white">{l.origin}</td>
                    <td className="px-4 py-3 text-white">{l.dest}</td>
                    <td className="px-4 py-3 text-slate-300">{l.loadCount} loads</td>
                    <td className="px-4 py-3 text-gold font-medium">${l.avgRate.toFixed(0)}</td>
                    <td className="px-4 py-3 text-slate-300 hidden md:table-cell">${l.avgRatePerMile.toFixed(2)}/mi</td>
                    <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{l.topEquipment}</td>
                  </tr>
                ))}
                {(lanesData?.lanes ?? []).length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No lane data available</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Prospect Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowModal(false)}>
          <div className="bg-[#1e293b] border border-white/10 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">Add Prospect</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {([
                { key: "name", label: "Company Name", span: true },
                { key: "contactName", label: "Contact Name" },
                { key: "email", label: "Email" },
                { key: "phone", label: "Phone" },
                { key: "state", label: "State" },
                { key: "annualRevenue", label: "Est. Annual Revenue ($)" },
              ] as { key: string; label: string; span?: boolean }[]).map((f) => (
                <div key={f.key} className={f.span ? "sm:col-span-2" : ""}>
                  <label className="text-slate-400 text-xs font-medium mb-1 block">{f.label}</label>
                  <input value={form[f.key as keyof typeof form]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold/50 text-sm" />
                </div>
              ))}
              <div>
                <label className="text-slate-400 text-xs font-medium mb-1 block">Industry</label>
                <select value={form.industryType} onChange={(e) => setForm({ ...form, industryType: e.target.value })}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none text-sm">
                  <option value="" className="bg-[#0F1117] text-white">Select...</option>
                  {INDUSTRIES.map((ind) => <option key={ind} value={ind} className="bg-[#0F1117] text-white">{ind}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="text-slate-400 text-xs font-medium mb-1 block">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold/50 text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
              <button onClick={handleCreate} disabled={!form.name || createMutation.isPending}
                className="px-5 py-2 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 font-medium text-sm disabled:opacity-50">
                {createMutation.isPending ? "Creating..." : "Create Prospect"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
