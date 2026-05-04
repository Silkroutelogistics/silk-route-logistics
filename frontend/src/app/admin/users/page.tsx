"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search, UserCheck, UserX, KeyRound, Shield,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import type { User } from "@/types/entities";

interface UsersResponse {
  users: User[];
  total: number;
  page: number;
  totalPages: number;
}

const ROLES = ["ALL", "ADMIN", "BROKER", "DISPATCH", "OPERATIONS", "CARRIER", "SHIPPER"] as const;
const STATUSES = ["ALL", "ACTIVE", "INACTIVE"] as const;

const roleBadgeColors: Record<string, string> = {
  ADMIN: "bg-purple-500/20 text-purple-300",
  BROKER: "bg-blue-500/20 text-blue-300",
  DISPATCH: "bg-cyan-500/20 text-cyan-300",
  OPERATIONS: "bg-teal-500/20 text-teal-300",
  CARRIER: "bg-orange-500/20 text-orange-300",
  SHIPPER: "bg-green-500/20 text-green-300",
  ACCOUNTING: "bg-yellow-500/20 text-yellow-300",
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [confirmAction, setConfirmAction] = useState<{ type: "status" | "reset"; userId: string; userName: string; currentActive?: boolean } | null>(null);

  const { data, isLoading } = useQuery<UsersResponse>({
    queryKey: ["admin-users", search, roleFilter, statusFilter, page],
    queryFn: () =>
      api
        .get("/admin/users", {
          params: {
            search: search || undefined,
            role: roleFilter !== "ALL" ? roleFilter : undefined,
            status: statusFilter !== "ALL" ? statusFilter : undefined,
            page,
            limit: 20,
          },
        })
        .then((r) => r.data),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ userId, active }: { userId: string; active: boolean }) =>
      api.patch(`/admin/users/${userId}/status`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setConfirmAction(null);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (userId: string) =>
      api.post(`/admin/users/${userId}/reset-password`),
    onSuccess: () => {
      setConfirmAction(null);
    },
  });

  const formatDate = (date: string | null) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">User Management</h1>
        <p className="text-slate-400 text-sm mt-1">Manage platform users, roles, and access</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[250px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-gold/50 focus:ring-1 focus:ring-gold/30"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
          className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 appearance-none cursor-pointer"
        >
          {ROLES.map((r) => (
            <option key={r} value={r} className="bg-[#0F1117]">
              {r === "ALL" ? "All Roles" : r}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 appearance-none cursor-pointer"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s} className="bg-[#0F1117]">
              {s === "ALL" ? "All Statuses" : s}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Role</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">2FA</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Last Login</th>
                <th className="text-right px-4 py-3 text-slate-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    Loading users...
                  </td>
                </tr>
              ) : !data?.users?.length ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    No users found
                  </td>
                </tr>
              ) : (
                data.users.map((user) => (
                  <tr key={user.id} className="border-b border-white/5 hover:bg-[#0F1117]">
                    <td className="px-4 py-3 text-white font-medium">
                      {user.firstName} {user.lastName}
                    </td>
                    <td className="px-4 py-3 text-slate-300">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${roleBadgeColors[user.role] || "bg-slate-500/20 text-slate-300"}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.isActive
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-red-500/20 text-red-300"
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? "bg-emerald-400" : "bg-red-400"}`} />
                        {user.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {user.totpEnabled ? (
                        <Shield className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <span className="text-slate-400 text-xs">Off</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {formatDate(user.lastLogin ?? null)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() =>
                            setConfirmAction({
                              type: "status",
                              userId: user.id,
                              userName: `${user.firstName} ${user.lastName}`,
                              currentActive: user.isActive,
                            })
                          }
                          className={`p-1.5 rounded-md transition ${
                            user.isActive
                              ? "text-red-400 hover:bg-red-500/10"
                              : "text-emerald-400 hover:bg-emerald-500/10"
                          }`}
                          title={user.isActive ? "Deactivate" : "Activate"}
                        >
                          {user.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() =>
                            setConfirmAction({
                              type: "reset",
                              userId: user.id,
                              userName: `${user.firstName} ${user.lastName}`,
                            })
                          }
                          className="p-1.5 rounded-md text-amber-400 hover:bg-amber-500/10 transition"
                          title="Reset Password"
                        >
                          <KeyRound className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-white/10">
            <span className="text-xs text-slate-500">
              Showing page {data.page} of {data.totalPages} ({data.total} total users)
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page >= data.totalPages}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 ">
          <div className="bg-[#0F1117] border border-white/10 rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-white mb-2">
              {confirmAction.type === "status"
                ? confirmAction.currentActive
                  ? "Deactivate User"
                  : "Activate User"
                : "Reset Password"}
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              {confirmAction.type === "status"
                ? `Are you sure you want to ${confirmAction.currentActive ? "deactivate" : "activate"} ${confirmAction.userName}? ${
                    confirmAction.currentActive
                      ? "They will no longer be able to log in."
                      : "They will be able to log in again."
                  }`
                : `Are you sure you want to reset the password for ${confirmAction.userName}? A temporary password will be generated.`}
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 text-sm text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmAction.type === "status") {
                    toggleStatusMutation.mutate({
                      userId: confirmAction.userId,
                      active: !confirmAction.currentActive,
                    });
                  } else {
                    resetPasswordMutation.mutate(confirmAction.userId);
                  }
                }}
                disabled={toggleStatusMutation.isPending || resetPasswordMutation.isPending}
                className={`px-4 py-2 text-sm rounded-lg font-medium transition disabled:opacity-50 ${
                  confirmAction.type === "status" && confirmAction.currentActive
                    ? "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                    : "bg-gold/20 text-gold hover:bg-gold/30"
                }`}
              >
                {toggleStatusMutation.isPending || resetPasswordMutation.isPending
                  ? "Processing..."
                  : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
