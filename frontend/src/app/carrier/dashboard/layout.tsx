"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierSidebar } from "@/components/carrier";
import { Search, Bell, X, LogOut } from "lucide-react";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";
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
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function CarrierDashboardLayout({ children }: { children: React.ReactNode }) {
  const [notifOpen, setNotifOpen] = useState(false);
  const { token, user, loadUser, logout } = useCarrierAuth();
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  const { data: notifData } = useQuery({
    queryKey: ["carrier-notifications"],
    queryFn: () => api.get<{ notifications: Notification[] }>("/notifications").then((r) => r.data),
    enabled: !!token,
    refetchInterval: 120000,
  });

  const notifications = notifData?.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!token) {
      router.replace("/carrier/login");
      return;
    }
    // Set auth header for carrier token
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
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

  const initials = user ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}` : "C";
  const companyName = user?.carrierProfile?.companyName || user?.company || "";

  return (
    <div className="flex h-screen bg-[#F7F8FA] overflow-hidden">
      <CarrierSidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Search size={16} className="text-gray-400" />
            <input
              placeholder="Search loads, documents, payments..."
              className="border-none outline-none text-[13px] text-gray-700 w-[280px] bg-transparent"
            />
          </div>
          <div className="flex items-center gap-4">
            {/* Company name */}
            {companyName && (
              <span className="text-xs text-gray-400 font-medium">{companyName}</span>
            )}
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
            {/* Avatar + Logout */}
            <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-xs font-bold text-[#0D1B2A] border-2 border-[#C9A84C]/30 cursor-pointer">
              {initials}
            </div>
            <button onClick={logout} className="text-gray-400 hover:text-red-500" title="Logout">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
