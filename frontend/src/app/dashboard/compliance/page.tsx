"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Shield, AlertTriangle, CheckCircle2, Clock, RefreshCw,
  Truck, User, UserCheck, Calendar, XCircle,
} from "lucide-react";

interface Alert {
  id: string; type: string; entityType: string; entityId: string;
  entityName: string; expiryDate: string; status: string;
  severity: string; notifiedAt: string | null; createdAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
  WARNING: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  INFO: "bg-blue-500/20 text-blue-400 border-blue-500/30",
};

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  Driver: <User className="w-4 h-4" />,
  Truck: <Truck className="w-4 h-4" />,
  Trailer: <Truck className="w-4 h-4" />,
  CarrierProfile: <UserCheck className="w-4 h-4" />,
};

function formatType(type: string) {
  return type.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function daysUntil(date: string) {
  const diff = new Date(date).getTime() - Date.now();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return "Today";
  return `${days} days`;
}

export default function CompliancePage() {
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["compliance-stats"],
    queryFn: () => api.get("/compliance/stats").then(r => r.data),
  });

  const { data: alertsData } = useQuery({
    queryKey: ["compliance-alerts"],
    queryFn: () => api.get<{ alerts: Alert[]; total: number }>("/compliance/alerts?limit=50").then(r => r.data),
  });

  const scanMutation = useMutation({
    mutationFn: () => api.post("/compliance/scan"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["compliance-stats"] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/compliance/alerts/${id}/resolve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["compliance-stats"] });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/compliance/alerts/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["compliance-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["compliance-stats"] });
    },
  });

  const alerts = alertsData?.alerts || [];
  const critical = alerts.filter(a => a.severity === "CRITICAL" && a.status === "ACTIVE");
  const warnings = alerts.filter(a => a.severity === "WARNING" && a.status === "ACTIVE");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Compliance Center</h1>
          <p className="text-sm text-slate-400 mt-1">Monitor licenses, insurance, inspections, and regulatory compliance</p>
        </div>
        <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
          <RefreshCw className={`w-4 h-4 ${scanMutation.isPending ? "animate-spin" : ""}`} />
          {scanMutation.isPending ? "Scanning..." : "Run Compliance Scan"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={<XCircle className="w-5 h-5" />} label="Critical" value={stats?.bySeverity?.CRITICAL || 0}
          color="text-red-400 bg-red-500/20" borderColor={stats?.bySeverity?.CRITICAL > 0 ? "border-red-500/30" : "border-white/10"} />
        <SummaryCard icon={<AlertTriangle className="w-5 h-5" />} label="Warnings" value={stats?.bySeverity?.WARNING || 0}
          color="text-yellow-400 bg-yellow-500/20" borderColor="border-white/10" />
        <SummaryCard icon={<Clock className="w-5 h-5" />} label="Expiring (7 days)" value={stats?.upcomingExpirations?.length || 0}
          color="text-orange-400 bg-orange-500/20" borderColor="border-white/10" />
        <SummaryCard icon={<CheckCircle2 className="w-5 h-5" />} label="All Clear" value={
          (stats?.bySeverity?.CRITICAL || 0) === 0 && (stats?.bySeverity?.WARNING || 0) === 0 ? "Yes" : "No"
        } color={((stats?.bySeverity?.CRITICAL || 0) === 0 && (stats?.bySeverity?.WARNING || 0) === 0) ? "text-green-400 bg-green-500/20" : "text-slate-400 bg-slate-500/20"}
          borderColor="border-white/10" />
      </div>

      {/* By Entity Type */}
      {stats?.byEntityType && Object.keys(stats.byEntityType).length > 0 && (
        <div className="grid sm:grid-cols-4 gap-4">
          {Object.entries(stats.byEntityType).map(([entity, count]) => (
            <div key={entity} className="bg-white/5 rounded-xl border border-white/10 p-4 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-slate-400">
                {ENTITY_ICONS[entity] || <Shield className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-sm text-white font-medium">{count as number} alerts</p>
                <p className="text-xs text-slate-500">{entity}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Critical Alerts */}
      {critical.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
            <XCircle className="w-4 h-4" /> Critical — Immediate Action Required
          </h2>
          <div className="space-y-2">
            {critical.map(alert => (
              <AlertCard key={alert.id} alert={alert} onResolve={resolveMutation.mutate} onDismiss={dismissMutation.mutate} />
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {warnings.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Warnings — Expiring Soon
          </h2>
          <div className="space-y-2">
            {warnings.map(alert => (
              <AlertCard key={alert.id} alert={alert} onResolve={resolveMutation.mutate} onDismiss={dismissMutation.mutate} />
            ))}
          </div>
        </div>
      )}

      {/* Upcoming Expirations */}
      {stats?.upcomingExpirations?.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/10">
            <h2 className="font-semibold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gold" /> Upcoming Expirations (Next 7 Days)
            </h2>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-white/10">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Entity</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Type</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Expiry</th>
                <th className="text-left px-4 py-3 font-medium text-slate-400">Time Left</th>
              </tr>
            </thead>
            <tbody>
              {stats.upcomingExpirations.map((item: Alert) => (
                <tr key={item.id} className="border-b border-white/5">
                  <td className="px-4 py-3 text-white">{item.entityName}</td>
                  <td className="px-4 py-3 text-slate-400">{formatType(item.type)}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(item.expiryDate).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    <span className={new Date(item.expiryDate) <= new Date() ? "text-red-400 font-medium" : "text-yellow-400"}>
                      {daysUntil(item.expiryDate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* All Clear State */}
      {alerts.length === 0 && (
        <div className="text-center py-16">
          <Shield className="w-12 h-12 mx-auto mb-3 text-green-500/50" />
          <p className="text-lg font-medium text-white">All Compliant</p>
          <p className="text-sm text-slate-500 mt-1">No compliance issues found. Run a scan to check for new alerts.</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, color, borderColor }: {
  icon: React.ReactNode; label: string; value: number | string; color: string; borderColor: string;
}) {
  return (
    <div className={`bg-white/5 rounded-xl border ${borderColor} p-5`}>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color} mb-3`}>{icon}</div>
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function AlertCard({ alert, onResolve, onDismiss }: {
  alert: Alert; onResolve: (id: string) => void; onDismiss: (id: string) => void;
}) {
  return (
    <div className={`flex items-center justify-between p-4 rounded-xl border ${SEVERITY_COLORS[alert.severity]} bg-opacity-50`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
          {ENTITY_ICONS[alert.entityType] || <Shield className="w-4 h-4" />}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{alert.entityName}</p>
          <p className="text-xs text-slate-400">{formatType(alert.type)} &middot; Expires {new Date(alert.expiryDate).toLocaleDateString()} &middot; {daysUntil(alert.expiryDate)}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={() => onResolve(alert.id)} className="px-3 py-1 bg-green-500/20 text-green-400 rounded text-xs hover:bg-green-500/30">Resolve</button>
        <button onClick={() => onDismiss(alert.id)} className="px-3 py-1 bg-white/10 text-slate-400 rounded text-xs hover:bg-white/20">Dismiss</button>
      </div>
    </div>
  );
}
