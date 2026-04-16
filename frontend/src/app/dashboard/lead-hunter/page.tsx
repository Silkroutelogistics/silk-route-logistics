"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import {
  Search, Plus, X, Target, Users, DollarSign,
  TrendingUp, Mail, Crosshair, Map, Route,
  Upload, Send, Loader2, CheckCircle2, PhoneCall, MessageSquare,
  AlertTriangle, ArrowRight, Filter, BarChart3, ChevronRight, Eye,
  Inbox, Clock, SkipForward, Pause, Play, MousePointerClick,
} from "lucide-react";
import { ProspectDrawer } from "./ProspectDrawer";

/* ─── Types ─── */

interface Customer {
  id: string; name: string; contactName: string | null; email: string | null; phone: string | null;
  city: string | null; state: string | null; status: string; notes: string | null;
  creditLimit: number | null; paymentTerms: string | null; annualRevenue: number | null;
  industryType: string | null; onboardingStatus: string | null;
}

interface CustomerStats {
  totalCustomers: number;
  activeCustomers: number;
  totalRevenue: number;
  totalShipments: number;
  pipeline: { lead: number; contacted: number; qualified: number; proposal: number; won: number };
  winRate: number;
}
interface RegionStat { region: string; states: string[]; loadCount: number; avgRate: number; avgRatePerMile: number; availableCarriers: number; }
interface Lane { origin: string; dest: string; avgRate: number; avgRatePerMile: number; loadCount: number; avgTransitDays: number; topEquipment: string; trend: string; }

interface CallLog { date: string; type: string; notes: string; by: string; }
type PipelineStage = "LEAD" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "WON";
type Tab = "pipeline" | "replies" | "queue" | "activity" | "regions" | "lanes";

interface Reply {
  id: string;
  type: string;
  entityId: string;
  from: string | null;
  subject: string | null;
  body: string | null;
  metadata: { intent?: string; intentConfidence?: string; action?: string; gmailId?: string; source?: string } | null;
  createdAt: string;
  user?: { firstName: string; lastName: string };
}

interface ActiveSequence {
  id: string;
  prospectId: string;
  prospectEmail: string;
  prospectName: string;
  currentStep: number;
  totalSteps: number;
  status: string;
  metadata?: { engagementScore?: number; opens?: number; clicks?: number };
  nextSendAt: string | null;
  createdAt: string;
}

interface QueueProspect {
  id: string; name: string; contactName: string | null; email: string | null;
  industryType: string | null; currentTouch: number | null; nextTouchDueAt: string | null;
  lastTouchSentAt: string | null; sequenceStatus: string | null; sequenceCluster: string | null;
  drafts: { id: string; subject: string | null; metadata: Record<string, unknown> | null; createdAt: string }[];
}
interface QueueData {
  counts: { overdue: number; today: number; tomorrow: number; thisWeek: number };
  overdue: QueueProspect[]; today: QueueProspect[]; tomorrow: QueueProspect[]; thisWeek: QueueProspect[];
}
interface EngagementStats {
  totalSent: number; uniqueOpens: number; openRate: number; replyRate: number; totalClicks: number; replies: number;
}

const INTENT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  INTERESTED: { bg: "bg-green-500/20", text: "text-green-400", label: "Hot" },
  NEUTRAL: { bg: "bg-amber-500/20", text: "text-amber-400", label: "Warm" },
  OBJECTION: { bg: "bg-orange-500/20", text: "text-orange-400", label: "Cold" },
  OUT_OF_OFFICE: { bg: "bg-blue-500/20", text: "text-blue-400", label: "Out of Office" },
  UNSUBSCRIBE: { bg: "bg-red-500/20", text: "text-red-400", label: "Not Interested" },
};
type TemplateType = "INTRO" | "FOLLOW_UP" | "CAPACITY" | "CUSTOM";

// Spec-aligned palette (gray/gold/blue/purple/green) — dark-panel variant
const PIPELINE_STAGES: { key: PipelineStage; label: string; color: string; bg: string }[] = [
  { key: "LEAD", label: "Lead", color: "text-slate-300", bg: "bg-slate-500/20 border-slate-500/30" },
  { key: "CONTACTED", label: "Contacted", color: "text-gold", bg: "bg-gold/20 border-gold/30" },
  { key: "QUALIFIED", label: "Qualified", color: "text-blue-400", bg: "bg-blue-500/20 border-blue-500/30" },
  { key: "PROPOSAL", label: "Proposal", color: "text-purple-400", bg: "bg-purple-500/20 border-purple-500/30" },
  { key: "WON", label: "Won", color: "text-green-400", bg: "bg-green-500/20 border-green-500/30" },
];

const INDUSTRIES = [
  "Manufacturing", "Retail", "Agriculture", "Automotive", "Food & Beverage",
  "Construction", "Chemical", "Pharmaceutical", "E-Commerce", "Other",
];

const EMPTY_FORM = {
  name: "", contactName: "", email: "", phone: "", industryType: "", state: "", city: "",
  annualRevenue: "", notes: "", status: "Prospect", type: "SHIPPER", paymentTerms: "Net 30",
};

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
<p>Best regards,<br/><strong>Wasih Haider</strong><br/>CEO, Silk Route Logistics Inc.<br/>MC# 01794414 | DOT# 4526880<br/>(269) 220-6760 | whaider@silkroutelogistics.ai<br/>silkroutelogistics.ai</p>`,
  },
  FOLLOW_UP: {
    label: "Follow-Up",
    subject: "Following Up — Silk Route Logistics",
    preview: (name: string) => `<p>Hi ${name},</p>
<p>I wanted to follow up on my previous email about Silk Route Logistics. We recently helped manufacturing companies reduce their freight costs by 8-12% while improving on-time delivery rates.</p>
<p>If you're currently evaluating freight providers or have any upcoming shipping needs, I'd be happy to provide a no-obligation rate comparison on your top lanes.</p>
<p>Just reply to this email or book a call at your convenience.</p>
<p>Best regards,<br/><strong>Wasih Haider</strong><br/>CEO, Silk Route Logistics Inc.<br/>(269) 220-6760 | whaider@silkroutelogistics.ai</p>`,
  },
  CAPACITY: {
    label: "Capacity Pitch",
    subject: "Freight capacity when you need it — Silk Route Logistics",
    preview: (name: string) => `<p>Hi ${name},</p>
<p>I know finding reliable freight capacity can be a headache — especially during peak seasons or when you need last-minute trucks.</p>
<p>At Silk Route Logistics, we maintain a vetted carrier network across all 48 states with:</p>
<ul><li><strong>Same-day truck coverage</strong> — Dry van, flatbed, reefer, and specialized</li><li><strong>98% pickup rate</strong> — When we commit to a load, it gets picked up</li><li><strong>Real-time GPS tracking</strong> — Full visibility from pickup to delivery</li><li><strong>Dedicated point of contact</strong> — You deal with me directly, not a rotating desk</li></ul>
<p>Happy to start with a single trial load so you can see how we operate — no long-term commitment required.</p>
<p>Best regards,<br/><strong>Wasih Haider</strong><br/>Founder & CEO, Silk Route Logistics Inc.<br/>(269) 220-6760 | whaider@silkroutelogistics.ai</p>`,
  },
  CUSTOM: {
    label: "Custom",
    subject: "Message from Silk Route Logistics",
    preview: () => "",
  },
};

/* ─── Helpers ─── */

const STATUS_TO_STAGE: Record<string, PipelineStage> = {
  Active: "WON",
  Contacted: "CONTACTED",
  Qualified: "QUALIFIED",
  Proposal: "PROPOSAL",
  Prospect: "LEAD",
};

function resolveStage(customerStatus: string): PipelineStage {
  return STATUS_TO_STAGE[customerStatus] || "LEAD";
}

interface ActivityEvent {
  id: string;
  kind: "call" | "email" | "note" | "stage_change" | "import";
  timestamp: string;
  customerId: string | null;
  customerName: string | null;
  actor: string;
  summary: string;
  detail: string | null;
}

interface CommunicationRow {
  id: string;
  type: string;
  entityId: string;
  subject: string | null;
  body: string | null;
  createdAt: string;
  metadata: { activityType?: string; source?: string } | null;
  user?: { firstName?: string; lastName?: string } | null;
}

const COMM_TYPE_TO_ACTIVITY: Record<string, string> = {
  CALL_OUTBOUND: "Call",
  CALL_INBOUND: "Call",
  EMAIL_OUTBOUND: "Email",
  EMAIL_INBOUND: "Email",
  NOTE: "Note",
};

function commToCallLog(c: CommunicationRow): CallLog {
  const activityType = c.metadata?.activityType || COMM_TYPE_TO_ACTIVITY[c.type] || "Note";
  const initials = c.user
    ? `${c.user.firstName?.[0] || ""}${c.user.lastName?.[0] || ""}`.toUpperCase() || "—"
    : "—";
  return {
    date: c.createdAt,
    type: activityType,
    notes: c.body || c.subject || "",
    by: initials,
  };
}

function daysSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
}

function formatActivityDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = daysSince(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Yesterday ${time}`;
  if (diff < 7) return `${diff}d ago ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + ` ${time}`;
}

/* ─── Component ─── */

export default function LeadHunterPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("pipeline");
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [activityTypeFilter, setActivityTypeFilter] = useState("");
  const [activityDateRange, setActivityDateRange] = useState<"today" | "7d" | "30d" | "all">("7d");
  const [drawerProspectId, setDrawerProspectId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [laneRegion, setLaneRegion] = useState("");

  // Pipeline
  const [selectedProspects, setSelectedProspects] = useState<Set<string>>(new Set());
  const [stageFilter, setStageFilter] = useState<PipelineStage | "">("");

  // CSV Import
  const [csvRows, setCsvRows] = useState<Record<string, string>[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvProgress, setCsvProgress] = useState({ current: 0, total: 0 });
  const [csvResult, setCsvResult] = useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Mass Email
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTemplate, setEmailTemplate] = useState<TemplateType>("INTRO");
  const [emailSubject, setEmailSubject] = useState(EMAIL_TEMPLATES.INTRO.subject);
  const [emailBody, setEmailBody] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [selectAllRecipients, setSelectAllRecipients] = useState(true);
  const [emailSending, setEmailSending] = useState(false);
  const [emailProgress, setEmailProgress] = useState({ current: 0, total: 0 });
  const [emailResult, setEmailResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);
  const [emailPrefilter, setEmailPrefilter] = useState<string | null>(null);

  /* ─── Queries ─── */

  const { data: stats } = useQuery({
    queryKey: ["customer-stats"],
    queryFn: () => api.get<CustomerStats>("/customers/stats").then((r) => r.data),
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers-prospects", search, industryFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      if (industryFilter) p.set("industry", industryFilter);
      p.set("page", "1");
      p.set("limit", "200");
      return api.get<{ customers: Customer[] }>(`/customers?${p}`).then((r) => r.data);
    },
  });

  const { data: industriesList } = useQuery({
    queryKey: ["customer-industries"],
    queryFn: () => api.get<string[]>("/customers/industries").then((r) => r.data),
  });

  const { data: regions } = useQuery({
    queryKey: ["market-regions"],
    queryFn: () => api.get<RegionStat[]>("/market/regions").then((r) => r.data),
    enabled: tab === "regions" || tab === "lanes",
  });

  const { data: lanesData } = useQuery({
    queryKey: ["market-lanes", laneRegion],
    queryFn: () => api.get<{ lanes: Lane[] }>(`/market/lanes?region=${laneRegion}`).then((r) => r.data),
    enabled: tab === "lanes",
  });

  // All SHIPPER activity (calls, emails, notes) — source of truth for Activity Log + Last Contact column
  const { data: communicationsData } = useQuery({
    queryKey: ["lead-hunter-communications"],
    queryFn: () => api.get<{ communications: CommunicationRow[]; total: number }>("/communications?entity_type=SHIPPER&limit=100").then((r) => r.data),
    refetchInterval: 60000,
  });

  // Inbound replies from Gmail
  const { data: repliesData } = useQuery({
    queryKey: ["lead-hunter-replies"],
    queryFn: () => api.get<{ communications: Reply[]; total: number }>("/communications?entity_type=SHIPPER&type=EMAIL_INBOUND&limit=50").then((r) => r.data),
    refetchInterval: 60000, // poll every 60s
  });

  // Merged activity feed (Communication + SystemLog) for Tab 3
  const { data: activityFeedData } = useQuery({
    queryKey: ["lead-hunter-activity-feed", activityTypeFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("limit", "150");
      if (activityTypeFilter) p.set("type", activityTypeFilter);
      return api.get<{ events: ActivityEvent[]; total: number }>(`/customers/activity-feed?${p}`).then((r) => r.data);
    },
    enabled: tab === "activity",
    refetchInterval: 60000,
  });

  // Active email sequences
  const { data: sequencesData } = useQuery({
    queryKey: ["active-sequences"],
    queryFn: () => api.get<{ sequences: ActiveSequence[] }>("/automation/sequences?status=ACTIVE&limit=50").then((r) => r.data),
  });

  // Follow-up Queue (v3.6.c)
  const { data: queueData } = useQuery({
    queryKey: ["sequence-queue"],
    queryFn: () => api.get<QueueData>("/sequences/queue").then((r) => r.data),
    refetchInterval: 60000,
  });

  // Engagement stats (v3.6.c)
  const { data: engagementStats } = useQuery({
    queryKey: ["engagement-stats"],
    queryFn: () => api.get<EngagementStats>("/email-tracking/engagement-stats").then((r) => r.data),
  });

  /* ─── Mutations ─── */

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.post("/customers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers-prospects"] });
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
      queryClient.invalidateQueries({ queryKey: ["customers-prospects"] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      toast("Prospect converted to active customer!", "success");
    },
    onError: () => toast("Failed to convert prospect", "error"),
  });

  /* ─── Derived Data ─── */

  const allCustomers = customersData?.customers ?? [];
  // All prospects in the pipeline — show everyone except won/Active customers
  const prospects = allCustomers.filter((c) => c.status !== "Active");

  // Build { customerId: CallLog[] } from the Communication query (server is source of truth)
  const callLogs = useMemo(() => {
    const map: Record<string, CallLog[]> = {};
    for (const c of communicationsData?.communications ?? []) {
      if (!map[c.entityId]) map[c.entityId] = [];
      map[c.entityId].push(commToCallLog(c));
    }
    return map;
  }, [communicationsData]);

  const getStage = useCallback((c: Customer) => resolveStage(c.status), []);

  const filteredProspects = stageFilter
    ? prospects.filter((c) => getStage(c) === stageFilter)
    : prospects;

  // Server-side pipeline counts (authoritative, not limited by page size).
  // Fall back to local aggregation over the visible page while stats are loading.
  const localStageCounts = PIPELINE_STAGES.reduce((acc, s) => {
    acc[s.key] = prospects.filter((c) => getStage(c) === s.key).length;
    return acc;
  }, {} as Record<PipelineStage, number>);

  const stageCounts: Record<PipelineStage, number> = stats?.pipeline
    ? {
        LEAD: stats.pipeline.lead,
        CONTACTED: stats.pipeline.contacted,
        QUALIFIED: stats.pipeline.qualified,
        PROPOSAL: stats.pipeline.proposal,
        WON: stats.pipeline.won,
      }
    : localStageCounts;

  const contactedCount = stageCounts.CONTACTED + stageCounts.QUALIFIED + stageCounts.PROPOSAL;
  const winRate = stats?.winRate != null
    ? stats.winRate.toFixed(1)
    : (prospects.length > 0
      ? ((localStageCounts.WON / (prospects.length + localStageCounts.WON)) * 100).toFixed(1)
      : "0");

  /* ─── Pipeline Stage Update (persists to DB) ─── */

  const STAGE_TO_STATUS: Record<PipelineStage, string> = {
    LEAD: "Prospect",
    CONTACTED: "Contacted",
    QUALIFIED: "Qualified",
    PROPOSAL: "Proposal",
    WON: "Active",
  };

  const updateStage = (customerId: string, stage: PipelineStage) => {
    api.patch(`/customers/${customerId}`, { status: STAGE_TO_STATUS[stage] })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["customers-prospects"] });
        queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      })
      .catch(() => toast("Failed to update stage", "error"));
  };

  /* ─── CSV Import ─── */

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
    status: "Prospect",
  });

  const handleCsvImport = async () => {
    setCsvImporting(true);
    const mapped = csvRows.map(mapCsvRow).filter((r) => r.name);
    setCsvProgress({ current: 0, total: mapped.length });
    try {
      const res = await api.post("/customers/bulk", { customers: mapped });
      setCsvResult(res.data);
      queryClient.invalidateQueries({ queryKey: ["customers-prospects"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setCsvResult({ created: 0, updated: 0, skipped: 0, errors: [error?.response?.data?.error || "Import failed"] });
    } finally {
      setCsvImporting(false);
    }
  };

  /* ─── Mass Email ─── */

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

  const openEmailModal = useCallback((prefilterIds?: string[]) => {
    const prospectList = prefilterIds
      ? prospects.filter((c) => prefilterIds.includes(c.id) && c.email)
      : prospects.filter((c) => c.email);
    setSelectedRecipients(new Set(prospectList.map((c) => c.id)));
    setSelectAllRecipients(!prefilterIds);
    setEmailTemplate("INTRO");
    setEmailSubject(EMAIL_TEMPLATES.INTRO.subject);
    setEmailBody("");
    setEmailResult(null);
    setEmailSending(false);
    setEmailPrefilter(prefilterIds ? prefilterIds[0] ?? null : null);
    setShowEmailModal(true);
  }, [prospects]);

  const handleToggleAllRecipients = useCallback((checked: boolean) => {
    setSelectAllRecipients(checked);
    if (checked) {
      const withEmail = prospects.filter((c) => c.email);
      setSelectedRecipients(new Set(withEmail.map((c) => c.id)));
    } else {
      setSelectedRecipients(new Set());
    }
  }, [prospects]);

  const handleSendCampaign = async () => {
    const ids = Array.from(selectedRecipients);
    if (ids.length === 0) return;
    setEmailSending(true);
    setEmailProgress({ current: 0, total: ids.length });
    try {
      const progressInterval = setInterval(() => {
        setEmailProgress((p) => ({ ...p, current: Math.min(p.current + 1, p.total - 1) }));
      }, 600);
      // Map legacy template types to touch numbers for new builder
      const touchMap: Record<string, number> = { INTRO: 1, FOLLOW_UP: 2, CAPACITY: 1, CUSTOM: 1 };
      const res = await api.post<{ sent: number; failed: number; skipped: number }>("/customers/mass-email", {
        customerIds: ids,
        touchNumber: touchMap[emailTemplate] || 1,
        subjectOverride: emailSubject,
        bodyOverride: emailTemplate === "CUSTOM" ? emailBody : undefined,
        // Legacy fields for backward compat
        subject: emailSubject,
        body: emailTemplate === "CUSTOM" ? emailBody : undefined,
        templateType: emailTemplate,
      });
      clearInterval(progressInterval);
      setEmailProgress({ current: ids.length, total: ids.length });
      setEmailResult(res.data);

      // Auto-advance any prospect still in LEAD stage to CONTACTED
      const leadIds = ids.filter((id) => {
        const c = allCustomers.find((x) => x.id === id);
        return c && resolveStage(c.status) === "LEAD";
      });
      if (leadIds.length > 0) {
        await api.patch("/customers/bulk-stage", { ids: leadIds, status: "Contacted" }).catch(() => {});
        queryClient.invalidateQueries({ queryKey: ["customers-prospects"] });
        queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      }
      toast(`Email sent to ${res.data.sent} prospect${res.data.sent !== 1 ? "s" : ""}`, "success");
    } catch {
      setEmailResult({ sent: 0, failed: ids.length, skipped: 0 });
    } finally {
      setEmailSending(false);
    }
  };

  /* ─── Reply Quick Actions (Tab 2) ─── */

  const handleReplyQuickAction = async (
    prospect: Customer,
    action: "schedule_call" | "send_follow_up" | "mark_not_interested",
    replySubject?: string | null,
  ) => {
    if (action === "schedule_call") {
      if (prospect.phone) window.open(`tel:${prospect.phone}`);
      try {
        await api.post("/communications", {
          type: "CALL_OUTBOUND",
          direction: "OUTBOUND",
          entityType: "SHIPPER",
          entityId: prospect.id,
          subject: "Scheduled callback from Replies inbox",
          body: `Call queued from reply — ${prospect.contactName || prospect.name}`,
          metadata: { source: "LeadHunter.Replies", action: "schedule_call" },
        });
        queryClient.invalidateQueries({ queryKey: ["lead-hunter-communications"] });
        queryClient.invalidateQueries({ queryKey: ["lead-hunter-activity-feed"] });
      } catch { /* non-fatal */ }
      toast(`Calling ${prospect.contactName || prospect.name}`, "success");
      return;
    }

    if (action === "send_follow_up") {
      setEmailPrefilter(prospect.id);
      setSelectedRecipients(new Set([prospect.id]));
      setSelectAllRecipients(false);
      setEmailTemplate("FOLLOW_UP");
      setEmailSubject(replySubject ? `Re: ${replySubject}` : EMAIL_TEMPLATES.FOLLOW_UP.subject);
      setEmailBody("");
      setEmailResult(null);
      setShowEmailModal(true);
      return;
    }

    if (action === "mark_not_interested") {
      try {
        await api.post("/communications", {
          type: "NOTE",
          entityType: "SHIPPER",
          entityId: prospect.id,
          subject: "Marked Not Interested from Replies inbox",
          body: "Prospect marked not interested; sequences stopped.",
          metadata: { source: "LeadHunter.Replies", action: "mark_not_interested", intent: "UNSUBSCRIBE" },
        });
        queryClient.invalidateQueries({ queryKey: ["lead-hunter-communications"] });
        queryClient.invalidateQueries({ queryKey: ["lead-hunter-activity-feed"] });
        toast(`${prospect.name} marked not interested`, "success");
      } catch {
        toast("Failed to mark prospect", "error");
      }
    }
  };

  /* ─── Bulk Actions ─── */

  const handleBulkStageChange = async (stage: PipelineStage) => {
    const ids = Array.from(selectedProspects);
    if (ids.length === 0) return;
    try {
      const res = await api.patch<{ updated: number; changed: number }>("/customers/bulk-stage", {
        ids,
        status: STAGE_TO_STATUS[stage],
      });
      queryClient.invalidateQueries({ queryKey: ["customers-prospects"] });
      queryClient.invalidateQueries({ queryKey: ["customer-stats"] });
      setSelectedProspects(new Set());
      toast(`${res.data.updated} prospect${res.data.updated !== 1 ? "s" : ""} moved to ${stage}`, "success");
    } catch {
      toast("Failed to update stages", "error");
    }
  };

  const handleBulkEmail = () => {
    const ids = Array.from(selectedProspects);
    openEmailModal(ids);
    setSelectedProspects(new Set());
  };

  const toggleSelectProspect = (id: string) => {
    setSelectedProspects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  /* ─── Handlers ─── */

  const handleCreate = () => {
    const payload: Record<string, unknown> = { ...form };
    if (form.annualRevenue) payload.annualRevenue = parseFloat(form.annualRevenue);
    createMutation.mutate(payload);
  };

  const lastContactDate = (customerId: string): string | null => {
    const logs = callLogs[customerId];
    if (!logs || logs.length === 0) return null;
    return logs[0].date;
  };

  const daysSinceContact = (customerId: string): number | null => {
    const last = lastContactDate(customerId);
    if (!last) return null;
    return daysSince(last);
  };

  /* ─── Tabs Config ─── */

  const replies: Reply[] = repliesData?.communications || [];
  const activeSequences: ActiveSequence[] = sequencesData?.sequences || [];
  const hotReplies = replies.filter((r) => r.metadata?.intent === "INTERESTED").length;

  // Map prospect ID → active sequence
  const sequenceByProspect = activeSequences.reduce((acc, seq) => {
    acc[seq.prospectId] = seq;
    return acc;
  }, {} as Record<string, ActiveSequence>);

  // Map prospect ID → latest reply
  const replyByProspect = replies.reduce((acc, r) => {
    if (!acc[r.entityId]) acc[r.entityId] = r;
    return acc;
  }, {} as Record<string, Reply>);

  const queueBadge = (queueData?.counts.overdue ?? 0) + (queueData?.counts.today ?? 0);

  const tabs: { key: Tab; label: string; icon: typeof Target; badge?: number }[] = [
    { key: "pipeline", label: "Pipeline", icon: Crosshair },
    { key: "replies", label: "Replies", icon: Mail, badge: hotReplies > 0 ? hotReplies : undefined },
    { key: "queue", label: "Queue", icon: Inbox, badge: queueBadge > 0 ? queueBadge : undefined },
    { key: "activity", label: "Activity Log", icon: MessageSquare },
    { key: "regions", label: "Regional Intelligence", icon: Map },
    { key: "lanes", label: "Lane Opportunities", icon: Route },
  ];

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Target className="w-7 h-7 text-gold" /> Lead Hunter
            <span className="text-sm font-normal text-slate-400 ml-2">Sales Command Center</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Pipeline: <span className="text-white font-medium">{prospects.length}</span> prospects
            {" | "}<span className="text-amber-400 font-medium">{contactedCount}</span> contacted
            {" | "}<span className="text-purple-400 font-medium">{stageCounts.QUALIFIED}</span> qualified
            {" | "}<span className="text-green-400 font-medium">{stageCounts.WON}</span> won
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => csvInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-2 border border-white/10 text-slate-300 font-medium rounded-lg text-xs hover:bg-white/5 hover:text-white">
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
          <input ref={csvInputRef} type="file" accept=".csv" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleCsvFile(file);
            e.target.value = "";
          }} />
          <button onClick={() => {
              if (selectedProspects.size > 0) {
                handleBulkEmail();
              } else {
                openEmailModal();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-2 border border-white/10 text-slate-300 font-medium rounded-lg text-xs hover:bg-white/5 hover:text-white">
            <Send className="w-3.5 h-3.5" /> Send Email
          </button>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 bg-gold/20 text-gold rounded-lg hover:bg-gold/30 font-medium text-xs">
            <Plus className="w-3.5 h-3.5" /> Add Prospect
          </button>
        </div>
      </div>

      {/* ─── KPI Cards — click to filter ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {([
          { label: "Total Leads", value: stageCounts.LEAD, icon: Users, color: "text-slate-300",
            onClick: () => { setTab("pipeline"); setStageFilter(stageFilter === "LEAD" ? "" : "LEAD"); },
            active: stageFilter === "LEAD" },
          { label: "Contacted", value: stageCounts.CONTACTED, icon: PhoneCall, color: "text-gold",
            onClick: () => { setTab("pipeline"); setStageFilter(stageFilter === "CONTACTED" ? "" : "CONTACTED"); },
            active: stageFilter === "CONTACTED" },
          { label: "Qualified", value: stageCounts.QUALIFIED, icon: CheckCircle2, color: "text-blue-400",
            onClick: () => { setTab("pipeline"); setStageFilter(stageFilter === "QUALIFIED" ? "" : "QUALIFIED"); },
            active: stageFilter === "QUALIFIED" },
          { label: "Proposals", value: stageCounts.PROPOSAL, icon: DollarSign, color: "text-purple-400",
            onClick: () => { setTab("pipeline"); setStageFilter(stageFilter === "PROPOSAL" ? "" : "PROPOSAL"); },
            active: stageFilter === "PROPOSAL" },
          { label: "Win Rate", value: `${winRate}%`, icon: TrendingUp, color: "text-green-400",
            onClick: () => { setTab("pipeline"); setStageFilter(stageFilter === "WON" ? "" : "WON"); },
            active: stageFilter === "WON" },
          { label: "Hot Replies", value: hotReplies, icon: Mail, color: "text-green-400",
            onClick: () => setTab("replies"),
            active: tab === "replies" },
          { label: "Open Rate", value: `${engagementStats?.openRate ?? 0}%`, icon: Eye, color: "text-blue-400",
            onClick: () => { setTab("pipeline"); /* filter to opened no reply */ },
            active: false },
          { label: "Reply Rate", value: `${engagementStats?.replyRate ?? 0}%`, icon: MousePointerClick, color: "text-green-400",
            onClick: () => setTab("replies"),
            active: false },
        ] as const).map((kpi) => (
          <button
            key={kpi.label}
            onClick={kpi.onClick}
            className={`text-left bg-white/5 border rounded-xl p-4 hover:bg-white/10 hover:border-gold/40 transition ${
              kpi.active ? "border-gold/60 ring-1 ring-gold/30" : "border-white/10"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-xs">{kpi.label}</span>
              <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
            </div>
            <p className="text-xl font-bold text-white mt-1">{kpi.value}</p>
          </button>
        ))}
      </div>

      {/* ─── Tabs ─── */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
              tab === t.key ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"}`}>
            <t.icon className="w-4 h-4" /> {t.label}
            {t.badge && <span className="px-1.5 py-0.5 text-[10px] font-bold bg-green-500/20 text-green-400 rounded-full">{t.badge}</span>}
          </button>
        ))}
      </div>

      {/* ═══════════════ TAB 1: PIPELINE ═══════════════ */}
      {tab === "pipeline" && (
        <div className="space-y-4">
          {/* Search + Filters + Bulk Actions */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search prospects..."
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-gold/50 text-sm" />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as PipelineStage | "")}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none">
                <option value="" className="bg-[#0F1117]">All Stages</option>
                {PIPELINE_STAGES.map((s) => <option key={s.key} value={s.key} className="bg-[#0F1117]">{s.label} ({stageCounts[s.key]})</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <select value={industryFilter} onChange={(e) => setIndustryFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none">
                <option value="" className="bg-[#0F1117]">All Industries</option>
                {(industriesList ?? []).map((ind) => <option key={ind} value={ind} className="bg-[#0F1117]">{ind}</option>)}
              </select>
            </div>
            {selectedProspects.size > 0 && (
              <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
                <span className="text-xs text-slate-400">{selectedProspects.size} selected</span>
                <button onClick={handleBulkEmail} className="text-xs text-gold hover:text-gold/80 font-medium">Email</button>
                <span className="text-slate-600">|</span>
                <select onChange={(e) => { if (e.target.value) handleBulkStageChange(e.target.value as PipelineStage); e.target.value = ""; }}
                  className="bg-transparent text-xs text-gold font-medium focus:outline-none cursor-pointer">
                  <option value="" className="bg-[#0F1117]">Move to...</option>
                  {PIPELINE_STAGES.map((s) => <option key={s.key} value={s.key} className="bg-[#0F1117]">{s.label}</option>)}
                </select>
              </div>
            )}
          </div>

          {/* Pipeline Stage Headers (Kanban-style summary) */}
          <div className="grid grid-cols-5 gap-2">
            {PIPELINE_STAGES.map((s) => (
              <button key={s.key} onClick={() => setStageFilter(stageFilter === s.key ? "" : s.key)}
                className={`rounded-lg border p-3 text-center transition ${
                  stageFilter === s.key ? s.bg : "bg-white/5 border-white/10 hover:bg-white/10"}`}>
                <p className={`text-lg font-bold ${s.color}`}>{stageCounts[s.key]}</p>
                <p className="text-xs text-slate-400">{s.label}</p>
              </button>
            ))}
          </div>

          {/* Prospect List */}
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="px-3 py-3 w-8">
                    <input type="checkbox"
                      checked={selectedProspects.size === filteredProspects.length && filteredProspects.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedProspects(new Set(filteredProspects.map((c) => c.id)));
                        else setSelectedProspects(new Set());
                      }}
                      className="rounded border-slate-600 text-amber-500 focus:ring-amber-500/20" />
                  </th>
                  <th className="text-left px-3 py-3 font-medium">Company</th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Contact</th>
                  <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">Location</th>
                  <th className="text-left px-3 py-3 font-medium hidden md:table-cell">Industry</th>
                  <th className="text-left px-3 py-3 font-medium">Stage</th>
                  <th className="text-left px-3 py-3 font-medium hidden lg:table-cell">Last Contact</th>
                  <th className="px-3 py-3 font-medium w-10" />
                </tr>
              </thead>
              <tbody>
                {filteredProspects.map((c) => {
                  const stage = getStage(c);
                  const stageInfo = PIPELINE_STAGES.find((s) => s.key === stage)!;
                  const daysSince_ = daysSinceContact(c.id);
                  const isStale = daysSince_ !== null && daysSince_ > 7 && stage === "CONTACTED";
                  const isActive = drawerProspectId === c.id;
                  const initials = (c.contactName || c.name).split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
                  const avatarCls = stage === "LEAD"
                    ? "bg-slate-500/15 text-slate-300"
                    : "bg-gold/15 text-gold";

                  return (
                    <tr key={c.id} className={`border-b border-white/5 hover:bg-white/5 cursor-pointer ${isActive ? "bg-white/5" : ""}`}
                      onClick={() => setDrawerProspectId(c.id)}>
                      <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selectedProspects.has(c.id)}
                          onChange={() => toggleSelectProspect(c.id)}
                          className="rounded border-slate-600 text-amber-500 focus:ring-amber-500/20" />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold ${avatarCls}`}>
                            {initials || "—"}
                          </span>
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">{c.name}</p>
                            {c.annualRevenue && <p className="text-xs text-slate-500">${(c.annualRevenue / 1000).toFixed(0)}K rev</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-slate-300 hidden md:table-cell">{c.contactName || c.name.split(/\s+/)[0]}</td>
                      <td className="px-3 py-3 text-slate-400 hidden lg:table-cell">
                        {[c.city, c.state].filter(Boolean).join(", ") || "---"}
                      </td>
                      <td className="px-3 py-3 text-slate-400 hidden md:table-cell">{c.industryType ?? "---"}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${stageInfo.bg} ${stageInfo.color}`}>
                            {stageInfo.label}
                          </span>
                          {sequenceByProspect[c.id] && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] bg-gold/20 text-gold flex items-center gap-0.5">
                              <Loader2 className="w-2.5 h-2.5 animate-spin" />
                              Seq {sequenceByProspect[c.id].currentStep + 1}/{sequenceByProspect[c.id].totalSteps}
                            </span>
                          )}
                          {replyByProspect[c.id] && (() => {
                            const intent = replyByProspect[c.id].metadata?.intent || "NEUTRAL";
                            const style = INTENT_COLORS[intent] || INTENT_COLORS.NEUTRAL;
                            return (
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${style.bg} ${style.text}`}>
                                {style.label}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-3 py-3 hidden lg:table-cell">
                        {daysSince_ !== null ? (
                          <span className={`text-xs flex items-center gap-1 ${isStale ? "text-red-400" : "text-slate-400"}`}>
                            {isStale && <AlertTriangle className="w-3 h-3" />}
                            {daysSince_}d ago
                          </span>
                        ) : (
                          <span className="text-xs text-slate-600">Never</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      </td>
                    </tr>
                  );
                })}
                {filteredProspects.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">No prospects found</td></tr>
                )}
              </tbody>
            </table>

          </div>
        </div>
      )}

      {/* ═══════════════ TAB: REPLIES INBOX ═══════════════ */}
      {tab === "replies" && (
        <div className="space-y-4">
          {/* Reply stats */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Total Replies", value: replies.length, color: "text-white" },
              { label: "Hot Leads", value: replies.filter((r) => r.metadata?.intent === "INTERESTED").length, color: "text-green-400" },
              { label: "Objections", value: replies.filter((r) => r.metadata?.intent === "OBJECTION").length, color: "text-amber-400" },
              { label: "Unsubscribes", value: replies.filter((r) => r.metadata?.intent === "UNSUBSCRIBE").length, color: "text-red-400" },
            ].map((s) => (
              <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-500">{s.label}</p>
                <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Active Sequences */}
          {activeSequences.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-gold animate-spin" /> Active Sequences
                <span className="text-xs text-slate-500 font-normal ml-2">{activeSequences.length} running</span>
              </h3>
              <div className="space-y-2">
                {activeSequences.map((seq) => (
                  <div key={seq.id} className="flex items-center gap-4 py-2 px-3 bg-white/[0.02] rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium truncate">{seq.prospectName}</p>
                      <p className="text-xs text-slate-500 font-mono">{seq.prospectEmail}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-gold font-semibold">Step {seq.currentStep + 1}/{seq.totalSteps}</p>
                      <div className="w-16 h-1 bg-white/10 rounded-full mt-1 overflow-hidden">
                        <div className="h-full bg-gold rounded-full" style={{ width: `${((seq.currentStep + 1) / seq.totalSteps) * 100}%` }} />
                      </div>
                    </div>
                    {seq.metadata?.engagementScore !== undefined && (
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        seq.metadata.engagementScore >= 60 ? "bg-green-500/20 text-green-400" :
                        seq.metadata.engagementScore >= 30 ? "bg-amber-500/20 text-amber-400" :
                        "bg-slate-500/20 text-slate-400"
                      }`}>
                        {seq.metadata.engagementScore}% engaged
                      </span>
                    )}
                    {seq.nextSendAt && (
                      <span className="text-[10px] text-slate-500">Next: {new Date(seq.nextSendAt).toLocaleDateString()}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Replies list */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
              <Mail className="w-4 h-4 text-gold" /> Inbound Replies
              <span className="text-xs text-slate-500 font-normal ml-2">Auto-detected from Gmail every 30 min</span>
            </h3>
            {replies.length === 0 ? (
              <div className="text-center py-12">
                <Mail className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                <p className="text-slate-500 text-sm">No replies detected yet</p>
                <p className="text-slate-600 text-xs mt-1">Gmail is polled every 30 minutes. Replies from prospects auto-stop their sequences and appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {replies.map((reply) => {
                  const intent = reply.metadata?.intent || "NEUTRAL";
                  const intentStyle = INTENT_COLORS[intent] || INTENT_COLORS.NEUTRAL;
                  const prospect = allCustomers.find((c) => c.id === reply.entityId);
                  return (
                    <div key={reply.id} className="border border-white/5 rounded-lg p-4 hover:bg-white/[0.02] transition">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-sm font-medium text-white">{prospect?.name || reply.from || "Unknown"}</span>
                            {prospect?.contactName && <span className="text-xs text-slate-500">({prospect.contactName})</span>}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${intentStyle.bg} ${intentStyle.text}`}>
                              {intentStyle.label}
                            </span>
                          </div>
                          {reply.subject && <p className="text-xs text-slate-400 mb-1">Re: {reply.subject}</p>}
                          <p className="text-sm text-slate-300 line-clamp-2">{reply.body || "No body content"}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[10px] text-slate-500">{formatActivityDate(reply.createdAt)}</p>
                          {reply.metadata?.action && (
                            <p className="text-[10px] text-gold mt-1">{reply.metadata.action}</p>
                          )}
                        </div>
                      </div>
                      {/* Quick actions */}
                      <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/5">
                        <button
                          disabled={!prospect}
                          onClick={() => prospect && handleReplyQuickAction(prospect, "schedule_call")}
                          className="text-[10px] px-2 py-1 bg-blue-500/10 text-blue-400 rounded hover:bg-blue-500/20 transition disabled:opacity-40">
                          Schedule Call
                        </button>
                        <button
                          disabled={!prospect}
                          onClick={() => prospect && handleReplyQuickAction(prospect, "send_follow_up", reply.subject)}
                          className="text-[10px] px-2 py-1 bg-gold/10 text-gold rounded hover:bg-gold/20 transition disabled:opacity-40">
                          Send Follow-up
                        </button>
                        <button
                          disabled={!prospect}
                          onClick={() => prospect && handleReplyQuickAction(prospect, "mark_not_interested")}
                          className="text-[10px] px-2 py-1 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition disabled:opacity-40">
                          Mark Not Interested
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ TAB: FOLLOW-UP QUEUE (v3.6.c) ═══════════════ */}
      {tab === "queue" && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
              { label: "Overdue", count: queueData?.counts.overdue ?? 0, color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
              { label: "Today", count: queueData?.counts.today ?? 0, color: "text-gold", bg: "bg-gold/10 border-gold/20" },
              { label: "Tomorrow", count: queueData?.counts.tomorrow ?? 0, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
              { label: "This Week", count: queueData?.counts.thisWeek ?? 0, color: "text-slate-300", bg: "bg-white/5 border-white/10" },
            ] as const).map((card) => (
              <div key={card.label} className={`rounded-xl border p-4 ${card.bg}`}>
                <p className="text-xs text-slate-500">{card.label}</p>
                <p className={`text-2xl font-bold ${card.color} mt-1`}>{card.count}</p>
              </div>
            ))}
          </div>

          {/* Queue List */}
          {(() => {
            const allQueue = [
              ...(queueData?.overdue ?? []).map((c) => ({ ...c, bucket: "overdue" as const })),
              ...(queueData?.today ?? []).map((c) => ({ ...c, bucket: "today" as const })),
              ...(queueData?.tomorrow ?? []).map((c) => ({ ...c, bucket: "tomorrow" as const })),
              ...(queueData?.thisWeek ?? []).map((c) => ({ ...c, bucket: "thisWeek" as const })),
            ];

            if (allQueue.length === 0) {
              return (
                <div className="text-center py-16">
                  <Inbox className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                  <p className="text-white font-medium">Inbox Zero</p>
                  <p className="text-slate-500 text-sm mt-1">No follow-ups due today.{" "}
                    <button onClick={() => setTab("pipeline")} className="text-gold hover:underline">Go to Pipeline</button>
                  </p>
                </div>
              );
            }

            return (
              <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-slate-500 text-xs uppercase border-b border-white/10">
                      <th className="px-4 py-3">Prospect</th>
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Current</th>
                      <th className="px-4 py-3">Next Touch</th>
                      <th className="px-4 py-3">Due</th>
                      <th className="px-4 py-3">Days Silent</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allQueue.map((item) => {
                      const nextTouch = (item.currentTouch ?? 0) + 1;
                      const silentDays = item.lastTouchSentAt ? daysSince(item.lastTouchSentAt) : null;
                      const bucketColors = { overdue: "text-red-400", today: "text-gold", tomorrow: "text-blue-400", thisWeek: "text-slate-400" };
                      const hasDraft = item.drafts.length > 0;

                      return (
                        <tr key={item.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-4 py-3">
                            <button onClick={() => setDrawerProspectId(item.id)} className="text-white hover:text-gold font-medium">
                              {item.contactName || item.name}
                            </button>
                          </td>
                          <td className="px-4 py-3 text-slate-400">{item.name}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-gold/20 text-gold">
                              Touch {item.currentTouch ?? 0}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-500/20 text-blue-400">
                              Touch {nextTouch}
                            </span>
                            {hasDraft && <span className="ml-1.5 text-[10px] text-green-400">(draft ready)</span>}
                          </td>
                          <td className={`px-4 py-3 font-medium ${bucketColors[item.bucket]}`}>
                            {item.nextTouchDueAt ? new Date(item.nextTouchDueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {silentDays !== null ? `${silentDays}d` : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setDrawerProspectId(item.id)}
                                className="px-2.5 py-1 text-xs font-medium text-gold bg-gold/10 rounded hover:bg-gold/20"
                                title="Review & Send"
                              >
                                <Send className="w-3 h-3 inline mr-1" />Review
                              </button>
                              <button
                                onClick={async () => {
                                  await api.post("/sequences/skip-touch", { customerId: item.id });
                                  queryClient.invalidateQueries({ queryKey: ["sequence-queue"] });
                                  toast(`Skipped touch ${item.currentTouch ?? 0} for ${item.name}`, "success");
                                }}
                                className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded"
                                title="Skip this touch"
                              >
                                <SkipForward className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={async () => {
                                  await api.post("/sequences/pause", { customerId: item.id, action: "PAUSE" });
                                  queryClient.invalidateQueries({ queryKey: ["sequence-queue"] });
                                  toast(`Paused sequence for ${item.name}`, "success");
                                }}
                                className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded"
                                title="Pause sequence"
                              >
                                <Pause className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}

      {/* ═══════════════ TAB 2: ACTIVITY LOG ═══════════════ */}
      {tab === "activity" && (() => {
        const allEvents = activityFeedData?.events ?? [];

        // Client-side date range filter: today / 7d / 30d / all
        const now = Date.now();
        const rangeMs: Record<string, number | null> = {
          today: 24 * 60 * 60 * 1000,
          "7d":  7  * 24 * 60 * 60 * 1000,
          "30d": 30 * 24 * 60 * 60 * 1000,
          all:   null,
        };
        const cutoff = rangeMs[activityDateRange];
        const events = cutoff == null
          ? allEvents
          : allEvents.filter((e) => now - new Date(e.timestamp).getTime() <= cutoff);

        const iconFor = (kind: ActivityEvent["kind"]) => {
          switch (kind) {
            case "call": return <PhoneCall className="w-4 h-4" />;
            case "email": return <Mail className="w-4 h-4" />;
            case "note": return <MessageSquare className="w-4 h-4" />;
            case "stage_change": return <ArrowRight className="w-4 h-4" />;
            case "import": return <Upload className="w-4 h-4" />;
          }
        };
        const colorFor = (kind: ActivityEvent["kind"]) => ({
          call: "text-blue-400",
          email: "text-amber-400",
          note: "text-slate-400",
          stage_change: "text-green-400",
          import: "text-gold",
        })[kind];

        // Daily summary — counts in the selected range
        const summary = {
          emails: events.filter((e) => e.kind === "email").length,
          calls: events.filter((e) => e.kind === "call").length,
          stageChanges: events.filter((e) => e.kind === "stage_change").length,
          notes: events.filter((e) => e.kind === "note").length,
        };
        const summaryCards = [
          { label: "Emails",  value: summary.emails,       cls: "text-amber-400" },
          { label: "Calls",   value: summary.calls,        cls: "text-blue-400" },
          { label: "Stage Changes", value: summary.stageChanges, cls: "text-green-400" },
          { label: "Notes",   value: summary.notes,        cls: "text-slate-300" },
        ];
        const rangeButtons: { key: typeof activityDateRange; label: string }[] = [
          { key: "today", label: "Today" },
          { key: "7d",    label: "7 days" },
          { key: "30d",   label: "30 days" },
          { key: "all",   label: "All" },
        ];

        return (
          <div className="space-y-4">
            {/* Daily summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {summaryCards.map((s) => (
                <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-xs text-slate-500">{s.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${s.cls}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-gold" /> All Prospect Activity
                  <span className="text-xs text-slate-500 font-normal ml-2">{events.length} entries</span>
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex rounded-lg border border-white/10 overflow-hidden">
                    {rangeButtons.map((r) => (
                      <button
                        key={r.key}
                        onClick={() => setActivityDateRange(r.key)}
                        className={`px-3 py-1.5 text-xs transition ${
                          activityDateRange === r.key
                            ? "bg-gold/20 text-gold"
                            : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                  <select value={activityTypeFilter} onChange={(e) => setActivityTypeFilter(e.target.value)}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none">
                    <option value="" className="bg-[#0F1117]">All Activity</option>
                    <option value="call" className="bg-[#0F1117]">Calls</option>
                    <option value="email" className="bg-[#0F1117]">Emails</option>
                    <option value="note" className="bg-[#0F1117]">Notes</option>
                    <option value="stage_change" className="bg-[#0F1117]">Stage Changes</option>
                    <option value="import" className="bg-[#0F1117]">Imports</option>
                  </select>
                </div>
              </div>
              {events.length === 0 ? (
                <p className="text-slate-500 text-sm py-8 text-center">No activity in this range.</p>
              ) : (
                <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                  {events.map((e) => (
                    <button
                      key={e.id}
                      onClick={() => e.customerId && setDrawerProspectId(e.customerId)}
                      className="w-full flex items-start gap-3 py-3 border-b border-white/5 last:border-0 text-left hover:bg-white/[0.02] transition px-2 -mx-2 rounded"
                    >
                      <span className={`mt-0.5 shrink-0 ${colorFor(e.kind)}`}>{iconFor(e.kind)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-slate-500">{formatActivityDate(e.timestamp)}</span>
                          <span className="text-xs text-slate-600">|</span>
                          <span className="text-xs font-medium text-white uppercase tracking-wider">{e.kind.replace("_", " ")}</span>
                        </div>
                        <p className="text-sm text-slate-300 mt-0.5">
                          {e.customerName && <span className="text-gold font-medium">{e.customerName} — </span>}
                          {e.summary}
                          {e.detail && e.kind === "stage_change" && <span className="text-slate-500"> ({e.detail})</span>}
                        </p>
                      </div>
                      <span className="text-xs text-slate-600 shrink-0">{e.actor}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

      {/* ═══════════════ TAB 3: REGIONAL INTELLIGENCE ═══════════════ */}
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

      {/* ═══════════════ TAB 4: LANE OPPORTUNITIES ═══════════════ */}
      {tab === "lanes" && (
        <div className="space-y-4">
          <select value={laneRegion} onChange={(e) => setLaneRegion(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-white focus:outline-none text-sm">
            <option value="" className="bg-[#0F1117]">All Regions</option>
            {(regions ?? []).map((r) => <option key={r.region} value={r.region} className="bg-[#0F1117]">{r.region.replace(/_/g, " ")}</option>)}
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

      {/* ═══════════════ ADD PROSPECT MODAL ═══════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 " onClick={() => setShowModal(false)}>
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
                { key: "city", label: "City" },
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
                  <option value="" className="bg-[#0F1117]">Select...</option>
                  {INDUSTRIES.map((ind) => <option key={ind} value={ind} className="bg-[#0F1117]">{ind}</option>)}
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

      {/* ═══════════════ EMAIL CAMPAIGN MODAL ═══════════════ */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4" onClick={() => setShowEmailModal(false)}>
          <div className="bg-[#1e293b] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold text-white">Send Outreach</h2>
                <p className="text-sm text-slate-400 mt-0.5">Send initial outreach to Lead-stage prospects. For follow-ups to contacted prospects, use the Queue view.</p>
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
                      <span className="px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 font-medium">{emailResult.skipped} skipped</span>
                    )}
                    {emailResult.failed > 0 && (
                      <span className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 font-medium">{emailResult.failed} failed</span>
                    )}
                  </div>
                  <button onClick={() => setShowEmailModal(false)}
                    className="px-4 py-2 bg-gold/20 text-gold font-medium rounded-lg text-sm hover:bg-gold/30">Done</button>
                </div>
              ) : (
                <>
                  {/* Recipients */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Recipients (Prospects Only)</label>
                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                      <label className="flex items-center gap-2 text-sm text-slate-300 pb-2 border-b border-white/5 cursor-pointer">
                        <input type="checkbox" checked={selectAllRecipients}
                          onChange={(e) => handleToggleAllRecipients(e.target.checked)}
                          className="rounded border-slate-600 text-amber-500 focus:ring-amber-500/20" />
                        <span className="font-medium">All Prospects with Email ({prospects.filter((c) => c.email).length})</span>
                      </label>
                      {prospects.map((c) => (
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
                      <option value="INTRO" className="bg-[#0F1117]">Company Introduction</option>
                      <option value="FOLLOW_UP" className="bg-[#0F1117]">Follow-Up</option>
                      <option value="CAPACITY" className="bg-[#0F1117]">Capacity Pitch</option>
                      <option value="CUSTOM" className="bg-[#0F1117]">Custom</option>
                    </select>
                  </div>

                  {/* Subject */}
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">Subject</label>
                    <input value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500/50" />
                  </div>

                  {/* Custom body */}
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

                  {/* Preview — Gmail-style (white bg, plain text, real signature, no brand chrome) */}
                  {emailTemplate !== "CUSTOM" && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                        <Eye className="w-3.5 h-3.5" /> Preview (as recipient sees it in Gmail)
                      </label>
                      <div className="bg-white rounded-lg border border-slate-200 p-5">
                        <div className="text-sm text-gray-800 leading-relaxed [&_p]:mb-3"
                          dangerouslySetInnerHTML={{ __html: EMAIL_TEMPLATES[emailTemplate].preview(
                            (() => { const p = prospects.find((c) => selectedRecipients.has(c.id)); return (p?.contactName || p?.name || "").split(/\s+/)[0] || "there"; })()
                          ) }} />
                      </div>
                    </div>
                  )}

                  {emailTemplate === "CUSTOM" && emailBody && (
                    <div>
                      <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider">
                        <Eye className="w-3.5 h-3.5" /> Preview
                      </label>
                      <div className="bg-white rounded-lg border border-slate-200 p-5">
                        <div className="text-sm text-gray-800 leading-relaxed [&_p]:mb-3"
                          dangerouslySetInnerHTML={{ __html: emailBody.replace(/\{contactName\}/g, "{contactName}") }} />
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {!emailResult && (
              <div className="flex items-center justify-end gap-3 p-5 border-t border-white/10">
                <button onClick={() => setShowEmailModal(false)} className="px-4 py-2 text-slate-400 hover:text-white text-sm">Cancel</button>
                <button onClick={handleSendCampaign}
                  disabled={emailSending || selectedRecipients.size === 0 || !emailSubject.trim() || (emailTemplate === "CUSTOM" && !emailBody.trim())}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gold/20 text-gold font-medium rounded-lg text-sm hover:bg-gold/30 disabled:opacity-50 disabled:cursor-not-allowed">
                  {emailSending ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Sending {emailProgress.current}/{emailProgress.total}...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Send to {selectedRecipients.size} Prospect{selectedRecipients.size !== 1 ? "s" : ""}</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ CSV IMPORT MODAL ═══════════════ */}
      {showCsvPreview && (
        <div className="fixed inset-0 bg-black/60  z-50 flex items-center justify-center p-4" onClick={() => { setShowCsvPreview(false); setCsvRows([]); setCsvResult(null); }}>
          <div className="bg-[#0f172a] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h2 className="text-lg font-bold text-white">Import Prospects from CSV</h2>
                <p className="text-sm text-slate-400 mt-0.5">Found {csvRows.length} contact{csvRows.length !== 1 ? "s" : ""}. Imported as Prospects (Lead stage).</p>
              </div>
              <button onClick={() => { setShowCsvPreview(false); setCsvRows([]); setCsvResult(null); }}
                className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {csvResult ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="px-3 py-1.5 rounded-lg bg-green-500/20 text-green-400 font-medium">{csvResult.created} new prospects</span>
                    {csvResult.updated > 0 && <span className="px-3 py-1.5 rounded-lg bg-blue-500/20 text-blue-400 font-medium">{csvResult.updated} updated</span>}
                    {csvResult.skipped > 0 && <span className="px-3 py-1.5 rounded-lg bg-yellow-500/20 text-yellow-400 font-medium">{csvResult.skipped} unchanged</span>}
                    {csvResult.errors.length > 0 && <span className="px-3 py-1.5 rounded-lg bg-red-500/20 text-red-400 font-medium">{csvResult.errors.length} failed</span>}
                  </div>
                  {csvResult.errors.length > 0 && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 space-y-1">
                      {csvResult.errors.map((e, i) => <p key={i} className="text-xs text-red-400">{e}</p>)}
                    </div>
                  )}
                  <button onClick={() => { setShowCsvPreview(false); setCsvRows([]); setCsvResult(null); }}
                    className="px-4 py-2 bg-gold/20 text-gold font-medium rounded-lg text-sm hover:bg-gold/30">Done</button>
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
                              <td key={h} className="py-2 px-2 text-slate-300 text-xs truncate max-w-[150px]">{row[h] || "---"}</td>
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
                  className="flex items-center gap-2 px-4 py-2.5 bg-gold/20 text-gold font-medium rounded-lg text-sm hover:bg-gold/30 disabled:opacity-50">
                  {csvImporting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Importing {csvProgress.current}/{csvProgress.total}...</>
                  ) : (
                    <><Upload className="w-4 h-4" /> Import {csvRows.length} Prospects</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ PROSPECT DRAWER (right-side, IconTabs) ═══════════════ */}
      <ProspectDrawer
        prospect={drawerProspectId ? allCustomers.find((c) => c.id === drawerProspectId) ?? null : null}
        onClose={() => setDrawerProspectId(null)}
      />
    </div>
  );
}
