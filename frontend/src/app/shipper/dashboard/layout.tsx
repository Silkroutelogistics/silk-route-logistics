"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperSidebar } from "@/components/shipper";
import { Search, Bell, X } from "lucide-react";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { Logo } from "@/components/ui/Logo";

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function ShipperDashboardLayout({ children }: { children: React.ReactNode }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const { token, user, loadUser } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const { showWarning, countdown, extendSession, forceLogout } = useSessionTimeout({
    timeoutMs: 60 * 60 * 1000,
    warningBeforeMs: 2 * 60 * 1000,
    loginPath: "/shipper/login",
  });

  const { data: notifData } = useQuery({
    queryKey: ["shipper-notifications"],
    queryFn: () => api.get<{ notifications: Notification[] }>("/notifications").then((r) => r.data),
    enabled: !!token,
    refetchInterval: 120000,
  });

  const notifications = notifData?.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!token) {
      router.replace("/shipper/login");
      return;
    }
    if (!user) {
      loadUser().finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, [token, user, loadUser, router]);

  if (!token || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F8FA]">
        <div className="text-center">
          <Logo size="lg" />
          <p className="mt-4 text-sm text-gray-400 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  const initials = user ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}` : "JD";

  return (
    <div className="flex h-screen bg-[#F7F8FA] overflow-hidden">
      <ShipperSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Search size={16} className="text-gray-400" />
            <input
              placeholder="Search shipments, quotes, invoices..."
              className="border-none outline-none text-[13px] text-gray-700 w-[280px] bg-transparent"
            />
          </div>
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="relative">
                <Bell size={19} className="text-gray-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute top-8 right-0 w-80 bg-white rounded-lg shadow-[0_12px_40px_rgba(13,27,42,0.15)] border border-gray-200 z-[100]">
                  <div className="flex justify-between items-center px-3 py-2 border-b border-gray-100">
                    <span className="text-[13px] font-bold text-[#0D1B2A]">Notifications</span>
                    <button onClick={() => setNotifOpen(false)}><X size={14} className="text-gray-400" /></button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-gray-400">No notifications</div>
                  ) : (
                    notifications.slice(0, 10).map((n) => (
                      <div key={n.id} className={`px-3 py-2.5 border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${!n.read ? "bg-blue-50/50" : ""}`}>
                        <div className="text-xs text-gray-700 leading-snug">{n.message || n.title}</div>
                        <div className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            {/* Avatar */}
            <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-[#0D1B2A] to-[#1B2D45] flex items-center justify-center text-xs font-bold text-[#C9A84C] border-2 border-[#C9A84C]/30 cursor-pointer">
              {initials}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>

      {/* Session timeout warning modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center">
          <div className="bg-[#121e30] border border-[rgba(200,150,62,0.2)] rounded-2xl p-9 max-w-[420px] w-[90%] text-center shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[rgba(202,138,4,0.12)] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ca8a04" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h3 className="text-[#e8edf2] text-lg font-semibold mb-2">Session Expiring</h3>
            <p className="text-[#7a9ab5] text-sm leading-relaxed mb-6">
              Your session is about to expire due to inactivity. You will be logged out in <strong className="text-[#ca8a04]">{countdown}</strong>.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={extendSession} className="px-6 py-2.5 text-sm font-semibold bg-gradient-to-br from-[#c8a951] to-[#b8963e] text-[#0D1B2A] rounded-lg hover:shadow-[0_4px_20px_rgba(200,150,62,0.25)] transition-all">
                Extend Session
              </button>
              <button onClick={forceLogout} className="px-6 py-2.5 text-sm font-medium bg-transparent text-[#6a8090] border border-[#243447] rounded-lg hover:bg-[rgba(200,150,62,0.05)] transition-all">
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
