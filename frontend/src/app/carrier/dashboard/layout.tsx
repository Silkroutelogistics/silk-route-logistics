"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierSidebar } from "@/components/carrier";
import { Search, Bell, X, LogOut, Clock, FileSignature, ChevronRight } from "lucide-react";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { Logo } from "@/components/ui/Logo";
import { AuthRefreshBanner } from "@/components/ui/AuthRefreshBanner";
import { MarcoPolo } from "@/components/MarcoPolo";
import type { Notification } from "@/types/entities";

// v3.8.ajd Sprint 1 — Non-APPROVED carriers may log in but are confined
// to /carrier/dashboard/application-status. The layout enforces this
// client-side; per-route APPROVED checks at the backend (carrierLoads.ts
// :31/169, etc.) defend against a malicious or stale-tab carrier hitting
// load endpoints directly. SUSPENDED never reaches this layout — login
// is hard-blocked at the OTP/TOTP gates in carrierAuth.ts.
const STATUS_PAGE = "/carrier/dashboard/application-status";

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
  const { user, loadUser, logout } = useCarrierAuth();
  const [checking, setChecking] = useState(true);
  const router = useRouter();
  const pathname = usePathname();
  const { showWarning, countdown, extendSession } = useSessionTimeout({
    // audit F2 — unified to 60 min (was an undocumented 45) to match the shipper
    // portal + the useSessionTimeout default: one inactivity policy across portals.
    timeoutMs: 60 * 60 * 1000,
    warningBeforeMs: 2 * 60 * 1000,
    loginPath: "/carrier/login",
    onLogout: logout,
  });

  // v3.8.ajd Sprint 1 — Only poll notifications when carrier is APPROVED.
  // Non-APPROVED carriers see a single status page; no notifications
  // surface, no polling. Saves a 2-minute interval network call.
  const { data: notifData } = useQuery({
    queryKey: ["carrier-notifications"],
    queryFn: () => api.get<{ notifications: Notification[] }>("/notifications").then((r) => r.data),
    enabled: !!user && user.carrierProfile?.onboardingStatus === "APPROVED",
    refetchInterval: 120000,
  });

  // Track 1.1b — Activation gate. APPROVED carriers who haven't signed the
  // Broker-Carrier Agreement get a persistent banner driving them to the
  // activation step. Shares the activation page's query key, so signing there
  // clears the banner immediately. Tendering is independently hard-gated by
  // complianceMonitorService — this banner is a UX nudge, not the enforcement.
  const { data: activationData } = useQuery({
    queryKey: ["carrier-activation"],
    queryFn: () => api.get<{ requiresActivation: boolean }>("/carrier-auth/activation-status").then((r) => r.data),
    enabled: !!user && user.carrierProfile?.onboardingStatus === "APPROVED",
  });

  const notifications = notifData?.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    if (!user) {
      loadUser().then(() => {
        const currentUser = useCarrierAuth.getState().user;
        if (!currentUser) {
          // Sprint 66 (v3.8.afu) — preserve deep-link via ?next so the
          // carrier returns to the page they tried to access (e.g. an
          // emailed tender CTA) after login, not the dashboard root.
          // Whitelist enforced on the /carrier/login side: only paths
          // starting with /carrier/ accepted.
          const current = typeof window !== "undefined" ? window.location.pathname + window.location.search : "";
          const nextParam = current && current !== "/carrier/login" ? `?next=${encodeURIComponent(current)}` : "";
          router.replace(`/carrier/login${nextParam}`);
          return;
        }
        setChecking(false);
      });
    } else {
      setChecking(false);
    }
  }, [user, loadUser, router]);

  // v3.8.ajd Sprint 1 — Status-based routing. Once `user` is loaded, if
  // onboardingStatus is non-APPROVED AND the carrier is trying to access
  // anything other than the application-status page, redirect them.
  // Conversely, if onboardingStatus is APPROVED and the carrier lands on
  // the status page, push them to the main dashboard (the status page is
  // not meant for approved carriers; their stale tab gets the redirect).
  useEffect(() => {
    if (checking || !user || !pathname) return;
    const status = user.carrierProfile?.onboardingStatus;
    if (!status) return;
    if (status !== "APPROVED" && pathname !== STATUS_PAGE) {
      router.replace(STATUS_PAGE);
    } else if (status === "APPROVED" && pathname === STATUS_PAGE) {
      router.replace("/carrier/dashboard");
    }
  }, [user, pathname, checking, router]);

  if (checking) {
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
  const isApproved = user?.carrierProfile?.onboardingStatus === "APPROVED";
  const needsActivation = !!activationData?.requiresActivation && pathname !== "/carrier/dashboard/activation";

  return (
    <div className="flex h-screen bg-[#F7F8FA] overflow-hidden">
      {/* v3.8.ajd Sprint 1 — Sidebar hidden for non-APPROVED carriers.
          They only have one accessible route (application-status) so there's
          no nav to surface. Approved carriers see the full sidebar. */}
      {isApproved && <CarrierSidebar />}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {isApproved ? (
              <>
                <Search size={16} className="text-gray-400 shrink-0" />
                <input
                  placeholder="Search loads, documents, payments..."
                  className="border-none outline-none text-[13px] text-gray-700 w-full max-w-[280px] bg-transparent"
                />
              </>
            ) : (
              <Logo size="sm" />
            )}
          </div>
          <div className="flex items-center gap-4">
            {/* Company name */}
            {companyName && (
              <span className="text-xs text-gray-400 font-medium hidden sm:inline">{companyName}</span>
            )}
            {/* Notifications — APPROVED carriers only. Non-APPROVED have
                a single page with no actionable notifications surface. */}
            {isApproved && (
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
                  <div className="absolute top-8 right-0 w-[calc(100vw-2rem)] sm:w-80 bg-white rounded-lg shadow-[0_12px_40px_rgba(13,27,42,0.15)] border border-gray-200 z-[100]">
                    <div className="flex justify-between items-center px-3 py-2 border-b border-gray-100">
                      <span className="text-[13px] font-bold text-[#0F1117]">Notifications</span>
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
            )}
            {/* Avatar + Logout */}
            <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-xs font-bold text-[#0F1117] border-2 border-[#C9A84C]/30 cursor-pointer">
              {initials}
            </div>
            <button onClick={logout} className="text-gray-400 hover:text-red-500" title="Logout">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Post-Sprint-53 auth refresh banner (auto-expires 24h post-deploy) */}
        <AuthRefreshBanner />

        {/* Track 1.1b — Activation banner: APPROVED but Broker-Carrier
            Agreement not yet signed. Soft-gate UX nudge; tendering is
            independently blocked by the compliance gate until signed. */}
        {isApproved && needsActivation && (
          <a
            href="/carrier/dashboard/activation"
            className="flex items-center gap-3 px-4 sm:px-6 py-2.5 bg-amber-50 border-b border-amber-200 hover:bg-amber-100 transition-colors"
          >
            <FileSignature size={16} className="text-amber-700 shrink-0" />
            <p className="text-[13px] text-amber-900 flex-1 min-w-0">
              <span className="font-semibold">Complete your activation to start hauling.</span>{" "}
              Sign your Broker-Carrier Agreement and choose Quick Pay.
            </p>
            <span className="text-[13px] font-semibold text-amber-800 flex items-center gap-1 shrink-0">
              Activate <ChevronRight size={14} />
            </span>
          </a>
        )}

        {/* Content */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
      </div>

      {/* Marco Polo AI Assistant — token={null} is intentional; auth flows through httpOnly cookie.
          v3.8.ajd Sprint 1 — Hidden for non-APPROVED carriers (they haven't been
          cleared to operate; no need for the dispatch assistant yet). */}
      {isApproved && <MarcoPolo isAuthenticated={true} token={null} darkMode={false} />}

      {/* Session Timeout Warning */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock size={20} className="text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Session Expiring</h3>
                <p className="text-xs text-gray-500">Your session will expire due to inactivity</p>
              </div>
            </div>
            <div className="text-center py-3">
              <span className="text-2xl font-mono font-bold text-red-600">{countdown}</span>
            </div>
            <div className="flex gap-3">
              <button onClick={logout} className="flex-1 px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                Logout
              </button>
              <button onClick={extendSession} className="flex-1 px-4 py-2 text-sm bg-[#C9A84C] text-[#0F1117] rounded-lg font-semibold hover:bg-[#B8973F]">
                Stay Logged In
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
