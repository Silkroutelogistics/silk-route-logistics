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
import { AuthRefreshBanner } from "@/components/ui/AuthRefreshBanner";
import { ShipperChatbot } from "@/components/shipper/ShipperChatbot";
import type { Notification } from "@/types/entities";

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
  const { user, loadUser } = useAuthStore();
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
    enabled: !!user,
    refetchInterval: 120000,
  });

  const notifications = notifData?.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    // Sprint 174 (v3.8.acf) Layer α — defense-in-depth role gate. AE
    // dashboard layout uses AuthGuard for this (bounces non-AE roles
    // to their portals); shipper portal needed the same check. A user
    // whose role !== "SHIPPER" landing here means Layers β + γ both
    // failed — log out to clear cookie + state, then bounce.
    const bounceIfWrongRole = (u: { role?: string } | null) => {
      if (u && u.role !== "SHIPPER") {
        api.post("/auth/logout").catch(() => {});
        useAuthStore.getState().clearAuth();
        router.replace("/shipper/login");
        return true;
      }
      return false;
    };

    if (!user) {
      loadUser().then(() => {
        const currentUser = useAuthStore.getState().user;
        if (!currentUser) {
          router.replace("/shipper/login");
          return;
        }
        if (bounceIfWrongRole(currentUser)) return;
        setChecking(false);
      });
    } else {
      if (bounceIfWrongRole(user)) return;
      setChecking(false);
    }
  }, [user, loadUser, router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FBF7F0]">
        <div className="text-center">
          <Logo size="lg" />
          <p className="mt-4 text-sm text-gray-400 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  const initials = user ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}` : "JD";

  return (
    <div className="flex h-screen bg-[#FBF7F0] overflow-hidden">
      <ShipperSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-[#EFE6D3] flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Search size={16} className="text-gray-400 shrink-0" />
            <input
              placeholder="Search shipments, quotes, invoices..."
              className="border-none outline-none text-[13px] text-gray-700 w-full max-w-[280px] bg-transparent"
            />
          </div>
          <div className="flex items-center gap-4">
            {/* Notifications */}
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="relative">
                <Bell size={19} className="text-gray-500" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#9B2C2C] text-[#FBF7F0] text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <div className="absolute top-8 right-0 w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-lg shadow-[0_12px_40px_rgba(10,37,64,0.15)] border border-[#EFE6D3] z-[100]">
                  <div className="flex justify-between items-center px-3 py-2 border-b border-[#EFE6D3]">
                    <span className="text-[13px] font-bold text-[#0A2540]">Notifications</span>
                    <button onClick={() => setNotifOpen(false)}><X size={14} className="text-gray-400" /></button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-gray-400">No notifications</div>
                  ) : (
                    notifications.slice(0, 10).map((n) => (
                      <div key={n.id} className={`px-3 py-2.5 border-b border-[#F5EEE0] cursor-pointer hover:bg-[#FBF7F0] ${!n.read ? "bg-[#E2EAF2]/60" : ""}`}>
                        <div className="text-xs text-gray-700 leading-snug">{n.message || n.title}</div>
                        <div className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
            {/* Avatar */}
            <div className="w-[34px] h-[34px] rounded-full bg-[#C5A572] flex items-center justify-center text-xs font-bold text-[#0A2540] border-2 border-[#C5A572]/40 cursor-pointer">
              {initials}
            </div>
          </div>
        </header>

        {/* Post-Sprint-53 auth refresh banner (auto-expires 24h post-deploy) */}
        <AuthRefreshBanner />

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>

      {/* Shipper AI Assistant */}
      <ShipperChatbot />

      {/* Session timeout warning modal */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50  z-[99999] flex items-center justify-center">
          <div className="bg-white border border-[#EFE6D3] rounded-2xl p-9 max-w-[420px] w-[90%] text-center shadow-[0_20px_60px_rgba(10,37,64,0.18)]">
            <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#FBEFD4] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#B07A1A" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h3 className="text-[#0A2540] text-lg font-semibold mb-2">Session Expiring</h3>
            <p className="text-[#3A4A5F] text-sm leading-relaxed mb-6">
              Your session is about to expire due to inactivity. You will be logged out in <strong className="text-[#9B2C2C]">{countdown}</strong>.
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={extendSession} className="px-6 py-2.5 text-sm font-semibold bg-[#BA7517] text-[#FBF7F0] rounded-lg hover:bg-[#854F0B] transition-all">
                Extend Session
              </button>
              <button onClick={forceLogout} className="px-6 py-2.5 text-sm font-medium bg-transparent text-[#3A4A5F] border border-[#EFE6D3] rounded-lg hover:bg-[#FBF7F0] transition-all">
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
