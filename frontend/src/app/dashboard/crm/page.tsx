"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import {
  Search, Building2, Phone, Mail, MapPin, Plus, Star, ChevronDown, ChevronUp,
  X, Users, CreditCard, FileCheck, Briefcase, UserPlus, Trash2, Pencil,
  ShieldCheck, Loader2, ExternalLink, Package, Upload, Download, PhoneCall,
  MessageSquare, Calendar, StickyNote, Send, CheckCircle2, Eye,
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
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [creditForm, setCreditForm] = useState({ creditStatus: "NOT_CHECKED", creditLimit: "" });
  const [createContacts, setCreateContacts] = useState<{ name: string; title: string; email: string; phone: string; isPrimary: boolean }[]>([]);
  const [createContactForm, setCreateContactForm] = useState({ name: "", title: "", email: "", phone: "" });
  const [secCredit, setSecCredit] = useState<Record<string, any>>({});
  const [secLoading, setSecLoading] = useState<string | null>(null);
  const [showUnit, setShowUnit] = useState(false);
  const [sameAsBilling, setSameAsBilling] = useState(true);
  const [form, setForm] = useState({
    name: "", contactName: "", email: "", phone: "", address: "", city: "", state: "", zip: "", unit: "",
    status: "Active", creditLimit: "", paymentTerms: "Net 30", notes: "",
    type: "SHIPPER", taxId: "", industryType: "", mcNumber: "", billingAddress: "",
  });

  // CSV Import state
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvProgress, setCsvProgress] = useState({ current: 0, total: 0 });
  const [csvResult, setCsvResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Call Log state
  interface CallLog { date: string; type: string; notes: string; by: string; }
  const [callLogs, setCallLogs] = useState<Record<string, CallLog[]>>({});
  const [showLogForm, setShowLogForm] = useState<string | null>(null);
  const [logForm, setLogForm] = useState({ type: "Call", notes: "" });

  // Mass Email Campaign state
  type TemplateType = "INTRO" | "FOLLOW_UP" | "RATE_SHEET" | "CUSTOM";
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<TemplateType>("INTRO");
  const [emailSubject, setEmailSubject] = useState("Introducing Silk Route Logistics — Your Freight Partner");
  const [emailBody, setEmailBody] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [selectAllRecipients, setSelectAllRecipients] = useState(true);
  const [emailSending, setEmailSending] = useState(false);
  const [emailProgress, setEmailProgress] = useState({ current: 0, total: 0 });
  const [emailResult, setEmailResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);
  const [emailToast, setEmailToast] = useState<string | null>(null);

  const EMAIL_TEMPLATES: Record<TemplateType, { label: string; subject: string; preview: (name: string) => string }> = {
    INTRO: {
      label: "Company Introduction",
      subject: "Introducing Silk Route Logistics — Your Freight Partner",
      preview: (name: string) => `<h2 style="color:#C9A84C;margin:0 0 16px">Silk Route Logistics Inc.</h2>
<p>Hi ${name},</p>
<p>I'm reaching out from Silk Route Logistics — a technology-driven freight brokerage based in Kalamazoo, MI.</p>
<p>We specialize in FTL dry van freight across the Midwest and nationwide, with a focus on:</p>
<ul><li>Real-time shipment tracking via our shipper portal</li><li>Competitive rates backed by AI-powered market intelligence</li><li>35-point carrier compliance vetting (Compass Engine)</li><li>Dedicated account management — not a call center</li></ul>
<p>I'd love the opportunity to learn about your shipping needs and see if we can add value. Would you be open to a brief call this week?</p>
<p>Best regards,<br/><strong>Wasi Haider</strong><br/>CEO, Silk Route Logistics Inc.<br/>MC# 01794414 | DOT# 4526880<br/>(269) 220-6760 | whaider@silkroutelogistics.ai<br/>silkroutelogistics.ai</p>`,
    },
    FOLLOW_UP: {
      label: "Follow-Up",
      subject: "Following Up — Silk Route Logistics",
      preview: (name: string) => `<p>Hi ${name},</p>
<p>I wanted to follow up on my previous email about Silk Route Logistics. We recently helped manufacturing companies reduce their freight costs by 8-12% while improving on-time delivery rates.</p>
<p>If you're currently evaluating freight providers or have any upcoming shipping needs, I'd be happy to provide a no-obligation rate comparison on your top lanes.</p>
<p>Just reply to this email or book a call at your convenience.</p>
<p>Best regards,<br/><strong>Wasi Haider</strong><br/>CEO, Silk Route Logistics Inc.<br/>(269) 220-6760 | whaider@silkroutelogistics.ai</p>`,
    },
    RATE_SHEET: {
      label: "Rate Sheet",
      subject: "Silk Route Logistics — Rate Information",
      preview: (name: string) => `<p>Hi ${name},</p>
<p>Thank you for your interest in Silk Route Logistics. Attached is our current rate information for the lanes most relevant to your operation.</p>
<p>Key highlights:</p>
<ul><li>FTL Dry Van rates from $2.15/mile (Midwest lanes)</li><li>No hidden fees — all-in rates published monthly</li><li>Quick Pay available for carriers (Net-7 to same-day)</li><li>Free real-time tracking portal for all shipments</li></ul>
<p>Let me know if you'd like a custom quote on specific lanes.</p>
<p>Best regards,<br/><strong>Wasi Haider</strong><br/>CEO, Silk Route Logistics Inc.<br/>(269) 220-6760 | whaider@silkroutelogistics.ai</p>`,
    },
    CUSTOM: {
      label: "Custom",
      subject: "Message from Silk Route Logistics",
      preview: () => "",
    },
  };

  const handleTemplateChange = useCallback((t: TemplateType) => {
    setEmailTemplate(t);
    setEmailSubject(EMAIL_TEMPLATES[t].subject);
    if (t !== "CUSTOM") setEmailBody("");
  }, []);

  const handleToggleRecipient = useCallback((id: string) => {
    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Load call logs from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("srl-call-logs");
      if (saved) setCallLogs(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const saveCallLog = (customerId: string) => {
    if (!logForm.notes.trim()) return;
    const newLog: CallLog = {
      date: new Date().toISOString(),
      type: logForm.type,
      notes: logForm.notes.trim(),
      by: "WH",
    };
    const updated = {
      ...callLogs,
      [customerId]: [newLog, ...(callLogs[customerId] || [])],
    };
    setCallLogs(updated);
    localStorage.setItem("srl-call-logs", JSON.stringify(updated));
    setLogForm({ type: "Call", notes: "" });
    setShowLogForm(null);
  };

  // CSV parsing
  const handleCsvFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return;
      const headers = lines[0].split(",").map((h) => h.trim());
      const rows: Record<string, string>[] = [];
      for (let i = 1; i < lines.length; i++) {
        // Handle CSV values that might contain commas inside quotes
        const vals: string[] = [];
        let current = "";
        let inQuotes = false;
        for (const ch of lines[i]) {
          if (ch === '"') { inQuotes = !inQuotes; }
          else if (ch === "," && !inQuotes) { vals.push(current.trim()); current = ""; }
          else { current += ch; }
        }
        vals.push(current.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
        if (Object.values(row).some((v) => v)) rows.push(row);
      }
      setCsvRows(rows);
      setShowCsvPreview(true);
      setCsvResult(null);
    };
    reader.readAsText(file);
  };

  const mapCsvRow = (row: Record<string, string>) => ({
    name: row["Company Name"] || row["company_name"] || row["Name"] || "",
    contactName: row["Contact Name"] || row["contact_name"] || row["Contact"] || "",
    email: row["Email"] || row["email"] || "",
    phone: row["Phone"] || row["phone"] || "",
    city: row["City"] || row["city"] || "",
    state: row["State"] || row["state"] || "",
    industryType: row["Industry"] || row["industry"] || row["IndustryType"] || "",
    type: row["Type"] || row["type"] || "SHIPPER",
  });

  const handleCsvImport = async () => {
    setCsvImporting(true);
    const mapped = csvRows.map(mapCsvRow).filter((r) => r.name);
    setCsvProgress({ current: 0, total: mapped.length });

    try {
      // Use bulk endpoint
      const res = await api.post("/customers/bulk", { customers: mapped });
      setCsvResult(res.data);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
    } catch (err: any) {
      setCsvResult({ created: 0, skipped: 0, errors: [err?.response?.data?.error || "Import failed"] });
    } finally {
      setCsvImporting(false);
    }
  };

  // CSV Export
  const handleCsvExport = () => {
    if (!data?.customers) return;
    const headers = ["Name", "Contact", "Email", "Phone", "City", "State", "Type", "Industry", "Credit Limit", "Payment Terms", "Status", "Created Date"];
    const escCsv = (v: string) => v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v;
    const rows = data.customers.map((c) => [
      c.name, c.contactName || "", c.email || "", c.phone || "",
      c.city || "", c.state || "", c.type || "", c.industryType || "",
      c.creditLimit?.toString() || "", c.paymentTerms || "", c.status,
      "",
    ].map(escCsv).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const date = new Date().toISOString().split("T")[0];
    a.download = `srl-customers-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const openEmailModal = useCallback(() => {
    const allCustomers = data?.customers || [];
    const withEmail = allCustomers.filter((c) => c.email);
    setSelectedRecipients(new Set(withEmail.map((c) => c.id)));
    setSelectAllRecipients(true);
    setEmailTemplate("INTRO");
    setEmailSubject(EMAIL_TEMPLATES.INTRO.subject);
    setEmailBody("");
    setEmailResult(null);
    setEmailSending(false);
    setShowEmailModal(true);
  }, [data?.customers]);

  const handleToggleAllRecipients = useCallback((checked: boolean) => {
    setSelectAllRecipients(checked);
    if (checked) {
      const withEmail = (data?.customers || []).filter((c) => c.email);
      setSelectedRecipients(new Set(withEmail.map((c) => c.id)));
    } else {
      setSelectedRecipients(new Set());
    }
  }, [data?.customers]);

  const handleSendCampaign = async () => {
    const ids = Array.from(selectedRecipients);
    if (ids.length === 0) return;
    setEmailSending(true);
    setEmailProgress({ current: 0, total: ids.length });

    try {
      const progressInterval = setInterval(() => {
        setEmailProgress((p) => ({ ...p, current: Math.min(p.current + 1, p.total - 1) }));
      }, 600);

      const res = await api.post<{ sent: number; failed: number; skipped: number }>("/customers/mass-email", {
        customerIds: ids,
        subject: emailSubject,
        body: emailTemplate === "CUSTOM" ? emailBody : undefined,
        templateType: emailTemplate,
      });

      clearInterval(progressInterval);
      setEmailProgress({ current: ids.length, total: ids.length });
      setEmailResult(res.data);
      setEmailToast(`Sent to ${res.data.sent} recipient${res.data.sent !== 1 ? "s" : ""}`);
      setTimeout(() => setEmailToast(null), 4000);
    } catch {
      setEmailResult({ sent: 0, failed: ids.length, skipped: 0 });
    } finally {
      setEmailSending(false);
    }
  };

  const { data: contacts } = useQuery({
    queryKey: ["customer-contacts", expanded],
    queryFn: () => api.get<CustomerContact[]>(`/customers/${expanded}/contacts`).then((r) => r.data),
    enabled: !!expanded,
  });

  const createCustomer = useMutation({
    mutationFn: () => api.post("/customers", {
      ...form,
      creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
      billingAddress: sameAsBilling
        ? [form.address, form.unit, form.city, form.state, form.zip].filter(Boolean).join(", ")
        : form.billingAddress,
      contacts: createContacts.length > 0 ? createContacts : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      setShowCreate(false);
      setShowUnit(false);
      setSameAsBilling(true);
      setCreateContacts([]);
      setCreateContactForm({ name: "", title: "", email: "", phone: "" });
      setForm({ name: "", contactName: "", email: "", phone: "", address: "", city: "", state: "", zip: "", unit: "", status: "Active", creditLimit: "", paymentTerms: "Net 30", notes: "", type: "SHIPPER", taxId: "", industryType: "", mcNumber: "", billingAddress: "" });
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

  const editContact = useMutation({
    mutationFn: ({ customerId, contactId }: { customerId: string; contactId: string }) =>
      api.patch(`/customers/${customerId}/contacts/${contactId}`, contactForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", expanded] });
      setShowContactModal(null);
      setEditingContactId(null);
      setContactForm({ name: "", title: "", email: "", phone: "", isPrimary: false });
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
    onError: (err: any) => {
      const msg = err?.response?.data?.error || "Failed to delete customer";
      alert(msg === "Insufficient permissions" ? "You don't have permission to delete customers." : msg);
    },
  });

  const handleSecCreditCheck = async (customerId: string, customerName: string) => {
    setSecLoading(customerId);
    try {
      const res = await api.get(`/external-integrations/credit-check/${encodeURIComponent(customerName)}`);
      setSecCredit((prev) => ({ ...prev, [customerId]: res.data }));
    } catch {
      setSecCredit((prev) => ({ ...prev, [customerId]: { error: true } }));
    } finally {
      setSecLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customer Relationship Management</h1>
          <p className="text-sm text-slate-400 mt-1">Manage shippers, contacts, credit, and relationships</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={openEmailModal} className="flex items-center gap-1.5 px-3 py-2 border border-gold text-gold font-medium rounded-lg text-xs hover:bg-gold/10">
            <Send className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Send</span> Email
          </button>
          <button onClick={handleCsvExport} className="flex items-center gap-1.5 px-3 py-2 border border-gold text-gold font-medium rounded-lg text-xs hover:bg-gold/10">
            <Download className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Export</span>
          </button>
          <button onClick={() => csvInputRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 border border-gold text-gold font-medium rounded-lg text-xs hover:bg-gold/10">
            <Upload className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Import</span>
          </button>
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleCsvFile(file);
            e.target.value = "";
          }} />
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>
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
              <button onClick={() => setExpanded(isExp ? null : c.id)} className="w-full text-left p-5 transition" style={{ background: isExp ? 'var(--srl-bg-elevated)' : 'transparent' }}>
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
                <div className="border-t p-5 space-y-4" style={{ borderColor: 'var(--srl-border-subtle)', background: 'var(--srl-bg-surface)' }}>
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
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={() => {
                                setEditingContactId(ct.id);
                                setContactForm({ name: ct.name, title: ct.title || "", email: ct.email || "", phone: ct.phone || "", isPrimary: ct.isPrimary });
                                setShowContactModal(c.id);
                              }} className="text-slate-500 hover:text-gold p-1"><Pencil className="w-3 h-3" /></button>
                              <button onClick={() => deleteContact.mutate({ customerId: c.id, contactId: ct.id })}
                                className="text-slate-500 hover:text-red-400 p-1"><Trash2 className="w-3 h-3" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : c.contactName ? (
                      <div className="grid sm:grid-cols-2 gap-2">
                        <div className="bg-white/5 rounded-lg border border-white/10 p-3">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-white font-medium">{c.contactName}</p>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-gold/20 text-gold">Primary</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                            {c.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {c.email}</span>}
                            {c.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {c.phone}</span>}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No contacts added yet</p>
                    )}
                  </div>

                  {/* Activity Log */}
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-medium text-white flex items-center gap-1"><MessageSquare className="w-4 h-4 text-gold" /> Activity Log</h3>
                      <button onClick={() => setShowLogForm(showLogForm === c.id ? null : c.id)}
                        className="flex items-center gap-1 text-xs text-gold hover:text-gold/80">
                        <Plus className="w-3 h-3" /> Log Activity
                      </button>
                    </div>

                    {showLogForm === c.id && (
                      <div className="bg-white/5 rounded-lg border border-white/10 p-3 mb-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <select value={logForm.type} onChange={(e) => setLogForm((f) => ({ ...f, type: e.target.value }))}
                            className="px-2.5 py-1.5 bg-white/10 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-gold/50">
                            {["Call", "Email", "Meeting", "Note"].map((t) => <option key={t} value={t} className="bg-[#0f172a]">{t}</option>)}
                          </select>
                        </div>
                        <textarea value={logForm.notes} onChange={(e) => setLogForm((f) => ({ ...f, notes: e.target.value }))}
                          rows={2} placeholder="Notes about this activity..."
                          className="w-full px-3 py-2 bg-white/10 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-gold/50 resize-none" />
                        <div className="flex gap-2">
                          <button onClick={() => saveCallLog(c.id)} disabled={!logForm.notes.trim()}
                            className="px-3 py-1.5 bg-gold text-navy rounded text-xs font-medium hover:bg-gold/90 disabled:opacity-50">Save</button>
                          <button onClick={() => { setShowLogForm(null); setLogForm({ type: "Call", notes: "" }); }}
                            className="px-3 py-1.5 text-slate-400 hover:text-white text-xs">Cancel</button>
                        </div>
                      </div>
                    )}

                    {(callLogs[c.id] && callLogs[c.id].length > 0) ? (
                      <div className="space-y-2">
                        {callLogs[c.id].slice(0, 10).map((log, idx) => {
                          const icons: Record<string, React.ReactNode> = {
                            Call: <PhoneCall className="w-3.5 h-3.5 text-blue-400" />,
                            Email: <Mail className="w-3.5 h-3.5 text-green-400" />,
                            Meeting: <Calendar className="w-3.5 h-3.5 text-purple-400" />,
                            Note: <StickyNote className="w-3.5 h-3.5 text-yellow-400" />,
                          };
                          const d = new Date(log.date);
                          const dateStr = `${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}/${d.getFullYear()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
                          return (
                            <div key={idx} className="flex items-start gap-2 text-sm">
                              <div className="mt-0.5">{icons[log.type] || icons.Note}</div>
                              <div className="min-w-0">
                                <span className="text-xs text-slate-500">{dateStr}</span>
                                <span className="text-slate-400 mx-1.5">&mdash;</span>
                                <span className="text-slate-300">{log.notes}</span>
                                <span className="text-xs text-slate-600 ml-2">&mdash; {log.by}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">No activity logged yet</p>
                    )}
                  </div>

                  {/* SEC EDGAR Credit Check Result */}
                  {secCredit[c.id] && !secCredit[c.id].error && (
                    <div className="bg-white/5 rounded-lg border border-white/10 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-medium text-white flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-gold" /> SEC EDGAR Credit Report
                        </h3>
                        {(() => {
                          const r = secCredit[c.id].riskAssessment as string;
                          const colors: Record<string, string> = { LOW: "bg-green-500/20 text-green-400", MEDIUM: "bg-yellow-500/20 text-yellow-400", HIGH: "bg-red-500/20 text-red-400", UNKNOWN: "bg-slate-500/20 text-slate-400" };
                          return <span className={`px-2 py-0.5 rounded text-xs font-medium ${colors[r] || colors.UNKNOWN}`}>{r} RISK</span>;
                        })()}
                      </div>
                      {secCredit[c.id].found ? (
                        <>
                          <div className="flex items-center gap-3 text-sm">
                            <span className="text-white font-medium">{secCredit[c.id].companyName}</span>
                            {secCredit[c.id].ticker && <span className="text-gold font-mono text-xs bg-gold/10 px-1.5 py-0.5 rounded">{secCredit[c.id].ticker}</span>}
                            {secCredit[c.id].sicDescription && <span className="text-slate-400 text-xs">{secCredit[c.id].sicDescription}</span>}
                          </div>
                          {secCredit[c.id].financials ? (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <SecMetric label="Revenue" value={secCredit[c.id].financials.revenue} />
                              <SecMetric label="Net Income" value={secCredit[c.id].financials.netIncome} />
                              <SecMetric label="Total Assets" value={secCredit[c.id].financials.totalAssets} />
                              <SecMetric label="Debt/Equity" value={secCredit[c.id].financials.debtToEquityRatio} isCurrency={false} />
                            </div>
                          ) : (
                            <p className="text-xs text-slate-400">No XBRL financial data available for this company.</p>
                          )}
                          {secCredit[c.id].latestAnnualFiling && (
                            <p className="text-xs text-slate-500">Latest 10-K filed: {secCredit[c.id].latestAnnualFiling}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-slate-400">No public filings found &mdash; company may be private.</p>
                      )}
                    </div>
                  )}
                  {secCredit[c.id]?.error && (
                    <div className="bg-red-500/5 rounded-lg border border-red-500/10 p-3">
                      <p className="text-xs text-red-400">SEC EDGAR lookup failed. Please try again later.</p>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-2">
                    {c.status === "Active" && (
                      <a
                        href={`/dashboard/orders?customerId=${c.id}&customerName=${encodeURIComponent(c.name)}`}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#C9A84C] text-[#0F1117] rounded-lg text-xs hover:bg-[#C9A84C]/90 no-underline font-medium"
                      >
                        <Package className="w-3 h-3" /> Create Load
                      </a>
                    )}
                    <button onClick={() => {
                      setCreditForm({ creditStatus: c.creditStatus || "NOT_CHECKED", creditLimit: c.creditLimit?.toString() || "" });
                      setShowCreditModal(c.id);
                    }} className="flex items-center gap-1 px-3 py-1.5 border border-[#C9A84C] text-[#C9A84C] rounded-lg text-xs hover:bg-[#C9A84C]/10">
                      <CreditCard className="w-3 h-3" /> Update Credit
                    </button>
                    <button
                      onClick={() => handleSecCreditCheck(c.id, c.name)}
                      disabled={secLoading === c.id}
                      className="flex items-center gap-1 px-3 py-1.5 border border-slate-600 text-slate-300 rounded-lg text-xs hover:bg-white/10 disabled:opacity-50"
                    >
                      {secLoading === c.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                      {secLoading === c.id ? "Checking..." : "Check Credit (SEC)"}
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users className="w-12 h-12 text-slate-300 mb-4" />
            <h3 className="text-lg font-semibold text-white mb-1">No customers yet</h3>
            <p className="text-sm text-slate-400 mb-4 max-w-sm">Add your first customer to start building your CRM</p>
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-gold text-navy rounded-lg text-sm font-medium">Add Customer</button>
          </div>
        )}
      </div>

      {/* Create Customer Drawer */}
      <SlideDrawer open={showCreate} onClose={() => setShowCreate(false)} title="Add Customer">
            <div className="space-y-4">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">Company Info</p>
            <div className="grid grid-cols-2 gap-3">
              <FInput label="Company Name *" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
              <div>
                <label className="block text-xs text-slate-400 mb-1">Customer Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-amber-500/50">
                  {["SHIPPER", "BROKER", "MANUFACTURER", "DISTRIBUTOR", "RETAILER", "GOVERNMENT", "OTHER"].map(t =>
                    <option key={t} value={t}>{t}</option>
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

            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider pt-2">Address & Billing</p>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Address</label>
              <AddressAutocomplete
                value={form.address}
                onChange={(v) => setForm((f) => ({ ...f, address: v }))}
                onSelect={(addr) => {
                  setForm((f) => ({ ...f, address: addr.street, city: addr.city, state: addr.state, zip: addr.zip, unit: addr.unit || f.unit }));
                  if (addr.unit) setShowUnit(true);
                }}
                placeholder="Start typing an address..."
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-amber-500/50"
              />
              {(showUnit || form.unit) ? (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Unit / Suite #</label>
                  <input
                    value={form.unit}
                    onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))}
                    placeholder="e.g. Suite 200, Unit 4B, Apt 12"
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
                  />
                </div>
              ) : (
                <button type="button" onClick={() => setShowUnit(true)}
                  className="mt-1.5 text-xs text-amber-600 hover:text-amber-500 font-medium">
                  + Add Unit / Suite #
                </button>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <FInput label="City" value={form.city} onChange={(v) => setForm((f) => ({ ...f, city: v }))} />
              <FInput label="State" value={form.state} onChange={(v) => setForm((f) => ({ ...f, state: v }))} placeholder="e.g. MI" />
              <FInput label="Zip" value={form.zip} onChange={(v) => setForm((f) => ({ ...f, zip: v }))} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-1">
              <input type="checkbox" checked={sameAsBilling}
                onChange={(e) => {
                  setSameAsBilling(e.target.checked);
                  if (e.target.checked) setForm((f) => ({ ...f, billingAddress: "" }));
                }}
                className="w-4 h-4 rounded bg-gray-50 border-gray-200 accent-amber-500" />
              <span className="text-xs text-gray-600">Billing address same as above</span>
            </label>
            {!sameAsBilling && (
              <FInput label="Billing Address" value={form.billingAddress} onChange={(v) => setForm((f) => ({ ...f, billingAddress: v }))} placeholder="Enter billing address" />
            )}

            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider pt-2">Financial & Industry</p>
            <div className="grid grid-cols-3 gap-3">
              <FInput label="Credit Limit ($)" value={form.creditLimit} onChange={(v) => setForm((f) => ({ ...f, creditLimit: v }))} type="number" />
              <div>
                <label className="block text-xs text-gray-500 mb-1">Payment Terms</label>
                <select value={form.paymentTerms} onChange={(e) => setForm((f) => ({ ...f, paymentTerms: e.target.value }))}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-amber-500/50">
                  {["Net 15", "Net 30", "Net 45", "Net 60", "COD", "Prepaid"].map(t =>
                    <option key={t} value={t}>{t}</option>
                  )}
                </select>
              </div>
              <FInput label="Tax ID" value={form.taxId} onChange={(v) => setForm((f) => ({ ...f, taxId: v }))} />
            </div>
            <FInput label="Industry Type" value={form.industryType} onChange={(v) => setForm((f) => ({ ...f, industryType: v }))} placeholder="e.g. Manufacturing, Food & Beverage" />
            <FInput label="Notes" value={form.notes} onChange={(v) => setForm((f) => ({ ...f, notes: v }))} />

            <p className="text-xs text-gray-500 font-medium uppercase tracking-wider pt-2">Contacts</p>
            {createContacts.length > 0 && (
              <div className="space-y-2">
                {createContacts.map((ct, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-3 text-sm text-gray-900 min-w-0">
                      <span className="font-medium truncate">{ct.name}</span>
                      {ct.title && <span className="text-gray-500 truncate">{ct.title}</span>}
                      {ct.email && <span className="text-gray-500 truncate">{ct.email}</span>}
                      {ct.phone && <span className="text-gray-500 truncate">{ct.phone}</span>}
                      {ct.isPrimary && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">Primary</span>}
                    </div>
                    <button onClick={() => setCreateContacts((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-gray-400 hover:text-red-500 shrink-0 ml-2"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input value={createContactForm.name} onChange={(e) => setCreateContactForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Name *" className="px-2.5 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                <input value={createContactForm.title} onChange={(e) => setCreateContactForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="Title" className="px-2.5 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                <input value={createContactForm.email} onChange={(e) => setCreateContactForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="Email" className="px-2.5 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
                <input value={createContactForm.phone} onChange={(e) => setCreateContactForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="Phone" className="px-2.5 py-1.5 bg-white border border-gray-200 rounded text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50" />
              </div>
              <button type="button" onClick={() => {
                if (!createContactForm.name.trim()) return;
                setCreateContacts((prev) => [...prev, { ...createContactForm, isPrimary: prev.length === 0 }]);
                setCreateContactForm({ name: "", title: "", email: "", phone: "" });
              }} disabled={!createContactForm.name.trim()}
                className="flex items-center gap-1 text-xs text-amber-600 hover:text-amber-500 font-medium disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus className="w-3 h-3" /> Add Contact
              </button>
            </div>

            <button onClick={() => createCustomer.mutate()} disabled={!form.name || createCustomer.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              Add Customer
            </button>
            </div>
      </SlideDrawer>

      {/* Add/Edit Contact Drawer */}
      <SlideDrawer open={!!showContactModal} onClose={() => { setShowContactModal(null); setEditingContactId(null); setContactForm({ name: "", title: "", email: "", phone: "", isPrimary: false }); }} title={editingContactId ? "Edit Contact" : "Add Contact"} width="max-w-md">
            <div className="space-y-4">
            <FInput label="Name *" value={contactForm.name} onChange={(v) => setContactForm((f) => ({ ...f, name: v }))} />
            <FInput label="Title" value={contactForm.title} onChange={(v) => setContactForm((f) => ({ ...f, title: v }))} placeholder="e.g. Shipping Manager" />
            <div className="grid grid-cols-2 gap-3">
              <FInput label="Email" value={contactForm.email} onChange={(v) => setContactForm((f) => ({ ...f, email: v }))} />
              <FInput label="Phone" value={contactForm.phone} onChange={(v) => setContactForm((f) => ({ ...f, phone: v }))} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={contactForm.isPrimary} onChange={(e) => setContactForm((f) => ({ ...f, isPrimary: e.target.checked }))}
                className="w-4 h-4 rounded bg-gray-50 border-gray-200 accent-amber-500" />
              <span className="text-sm text-gray-700">Primary Contact</span>
            </label>
            {editingContactId ? (
              <button onClick={() => editContact.mutate({ customerId: showContactModal!, contactId: editingContactId })} disabled={!contactForm.name || editContact.isPending}
                className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
                Save Changes
              </button>
            ) : (
              <button onClick={() => addContact.mutate(showContactModal!)} disabled={!contactForm.name || addContact.isPending}
                className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
                Add Contact
              </button>
            )}
            </div>
      </SlideDrawer>

      {/* Update Credit Drawer */}
      <SlideDrawer open={!!showCreditModal} onClose={() => setShowCreditModal(null)} title="Update Credit Status" width="max-w-md">
            <div className="space-y-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Credit Status</label>
              <select value={creditForm.creditStatus} onChange={(e) => setCreditForm((f) => ({ ...f, creditStatus: e.target.value }))}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 focus:outline-none focus:border-amber-500/50">
                {["NOT_CHECKED", "PENDING_REVIEW", "APPROVED", "CONDITIONAL", "DENIED"].map(s =>
                  <option key={s} value={s}>{s.replace("_", " ")}</option>
                )}
              </select>
            </div>
            <FInput label="Credit Limit ($)" value={creditForm.creditLimit} onChange={(v) => setCreditForm((f) => ({ ...f, creditLimit: v }))} type="number" />
            <button onClick={() => updateCredit.mutate(showCreditModal!)} disabled={updateCredit.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              Update Credit
            </button>
            </div>
      </SlideDrawer>

      {/* Email Campaign Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" style={{ background: 'var(--srl-bg-surface)', border: '1px solid var(--srl-border)' }}>
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold text-white">Send Email Campaign</h2>
                <p className="text-sm text-slate-400 mt-0.5">Send branded emails to your CRM contacts</p>
              </div>
              <button onClick={() => setShowEmailModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {emailResult ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    {emailResult.sent > 0 && (
                      <span className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 font-medium flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" /> {emailResult.sent} sent
                      </span>
                    )}
                    {emailResult.skipped > 0 && (
                      <span className="px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 font-medium">
                        {emailResult.skipped} skipped (no email)
                      </span>
                    )}
                    {emailResult.failed > 0 && (
                      <span className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 font-medium">
                        {emailResult.failed} failed
                      </span>
                    )}
                  </div>
                  <button onClick={() => setShowEmailModal(false)}
                    className="px-4 py-2 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Recipients */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Recipients</label>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                      <label className="flex items-center gap-2 text-sm text-slate-300 pb-2 border-b border-white/5 cursor-pointer">
                        <input type="checkbox" checked={selectAllRecipients}
                          onChange={(e) => handleToggleAllRecipients(e.target.checked)}
                          className="rounded border-slate-600 text-amber-500 focus:ring-amber-500/20" />
                        <span className="font-medium">All Customers with Email ({(data?.customers || []).filter((c) => c.email).length})</span>
                      </label>
                      {(data?.customers || []).map((c) => (
                        <label key={c.id} className={`flex items-center gap-2 text-sm cursor-pointer ${c.email ? "text-slate-300" : "text-slate-600"}`}>
                          <input type="checkbox" checked={selectedRecipients.has(c.id)}
                            onChange={() => handleToggleRecipient(c.id)}
                            disabled={!c.email}
                            className="rounded border-slate-600 text-amber-500 focus:ring-amber-500/20 disabled:opacity-30" />
                          <span>{c.name}</span>
                          {c.email ? (
                            <span className="text-xs text-slate-500 ml-auto truncate max-w-[200px]">{c.email}</span>
                          ) : (
                            <span className="text-xs text-red-400/60 ml-auto">No email</span>
                          )}
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Template */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Template</label>
                    <select value={emailTemplate} onChange={(e) => handleTemplateChange(e.target.value as TemplateType)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500/50">
                      <option value="INTRO" className="bg-slate-900">Company Introduction</option>
                      <option value="FOLLOW_UP" className="bg-slate-900">Follow-Up</option>
                      <option value="RATE_SHEET" className="bg-slate-900">Rate Sheet</option>
                      <option value="CUSTOM" className="bg-slate-900">Custom</option>
                    </select>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Subject</label>
                    <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50" />
                  </div>

                  {/* Custom body textarea */}
                  {emailTemplate === "CUSTOM" && (
                    <div>
                      <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                        Message Body <span className="text-slate-600 normal-case">(HTML supported, use {"{contactName}"} for personalization)</span>
                      </label>
                      <textarea value={emailBody} onChange={(e) => setEmailBody(e.target.value)} rows={8}
                        placeholder="<p>Hi {contactName},</p><p>Your message here...</p>"
                        className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50 font-mono" />
                    </div>
                  )}

                  {/* Preview */}
                  {emailTemplate !== "CUSTOM" && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                        <Eye className="w-3.5 h-3.5" /> Preview
                      </label>
                      <div className="bg-white rounded-lg border border-white/10 overflow-hidden">
                        <div style={{ background: "#0f172a", padding: "16px", textAlign: "center", borderBottom: "3px solid #d4a574" }}>
                          <h3 style={{ color: "#d4a574", margin: 0, fontFamily: "Georgia, serif", fontSize: "18px" }}>Silk Route Logistics</h3>
                        </div>
                        <div className="p-4 text-sm text-gray-700 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-3 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-5 [&_li]:mb-1 [&_ul]:list-disc"
                          dangerouslySetInnerHTML={{ __html: EMAIL_TEMPLATES[emailTemplate].preview((data?.customers || []).find((c: Customer) => selectedRecipients.has(c.id))?.contactName?.split(/\s+/)[0] || "there") }} />
                        <div style={{ background: "#1e293b", padding: "12px", textAlign: "center", fontSize: "11px", color: "#94a3b8" }}>
                          Silk Route Logistics &bull; silkroutelogistics.ai
                        </div>
                      </div>
                    </div>
                  )}

                  {emailTemplate === "CUSTOM" && emailBody && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                        <Eye className="w-3.5 h-3.5" /> Preview
                      </label>
                      <div className="bg-white rounded-lg border border-white/10 overflow-hidden">
                        <div style={{ background: "#0f172a", padding: "16px", textAlign: "center", borderBottom: "3px solid #d4a574" }}>
                          <h3 style={{ color: "#d4a574", margin: 0, fontFamily: "Georgia, serif", fontSize: "18px" }}>Silk Route Logistics</h3>
                        </div>
                        <div className="p-4 text-sm text-gray-700 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mb-3 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:pl-5 [&_li]:mb-1 [&_ul]:list-disc"
                          dangerouslySetInnerHTML={{ __html: emailBody.replace(/\{contactName\}/g, "{contactName}") }} />
                        <div style={{ background: "#1e293b", padding: "12px", textAlign: "center", fontSize: "11px", color: "#94a3b8" }}>
                          Silk Route Logistics &bull; silkroutelogistics.ai
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {!emailResult && (
              <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10">
                <button onClick={() => setShowEmailModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">
                  Cancel
                </button>
                <button onClick={handleSendCampaign}
                  disabled={emailSending || selectedRecipients.size === 0 || !emailSubject.trim() || (emailTemplate === "CUSTOM" && !emailBody.trim())}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed">
                  {emailSending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending {emailProgress.current}/{emailProgress.total}...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Send to {selectedRecipients.size} Recipient{selectedRecipients.size !== 1 ? "s" : ""}</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast notification */}
      {emailToast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-green-500/90 text-white rounded-lg shadow-xl text-sm font-medium animate-in slide-in-from-bottom-4">
          <CheckCircle2 className="w-4 h-4" /> {emailToast}
        </div>
      )}

      {/* CSV Import Preview Modal */}
      {showCsvPreview && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold text-white">CSV Import Preview</h2>
                <p className="text-sm text-slate-400 mt-0.5">Found {csvRows.length} contact{csvRows.length !== 1 ? "s" : ""}. Ready to import?</p>
              </div>
              <button onClick={() => { setShowCsvPreview(false); setCsvRows([]); setCsvResult(null); }}
                className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {csvResult ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 font-medium">{csvResult.created} imported</span>
                    {csvResult.skipped > 0 && <span className="px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 font-medium">{csvResult.skipped} skipped (duplicates)</span>}
                    {csvResult.errors.length > 0 && <span className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 font-medium">{csvResult.errors.length} failed</span>}
                  </div>
                  {csvResult.errors.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 space-y-1">
                      {csvResult.errors.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
                    </div>
                  )}
                  <button onClick={() => { setShowCsvPreview(false); setCsvRows([]); setCsvResult(null); }}
                    className="px-4 py-2 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">Done</button>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          {Object.keys(csvRows[0] || {}).slice(0, 8).map((h) => (
                            <th key={h} className="text-left py-2 px-2 text-xs text-slate-500 font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.slice(0, 5).map((row, i) => (
                          <tr key={i} className="border-b border-white/5">
                            {Object.keys(csvRows[0] || {}).slice(0, 8).map((h) => (
                              <td key={h} className="py-2 px-2 text-slate-300 text-xs truncate max-w-[150px]">{row[h] || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvRows.length > 5 && <p className="text-xs text-slate-500 mt-2">...and {csvRows.length - 5} more rows</p>}
                </>
              )}
            </div>

            {!csvResult && (
              <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10">
                <button onClick={() => { setShowCsvPreview(false); setCsvRows([]); }}
                  className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
                <button onClick={handleCsvImport} disabled={csvImporting}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
                  {csvImporting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Importing {csvProgress.current}/{csvProgress.total}...</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Import {csvRows.length} Customers</>
                  )}
                </button>
              </div>
            )}
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
      <label className="block text-xs text-gray-500 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || label.replace(" *", "")}
        type={type || "text"} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20" />
    </div>
  );
}

function SecMetric({ label, value, isCurrency = true }: { label: string; value: number | null; isCurrency?: boolean }) {
  if (value == null) return (
    <div>
      <span className="text-xs text-slate-500">{label}</span>
      <p className="text-sm text-slate-500">&mdash;</p>
    </div>
  );
  let display: string;
  if (!isCurrency) {
    display = value.toFixed(2);
  } else if (Math.abs(value) >= 1e9) {
    display = `$${(value / 1e9).toFixed(1)}B`;
  } else if (Math.abs(value) >= 1e6) {
    display = `$${(value / 1e6).toFixed(1)}M`;
  } else {
    display = `$${(value / 1e3).toFixed(0)}K`;
  }
  const isNegative = value < 0;
  return (
    <div>
      <span className="text-xs text-slate-500">{label}</span>
      <p className={`text-sm font-medium ${isNegative ? "text-red-400" : "text-white"}`}>{display}</p>
    </div>
  );
}

/* ── Google Places AddressAutocomplete (AutocompleteService pattern) ── */
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

interface ParsedAddr { street: string; city: string; state: string; zip: string; unit?: string; }

function AddressAutocomplete({ value, onChange, onSelect, placeholder, className }: {
  value: string; onChange: (v: string) => void; onSelect: (a: ParsedAddr) => void;
  placeholder?: string; className?: string;
}) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState<{ description: string; placeId: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<any>(null); // eslint-disable-line
  const placesRef = useRef<any>(null); // eslint-disable-line

  useEffect(() => {
    loadGoogleMaps().then(() => {
      if ((window as any).google?.maps?.places) {
        autocompleteRef.current = new (window as any).google.maps.places.AutocompleteService();
        placesRef.current = new (window as any).google.maps.places.PlacesService(document.createElement("div"));
      }
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync display when value clears externally
  useEffect(() => { if (!value) setQuery(""); }, [value]);

  const search = useCallback((q: string) => {
    if (q.length < 3 || !autocompleteRef.current) { setResults([]); return; }
    setLoading(true);
    autocompleteRef.current.getPlacePredictions(
      { input: q, componentRestrictions: { country: ["us", "ca", "mx"] }, types: ["address"] },
      (predictions: any[] | null, status: string) => { // eslint-disable-line
        if (status === "OK" && predictions) {
          setResults(predictions.slice(0, 5).map((p: any) => ({ description: p.description, placeId: p.place_id }))); // eslint-disable-line
          setShowDropdown(true);
        } else { setResults([]); }
        setLoading(false);
      }
    );
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    onChange(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (item: { description: string; placeId: string }) => {
    setShowDropdown(false);
    setQuery(item.description);
    if (!placesRef.current) return;
    placesRef.current.getDetails(
      { placeId: item.placeId, fields: ["address_components", "formatted_address"] },
      (place: any, status: string) => { // eslint-disable-line
        if (status !== "OK" || !place?.address_components) return;
        let streetNumber = "", route = "", city = "", state = "", zip = "", unit = "";
        for (const c of place.address_components) {
          const t: string[] = c.types;
          if (t.includes("street_number")) streetNumber = c.long_name;
          if (t.includes("route")) route = c.long_name;
          if (t.includes("locality")) city = c.long_name;
          if (t.includes("sublocality_level_1") && !city) city = c.long_name;
          if (t.includes("administrative_area_level_1")) state = c.short_name;
          if (t.includes("postal_code")) zip = c.short_name;
          if (t.includes("subpremise")) unit = c.long_name;
        }
        const street = [streetNumber, route].filter(Boolean).join(" ");
        onSelect({ street, city, state, zip, unit });
        setQuery(place.formatted_address || item.description);
      }
    );
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-amber-500" />
        <input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className={className ? `pl-9 ${className}` : "w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"}
          autoComplete="off"
        />
        {loading && <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />}
      </div>
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {results.map((r) => (
            <button key={r.placeId} onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition truncate">
              <MapPin className="w-3.5 h-3.5 inline mr-2 text-amber-500" />{r.description}
            </button>
          ))}
          <div className="px-3 py-1 text-[9px] text-gray-400 text-right">Powered by Google</div>
        </div>
      )}
    </div>
  );
}
