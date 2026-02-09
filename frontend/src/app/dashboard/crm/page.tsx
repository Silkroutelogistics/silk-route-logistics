"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, Building2, Phone, Mail, MapPin, Plus, Star, ChevronDown, ChevronUp, X, TrendingUp } from "lucide-react";

interface Customer {
  id: string; name: string; contactName: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null;
  status: string; rating: number; notes: string | null; creditLimit: number | null; paymentTerms: string | null;
  totalShipments?: number; totalRevenue?: number; _count?: { shipments: number };
}

interface CustomerStats { totalCustomers: number; activeCustomers: number; totalRevenue: number; totalShipments: number; }

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-500/20 text-green-400",
  Inactive: "bg-slate-500/20 text-slate-400",
  Prospect: "bg-blue-500/20 text-blue-400",
};

export default function CRMPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", contactName: "", email: "", phone: "", address: "", city: "", state: "", zip: "", status: "Active", creditLimit: "", paymentTerms: "Net 30", notes: "" });

  const { data: stats } = useQuery({
    queryKey: ["customer-stats"],
    queryFn: () => api.get<CustomerStats>("/customers/stats").then((r) => r.data),
  });

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (statusFilter) params.set("status", statusFilter);

  const { data } = useQuery({
    queryKey: ["customers", search, statusFilter],
    queryFn: () => api.get<{ customers: Customer[]; total: number }>(`/customers?${params.toString()}`).then((r) => r.data),
  });

  const createCustomer = useMutation({
    mutationFn: () => api.post("/customers", { ...form, creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["customers"] }); queryClient.invalidateQueries({ queryKey: ["customer-stats"] }); setShowCreate(false); },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Customer Relationship Management</h1>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard label="Total Customers" value={stats?.totalCustomers || 0} />
        <StatCard label="Active" value={stats?.activeCustomers || 0} color="text-green-400" />
        <StatCard label="Total Revenue" value={`$${((stats?.totalRevenue || 0) / 1000).toFixed(0)}K`} />
        <StatCard label="Total Shipments" value={stats?.totalShipments || 0} />
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customers..."
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {["", "Active", "Prospect", "Inactive"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${statusFilter === s ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Customer List */}
      <div className="space-y-3">
        {data?.customers?.map((c) => (
          <div key={c.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
            <button onClick={() => setExpanded(expanded === c.id ? null : c.id)} className="w-full text-left p-5 hover:bg-white/5 transition">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-gold" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white">{c.name}</p>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status] || ""}`}>{c.status}</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                      {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>}
                      {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>}
                      {c.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.city}, {c.state}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-6 text-right">
                  <div>
                    <p className="text-sm text-white font-medium">${((c.totalRevenue || 0) / 1000).toFixed(0)}K</p>
                    <p className="text-xs text-slate-500">{c.totalShipments || c._count?.shipments || 0} loads</p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < c.rating ? "text-gold fill-gold" : "text-slate-600"}`} />
                    ))}
                  </div>
                  {expanded === c.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </div>
            </button>
            {expanded === c.id && (
              <div className="border-t border-white/10 p-5 bg-white/5 space-y-3">
                <div className="grid sm:grid-cols-3 gap-4 text-sm">
                  <div><span className="text-xs text-slate-500">Contact</span><p className="text-white">{c.contactName || "—"}</p></div>
                  <div><span className="text-xs text-slate-500">Credit Limit</span><p className="text-white">{c.creditLimit ? `$${c.creditLimit.toLocaleString()}` : "—"}</p></div>
                  <div><span className="text-xs text-slate-500">Payment Terms</span><p className="text-white">{c.paymentTerms || "—"}</p></div>
                </div>
                {c.notes && <div><span className="text-xs text-slate-500">Notes</span><p className="text-sm text-slate-300 mt-1">{c.notes}</p></div>}
              </div>
            )}
          </div>
        ))}
        {(!data?.customers || data.customers.length === 0) && (
          <div className="text-center py-12 text-slate-500">No customers found</div>
        )}
      </div>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Customer</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Company Name *"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            <div className="grid grid-cols-2 gap-3">
              <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} placeholder="Contact Name"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="Email"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="Phone"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={form.creditLimit} onChange={(e) => setForm((f) => ({ ...f, creditLimit: e.target.value }))} placeholder="Credit Limit ($)" type="number"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            </div>
            <input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="Address"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            <div className="grid grid-cols-3 gap-3">
              <input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} placeholder="City"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} placeholder="State" maxLength={2}
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
              <input value={form.zip} onChange={(e) => setForm((f) => ({ ...f, zip: e.target.value }))} placeholder="Zip"
                className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white" />
            </div>
            <button onClick={() => createCustomer.mutate()} disabled={!form.name || createCustomer.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              Add Customer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5">
      <p className="text-sm text-slate-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || "text-white"}`}>{value}</p>
    </div>
  );
}
