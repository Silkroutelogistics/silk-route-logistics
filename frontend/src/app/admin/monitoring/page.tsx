"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Activity, Server, Database, Clock, Cpu, HardDrive,
  AlertTriangle, CheckCircle2, Users, Truck, FileText,
  RefreshCw, ChevronLeft, ChevronRight, Shield, Eye,
} from "lucide-react";
import Link from "next/link";
import { useAuthStore } from "@/hooks/useAuthStore";

interface HealthData {
  status: string;
  uptime: number;
  timestamp: string;
  version: string;
  node: string;
  environment: string;
  database: { connected: boolean };
  memory: { rss: string; heapUsed: string; heapTotal: string };
  counts: { users: number; loads: number; invoices: number };
}

interface SystemLog {
  id: string;
  type: string;
  severity: string;
  message: string;
  metadata: any;
  userId: string | null;
  createdAt: string;
}

interface AuditEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  details: any;
  ipAddress: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string; role: string };
}

const SEVERITY_COLORS: Record<string, string> = {
  DEBUG: "bg-slate-500/20 text-slate-400",
  INFO: "bg-blue-500/20 text-blue-400",
  WARN: "bg-yellow-500/20 text-yellow-400",
  ERROR: "bg-red-500/20 text-red-400",
  CRITICAL: "bg-red-700/20 text-red-300",
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

export default function MonitoringPage() {
  const { user } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<"overview" | "logs" | "audit">("overview");
  const [logPage, setLogPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  useEffect(() => setMounted(true), []);

  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery<HealthData>({
    queryKey: ["health-detailed"],
    queryFn: () => api.get("/health/detailed").then(r => r.data),
    refetchInterval: 30000,
  });

  const { data: logsData } = useQuery({
    queryKey: ["system-logs", logPage],
    queryFn: () => api.get<{ logs: SystemLog[]; total: number; totalPages: number }>(`/system-logs?page=${logPage}`).then(r => r.data),
    enabled: tab === "logs",
  });

  const { data: auditData } = useQuery({
    queryKey: ["audit-trail", auditPage],
    queryFn: () => api.get<{ entries: AuditEntry[]; total: number; totalPages: number }>(`/audit-trail?page=${auditPage}`).then(r => r.data),
    enabled: tab === "audit",
  });

  if (user?.role !== "ADMIN") {
    return (
      <div className="min-h-screen bg-[#0f172a] flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <p className="text-white text-lg font-medium">Admin Access Required</p>
          <p className="text-slate-400 text-sm mt-1">This page is restricted to administrators.</p>
          <Link href="/dashboard/overview" className="text-[#C8963E] text-sm mt-4 inline-block hover:underline">Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-[#0f172a] p-8 transition-all duration-500 ${mounted ? "opacity-100" : "opacity-0"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="w-6 h-6 text-green-400" /> System Monitoring
          </h1>
          <p className="text-sm text-slate-400 mt-1">Real-time health, system logs, and audit trail</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/dashboard/overview" className="px-3 py-1.5 bg-white/5 text-slate-400 rounded-lg text-sm hover:bg-white/10 transition">
            Back to Dashboard
          </Link>
          <button onClick={() => refetchHealth()} className="px-3 py-1.5 bg-white/5 text-slate-400 rounded-lg text-sm hover:bg-white/10 transition flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* Status Banner */}
      {health && (
        <div className={`mb-6 rounded-xl px-5 py-4 flex items-center gap-3 border ${
          health.status === "healthy"
            ? "bg-green-500/5 border-green-500/20"
            : "bg-yellow-500/5 border-yellow-500/20"
        }`}>
          {health.status === "healthy" ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          )}
          <span className={`text-sm font-medium ${health.status === "healthy" ? "text-green-400" : "text-yellow-400"}`}>
            System {health.status === "healthy" ? "Healthy" : "Degraded"}
          </span>
          <span className="text-xs text-slate-500 ml-auto">Last checked: {new Date(health.timestamp).toLocaleTimeString()}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 bg-white/5 rounded-lg p-1 w-fit">
        {[
          { id: "overview" as const, label: "Overview", icon: Server },
          { id: "logs" as const, label: "System Logs", icon: FileText },
          { id: "audit" as const, label: "Audit Trail", icon: Eye },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm transition ${
              tab === t.id ? "bg-white/10 text-white font-medium" : "text-slate-400 hover:text-white"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* KPI Grid */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Uptime", value: health ? formatUptime(health.uptime) : "—", icon: Clock, color: "text-green-400", bg: "bg-green-500/10" },
              { label: "Node Version", value: health?.node || "—", icon: Server, color: "text-blue-400", bg: "bg-blue-500/10" },
              { label: "Environment", value: health?.environment || "—", icon: Cpu, color: "text-purple-400", bg: "bg-purple-500/10" },
              { label: "Database", value: health?.database?.connected ? "Connected" : "Disconnected", icon: Database, color: health?.database?.connected ? "text-green-400" : "text-red-400", bg: health?.database?.connected ? "bg-green-500/10" : "bg-red-500/10" },
            ].map(kpi => (
              <div key={kpi.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  </div>
                  <span className="text-xs text-slate-400">{kpi.label}</span>
                </div>
                <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
              </div>
            ))}
          </div>

          {/* Memory & Counts */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white/5 border border-white/5 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-cyan-400" /> Memory Usage
              </h3>
              <div className="space-y-3">
                {health?.memory && Object.entries(health.memory).map(([key, val]) => (
                  <div key={key} className="flex justify-between items-center">
                    <span className="text-xs text-slate-400 capitalize">{key === "rss" ? "RSS" : key.replace(/([A-Z])/g, " $1")}</span>
                    <span className="text-sm text-white font-medium">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/5 border border-white/5 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                <Database className="w-4 h-4 text-[#C8963E]" /> Database Counts
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Total Users", value: health?.counts?.users ?? 0, icon: Users, color: "text-blue-400" },
                  { label: "Total Loads", value: health?.counts?.loads ?? 0, icon: Truck, color: "text-green-400" },
                  { label: "Total Invoices", value: health?.counts?.invoices ?? 0, icon: FileText, color: "text-yellow-400" },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                      <span className="text-xs text-slate-400">{item.label}</span>
                    </div>
                    <span className="text-sm text-white font-medium">{item.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Logs Tab */}
      {tab === "logs" && (
        <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Time</th>
                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Severity</th>
                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Type</th>
                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {logsData?.logs?.length ? (
                logsData.logs.map(log => (
                  <tr key={log.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full ${SEVERITY_COLORS[log.severity] || SEVERITY_COLORS.INFO}`}>{log.severity}</span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-300">{log.type.replace("_", " ")}</td>
                    <td className="px-5 py-3 text-sm text-white truncate max-w-md">{log.message}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={4} className="px-5 py-12 text-center text-sm text-slate-500">No system logs found</td></tr>
              )}
            </tbody>
          </table>
          {logsData && logsData.totalPages > 1 && (
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <p className="text-xs text-slate-500">{logsData.total} total logs</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setLogPage(p => Math.max(1, p - 1))} disabled={logPage === 1} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs text-slate-400">Page {logPage} of {logsData.totalPages}</span>
                <button onClick={() => setLogPage(p => Math.min(logsData.totalPages, p + 1))} disabled={logPage === logsData.totalPages} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Audit Trail Tab */}
      {tab === "audit" && (
        <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/5">
                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Time</th>
                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">User</th>
                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Action</th>
                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Entity</th>
                <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {auditData?.entries?.length ? (
                auditData.entries.map(entry => (
                  <tr key={entry.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{new Date(entry.createdAt).toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-white">{entry.user.firstName} {entry.user.lastName}</p>
                      <p className="text-[10px] text-slate-500">{entry.user.role}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        entry.action === "CREATE" ? "bg-green-500/20 text-green-400" :
                        entry.action === "UPDATE" ? "bg-blue-500/20 text-blue-400" :
                        entry.action === "DELETE" ? "bg-red-500/20 text-red-400" :
                        "bg-slate-500/20 text-slate-400"
                      }`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-slate-300">{entry.entityType}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{entry.entityId.slice(0, 12)}...</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">{entry.ipAddress || "—"}</td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-500">No audit entries found</td></tr>
              )}
            </tbody>
          </table>
          {auditData && auditData.totalPages > 1 && (
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
              <p className="text-xs text-slate-500">{auditData.total} total entries</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setAuditPage(p => Math.max(1, p - 1))} disabled={auditPage === 1} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                <span className="text-xs text-slate-400">Page {auditPage} of {auditData.totalPages}</span>
                <button onClick={() => setAuditPage(p => Math.min(auditData.totalPages, p + 1))} disabled={auditPage === auditData.totalPages} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
