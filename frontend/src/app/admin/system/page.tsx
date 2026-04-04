"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Globe, Truck, Shield, Mail, MapPin, AlertTriangle,
  CheckCircle2, XCircle, Database, Server, Clock, Users,
  Package, FileText, Activity,
} from "lucide-react";

interface Integration {
  name: string;
  key: string;
  configured: boolean;
  description: string;
}

interface CronJob {
  jobName: string;
  schedule: string;
  lastRun: string | null;
  nextRun: string | null;
  enabled: boolean;
  lastStatus: string | null;
}

interface DbStats {
  users: number;
  loads: number;
  invoices: number;
  carriers: number;
  customers: number;
}

interface SystemStatusResponse {
  integrations: Integration[];
  cronJobs: CronJob[];
  dbStats: DbStats;
  environment: {
    nodeVersion: string;
    env: string;
    uptime: number;
  };
}

const integrationIcons: Record<string, typeof Globe> = {
  DAT_API_KEY: Globe,
  HIGHWAY_API_KEY: Truck,
  FMCSA_WEB_KEY: Shield,
  RESEND_API_KEY: Mail,
  GOOGLE_MAPS_API_KEY: MapPin,
  SENTRY_DSN: AlertTriangle,
  FMCSA_INSURANCE: Shield,
  OFAC_SDN: Shield,
  NHTSA_VIN: Truck,
  SEC_EDGAR: Database,
  SAM_GOV: Shield,
  OPENCORPORATES: Globe,
  CROSS_REF: Activity,
  FMCSA_BULK: Server,
  CARRIER_OK_API_KEY: Globe,
  TRUCKSTOP_API_KEY: Truck,
  CH_ROBINSON_API_KEY: Globe,
  ECHO_API_KEY: Globe,
  UBER_FREIGHT_API_KEY: Package,
  PROJECT44_API_KEY: MapPin,
  SAMSARA_API_TOKEN: MapPin,
  MOTIVE_API_KEY: MapPin,
  NUMVERIFY_API_KEY: Activity,
  IRS_TIN_MATCH_API_KEY: FileText,
};

const dbStatIcons: { key: keyof DbStats; label: string; icon: typeof Users }[] = [
  { key: "users", label: "Users", icon: Users },
  { key: "loads", label: "Loads", icon: Package },
  { key: "invoices", label: "Invoices", icon: FileText },
  { key: "carriers", label: "Carriers", icon: Truck },
  { key: "customers", label: "Customers", icon: Users },
];

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDate(date: string | null) {
  if (!date) return "Never";
  return new Date(date).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminSystemPage() {
  const { data, isLoading } = useQuery<SystemStatusResponse>({
    queryKey: ["admin-system-status"],
    queryFn: () => api.get("/admin/system-status").then((r) => r.data),
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500 text-sm">Loading system status...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">System Configuration</h1>
        <p className="text-slate-400 text-sm mt-1">Integration status, cron jobs, and database overview</p>
      </div>

      {/* Integration Status Cards */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-gold" />
          Integration Status
          <span className="text-xs text-slate-500 font-normal ml-2">
            {data?.integrations.filter((i) => i.configured).length || 0} / {data?.integrations.length || 0} active
          </span>
        </h2>

        {/* Free APIs */}
        <p className="text-[10px] text-[#C9A84C] uppercase tracking-widest font-semibold mb-2">Free APIs (No Cost)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-6">
          {data?.integrations.filter((i) => ["FMCSA_WEB_KEY","FMCSA_INSURANCE","OFAC_SDN","NHTSA_VIN","SEC_EDGAR","SAM_GOV","OPENCORPORATES","CROSS_REF","FMCSA_BULK","RESEND_API_KEY","GOOGLE_MAPS_API_KEY","SENTRY_DSN"].includes(i.key)).map((integration) => {
            const Icon = integrationIcons[integration.key] || Globe;
            return (
              <div key={integration.key} className="bg-white/5 border border-white/10 rounded-xl p-4 flex items-start gap-3">
                <div className={`p-2 rounded-lg ${integration.configured ? "bg-emerald-500/10" : "bg-slate-500/10"}`}>
                  <Icon className={`w-4 h-4 ${integration.configured ? "text-emerald-400" : "text-slate-500"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-medium text-white truncate">{integration.name}</h3>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${integration.configured ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-500/20 text-slate-400"}`}>
                      {integration.configured ? <><CheckCircle2 className="w-2.5 h-2.5" /> Connected</> : <><XCircle className="w-2.5 h-2.5" /> Not Configured</>}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-0.5 truncate">{integration.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Paid APIs */}
        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold mb-2">Paid / Partner APIs (Requires API Key)</p>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {data?.integrations.filter((i) => !["FMCSA_WEB_KEY","FMCSA_INSURANCE","OFAC_SDN","NHTSA_VIN","SEC_EDGAR","SAM_GOV","OPENCORPORATES","CROSS_REF","FMCSA_BULK","RESEND_API_KEY","GOOGLE_MAPS_API_KEY","SENTRY_DSN"].includes(i.key)).map((integration) => {
            const Icon = integrationIcons[integration.key] || Globe;
            return (
              <div
                key={integration.key}
                className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-start gap-4"
              >
                <div className={`p-2.5 rounded-lg ${integration.configured ? "bg-emerald-500/10" : "bg-slate-500/10"}`}>
                  <Icon className={`w-5 h-5 ${integration.configured ? "text-emerald-400" : "text-slate-500"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-white truncate">{integration.name}</h3>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                        integration.configured
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-slate-500/20 text-slate-400"
                      }`}
                    >
                      {integration.configured ? (
                        <CheckCircle2 className="w-3 h-3" />
                      ) : (
                        <XCircle className="w-3 h-3" />
                      )}
                      {integration.configured ? "Connected" : "Not Configured"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{integration.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Cron Jobs */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gold" />
          Cron Jobs
        </h2>
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Job Name</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Schedule</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Last Run</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                  <th className="text-left px-4 py-3 text-slate-400 font-medium">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {!data?.cronJobs?.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No cron jobs registered
                    </td>
                  </tr>
                ) : (
                  data.cronJobs.map((job) => (
                    <tr key={job.jobName} className="border-b border-white/5 hover:bg-[#0F1117]">
                      <td className="px-4 py-3 text-white font-medium">{job.jobName}</td>
                      <td className="px-4 py-3 text-slate-300 font-mono text-xs">{job.schedule}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{formatDate(job.lastRun)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                            job.lastStatus === "SUCCESS"
                              ? "bg-emerald-500/20 text-emerald-300"
                              : job.lastStatus === "FAILED"
                              ? "bg-red-500/20 text-red-300"
                              : "bg-slate-500/20 text-slate-400"
                          }`}
                        >
                          {job.lastStatus || "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block w-2 h-2 rounded-full ${
                            job.enabled ? "bg-emerald-400" : "bg-slate-600"
                          }`}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Database Stats & Environment */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* DB Stats */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Database className="w-5 h-5 text-gold" />
            Database Stats
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {dbStatIcons.map(({ key, label, icon: StatIcon }) => (
              <div key={key} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <StatIcon className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-400">{label}</span>
                </div>
                <p className="text-xl font-bold text-white">
                  {data?.dbStats?.[key]?.toLocaleString() ?? "-"}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Environment */}
        <section>
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Server className="w-5 h-5 text-gold" />
            Environment
          </h2>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Node Version</span>
              <span className="text-sm text-white font-mono">{data?.environment?.nodeVersion ?? "-"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Environment</span>
              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                data?.environment?.env === "production"
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}>
                {data?.environment?.env ?? "-"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Uptime</span>
              <span className="text-sm text-white">{data?.environment?.uptime ? formatUptime(data.environment.uptime) : "-"}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
