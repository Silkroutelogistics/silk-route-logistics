"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search, Building2, Phone, Mail, MapPin, Plus, Star, ChevronDown, ChevronUp,
  X, Users, CreditCard, FileCheck, Briefcase, UserPlus, Trash2, Edit3,
} from "lucide-react";

interface CustomerContact {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
}

interface Customer {
  id: string; name: string; contactName: string | null; email: string | null; phone: string | null;
  address: string | null; city: string | null; state: string | null; zip: string | null;
  status: string; rating: number; notes: string | null; creditLimit: number | null; paymentTerms: string | null;
  type: string | null; creditStatus: string | null; billingAddress: string | null;
  taxId: string | null; annualRevenue: number | null; industryType: string | null;
  mcNumber: string | null; preferredEquipment: string[] | null;
  onboardingStatus: string | null;
  totalShipments?: number; totalRevenue?: number; _count?: { shipments: number };
  contacts?: CustomerContact[];
}

interface CustomerStats { totalCustomers: number; activeCustomers: number; totalRevenue: number; totalShipments: number; }

const STATUS_COLORS: Record<string, string> = {
  Active: "bg-green-500/20 text-green-400",
  Inactive: "bg-slate-500/20 text-slate-400",
  Prospect: "bg-blue-500/20 text-blue-400",
};

const CREDIT_COLORS: Record<string, string> = {
  APPROVED: "bg-green-500/20 text-green-400",
  CONDITIONAL: "bg-yellow-500/20 text-yellow-400",
  DENIED: "bg-red-500/20 text-red-400",
  PENDING_REVIEW: "bg-blue-500/20 text-blue-400",
  NOT_CHECKED: "bg-slate-500/20 text-slate-400",
};

const TYPE_COLORS: Record<string, string> = {
  SHIPPER: "bg-blue-500/20 text-blue-400",
  BROKER: "bg-purple-500/20 text-purple-400",
  MANUFACTURER: "bg-cyan-500/20 text-cyan-400",
  DISTRIBUTOR: "bg-orange-500/20 text-orange-400",
  RETAILER: "bg-pink-500/20 text-pink-400",
  GOVERNMENT: "bg-emerald-500/20 text-emerald-400",
  OTHER: "bg-slate-500/20 text-slate-400",
};

export default function CRMPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showContactModal, setShowContactModal] = useState<string | null>(null);
  const [showCreditModal, setShowCreditModal] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({ name: "", title: "", email: "", phone: "", isPrimary: false });
  const [creditForm, setCreditForm] = useState({ creditStatus: "NOT_CHECKED", creditLimit: "" });
  const [form, setForm] = useState({
    name: "", contactName: "", email: "", phone: "", address: "", city: "", state: "", zip: "",
    status: "Active", creditLimit: "", paymentTerms: "Net 30", notes: "",
    type: "SHIPPER", taxId: "", industryType: "", mcNumber: "", billingAddress: "",
  });

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

  const { data: contacts } = useQuery({
    queryKey: ["customer-contacts", expanded],
    queryFn: () => api.get<CustomerContact[]>(`/customers/${expanded}/contacts`).then((r) => r.data),
    enabled: !!expanded,
  });

  const createCustomer = useMutation({
    mutationFn: () => api.post("/customers", {
      ...form,
      creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      setShowCreate(false);
      setForm({ name: "", contactName: "", email: "", phone: "", address: "", city: "", state: "", zip: "", status: "Active", creditLimit: "", paymentTerms: "Net 30", notes: "", type: "SHIPPER", taxId: "", industryType: "", mcNumber: "", billingAddress: "" });
    },
  });

  const addContact = useMutation({
    mutationFn: (customerId: string) => api.post(`/customers/${customerId}/contacts`, contactForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", expanded] });
      setShowContactModal(null);
      setContactForm({ name: "", title: "", email: "", phone: "", isPrimary: false });
    },
  });

  const deleteContact = useMutation({
    mutationFn: ({ customerId, contactId }: { customerId: string; contactId: string }) =>
      api.delete(`/customers/${customerId}/contacts/${contactId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", expanded] });
    },
  });

  const updateCredit = useMutation({
    mutationFn: (customerId: string) => api.patch(`/customers/${customerId}/credit`, {
      creditStatus: creditForm.creditStatus,
      creditLimit: creditForm.creditLimit ? parseFloat(creditForm.creditLimit) : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowCreditModal(null);
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      setExpanded(null);
    },
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer Relationship Management</h1>
          <p className="text-sm text-slate-400 mt-1">Manage shippers, contacts, credit, and relationships</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard icon={<Building2 className="w-5 h-5" />} label="Total Customers" value={stats?.totalCustomers || 0} />
        <StatCard icon={<FileCheck className="w-5 h-5" />} label="Active" value={stats?.activeCustomers || 0} color="text-green-400" />
        <StatCard icon={<CreditCard className="w-5 h-5" />} label="Total Revenue" value={`$${((stats?.totalRevenue || 0) / 1000).toFixed(0)}K`} />
        <StatCard icon={<Briefcase className="w-5 h-5" />} label="Total Shipments" value={stats?.totalShipments || 0} />
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
        {data?.customers?.map((c) => {
          const isExp = expanded === c.id;
          return (
            <div key={c.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <button onClick={() => setExpanded(isExp ? null : c.id)} className="w-full text-left p-5 hover:bg-white/[0.02] transition">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-gold" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-white">{c.name}</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[c.status] || ""}`}>{c.status}</span>
                        {c.type && <span className={`px-2 py-0.5 rounded text-xs ${TYPE_COLORS[c.type] || ""}`}>{c.type}</span>}
                        {c.creditStatus && c.creditStatus !== "NOT_CHECKED" && (
                          <span className={`px-2 py-0.5 rounded text-xs ${CREDIT_COLORS[c.creditStatus] || ""}`}>
                            Credit: {c.creditStatus.replace("_", " ")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-slate-400 mt-1 flex-wrap">
                        {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>}
                        {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>}
                        {c.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {c.city}, {c.state}</span>}
                        {c.type === "BROKER" && c.mcNumber && <span className="text-slate-500">MC# {c.mcNumber}</span>}
                        {c.industryType && <span className="text-slate-500">{c.industryType}</span>}
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
                    {isExp ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>
              </button>

              {isExp && (
                <div className="border-t border-white/10 p-5 bg-white/[0.02] space-y-4">
                  {/* Customer Details */}
                  <div className="grid sm:grid-cols-4 gap-4 text-sm">
                    <InfoRow label="Primary Contact" value={c.contactName || "—"} />
                    <InfoRow label="Credit Limit" value={c.creditLimit ? `$${c.creditLimit.toLocaleString()}` : "—"} />
                    <InfoRow label="Payment Terms" value={c.paymentTerms || "—"} />
                    <InfoRow label="Tax ID" value={c.taxId || "—"} />
                    <InfoRow label="Customer Type" value={c.type || "—"} />
                    <InfoRow label="Annual Revenue" value={c.annualRevenue ? `$${(c.annualRevenue / 1000).toFixed(0)}K` : "—"} />
                    <InfoRow label="Industry" value={c.industryType || "—"} />
                    {c.type === "BROKER" && <InfoRow label="MC Number" value={c.mcNumber || "—"} />}
                  </div>
                  {c.billingAddress && (
                    <div><span className="text-xs text-slate-500">Billing Address</span><p className="text-sm text-slate-300">{c.billingAddress}</p></div>
                  )}
                  {c.notes && (
                    <div><span className="text-xs text-slate-500">Notes</span><p className="text-sm text-slate-300 mt-1">{c.notes}</p></div>
                  )}

                  {/* Contacts Section */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-white flex items-center gap-1"><Users className="w-4 h-4 text-gold" /> Contacts</h3>
                      <button onClick={() => setShowContactModal(c.id)}
                        className="flex items-center gap-1 text-xs text-gold hover:text-gold/80">
                        <UserPlus className="w-3 h-3" /> Add Contact
                      </button>
                    </div>
                    {contacts && contacts.length > 0 ? (
                      <div className="grid sm:grid-cols-2 gap-2">
                        {contacts.map((ct) => (
                          <div key={ct.id} className="bg-white/5 rounded-lg border border-white/10 p-3 flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm text-white font-medium">{ct.name}</p>
                                {ct.isPrimary && <span className="text-xs px-1.5 py-0.5 rounded bg-gold/20 text-gold">Primary</span>}
                              </div>
                              {ct.title && <p className="text-xs text-slate-500">{ct.title}</p>}
                              <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                                {ct.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {ct.email}</span>}
                                {ct.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {ct.phone}</span>}
                              </div>
                            </div>
                            <button onClick={() => deleteContact.mutate({ customerId: c.id, contactId: ct.id })}
                              className="text-slate-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No contacts added yet</p>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-2">
                    <button onClick={() => {
                      setCreditForm({ creditStatus: c.creditStatus || "NOT_CHECKED", creditLimit: c.creditLimit?.toString() || "" });
                      setShowCreditModal(c.id);
                    }} className="flex items-center gap-1 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20">
                      <CreditCard className="w-3 h-3" /> Update Credit
                    </button>
                    <button onClick={() => { if (confirm("Delete this customer?")) deleteCustomer.mutate(c.id); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs hover:bg-red-500/20">
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {(!data?.customers || data.customers.length === 0) && (
          <div className="text-center py-12 text-slate-500">No customers found</div>
        )}
      </div>

      {/* Create Customer Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Customer</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Company Info</p>
            <div className="grid grid-cols-2 gap-3">
              <FInput label="Company Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
              <div>
                <label className="block text-xs text-slate-400 mb-1">Customer Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                  {["SHIPPER", "BROKER", "MANUFACTURER", "DISTRIBUTOR", "RETAILER", "GOVERNMENT", "OTHER"].map(t =>
                    <option key={t} value={t} className="bg-navy">{t}</option>
                  )}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FInput label="Contact Name" value={form.contactName} onChange={(v) => setForm((f) => ({ ...f, contactName: v }))} />
              <FInput label="Email" value={form.email} onChange={(v) => setForm((f) => ({ ...f, email: v }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <FInput label="Phone" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} />
              {form.type === "BROKER" && (
                <FInput label="MC Number" value={form.mcNumber} onChange={(v) => setForm((f) => ({ ...f, mcNumber: v }))} placeholder="e.g. MC-123456" />
              )}
            </div>

            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider pt-2">Address & Billing</p>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Address</label>
              <AddressAutocomplete
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                onSelect={(addr) => setForm((f) => ({ ...f, address: addr.street, city: addr.city, state: addr.state, zip: addr.zip }))}
                placeholder="Start typing an address..."
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FInput label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
              <FInput label="State" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} placeholder="e.g. MI" />
              <FInput label="Zip" value={form.zip} onChange={(v) => setForm((f) => ({ ...f, zip: v }))} />
            </div>
            <FInput label="Billing Address (if different)" value={form.billingAddress} onChange={(v) => setForm((f) => ({ ...f, billingAddress: v }))} />

            <p className="text-xs text-slate-500 font-medium uppercase tracking-wider pt-2">Financial & Industry</p>
            <div className="grid grid-cols-3 gap-3">
              <FInput label="Credit Limit ($)" value={form.creditLimit} onChange={(v) => setForm((f) => ({ ...f, creditLimit: v }))} type="number" />
              <div>
                <label className="block text-xs text-slate-400 mb-1">Payment Terms</label>
                <select value={form.paymentTerms} onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                  {["Net 15", "Net 30", "Net 45", "Net 60", "COD", "Prepaid"].map(t =>
                    <option key={t} value={t} className="bg-navy">{t}</option>
                  )}
                </select>
              </div>
              <FInput label="Tax ID" value={form.taxId} onChange={(v) => setForm((f) => ({ ...f, taxId: v }))} />
            </div>
            <FInput label="Industry Type" value={form.industryType} onChange={(v) => setForm((f) => ({ ...f, industryType: v }))} placeholder="e.g. Manufacturing, Food & Beverage" />
            <FInput label="Notes" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />

            <button onClick={() => createCustomer.mutate()} disabled={!form.name || createCustomer.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              Add Customer
            </button>
          </div>
        </div>
      )}

      {/* Add Contact Modal */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Add Contact</h2>
              <button onClick={() => setShowContactModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <FInput label="Name *" value={contactForm.name} onChange={(v) => setContactForm((f) => ({ ...f, name: v }))} />
            <FInput label="Title" value={contactForm.title} onChange={(v) => setContactForm((f) => ({ ...f, title: v }))} placeholder="e.g. Shipping Manager" />
            <div className="grid grid-cols-2 gap-3">
              <FInput label="Email" value={contactForm.email} onChange={(v) => setContactForm((f) => ({ ...f, email: v }))} />
              <FInput label="Phone" value={contactForm.phone} onChange={(v) => setContactForm((f) => ({ ...f, phone: v }))} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                className="w-4 h-4 rounded bg-white/5 border-white/10" />
              <span className="text-sm text-slate-300">Primary Contact</span>
            </label>
            <button onClick={() => addContact.mutate(showContactModal)} disabled={!contactForm.name || addContact.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              Add Contact
            </button>
          </div>
        </div>
      )}

      {/* Update Credit Modal */}
      {showCreditModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Update Credit Status</h2>
              <button onClick={() => setShowCreditModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">Credit Status</label>
              <select value={creditForm.creditStatus} onChange={(e) => setCreditForm((f) => ({ ...f, creditStatus: e.target.value }))}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
                {["NOT_CHECKED", "PENDING_REVIEW", "APPROVED", "CONDITIONAL", "DENIED"].map(s =>
                  <option key={s} value={s} className="bg-navy">{s.replace("_", " ")}</option>
                )}
              </select>
            </div>
            <FInput label="Credit Limit ($)" value={creditForm.creditLimit} onChange={(v) => setCreditForm((f) => ({ ...f, creditLimit: v }))} type="number" />
            <button onClick={() => updateCredit.mutate(showCreditModal)} disabled={updateCredit.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              Update Credit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="text-gold">{icon}</div>
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color || "text-white"}`}>{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-slate-500">{label}</span>
      <p className="text-sm text-white">{value}</p>
    </div>
  );
}

function FInput({ label, value, onChange, placeholder, type }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || label.replace(" *", "")}
        type={type || "text"} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
    </div>
  );
}

/* ── Google Places AddressAutocomplete ── */
let mapsPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (mapsPromise) return mapsPromise;
  if (typeof window !== "undefined" && (window as any).google?.maps?.places) return Promise.resolve();
  mapsPromise = new Promise((resolve) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) { resolve(); return; }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return mapsPromise;
}

interface ParsedAddr { street: string; city: string; state: string; zip: string; }

function AddressAutocomplete({ value, onChange, onSelect, placeholder, className }: {
  value: string; onChange: (v: string) => void; onSelect: (a: ParsedAddr) => void;
  placeholder?: string; className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<any>(null); // eslint-disable-line

  const handlePlace = useCallback(() => {
    const place = acRef.current?.getPlace();
    if (!place?.address_components) return;
    const get = (type: string) => place.address_components?.find((c: any) => c.types.includes(type)); // eslint-disable-line
    const num = get("street_number")?.long_name || "";
    const route = get("route")?.long_name || "";
    const street = [num, route].filter(Boolean).join(" ");
    onSelect({
      street: street || (inputRef.current?.value ?? ""),
      city: (get("locality") || get("sublocality_level_1") || get("administrative_area_level_3"))?.long_name || "",
      state: get("administrative_area_level_1")?.short_name || "",
      zip: get("postal_code")?.long_name || "",
    });
  }, [onSelect]);

  useEffect(() => {
    loadGoogleMaps().then(() => {
      if (!inputRef.current || !(window as any).google?.maps?.places || acRef.current) return;
      acRef.current = new (window as any).google.maps.places.Autocomplete(inputRef.current, { // eslint-disable-line
        types: ["address"],
        componentRestrictions: { country: ["us", "ca", "mx"] },
      });
      acRef.current.setFields(["address_components", "formatted_address"]);
      acRef.current.addListener("place_changed", handlePlace);
    });
  }, [handlePlace]);

  return (
    <input ref={inputRef} type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} className={className} autoComplete="off" />
  );
}
