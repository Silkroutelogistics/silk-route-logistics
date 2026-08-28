"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { backgroundPoll } from "@/lib/backgroundPoll";
import { CarrierSidebar } from "@/components/carrier";
import { Search, Bell, X, LogOut, Clock } from "lucide-react";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";
import { SessionWarningModal } from "@/components/auth/SessionWarningModal";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { Logo } from "@/components/ui/Logo";
import { AuthRefreshBanner } from "@/components/ui/AuthRefreshBanner";
import { MarcoPolo } from "@/components/MarcoPolo";
import type { Notification } from "@/types/entities";
import { resolveNotificationHref } from "@/lib/notificationTarget";

// v3.8.ajd Sprint 1 — Non-APPROVED carriers may log in but are confined
// to /carrier/dashboard/application-status. The layout enforces this
// client-side; per-route APPROVED checks at the backend (carrierLoads.ts
// :31/169, etc.) defend against a malicious or stale-tab carrier hitting
// load endpoints directly. SUSPENDED never reaches this layout — login
// is hard-blocked at the OTP/TOTP gates in carrierAuth.ts.
const STATUS_PAGE = "/carrier/dashboard/application-status";
const ACTIVATION_PAGE = "/carrier/dashboard/activation";
// Arc 11 — mandatory carrier 2FA. This gate sits ABOVE both of the above:
// an unenrolled carrier reaches the enrollment screen and nothing else,
// whatever their onboarding state. Unlike ACTIVATION_PAGE it is not
// conditioned on APPROVED, because a PENDING carrier waiting on review
// still has an account worth protecting.
const SECURITY_PAGE = "/carrier/dashboard/security";

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
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const { showWarning, countdown, extendSession } = useSessionTimeout({
    // SUPERSEDED 2026-08-26. This read "unified to 60 min (was an undocumented
    // 45) to match the shipper portal": correct then, since both portals and the
    // hook agreed on 60. Arc 34 moved the SERVER to 30 for every portal, which
    // made all three client numbers wrong at once. Timings now come from the
    // shared mirror so there is one number, and it is the server's.
    loginPath: "/carrier/login",
    onLogout: logout,
  });

  // v3.8.ajd Sprint 1 — Only poll notifications when carrier is APPROVED.
  // Non-APPROVED carriers see a single status page; no notifications
  // surface, no polling. Saves a 2-minute interval network call.
  const { data: notifData } = useQuery({
    queryKey: ["carrier-notifications"],
    // v3.8.asb — GET /notifications returns a BARE ARRAY
    // (notificationController.getNotifications -> res.json(notifications)).
    // This asked for `{ notifications: [...] }`, so `notifData.notifications`
    // was undefined, the `|| []` below swallowed it, and the carrier bell has
    // never displayed a single notification. The shipper portal had the
    // identical mismatch. The AE console reads the array directly and has
    // always worked, which is why nobody noticed.
    //
    // Fixed on the consumer rather than the endpoint: the endpoint's shape is
    // already correct for its longest-standing caller, and changing it would
    // have broken the one bell that works.
    // Arc final — marked a BACKGROUND POLL. This layout is mounted on every
    // page of the portal, so without the header its two-minute refetch reset
    // the idle clock forever and an abandoned desk never timed out.
    queryFn: () => api.get<Notification[]>("/notifications", backgroundPoll).then((r) => r.data),
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
    // Arc 11 — this one query now answers BOTH gates. It gained
    // requiresTotpEnrollment rather than getting a second query beside it,
    // because two queries against the same endpoint drift: one refetches,
    // the other does not, and the portal briefly believes two different
    // things about the same carrier.
    queryFn: () =>
      api
        .get<{ requiresActivation: boolean; requiresTotpEnrollment: boolean }>(
          "/carrier-auth/activation-status",
        )
        .then((r) => r.data),
    // No longer restricted to APPROVED. The enrollment gate covers PENDING
    // carriers too, so this has to resolve for them as well.
    enabled: !!user,
  });

  // Precedence, stated once and read by every gate below rather than left to
  // the order the effects happen to run in. Whichever effect calls
  // router.replace last would otherwise win, which is a fragile way to decide
  // which wall a carrier hits.
  const mustEnroll = !!activationData?.requiresTotpEnrollment;

  const notifications = Array.isArray(notifData) ? notifData : [];
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

  // Arc 11 — HARD enrollment gate, and the first of the three. A carrier
  // without an armed authenticator sees the enrollment screen and nothing
  // else. The backend refuses every other carrier route independently
  // (requireTotpEnrolled), so this is the matching UX, not the boundary.
  useEffect(() => {
    if (checking || !user || !pathname) return;
    if (mustEnroll && pathname !== SECURITY_PAGE) {
      router.replace(SECURITY_PAGE);
    }
  }, [user, pathname, checking, mustEnroll, router]);

  // v3.8.ajd Sprint 1 — Status-based routing. Once `user` is loaded, if
  // onboardingStatus is non-APPROVED AND the carrier is trying to access
  // anything other than the application-status page, redirect them.
  // Conversely, if onboardingStatus is APPROVED and the carrier lands on
  // the status page, push them to the main dashboard (the status page is
  // not meant for approved carriers; their stale tab gets the redirect).
  useEffect(() => {
    if (checking || !user || !pathname) return;
    // Enrollment outranks status routing: an unenrolled carrier must not be
    // bounced to the application-status page instead of the wall.
    if (mustEnroll) return;
    const status = user.carrierProfile?.onboardingStatus;
    if (!status) return;
    if (status !== "APPROVED" && pathname !== STATUS_PAGE) {
      router.replace(STATUS_PAGE);
    } else if (status === "APPROVED" && pathname === STATUS_PAGE) {
      router.replace("/carrier/dashboard");
    }
  }, [user, pathname, checking, mustEnroll, router]);

  // v3.8.aqi — HARD activation gate. An APPROVED carrier who hasn't signed the
  // Broker-Carrier Agreement cannot access ANY operational surface — the portal
  // redirects them to the activation page (the only reachable route) until the
  // BCA is signed. Backend independently hard-blocks tendering (complianceCheck),
  // so this is the matching UX enforcement, not the security boundary.
  useEffect(() => {
    if (checking || !user || !pathname) return;
    // Enrollment outranks activation. A carrier who has not armed a second
    // factor should not be asked to sign the BCA first.
    if (mustEnroll) return;
    if (
      user.carrierProfile?.onboardingStatus === "APPROVED" &&
      activationData?.requiresActivation &&
      pathname !== ACTIVATION_PAGE
    ) {
      router.replace(ACTIVATION_PAGE);
    }
  }, [user, pathname, checking, mustEnroll, activationData, router]);

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

  const initials = user ? `${user.firstName?.[0] || ""}${user.lastName?.[0] || ""}` : "C";
  const companyName = user?.carrierProfile?.companyName || user?.company || "";
  const isApproved = user?.carrierProfile?.onboardingStatus === "APPROVED";
  // v3.8.aqi — hard activation gate. Until the BCA is signed, an approved carrier
  // sees ONLY the activation page: no sidebar, search, notifications, or content.
  const mustActivate = isApproved && !!activationData?.requiresActivation;
  const onActivationPage = pathname === ACTIVATION_PAGE;
  // Arc 11 — the enrollment wall hides the chrome too. There is exactly one
  // reachable route until the authenticator is armed, so there is no nav to
  // surface and a bell that cannot be clicked through is just noise.
  const showOperationalChrome = isApproved && !mustActivate && !mustEnroll;

  return (
    <div className="flex h-screen bg-[#FBF7F0] overflow-hidden">
      {/* v3.8.ajd Sprint 1 — Sidebar hidden for non-APPROVED carriers.
          They only have one accessible route (application-status) so there's
          no nav to surface. Approved carriers see the full sidebar. */}
      {showOperationalChrome && <CarrierSidebar />}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-[#EFE6D3] flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {showOperationalChrome ? (
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
            {/* Notifications — activated (BCA-signed) carriers only. */}
            {showOperationalChrome && (
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
                      notifications.slice(0, 10).map((n) => {
                        // Only a row with somewhere safe to go is rendered
                        // clickable. Previously EVERY row carried cursor-pointer
                        // and a hover highlight with no handler at all, so it
                        // invited a click and did nothing — which reads as a
                        // broken app rather than as an item with no target.
                        const href = resolveNotificationHref(n.actionUrl, "/carrier");
                        const seen = () => {
                          if (n.read) return;
                          api
                            .patch(`/notifications/${n.id}/read`)
                            .then(() => queryClient.invalidateQueries({ queryKey: ["carrier-notifications"] }))
                            .catch(() => {}); // never block navigation on the read receipt
                        };
                        const body = (
                          <>
                            <div className="text-xs text-gray-700 leading-snug">{n.message || n.title}</div>
                            <div className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</div>
                          </>
                        );
                        const base = `px-3 py-2.5 border-b border-[#F5EEE0] ${!n.read ? "bg-[#E2EAF2]/60" : ""}`;
                        return href ? (
                          <button
                            key={n.id}
                            type="button"
                            onClick={() => { seen(); setNotifOpen(false); router.push(href); }}
                            className={`${base} w-full text-left cursor-pointer hover:bg-[#FBF7F0]`}
                          >
                            {body}
                          </button>
                        ) : (
                          <div key={n.id} className={base} onClick={seen}>
                            {body}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Avatar + Logout */}
            <div className="w-[34px] h-[34px] rounded-full bg-[#C5A572] flex items-center justify-center text-xs font-bold text-[#0A2540] border-2 border-[#C5A572]/40 cursor-pointer">
              {initials}
            </div>
            <button onClick={logout} className="text-gray-400 hover:text-[#9B2C2C]" title="Logout">
              <LogOut size={17} />
            </button>
          </div>
        </header>

        {/* Post-Sprint-53 auth refresh banner (auto-expires 24h post-deploy) */}
        <AuthRefreshBanner />

        {/* Content — v3.8.aqi hard activation gate. Until the BCA is signed, only
            the activation page renders; every other route is redirected there by
            the effect above, so operational surfaces never show pre-signature. */}
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          {mustActivate && !onActivationPage ? (
            <div className="min-h-[50vh] flex items-center justify-center">
              <div className="text-center">
                <Logo size="lg" />
                <p className="mt-4 text-sm text-gray-400 animate-pulse">Redirecting to activation…</p>
              </div>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      {/* Marco Polo AI Assistant — token={null} is intentional; auth flows through httpOnly cookie.
          v3.8.ajd Sprint 1 — Hidden for non-APPROVED carriers (they haven't been
          cleared to operate; no need for the dispatch assistant yet). */}
      {isApproved && <MarcoPolo isAuthenticated={true} token={null} darkMode={false} />}

      {/* Session Timeout Warning */}
      {/* Was an inline copy of this markup; the shipper portal held a second and
          the AE console held none. One definition now, so a fourth cannot appear. */}
      <SessionWarningModal
        open={showWarning}
        countdown={countdown}
        onExtend={extendSession}
        onLogout={logout}
      />
    </div>
  );
}
