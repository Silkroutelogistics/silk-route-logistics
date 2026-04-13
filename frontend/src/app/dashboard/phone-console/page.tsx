"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import { useToast } from "@/components/ui/Toast";
import {
  Phone, PhoneIncoming, PhoneOutgoing, PhoneMissed, PhoneOff,
  MessageSquare, Voicemail, Search, X, ArrowDownLeft, ArrowUpRight,
  Clock, Mic, Send, RefreshCw, ExternalLink, StickyNote, FileText,
  Headphones, Filter, Calendar, Truck, Package, Building2, User,
  BarChart3, Timer, AlertCircle,
} from "lucide-react";

/* ─── Types ─── */

interface CommStats {
  totalCalls: number;
  totalSms: number;
  missedCalls: number;
  avgCallDuration: number;
}

interface OpenPhoneComm {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: "CALL_INBOUND" | "CALL_OUTBOUND" | "TEXT_INBOUND" | "TEXT_OUTBOUND" | "VOICEMAIL";
  from: string;
  to: string;
  body: string | null;
  duration: number | null;
  status: string;
  entityId: string | null;
  entityType: "CARRIER" | "SHIPPER" | null;
  entityName: string | null;
  metadata: {
    recordingUrl?: string;
    transcript?: string;
    voicemailTranscript?: string;
    openPhoneCallId?: string;
  } | null;
  createdAt: string;
}

type TypeFilter = "ALL" | "CALLS" | "SMS" | "MISSED" | "VOICEMAIL";
type DateRange = "today" | "7d" | "30d" | "custom";
type EntityFilter = "ALL" | "CARRIER" | "SHIPPER";
type DetailTab = "details" | "transcript" | "recording" | "sms-thread" | "notes";

/* ─── Helpers ─── */

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function formatAvgDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isCallType(type: string): boolean {
  return type === "CALL_INBOUND" || type === "CALL_OUTBOUND";
}

function isSmsType(type: string): boolean {
  return type === "TEXT_INBOUND" || type === "TEXT_OUTBOUND";
}

function getDateRangeParams(range: DateRange): { from?: string; to?: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "today") return { from: today.toISOString() };
  if (range === "7d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 7);
    return { from: d.toISOString() };
  }
  if (range === "30d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    return { from: d.toISOString() };
  }
  return {};
}

function getOtherPartyNumber(comm: OpenPhoneComm): string {
  return comm.direction === "INBOUND" ? comm.from : comm.to;
}

/* ─── Component ─── */

export default function PhoneConsolePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [dateRange, setDateRange] = useState<DateRange>("7d");
  const [entityFilter, setEntityFilter] = useState<EntityFilter>("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<OpenPhoneComm | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("details");
  const [smsDrawerOpen, setSmsDrawerOpen] = useState(false);
  const [smsTo, setSmsTo] = useState("");
  const [smsBody, setSmsBody] = useState("");

  // Queries
  const dateParams = getDateRangeParams(dateRange);

  const { data: stats } = useQuery<CommStats>({
    queryKey: ["openphone-stats", dateRange],
    queryFn: () =>
      api.get("/openphone/stats", { params: dateParams }).then((r) => r.data),
  });

  const { data: commsRaw, isLoading } = useQuery<OpenPhoneComm[]>({
    queryKey: ["openphone-comms", typeFilter, dateRange, entityFilter, search],
    queryFn: () =>
      api
        .get("/openphone/communications", {
          params: {
            ...dateParams,
            type: typeFilter !== "ALL" ? typeFilter : undefined,
            entityType: entityFilter !== "ALL" ? entityFilter : undefined,
            search: search || undefined,
          },
        })
        .then((r) => r.data?.data || r.data || []),
  });

  // SMS thread for selected entity
  const { data: smsThread } = useQuery<OpenPhoneComm[]>({
    queryKey: ["openphone-sms-thread", selected?.entityId],
    queryFn: () =>
      api
        .get("/openphone/history", {
          params: {
            entityId: selected!.entityId,
            type: "TEXT_INBOUND,TEXT_OUTBOUND",
          },
        })
        .then((r) => r.data?.data || r.data || []),
    enabled: !!selected?.entityId && detailTab === "sms-thread",
  });

  // Send SMS mutation
  const sendSmsMutation = useMutation({
    mutationFn: (payload: { to: string; content: string }) =>
      api.post("/openphone/sms", payload),
    onSuccess: () => {
      toast("SMS sent successfully", "success");
      setSmsBody("");
      setSmsTo("");
      setSmsDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: ["openphone-comms"] });
    },
    onError: () => toast("Failed to send SMS", "error"),
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: (comm: OpenPhoneComm) => {
      const path = comm.entityType === "CARRIER"
        ? `/openphone/sync/carrier/${comm.entityId}`
        : `/openphone/sync/shipper/${comm.entityId}`;
      return api.post(path);
    },
    onSuccess: () => {
      toast("Synced to OpenPhone", "success");
      queryClient.invalidateQueries({ queryKey: ["openphone-comms"] });
    },
    onError: () => toast("Sync failed", "error"),
  });

  // Filter comms client-side for MISSED / VOICEMAIL
  const comms = useMemo(() => {
    let list = commsRaw || [];
    if (typeFilter === "MISSED") {
      list = list.filter((c) => isCallType(c.type) && c.status === "missed");
    }
    if (typeFilter === "VOICEMAIL") {
      list = list.filter((c) => c.type === "VOICEMAIL" || !!c.metadata?.voicemailTranscript);
    }
    return list;
  }, [commsRaw, typeFilter]);

  // Handlers
  const handleSelect = (comm: OpenPhoneComm) => {
    setSelected(comm);
    setDetailTab("details");
  };

  const handleSendSms = () => {
    if (!smsTo.trim() || !smsBody.trim()) return;
    sendSmsMutation.mutate({ to: smsTo.trim(), content: smsBody.trim() });
  };

  const handleInlineSendSms = (to: string, content: string) => {
    if (!to || !content.trim()) return;
    sendSmsMutation.mutate({ to, content: content.trim() });
  };

  const openSmsDrawer = (prefillTo?: string) => {
    setSmsTo(prefillTo || "");
    setSmsBody("");
    setSmsDrawerOpen(true);
  };

  // Type filter pills
  const TYPE_PILLS: { key: TypeFilter; label: string; icon: typeof Phone }[] = [
    { key: "ALL", label: "All", icon: BarChart3 },
    { key: "CALLS", label: "Calls", icon: Phone },
    { key: "SMS", label: "SMS", icon: MessageSquare },
    { key: "MISSED", label: "Missed", icon: PhoneMissed },
    { key: "VOICEMAIL", label: "Voicemail", icon: Voicemail },
  ];

  const DATE_OPTIONS: { key: DateRange; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7d", label: "7 Days" },
    { key: "30d", label: "30 Days" },
    { key: "custom", label: "Custom" },
  ];

  const ENTITY_OPTIONS: { key: EntityFilter; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "CARRIER", label: "Carriers" },
    { key: "SHIPPER", label: "Shippers" },
  ];

  const DETAIL_TABS: { key: DetailTab; label: string; icon: typeof Phone }[] = [
    { key: "details", label: "Details", icon: FileText },
    { key: "transcript", label: "Transcript", icon: FileText },
    { key: "recording", label: "Recording", icon: Headphones },
    { key: "sms-thread", label: "SMS Thread", icon: MessageSquare },
    { key: "notes", label: "Notes", icon: StickyNote },
  ];

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col bg-[#0a0e1a] overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-5 pb-4">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#C9A84C]/10 flex items-center justify-center">
              <Phone className="w-5 h-5 text-[#C9A84C]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Phone Console</h1>
              <p className="text-sm text-gray-600">OpenPhone call and SMS management</p>
            </div>
          </div>
          <button
            onClick={() => openSmsDrawer()}
            className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C] hover:bg-[#b8963e] text-black text-sm font-semibold rounded-lg transition"
          >
            <Send className="w-4 h-4" />
            New SMS
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <StatsCard
            label="Total Calls"
            value={stats?.totalCalls ?? 0}
            icon={Phone}
            color="text-blue-400"
            bgColor="bg-blue-500/10"
          />
          <StatsCard
            label="Total SMS"
            value={stats?.totalSms ?? 0}
            icon={MessageSquare}
            color="text-emerald-400"
            bgColor="bg-emerald-500/10"
          />
          <StatsCard
            label="Missed Calls"
            value={stats?.missedCalls ?? 0}
            icon={PhoneMissed}
            color="text-red-400"
            bgColor="bg-red-500/10"
            highlight={!!stats?.missedCalls && stats.missedCalls > 0}
          />
          <StatsCard
            label="Avg Duration"
            value={formatAvgDuration(stats?.avgCallDuration ?? 0)}
            icon={Timer}
            color="text-[#C9A84C]"
            bgColor="bg-[#C9A84C]/10"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Type pills */}
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1">
            {TYPE_PILLS.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition",
                  typeFilter === key
                    ? "bg-[#C9A84C]/20 text-[#C9A84C]"
                    : "text-gray-600 hover:text-white hover:bg-gray-50"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          {/* Date range */}
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1">
            {DATE_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setDateRange(key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition",
                  dateRange === key
                    ? "bg-white/10 text-white"
                    : "text-gray-600 hover:text-white hover:bg-gray-50"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Entity filter */}
          <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-1">
            {ENTITY_OPTIONS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setEntityFilter(key)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition",
                  entityFilter === key
                    ? "bg-white/10 text-white"
                    : "text-gray-600 hover:text-white hover:bg-gray-50"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phone or name..."
              className="w-full pl-9 pr-8 py-2 bg-white/[0.03] border border-white/5 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#C9A84C]/40 transition"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main content — split view */}
      <div className="flex-1 flex overflow-hidden px-6 pb-5 gap-4">
        {/* Left: Communications feed */}
        <div
          className={cn(
            "flex flex-col rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-all",
            selected ? "w-[45%]" : "w-full"
          )}
        >
          {/* List header */}
          <div className="shrink-0 px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-600">
              {comms.length} communication{comms.length !== 1 ? "s" : ""}
            </span>
            <span className="text-xs text-slate-500">Sorted by latest</span>
          </div>

          {/* List body */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 gap-3">
                <div className="w-6 h-6 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
                <span className="text-sm text-slate-500">Loading communications...</span>
              </div>
            ) : comms.length === 0 ? (
              <EmptyState />
            ) : (
              comms.map((comm) => (
                <CommRow
                  key={comm.id}
                  comm={comm}
                  isSelected={selected?.id === comm.id}
                  onClick={() => handleSelect(comm)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Detail panel */}
        {selected && (
          <div className="flex-1 flex flex-col rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
            {/* Panel header */}
            <div className="shrink-0 px-5 py-4 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <DirectionIcon direction={selected.direction} className="w-5 h-5" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold text-sm">
                        {getOtherPartyNumber(selected)}
                      </span>
                      {selected.entityName && (
                        <EntityBadge type={selected.entityType} name={selected.entityName} />
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {selected.direction === "INBOUND" ? "Inbound" : "Outbound"}{" "}
                      {isCallType(selected.type) ? "Call" : isSmsType(selected.type) ? "SMS" : "Voicemail"}
                      {" \u00b7 "}{relativeTime(selected.createdAt)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="p-1.5 rounded-lg hover:bg-gray-50 text-gray-600 hover:text-white transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick actions */}
              <div className="flex items-center gap-2 mt-3">
                <a
                  href={`tel:${getOtherPartyNumber(selected)}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 text-xs font-medium rounded-lg transition"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Call Back
                </a>
                <button
                  onClick={() => openSmsDrawer(getOtherPartyNumber(selected))}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-xs font-medium rounded-lg transition"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Send SMS
                </button>
                {selected.entityId && (
                  <button
                    onClick={() => syncMutation.mutate(selected)}
                    disabled={syncMutation.isPending}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C]/10 hover:bg-[#C9A84C]/20 text-[#C9A84C] text-xs font-medium rounded-lg transition disabled:opacity-50"
                  >
                    <RefreshCw className={cn("w-3.5 h-3.5", syncMutation.isPending && "animate-spin")} />
                    Sync
                  </button>
                )}
              </div>
            </div>

            {/* Detail tabs */}
            <div className="shrink-0 flex items-center gap-1 px-5 py-2 border-b border-white/5">
              {DETAIL_TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setDetailTab(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition",
                    detailTab === key
                      ? "bg-white/10 text-white"
                      : "text-slate-500 hover:text-gray-700 hover:bg-gray-50"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-5">
              {detailTab === "details" && <DetailsTab comm={selected} />}
              {detailTab === "transcript" && <TranscriptTab comm={selected} />}
              {detailTab === "recording" && <RecordingTab comm={selected} />}
              {detailTab === "sms-thread" && (
                <SmsThreadTab thread={smsThread || []} onSend={handleInlineSendSms} toNumber={getOtherPartyNumber(selected)} />
              )}
              {detailTab === "notes" && <NotesTab />}
            </div>
          </div>
        )}
      </div>

      {/* Send SMS Drawer */}
      <SlideDrawer open={smsDrawerOpen} onClose={() => setSmsDrawerOpen(false)} title="Send SMS">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">To</label>
            <input
              value={smsTo}
              onChange={(e) => setSmsTo(e.target.value)}
              placeholder="+1 (555) 000-0000"
              className="w-full px-3 py-2.5 bg-[#0a0e1a] border border-gray-200 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-[#C9A84C]/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Message</label>
            <textarea
              value={smsBody}
              onChange={(e) => setSmsBody(e.target.value)}
              rows={5}
              placeholder="Type your message..."
              className="w-full px-3 py-2.5 bg-[#0a0e1a] border border-gray-200 rounded-lg text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-[#C9A84C]/40 resize-none"
            />
            <p className="mt-1 text-xs text-slate-500">{smsBody.length}/160 characters</p>
          </div>
          <button
            onClick={handleSendSms}
            disabled={!smsTo.trim() || !smsBody.trim() || sendSmsMutation.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#C9A84C] hover:bg-[#b8963e] text-black text-sm font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sendSmsMutation.isPending ? (
              <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {sendSmsMutation.isPending ? "Sending..." : "Send Message"}
          </button>
        </div>
      </SlideDrawer>
    </div>
  );
}

/* ─── Sub-components ─── */

function StatsCard({
  label,
  value,
  icon: Icon,
  color,
  bgColor,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: typeof Phone;
  color: string;
  bgColor: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.03] px-4 py-3.5 flex items-center gap-3",
        highlight ? "border-red-500/30" : "border-white/5"
      )}
    >
      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", bgColor)}>
        <Icon className={cn("w-4.5 h-4.5", color)} />
      </div>
      <div>
        <p className="text-xs text-gray-600 mb-0.5">{label}</p>
        <p className={cn("text-lg font-bold", highlight ? "text-red-400" : "text-white")}>{value}</p>
      </div>
    </div>
  );
}

function DirectionIcon({ direction, className }: { direction: string; className?: string }) {
  return direction === "INBOUND" ? (
    <ArrowDownLeft className={cn(className, "text-green-400")} />
  ) : (
    <ArrowUpRight className={cn(className, "text-blue-400")} />
  );
}

function EntityBadge({ type, name }: { type: "CARRIER" | "SHIPPER" | null; name: string }) {
  if (!type) return <span className="text-xs text-slate-500">{name}</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide",
        type === "CARRIER" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"
      )}
    >
      {type === "CARRIER" ? <Truck className="w-3 h-3" /> : <Package className="w-3 h-3" />}
      {name}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  if (isCallType(type)) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold">
        <Phone className="w-3 h-3" />
        CALL
      </span>
    );
  }
  if (isSmsType(type)) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-semibold">
        <MessageSquare className="w-3 h-3" />
        SMS
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px] font-semibold">
      <Voicemail className="w-3 h-3" />
      VM
    </span>
  );
}

function CommRow({
  comm,
  isSelected,
  onClick,
}: {
  comm: OpenPhoneComm;
  isSelected: boolean;
  onClick: () => void;
}) {
  const isMissed = isCallType(comm.type) && comm.status === "missed";

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 border-b border-white/[0.03] flex items-center gap-3 transition hover:bg-white/[0.03]",
        isSelected && "bg-gray-50 border-l-2 border-l-[#C9A84C]"
      )}
    >
      {/* Direction indicator */}
      <div className="shrink-0">
        {isMissed ? (
          <PhoneMissed className="w-4 h-4 text-red-400" />
        ) : (
          <DirectionIcon direction={comm.direction} className="w-4 h-4" />
        )}
      </div>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <TypeBadge type={comm.type} />
          <span className={cn("text-sm font-medium truncate", isMissed ? "text-red-300" : "text-white")}>
            {getOtherPartyNumber(comm)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {comm.entityName ? (
            <EntityBadge type={comm.entityType} name={comm.entityName} />
          ) : (
            <span className="text-xs text-slate-500">Unknown</span>
          )}
        </div>
        {isSmsType(comm.type) && comm.body && (
          <p className="text-xs text-gray-600 mt-1 truncate">
            {comm.body.length > 50 ? comm.body.slice(0, 50) + "..." : comm.body}
          </p>
        )}
      </div>

      {/* Right side — meta */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-[11px] text-slate-500">{relativeTime(comm.createdAt)}</span>
        {isCallType(comm.type) && comm.duration != null && comm.duration > 0 && (
          <span className="text-[11px] text-gray-600 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(comm.duration)}
          </span>
        )}
        {comm.metadata?.recordingUrl && (
          <Mic className="w-3 h-3 text-[#C9A84C]" />
        )}
      </div>
    </button>
  );
}

function DetailsTab({ comm }: { comm: OpenPhoneComm }) {
  const rows: { label: string; value: string }[] = [
    { label: "Direction", value: comm.direction === "INBOUND" ? "Inbound" : "Outbound" },
    { label: "Type", value: comm.type.replace(/_/g, " ") },
    { label: "From", value: comm.from },
    { label: "To", value: comm.to },
    { label: "Entity", value: comm.entityName || "Unknown" },
    { label: "Entity Type", value: comm.entityType || "N/A" },
    ...(isCallType(comm.type) ? [{ label: "Duration", value: formatDuration(comm.duration) }] : []),
    { label: "Status", value: comm.status || "N/A" },
    { label: "Timestamp", value: new Date(comm.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) },
    ...(comm.metadata?.openPhoneCallId ? [{ label: "OpenPhone ID", value: comm.metadata.openPhoneCallId }] : []),
  ];

  return (
    <div className="space-y-3">
      {rows.map(({ label, value }) => (
        <div key={label} className="flex items-start justify-between py-2 border-b border-white/[0.03]">
          <span className="text-xs text-slate-500 uppercase tracking-wide">{label}</span>
          <span className="text-sm text-white text-right max-w-[60%] break-all">{value}</span>
        </div>
      ))}
      {isSmsType(comm.type) && comm.body && (
        <div className="mt-4">
          <span className="text-xs text-slate-500 uppercase tracking-wide block mb-2">Message</span>
          <div className="p-3 bg-white/[0.03] rounded-lg text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
            {comm.body}
          </div>
        </div>
      )}
    </div>
  );
}

function TranscriptTab({ comm }: { comm: OpenPhoneComm }) {
  const transcript = comm.metadata?.transcript || comm.metadata?.voicemailTranscript;

  if (!transcript) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500">
        <FileText className="w-8 h-8 text-slate-600" />
        <p className="text-sm">No transcript available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-3">
        <FileText className="w-4 h-4 text-[#C9A84C]" />
        <span className="text-sm font-medium text-white">
          {comm.metadata?.voicemailTranscript ? "Voicemail Transcript" : "Call Transcript"}
        </span>
      </div>
      <div className="p-4 bg-white/[0.03] rounded-lg text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
        {transcript}
      </div>
    </div>
  );
}

function RecordingTab({ comm }: { comm: OpenPhoneComm }) {
  const url = comm.metadata?.recordingUrl;

  if (!url) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500">
        <Headphones className="w-8 h-8 text-slate-600" />
        <p className="text-sm">No recording available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Headphones className="w-4 h-4 text-[#C9A84C]" />
        <span className="text-sm font-medium text-white">Call Recording</span>
      </div>
      <div className="p-4 bg-white/[0.03] rounded-xl">
        <audio controls className="w-full" preload="metadata">
          <source src={url} />
          Your browser does not support audio playback.
        </audio>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-[#C9A84C] hover:underline"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Open in new tab
      </a>
    </div>
  );
}

function SmsThreadTab({
  thread,
  onSend,
  toNumber,
}: {
  thread: OpenPhoneComm[];
  onSend: (to: string, content: string) => void;
  toNumber: string;
}) {
  const [msg, setMsg] = useState("");

  const handleSend = () => {
    if (!msg.trim()) return;
    onSend(toNumber, msg);
    setMsg("");
  };

  if (!thread.length) {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500">
        <MessageSquare className="w-8 h-8 text-slate-600" />
        <p className="text-sm">No SMS messages in this thread</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 space-y-3 mb-4 overflow-y-auto">
        {thread.map((sms) => (
          <div
            key={sms.id}
            className={cn(
              "max-w-[80%] px-3 py-2 rounded-xl text-sm",
              sms.direction === "OUTBOUND"
                ? "ml-auto bg-[#C9A84C]/15 text-[#C9A84C] rounded-br-sm"
                : "mr-auto bg-gray-50 text-gray-700 rounded-bl-sm"
            )}
          >
            <p className="whitespace-pre-wrap">{sms.body}</p>
            <p className="text-[10px] text-slate-500 mt-1">{relativeTime(sms.createdAt)}</p>
          </div>
        ))}
      </div>

      {/* Quick reply */}
      <div className="shrink-0 flex items-center gap-2 pt-3 border-t border-white/5">
        <input
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Type a reply..."
          className="flex-1 px-3 py-2 bg-white/[0.03] border border-white/5 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#C9A84C]/40"
        />
        <button
          onClick={handleSend}
          disabled={!msg.trim()}
          className="p-2 bg-[#C9A84C] hover:bg-[#b8963e] text-black rounded-lg transition disabled:opacity-50"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function NotesTab() {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500">
      <StickyNote className="w-8 h-8 text-slate-600" />
      <p className="text-sm">Notes will appear here</p>
      <p className="text-xs text-slate-600">Add notes from the communications page or CRM</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
        <Phone className="w-8 h-8 text-slate-600" />
      </div>
      <h3 className="text-white font-semibold mb-2">No communications yet</h3>
      <p className="text-sm text-slate-500 max-w-sm leading-relaxed">
        Connect OpenPhone to start tracking calls and SMS automatically.
      </p>
    </div>
  );
}
