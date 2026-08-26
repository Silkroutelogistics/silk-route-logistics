"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "./useAuthStore";
import { SESSION_IDLE_MS, SESSION_WARNING_LEAD_MS } from "@/lib/sessionPolicy";

interface SessionTimeoutOptions {
  timeoutMs: number;       // Total inactivity before logout
  warningBeforeMs: number; // Show warning this many ms before logout
  loginPath: string;       // Where to redirect on timeout
  onLogout?: () => void;   // Custom logout handler (for carrier/shipper portals)
}

/**
 * Defaults come from the shared server mirror, NOT from per-caller numbers.
 *
 * Every caller used to pass its own timeout and every one of them was wrong: 60
 * minutes against a server that cuts at 30. A carrier could watch a countdown
 * showing 25 minutes remaining while the server had already refused them, which
 * is worse than showing no countdown at all. Callers may still override, but the
 * default is now the only number the server actually honours.
 */
export function useSessionTimeout({
  timeoutMs = SESSION_IDLE_MS,
  warningBeforeMs = SESSION_WARNING_LEAD_MS,
  loginPath = "/shipper/login",
  onLogout,
}: Partial<SessionTimeoutOptions> = {}) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const router = useRouter();
  const { clearAuth } = useAuthStore();
  const idleTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const warningTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const countdownInterval = useRef<ReturnType<typeof setInterval>>(undefined);

  const warningAt = timeoutMs - warningBeforeMs;

  const forceLogout = useCallback(() => {
    if (onLogout) {
      onLogout();
    } else {
      clearAuth();
    }
    localStorage.removeItem("srl_last_activity");
    // ?reason=timeout — the same param the API interceptor sends on a server 401.
    // This was ?expired=1, so a client-side timeout and a server-side one landed
    // on the same screen carrying different query params, and only one of them
    // was ever read by anything.
    router.replace(`${loginPath}?reason=timeout`);
  }, [clearAuth, router, loginPath, onLogout]);

  const extendSession = useCallback(() => {
    setShowWarning(false);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    resetIdle();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetIdle() {
    clearTimeout(idleTimer.current);
    clearTimeout(warningTimer.current);
    if (countdownInterval.current) clearInterval(countdownInterval.current);
    setShowWarning(false);
    localStorage.setItem("srl_last_activity", Date.now().toString());

    warningTimer.current = setTimeout(() => {
      setShowWarning(true);
      let remaining = Math.floor(warningBeforeMs / 1000);
      setCountdown(remaining);
      countdownInterval.current = setInterval(() => {
        remaining--;
        setCountdown(remaining);
        if (remaining <= 0) {
          clearInterval(countdownInterval.current);
          forceLogout();
        }
      }, 1000);
    }, warningAt);

    idleTimer.current = setTimeout(forceLogout, timeoutMs);
  }

  useEffect(() => {
    // Check if already expired
    const last = localStorage.getItem("srl_last_activity");
    if (last && Date.now() - parseInt(last, 10) > timeoutMs) {
      forceLogout();
      return;
    }

    const handler = () => {
      if (!showWarning) resetIdle();
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"];
    events.forEach((e) => document.addEventListener(e, handler, { passive: true }));
    resetIdle();

    // Background check
    const bgCheck = setInterval(() => {
      const l = localStorage.getItem("srl_last_activity");
      if (!l) return;
      const elapsed = Date.now() - parseInt(l, 10);
      if (elapsed > timeoutMs) forceLogout();
    }, 15000);

    return () => {
      events.forEach((e) => document.removeEventListener(e, handler));
      clearTimeout(idleTimer.current);
      clearTimeout(warningTimer.current);
      if (countdownInterval.current) clearInterval(countdownInterval.current);
      clearInterval(bgCheck);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const countdownFormatted = `${Math.floor(countdown / 60)}:${(countdown % 60).toString().padStart(2, "0")}`;

  return { showWarning, countdown: countdownFormatted, extendSession, forceLogout };
}
