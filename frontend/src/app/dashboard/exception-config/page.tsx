"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  FileText,
  DollarSign,
  Eye,
  EyeOff,
  Info,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Settings2,
  Shield,
  ShieldAlert,
  Truck,
  X,
  XCircle,
} from "lucide-react";

/* ─── Types ─── */

interface ExceptionConfig {
  id: string;
  type: string;
  category: string;
  name: string;
  description: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  isEnabled: boolean;
  thresholdValue: number | null;
  thresholdUnit: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ExceptionAlert {
  id: string;
  configId: string;
  entityType: string;
  entityId: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";
  message: string;
  metadata: Record<string, unknown> | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: string;
  config?: ExceptionConfig;
}

interface AlertsResponse {
  items: ExceptionAlert[];
  total: number;
  totalPages: number;
}

interface AlertStats {
  open: number;
  acknowledged: number;
  resolvedToday: number;
  total: number;
}

/* ─── Constants ─── */

type Category = "APPOINTMENT" | "STOP" | "ORDER" | "DOCUMENT" | "FINANCIAL" | "CARRIER";

const CATEGORY_META: Record<Category, { label: string; icon: React.ElementType; color: string }> = {
  APPOINTMENT: { label: "Appointment", icon: Clock, color: "text-sky-400" },
  STOP:        { label: "Stop",        icon: MapPin, color: "text-emerald-400" },
  ORDER:       { label: "Order",       icon: Package, color: "text-violet-400" },
  DOCUMENT:    { label: "Document",    icon: FileText, color: "text-amber-400" },
  FINANCIAL:   { label: "Financial",   icon: DollarSign, color: "text-green-400" },
  CARRIER:     { label: "Carrier",     icon: Truck, color: "text-rose-400" },
};

const CATEGORY_ORDER: Category[] = ["APPOINTMENT", "STOP", "ORDER", "DOCUMENT", "FINANCIAL", "CARRIER"];

const SEVERITY_BADGE: Record<string, string> = {
  INFO:     "bg-blue-500/15 text-blue-400 border-blue-500/20",
  WARNING:  "bg-amber-500/15 text-amber-400 border-amber-500/20",
  CRITICAL: "bg-red-500/15 text-red-400 border-red-500/20",
};

const SEVERITY_ICON: Record<string, React.ElementType> = {
  INFO: Info,
  WARNING: AlertTriangle,
  CRITICAL: ShieldAlert,
};

const STATUS_BADGE: Record<string, string> = {
  OPEN:         "bg-red-500/15 text-red-400",
  ACKNOWLEDGED: "bg-amber-500/15 text-amber-400",
  RESOLVED:     "bg-green-500/15 text-green-400",
  DISMISSED:    "bg-slate-500/15 text-gray-600",
};

/* ─── Helpers ─── */

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ─── Main Page ─── */

export default function ExceptionConfigPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [alertPage, setAlertPage] = useState(1);
  const [noteModalAlert, setNoteModalAlert] = useState<{ id: string; action: "resolve" | "dismiss" } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORY_ORDER));

  // ─── Queries ───

  const { data: configs, isLoading: configsLoading } = useQuery({
    queryKey: ["exception-configs"],
    queryFn: () => api.get<ExceptionConfig[]>("/exceptions/configs").then((r) => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ["exception-alert-stats"],
    queryFn: () => api.get<AlertStats>("/exceptions/alerts/stats").then((r) => r.data),
    refetchInterval: 30000,
  });

  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ["exception-alerts", alertPage],
    queryFn: () =>
      api.get<AlertsResponse>("/exceptions/alerts", { params: { page: alertPage, limit: 20 } }).then((r) => r.data),
    refetchInterval: 30000,
  });

  // ─── Mutations ───

  const toggleConfig = useMutation({
    mutationFn: ({ id, isEnabled }: { id: string; isEnabled: boolean }) =>
      api.patch(`/exceptions/configs/${id}`, { isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-configs"] });
      toast("Configuration updated", "success");
    },
    onError: () => toast("Failed to update configuration", "error"),
  });

  const updateSeverity = useMutation({
    mutationFn: ({ id, severity }: { id: string; severity: string }) =>
      api.patch(`/exceptions/configs/${id}`, { severity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-configs"] });
      toast("Severity updated", "success");
    },
    onError: () => toast("Failed to update severity", "error"),
  });

  const seedConfigs = useMutation({
    mutationFn: () => api.post("/exceptions/seed"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-configs"] });
      toast("Default configurations seeded", "success");
    },
    onError: () => toast("Failed to seed configurations", "error"),
  });

  const resolveAlert = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post(`/exceptions/alerts/${id}/resolve`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["exception-alert-stats"] });
      setNoteModalAlert(null);
      setNoteText("");
      toast("Alert resolved", "success");
    },
    onError: () => toast("Failed to resolve alert", "error"),
  });

  const dismissAlert = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.post(`/exceptions/alerts/${id}/dismiss`, { note }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exception-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["exception-alert-stats"] });
      setNoteModalAlert(null);
      setNoteText("");
      toast("Alert dismissed", "success");
    },
    onError: () => toast("Failed to dismiss alert", "error"),
  });

  // ─── Derived ───

  const configsByCategory = (configs ?? []).reduce<Record<string, ExceptionConfig[]>>((acc, c) => {
    (acc[c.category] ??= []).push(c);
    return acc;
  }, {});

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleNoteSubmit = () => {
    if (!noteModalAlert) return;
    if (noteModalAlert.action === "resolve") {
      resolveAlert.mutate({ id: noteModalAlert.id, note: noteText });
    } else {
      dismissAlert.mutate({ id: noteModalAlert.id, note: noteText });
    }
  };

  // ─── Render ───

  return (
    <div className="space-y-6 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Settings2 className="h-7 w-7 text-[#C5A572]" />
              <h1 className="text-2xl font-semibold tracking-tight">Exception Configuration</h1>
            </div>
            <p className="text-sm text-slate-400 ml-10">
              Configure exception monitoring rules and manage active alerts
            </p>
          </div>
          <button
            onClick={() => seedConfigs.mutate()}
            disabled={seedConfigs.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/5 text-slate-400 hover:text-white transition-all disabled:opacity-50"
          >
            {seedConfigs.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Seed Defaults
          </button>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-10">
          <StatCard
            label="Open Alerts"
            value={stats?.open ?? 0}
            icon={Bell}
            accent="text-red-400"
            bg="bg-red-500/10"
          />
          <StatCard
            label="Acknowledged"
            value={stats?.acknowledged ?? 0}
            icon={Eye}
            accent="text-amber-400"
            bg="bg-amber-500/10"
          />
          <StatCard
            label="Resolved Today"
            value={stats?.resolvedToday ?? 0}
            icon={CheckCircle2}
            accent="text-green-400"
            bg="bg-green-500/10"
          />
          <StatCard
            label="Total Alerts"
            value={stats?.total ?? 0}
            icon={Shield}
            accent="text-[#C5A572]"
            bg="bg-[#C5A572]/10"
          />
        </div>

        {/* Config Grid */}
        <div className="mb-12">
          <h2 className="text-lg font-medium text-slate-200 mb-6 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-slate-500" />
            Exception Rules
            <span className="text-xs text-slate-500 font-normal ml-2">
              {configs?.length ?? 0} configured
            </span>
          </h2>

          {configsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : !configs?.length ? (
            <div className="text-center py-20 text-slate-500">
              <ShieldAlert className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm">No exception configurations found.</p>
              <p className="text-xs mt-1 text-slate-400">Click &quot;Seed Defaults&quot; to create the standard set.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {CATEGORY_ORDER.filter((cat) => configsByCategory[cat]?.length).map((cat) => {
                const meta = CATEGORY_META[cat];
                const Icon = meta.icon;
                const isExpanded = expandedCategories.has(cat);
                const items = configsByCategory[cat];
                const enabledCount = items.filter((c) => c.isEnabled).length;

                return (
                  <div key={cat} className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden">
                    {/* Category Header */}
                    <button
                      onClick={() => toggleCategory(cat)}
                      className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn("p-2 rounded-lg bg-white/[0.04]", meta.color)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <span className="font-medium text-slate-200">{meta.label}</span>
                        <span className="text-xs text-slate-500">
                          {enabledCount}/{items.length} active
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      )}
                    </button>

                    {/* Config Cards */}
                    {isExpanded && (
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 px-5 pb-5">
                        {items.map((config) => (
                          <ConfigCard
                            key={config.id}
                            config={config}
                            onToggle={() =>
                              toggleConfig.mutate({ id: config.id, isEnabled: !config.isEnabled })
                            }
                            onSeverityChange={(severity) =>
                              updateSeverity.mutate({ id: config.id, severity })
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Alerts Section */}
        <div>
          <h2 className="text-lg font-medium text-slate-200 mb-6 flex items-center gap-2">
            <Bell className="h-5 w-5 text-slate-500" />
            Recent Alerts
            <span className="text-xs text-slate-500 font-normal ml-2">
              {alertsData?.total ?? 0} total
            </span>
          </h2>

          {alertsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
            </div>
          ) : !alertsData?.items?.length ? (
            <div className="text-center py-16 text-slate-500">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-sm">No alerts at this time.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {alertsData.items.map((alert) => (
                  <AlertRow
                    key={alert.id}
                    alert={alert}
                    onResolve={() => {
                      setNoteModalAlert({ id: alert.id, action: "resolve" });
                      setNoteText("");
                    }}
                    onDismiss={() => {
                      setNoteModalAlert({ id: alert.id, action: "dismiss" });
                      setNoteText("");
                    }}
                  />
                ))}
              </div>

              {/* Pagination */}
              {alertsData.totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 mt-6">
                  <button
                    onClick={() => setAlertPage((p) => Math.max(1, p - 1))}
                    disabled={alertPage <= 1}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-slate-500">
                    Page {alertPage} of {alertsData.totalPages}
                  </span>
                  <button
                    onClick={() => setAlertPage((p) => Math.min(alertsData.totalPages, p + 1))}
                    disabled={alertPage >= alertsData.totalPages}
                    className="px-3 py-1.5 text-xs rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Note Modal */}
      {noteModalAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 ">
          <div className="bg-[#0f1629] border border-gray-200 rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-slate-200">
                {noteModalAlert.action === "resolve" ? "Resolve Alert" : "Dismiss Alert"}
              </h3>
              <button
                onClick={() => setNoteModalAlert(null)}
                className="p-1 rounded-lg hover:bg-white/[0.06] text-slate-500 hover:text-gray-700 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a note (optional)..."
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.04] border border-gray-200 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-[#C5A572]/40 focus:ring-1 focus:ring-[#C5A572]/20 resize-none transition-colors"
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setNoteModalAlert(null)}
                className="px-4 py-2 text-sm rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNoteSubmit}
                disabled={resolveAlert.isPending || dismissAlert.isPending}
                className={cn(
                  "px-4 py-2 text-sm rounded-lg font-medium transition-all disabled:opacity-50",
                  noteModalAlert.action === "resolve"
                    ? "bg-green-500/20 text-green-400 hover:bg-green-500/30"
                    : "bg-slate-500/20 text-gray-600 hover:bg-slate-500/30"
                )}
              >
                {(resolveAlert.isPending || dismissAlert.isPending) && (
                  <Loader2 className="h-3 w-3 animate-spin inline mr-2" />
                )}
                {noteModalAlert.action === "resolve" ? "Resolve" : "Dismiss"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  bg,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={cn("p-2 rounded-lg", bg)}>
          <Icon className={cn("h-4 w-4", accent)} />
        </div>
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={cn("text-2xl font-semibold", accent)}>{value.toLocaleString()}</p>
    </div>
  );
}

function ConfigCard({
  config,
  onToggle,
  onSeverityChange,
}: {
  config: ExceptionConfig;
  onToggle: () => void;
  onSeverityChange: (severity: string) => void;
}) {
  const [showSeverity, setShowSeverity] = useState(false);

  return (
    <div
      className={cn(
        "relative rounded-xl border p-4 transition-all",
        config.isEnabled
          ? "border-white/[0.08] bg-white/[0.03] hover:bg-gray-50"
          : "border-white/[0.03] bg-white/[0.01] opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-slate-700 truncate">{config.name}</h4>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">{config.description}</p>
        </div>

        {/* Toggle */}
        <button
          onClick={onToggle}
          className={cn(
            "relative flex-shrink-0 w-10 h-[22px] rounded-full transition-colors",
            config.isEnabled ? "bg-[#C5A572]" : "bg-white/10"
          )}
          aria-label={config.isEnabled ? "Disable exception" : "Enable exception"}
        >
          <span
            className={cn(
              "absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-transform",
              config.isEnabled ? "translate-x-[22px]" : "translate-x-[3px]"
            )}
          />
        </button>
      </div>

      <div className="flex items-center justify-between">
        {/* Severity Badge */}
        <div className="relative">
          <button
            onClick={() => setShowSeverity(!showSeverity)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors",
              SEVERITY_BADGE[config.severity]
            )}
          >
            {config.severity}
            <ChevronDown className="h-3 w-3 opacity-50" />
          </button>

          {showSeverity && (
            <div className="absolute top-full left-0 mt-1 z-10 bg-[#141a2e] border border-gray-200 rounded-lg shadow-xl overflow-hidden">
              {(["INFO", "WARNING", "CRITICAL"] as const).map((sev) => (
                <button
                  key={sev}
                  onClick={() => {
                    onSeverityChange(sev);
                    setShowSeverity(false);
                  }}
                  className={cn(
                    "block w-full text-left px-4 py-2 text-xs hover:bg-white/[0.06] transition-colors",
                    config.severity === sev ? "text-white font-medium" : "text-gray-600"
                  )}
                >
                  {sev}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Threshold */}
        {config.thresholdValue != null && (
          <span className="text-[11px] text-slate-500">
            Threshold: {config.thresholdValue}{config.thresholdUnit ? ` ${config.thresholdUnit}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function AlertRow({
  alert,
  onResolve,
  onDismiss,
}: {
  alert: ExceptionAlert;
  onResolve: () => void;
  onDismiss: () => void;
}) {
  const SevIcon = SEVERITY_ICON[alert.severity] ?? Info;
  const isActionable = alert.status === "OPEN" || alert.status === "ACKNOWLEDGED";

  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-5 py-4 flex items-center gap-4 hover:bg-white/[0.04] transition-colors">
      {/* Severity Icon */}
      <div
        className={cn(
          "flex-shrink-0 p-2 rounded-lg",
          alert.severity === "CRITICAL"
            ? "bg-red-500/10 text-red-400"
            : alert.severity === "WARNING"
              ? "bg-amber-500/10 text-amber-400"
              : "bg-blue-500/10 text-blue-400"
        )}
      >
        <SevIcon className="h-4 w-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium text-slate-200 truncate">
            {alert.config?.name ?? alert.configId}
          </span>
          <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium uppercase", STATUS_BADGE[alert.status])}>
            {alert.status}
          </span>
        </div>
        <p className="text-xs text-slate-500 truncate">{alert.message}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-[11px] text-slate-400">
            {alert.entityType} {alert.entityId.slice(0, 8)}
          </span>
          <span className="text-[11px] text-slate-400">{timeAgo(alert.createdAt)}</span>
          {alert.resolutionNote && (
            <span className="text-[11px] text-slate-400 italic truncate max-w-[200px]">
              Note: {alert.resolutionNote}
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      {isActionable && (
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onResolve}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Resolve
          </button>
          <button
            onClick={onDismiss}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-white/[0.04] text-slate-500 hover:bg-white/[0.08] hover:text-slate-400 transition-colors"
          >
            <XCircle className="h-3.5 w-3.5" />
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
