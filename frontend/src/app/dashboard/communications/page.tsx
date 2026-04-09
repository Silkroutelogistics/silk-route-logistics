"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useToast } from "@/components/ui/Toast";
import {
  Search, Send, Mail, StickyNote, Phone, MessageSquare,
  Building2, User, Truck, Package,
} from "lucide-react";

interface Contact {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  type: "CARRIER" | "SHIPPER";
  company?: string;
  lastMessage?: string;
  unreadCount?: number;
}

interface Communication {
  id: string;
  type: "EMAIL" | "NOTE" | "CALL";
  subject: string | null;
  body: string;
  to: string | null;
  createdAt: string;
  user?: { firstName: string; lastName: string };
}

const TYPE_BADGE: Record<string, string> = {
  EMAIL: "bg-blue-500/20 text-blue-400",
  NOTE: "bg-yellow-500/20 text-yellow-400",
  CALL: "bg-green-500/20 text-green-400",
};

const TYPE_ICON: Record<string, typeof Mail> = {
  EMAIL: Mail, NOTE: StickyNote, CALL: Phone,
};

export default function CommunicationsPage() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"ALL" | "CARRIER" | "SHIPPER">("ALL");
  const [composeMode, setComposeMode] = useState<"NOTE" | "EMAIL">("NOTE");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [toField, setToField] = useState("");

  // Fetch shippers (customers)
  const { data: customers } = useQuery({
    queryKey: ["contacts-customers", contactSearch],
    queryFn: () => api.get(`/customers?search=${contactSearch}&limit=20`).then((r) => r.data),
  });

  // Fetch carriers
  const { data: carriers } = useQuery({
    queryKey: ["contacts-carriers"],
    queryFn: () => api.get("/carrier/all").then((r) => r.data),
  });

  // Fetch communications for selected contact
  const { data: communications } = useQuery({
    queryKey: ["communications", selectedContact?.id],
    queryFn: () =>
      api.get(`/communications?contactId=${selectedContact!.id}&page=1&limit=50`).then((r) => r.data),
    enabled: !!selectedContact,
    refetchInterval: 30000,
  });

  const commsData: Communication[] = communications?.data || communications || [];

  // Send communication
  const sendMutation = useMutation({
    mutationFn: (payload: { contactId: string; contactType: string; type: string; subject: string; body: string; to?: string }) =>
      api.post("/communications", payload),
    onSuccess: () => {
      toast("Communication sent successfully", "success");
      setBody("");
      setSubject("");
      queryClient.invalidateQueries({ queryKey: ["communications", selectedContact?.id] });
    },
    onError: () => toast("Failed to send communication", "error"),
  });

  // Build unified contact list
  const contacts: Contact[] = [
    ...(Array.isArray(customers?.data) ? customers.data : Array.isArray(customers) ? customers : []).map((c: Record<string, any>) => ({
      id: c.id, name: c.contactName || c.name, contactName: c.contactName,
      email: c.email, phone: c.phone, type: "SHIPPER" as const, company: c.name,
    })),
    ...(Array.isArray(carriers) ? carriers : []).map((c: Record<string, any>) => ({
      id: c.id, name: c.companyName || c.name || `${c.firstName || ""} ${c.lastName || ""}`.trim(),
      contactName: c.contactName, email: c.email || c.contactEmail,
      phone: c.phone || c.contactPhone, type: "CARRIER" as const, company: c.companyName || c.name,
    })),
  ].filter((c) => {
    if (filterTab === "CARRIER") return c.type === "CARRIER";
    if (filterTab === "SHIPPER") return c.type === "SHIPPER";
    return true;
  });

  const handleSend = () => {
    if (!selectedContact || !body.trim()) return;
    sendMutation.mutate({
      contactId: selectedContact.id,
      contactType: selectedContact.type,
      type: composeMode,
      subject: composeMode === "EMAIL" ? subject : "",
      body: body.trim(),
      to: composeMode === "EMAIL" ? (toField || selectedContact.email || "") : undefined,
    });
  };

  const selectContact = (c: Contact) => {
    setSelectedContact(c);
    setToField(c.email || "");
  };

  const tabs = ["ALL", "CARRIER", "SHIPPER"] as const;

  return (
    <div className="flex h-[calc(100vh-5rem)] gap-4 p-4">
      {/* Left Panel — Contact List */}
      <div className="w-1/3 flex flex-col rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        <div className="p-3 border-b border-white/10">
          <h2 className="text-white font-semibold text-lg mb-3 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-gold" /> Communications
          </h2>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              placeholder="Search contacts..."
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-gold/50"
            />
          </div>
          <div className="flex gap-1">
            {tabs.map((t) => (
              <button
                key={t}
                onClick={() => setFilterTab(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition ${
                  filterTab === t ? "bg-gold/20 text-gold" : "text-slate-400 hover:bg-white/5"
                }`}
              >
                {t === "ALL" ? "All" : t === "CARRIER" ? "Carriers" : "Shippers"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {contacts.length === 0 && (
            <p className="text-slate-500 text-sm text-center py-8">No contacts found</p>
          )}
          {contacts.map((c) => (
            <button
              key={`${c.type}-${c.id}`}
              onClick={() => selectContact(c)}
              className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/5 transition ${
                selectedContact?.id === c.id && selectedContact?.type === c.type ? "bg-white/10" : ""
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-white text-sm font-medium truncate">{c.name}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  c.type === "CARRIER" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"
                }`}>
                  {c.type}
                </span>
              </div>
              <p className="text-slate-500 text-xs truncate">{c.company}</p>
              {c.email && <p className="text-slate-600 text-xs truncate mt-0.5">{c.email}</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Right Panel — Thread + Compose */}
      <div className="w-2/3 flex flex-col rounded-xl border border-white/10 bg-white/5 overflow-hidden">
        {!selectedContact ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 text-slate-600 mx-auto mb-3" />
              <p className="text-slate-400 text-lg">Select a contact to view communications</p>
            </div>
          </div>
        ) : (
          <>
            {/* Contact Header */}
            <div className="px-5 py-3 border-b border-white/10 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-white/10 flex items-center justify-center">
                {selectedContact.type === "CARRIER" ? (
                  <Truck className="h-5 w-5 text-orange-400" />
                ) : (
                  <Package className="h-5 w-5 text-blue-400" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-white font-semibold truncate">{selectedContact.name}</h3>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  {selectedContact.company && (
                    <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{selectedContact.company}</span>
                  )}
                  {selectedContact.email && (
                    <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{selectedContact.email}</span>
                  )}
                  {selectedContact.phone && (
                    <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{selectedContact.phone}</span>
                  )}
                </div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                selectedContact.type === "CARRIER" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"
              }`}>
                {selectedContact.type}
              </span>
            </div>

            {/* Communication Thread */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {commsData.length === 0 && (
                <p className="text-slate-500 text-sm text-center py-12">No communications yet. Start the conversation below.</p>
              )}
              {commsData.map((comm) => {
                const Icon = TYPE_ICON[comm.type] || StickyNote;
                return (
                  <div key={comm.id} className="rounded-lg bg-white/5 border border-white/10 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[comm.type]}`}>
                        <Icon className="h-3 w-3" /> {comm.type}
                      </span>
                      {comm.subject && <span className="text-white text-sm font-medium truncate">{comm.subject}</span>}
                      <span className="ml-auto text-slate-500 text-xs whitespace-nowrap">
                        {new Date(comm.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {comm.to && <p className="text-slate-500 text-xs mb-1">To: {comm.to}</p>}
                    <p className="text-slate-300 text-sm whitespace-pre-wrap">{comm.body}</p>
                    {comm.user && (
                      <p className="text-slate-600 text-xs mt-2">— {comm.user.firstName} {comm.user.lastName}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Compose Bar */}
            <div className="border-t border-white/10 p-3">
              <div className="flex gap-2 mb-2">
                <button
                  onClick={() => setComposeMode("NOTE")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    composeMode === "NOTE" ? "bg-yellow-500/20 text-yellow-400" : "text-slate-400 hover:bg-white/5"
                  }`}
                >
                  <StickyNote className="h-3.5 w-3.5" /> Note
                </button>
                <button
                  onClick={() => setComposeMode("EMAIL")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                    composeMode === "EMAIL" ? "bg-blue-500/20 text-blue-400" : "text-slate-400 hover:bg-white/5"
                  }`}
                >
                  <Mail className="h-3.5 w-3.5" /> Email
                </button>
              </div>
              {composeMode === "EMAIL" && (
                <div className="flex gap-2 mb-2">
                  <input
                    value={toField}
                    onChange={(e) => setToField(e.target.value)}
                    placeholder="To email..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-gold/50"
                  />
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Subject..."
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-gold/50"
                  />
                </div>
              )}
              <div className="flex gap-2">
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend(); }}
                  placeholder={composeMode === "NOTE" ? "Write a note..." : "Compose email body..."}
                  rows={2}
                  className="flex-1 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-gold/50 resize-none"
                />
                <button
                  onClick={handleSend}
                  disabled={!body.trim() || sendMutation.isPending}
                  className="px-4 rounded-lg bg-gold/20 text-gold hover:bg-gold/30 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-1.5 text-sm font-medium"
                >
                  <Send className="h-4 w-4" /> Send
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
