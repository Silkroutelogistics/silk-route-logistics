"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Shield, Clock, User, Search, ChevronLeft, ChevronRight,
  Activity, FileText, Truck, Package, Users, DollarSign, Zap,
  Monitor, LogIn,
} from "lucide-react";

interface AuditLog {
  id: string;
  userId: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string };
}

interface LoginActivityLog {
  id: string;
  userId: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  changes: string | null;
  user: { firstName: string; lastName: string; email: string; role: string };
}

interface AuditStats {
  byAction: { action: string; count: number }[];
  byEntity: { entity: string; count: number }[];
  timeline: { date: string; count: number }[];
}

const ENTITY_ICONS: Record<string, React.ReactNode> = {
  LOAD: <Package className="w-4 h-4 text-blue-400" />,
  INVOICE: <FileText className="w-4 h-4 text-green-400" />,
  CARRIER: <Truck className="w-4 h-4 text-purple-400" />,
  USER: <Users className="w-4 h-4 text-gold" />,
  DRIVER: <User className="w-4 h-4 text-cyan-400" />,
  TRUCK: <Truck className="w-4 h-4 text-orange-400" />,
  PAYMENT: <DollarSign className="w-4 h-4 text-emerald-400" />,
  EDI: <Zap className="w-4 h-4 text-yellow-400" />,
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-500/20 text-green-400",
  UPDATE: "bg-blue-500/20 text-blue-400",
  DELETE: "bg-red-500/20 text-red-400",
  LOGIN: "bg-purple-500/20 text-purple-400",
  APPROVE: "bg-emerald-500/20 text-emerald-400",
  REJECT: "bg-red-500/20 text-red-400",
  TENDER: "bg-gold/20 text-gold",
  STATUS_CHANGE: "bg-cyan-500/20 text-cyan-400",
};

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  let browser = "Unknown Browser";
  let os = "Unknown OS";

  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome/i.test(ua)) browser = "Safari";

  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS/i.test(ua)) os = "macOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad/i.test(ua)) os = "iOS";

  return `${browser} / ${os}`;
}

export default function AuditLogPage() {
  const [activeTab, setActiveTab] = useState<"all" | "login">("all");
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // Login activity state
  const [loginPage, setLoginPage] = useState(1);
  const [loginSearch, setLoginSearch] = useState("");

  const { data: logsData, isLoading } = useQuery({
    queryKey: ["audit-logs", page, actionFilter, entityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("limit", "25");
      if (actionFilter) params.set("action", actionFilter);
      if (entityFilter) params.set("entity", entityFilter);
      return api.get<{ logs: AuditLog[]; total: number; page: number; totalPages: number }>(`/audit/logs?${params}`).then((r) => r.data);
    },
    enabled: activeTab === "all",
  });

  const { data: loginData, isLoading: loginLoading } = useQuery({
    queryKey: ["login-activity", loginPage],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("page", loginPage.toString());
      params.set("limit", "25");
      return api.get<{ logs: LoginActivityLog[]; total: number; page: number; totalPages: number }>(`/audit/login-activity?${params}`).then((r) => r.data);
    },
    enabled: activeTab === "login",
  });

  const { data: stats } = useQuery({
    queryKey: ["audit-stats"],
    queryFn: () => api.get<AuditStats>("/audit/stats").then((r) => r.data),
  });

  const logs = logsData?.logs || [];
  const filtered = searchQuery
    ? logs.filter((l) =>
        l.user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.user.firstName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.details || "").toLowerCase().includes(searchQuery.toLowerCase())
      )
    : logs;

  const loginLogs = loginData?.logs || [];
  const filteredLogin = loginSearch
    ? loginLogs.filter((l) =>
        l.user.email.toLowerCase().includes(loginSearch.toLowerCase()) ||
        l.user.firstName.toLowerCase().includes(loginSearch.toLowerCase()) ||
        l.user.lastName.toLowerCase().includes(loginSearch.toLowerCase())
      )
    : loginLogs;

  const uniqueActions = stats?.byAction.map((a) => a.action) || [];
  const uniqueEntities = stats?.byEntity.map((e) => e.entity) || [];
  const totalActions = stats?.byAction.reduce((s, a) => s + a.count, 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Log</h1>
          <p className="text-slate-400 text-sm mt-1">{logsData?.total || 0} total events tracked</p>
        </div>
      </div>

      {/* Tab Selector */}
      <div className="flex gap-2">
        <button
          onClick={() => { setActiveTab("all"); setPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === "all"
              ? "bg-gold/20 text-gold border border-gold/30"
              : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
          }`}
        >
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4" />
            All Activity
          </div>
        </button>
        <button
          onClick={() => { setActiveTab("login"); setLoginPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === "login"
              ? "bg-gold/20 text-gold border border-gold/30"
              : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"
          }`}
        >
          <div className="flex items-center gap-2">
            <LogIn className="w-4 h-4" />
            Login Activity
          </div>
        </button>
      </div>

      {activeTab === "all" && (
        <>
          {/* Stats Cards */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-gold" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{totalActions}</p>
                  <p className="text-xs text-slate-400">Total Events</p>
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{uniqueActions.length}</p>
                  <p className="text-xs text-slate-400">Action Types</p>
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Package className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{uniqueEntities.length}</p>
                  <p className="text-xs text-slate-400">Entity Types</p>
                </div>
              </div>
            </div>
            <div className="bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{stats?.timeline.length || 0}</p>
                  <p className="text-xs text-slate-400">Active Days (30d)</p>
                </div>
              </div>
            </div>
          </div>

          {/* Activity Breakdown */}
          {stats && (stats.byAction.length > 0 || stats.byEntity.length > 0) && (
            <div className="grid sm:grid-cols-2 gap-4">
              {stats.byAction.length > 0 && (
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">By Action</h3>
                  <div className="space-y-2">
                    {stats.byAction.slice(0, 8).map((a) => (
                      <div key={a.action} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[a.action] || "bg-white/10 text-slate-300"}`}>
                            {a.action}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-gold rounded-full" style={{ width: `${(a.count / totalActions) * 100}%` }} />
                          </div>
                          <span className="text-xs text-white font-medium w-8 text-right">{a.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {stats.byEntity.length > 0 && (
                <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">By Entity</h3>
                  <div className="space-y-2">
                    {stats.byEntity.slice(0, 8).map((e) => (
                      <div key={e.entity} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {ENTITY_ICONS[e.entity] || <Activity className="w-4 h-4 text-slate-400" />}
                          <span className="text-xs text-white">{e.entity}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(e.count / totalActions) * 100}%` }} />
                          </div>
                          <span className="text-xs text-white font-medium w-8 text-right">{e.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by user, action, or details..."
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
            <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
              <option value="" className="bg-navy">All Actions</option>
              {uniqueActions.map((a) => (
                <option key={a} value={a} className="bg-navy">{a}</option>
              ))}
            </select>
            <select value={entityFilter} onChange={(e) => { setEntityFilter(e.target.value); setPage(1); }}
              className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
              <option value="" className="bg-navy">All Entities</option>
              {uniqueEntities.map((e) => (
                <option key={e} value={e} className="bg-navy">{e}</option>
              ))}
            </select>
          </div>

          {/* Log Entries */}
          {isLoading ? (
            <p className="text-slate-400 text-center py-12">Loading...</p>
          ) : (
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Timestamp</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">User</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Action</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Entity</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Details</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map((log) => (
                      <tr key={log.id} className="hover:bg-white/5 transition">
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {new Date(log.createdAt).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>
                            <p className="text-xs text-white">{log.user.firstName} {log.user.lastName}</p>
                            <p className="text-[10px] text-slate-500">{log.user.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] || "bg-white/10 text-slate-300"}`}>
                            {log.action}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {ENTITY_ICONS[log.entity] || <Activity className="w-4 h-4 text-slate-400" />}
                            <span className="text-xs text-white">{log.entity}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 max-w-[300px] truncate">{log.details || "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{log.ipAddress || "—"}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500">No audit logs found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {logsData && logsData.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                  <p className="text-xs text-slate-500">
                    Page {logsData.page} of {logsData.totalPages} ({logsData.total} entries)
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
                      className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition disabled:opacity-30 flex items-center gap-1">
                      <ChevronLeft className="w-3 h-3" /> Previous
                    </button>
                    <button onClick={() => setPage(Math.min(logsData.totalPages, page + 1))} disabled={page === logsData.totalPages}
                      className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition disabled:opacity-30 flex items-center gap-1">
                      Next <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === "login" && (
        <>
          {/* Login Activity Search */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input value={loginSearch} onChange={(e) => setLoginSearch(e.target.value)} placeholder="Search by user name or email..."
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
          </div>

          {/* Login Activity Table */}
          {loginLoading ? (
            <p className="text-slate-400 text-center py-12">Loading...</p>
          ) : (
            <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10">
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Timestamp</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">User</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Role</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">IP Address</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Browser / Device</th>
                      <th className="text-left px-4 py-3 text-xs text-slate-400 font-medium">Note</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredLogin.map((log) => (
                      <tr key={log.id} className="hover:bg-white/5 transition">
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3 h-3" />
                            {new Date(log.createdAt).toLocaleString()}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>
                            <p className="text-xs text-white">{log.user.firstName} {log.user.lastName}</p>
                            <p className="text-[10px] text-slate-500">{log.user.email}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
                            {log.user.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap font-mono">{log.ipAddress || "—"}</td>
                        <td className="px-4 py-3 text-xs text-slate-400 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Monitor className="w-3 h-3" />
                            {parseUserAgent(log.userAgent)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500">{log.changes || "—"}</td>
                      </tr>
                    ))}
                    {filteredLogin.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-slate-500">No login activity found</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {loginData && loginData.totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
                  <p className="text-xs text-slate-500">
                    Page {loginData.page} of {loginData.totalPages} ({loginData.total} entries)
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setLoginPage(Math.max(1, loginPage - 1))} disabled={loginPage === 1}
                      className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition disabled:opacity-30 flex items-center gap-1">
                      <ChevronLeft className="w-3 h-3" /> Previous
                    </button>
                    <button onClick={() => setLoginPage(Math.min(loginData.totalPages, loginPage + 1))} disabled={loginPage === loginData.totalPages}
                      className="px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition disabled:opacity-30 flex items-center gap-1">
                      Next <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
