"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api, isLoginRedirectInFlight } from "@/lib/api";
import { CarrierSidebar } from "@/components/carrier";
import { CarrierWelcomeTour } from "@/components/carrier/CarrierWelcomeTour";
import { Search, LogOut, Clock } from "lucide-react";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";
import { SessionWarningModal } from "@/components/auth/SessionWarningModal";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { Logo } from "@/components/ui/Logo";
import { AuthRefreshBanner } from "@/components/ui/AuthRefreshBanner";
import { MarcoPolo } from "@/components/MarcoPolo";
import { NotificationCenter } from "@/components/carrier/NotificationCenter";
import { isFeatureEnabled, featureReason, lockedFeatureForPath } from "@/lib/carrierPortalFeatures";
import { LockedFeature } from "@/components/carrier/LockedFeature";

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

// M5/G31 — one shape for the header's icon buttons: a 44px target, a visible
// focus ring, a short transition that respects reduced motion.
const ICON_BTN =
  "relative inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-150 motion-reduce:transition-none hover:bg-[#F5EEE0] active:bg-[#EFE6D3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]";

export default function CarrierDashboardLayout({ children }: { children: React.ReactNode }) {
  // v3.8.bei — the welcome tour, once. Session-local dismissal covers the
  // render between Finish and the activation query refetching; the durable
  // answer is the stamp the tour writes.
  const [tourDismissed, setTourDismissed] = useState(false);
  const { user, loadUser, logout } = useCarrierAuth();
  const [checking, setChecking] = useState(true);
  const router = useRouter();
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

  // carrier-portal-upgrade M2 — the bell, its list and its fetch live in
  // components/carrier/NotificationCenter: fetched on load and on window focus,
  // no polling loop, server-scoped to the caller and the carrier type allowlist.

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
        .get<{ requiresActivation: boolean; requiresTotpEnrollment: boolean; portalTourCompletedAt?: string | null }>(
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


  useEffect(() => {
    if (!user) {
      loadUser().then(() => {
        const currentUser = useCarrierAuth.getState().user;
        if (!currentUser) {
          // v3.8.bdb — §13.3 Item 275. If the 401 interceptor has already committed a
          // navigation to the login page, do not issue a second one: two
          // navigations from one 401 was the race that dropped the carrier's
          // ?next= deep-link and, on Safari, could supersede the interceptor's
          // URL with a reason-less one and lose the SignedOutNotice. The
          // interceptor's URL carries both. See lib/api.ts.
          if (isLoginRedirectInFlight()) return;
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

  // carrier-portal-upgrade M1 — a locked page is never shown. Anyone who lands on
  // one (an old bookmark, a typed URL) is sent to the Dashboard.
  useEffect(() => {
    if (lockedFeatureForPath(pathname)) router.replace("/carrier/dashboard");
  }, [pathname, router]);

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
  //
  // `!mustEnroll` IS THE PRECEDENCE, AND IT BELONGS HERE RATHER THAN AT THE
  // CONSUMERS. The redirect effect above stands down for enrollment; the render
  // branch below did not, and the two disagreeing bricked a live carrier:
  // APPROVED + BCA unsigned + 2FA unenrolled was sent to the enrollment screen
  // (correct) and then refused it, because `mustActivate` was true while the
  // pathname was not the activation page. A spinner reading "Redirecting to
  // activation…" that never resolved, on the one screen that could have let
  // them out — so enrollment could never complete and the deadlock was permanent.
  //
  // Approving a carrier BEFORE they arm 2FA is what triggers it, and that is the
  // normal order: the AE approves from the console while the carrier has not yet
  // logged in. Carrying the precedence in the VALUE means a consumer added later
  // inherits it instead of having to remember it — the effect and the render had
  // to agree, and nothing made them.
  const mustActivate = isApproved && !mustEnroll && !!activationData?.requiresActivation;
  const onActivationPage = pathname === ACTIVATION_PAGE;
  // Arc 11 — the enrollment wall hides the chrome too. There is exactly one
  // reachable route until the authenticator is armed, so there is no nav to
  // surface and a bell that cannot be clicked through is just noise.
  const showOperationalChrome = isApproved && !mustActivate && !mustEnroll;

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-[#FBF7F0] overflow-hidden">
      {/* carrier-portal-upgrade M4 — a column below lg. The sidebar's mobile bar
          is fixed at the top and its spacer reserves that height, but in a ROW
          the spacer had no height to give, so the bar sat on this header and
          hid the bell and logout on every page under 1024px (E2E measured it). */}
      {/* v3.8.ajd Sprint 1 — Sidebar hidden for non-APPROVED carriers.
          They only have one accessible route (application-status) so there's
          no nav to surface. Approved carriers see the full sidebar. */}
      {showOperationalChrome && <CarrierSidebar />}
      {/* v3.8.bei — opens the FIRST time the operational chrome renders for a
          carrier the backend says has never seen it (an explicit null; an
          older backend returns undefined and shows nothing). Behind every
          gate above it by construction: a carrier who is not yet activated or
          enrolled never has the chrome, so never has the tour. */}
      {showOperationalChrome && activationData?.portalTourCompletedAt === null && !tourDismissed && (
        <CarrierWelcomeTour mode="first-run" onClose={() => setTourDismissed(true)} />
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="h-14 bg-white border-b border-[#EFE6D3] flex items-center justify-between px-4 sm:px-6 flex-shrink-0">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {showOperationalChrome ? (
              <>
                {/* M1 — locked: the box had no handler and nothing behind it. */}
                {isFeatureEnabled("headerSearch") ? (
                  <>
                    <Search size={16} className="text-[#5B6B7D] shrink-0" aria-hidden="true" />
                    <input
                      aria-label="Search"
                      placeholder="Search loads, documents, payments..."
                      className="border-none outline-none text-[13px] text-gray-700 w-full max-w-[280px] bg-transparent"
                    />
                  </>
                ) : (
                  <LockedFeature label="Search" reason={featureReason("headerSearch")} />
                )}
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
            {/* Notifications: activated (BCA-signed) carriers only. */}
            <NotificationCenter enabled={showOperationalChrome} />
            {/* Avatar + Logout */}
            <div className="hidden sm:flex w-[34px] h-[34px] rounded-full bg-[#C5A572] items-center justify-center text-xs font-bold text-[#0A2540] border-2 border-[#C5A572]/40" role="img" aria-label={companyName ? `Signed in to ${companyName}` : "Signed in"}>
              {initials}
            </div>
            <button onClick={logout} aria-label="Log out" title="Log out" className={`${ICON_BTN} text-[#5B6B7D] hover:text-[#9B2C2C]`}>
              <LogOut size={17} aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Post-Sprint-53 auth refresh banner (auto-expires 24h post-deploy) */}
        <AuthRefreshBanner />

        {/* Content — v3.8.aqi hard activation gate. Until the BCA is signed, only
            the activation page renders; every other route is redirected there by
            the effect above, so operational surfaces never show pre-signature. */}
        {/* M4 — bottom padding under lg so the floating assistant button never sits on the last line. */}
        <main className="flex-1 overflow-auto p-4 pb-24 sm:p-6 sm:pb-24 lg:pb-6">
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
