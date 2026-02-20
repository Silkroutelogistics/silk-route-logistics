"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "./useAuthStore";

interface SessionTimeoutOptions {
  timeoutMs: number;       // Total inactivity before logout
  warningBeforeMs: number; // Show warning this many ms before logout
  loginPath: string;       // Where to redirect on timeout
}

export function useSessionTimeout({
  timeoutMs = 60 * 60 * 1000,      // 60 minutes default (shippers)
  warningBeforeMs = 2 * 60 * 1000, // 2 minutes warning
  loginPath = "/shipper/login",
}: Partial<SessionTimeoutOptions> = {}) {
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const router = useRouter();
  const { clearAuth } = useAuthStore();
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();
  const warningTimer = useRef<ReturnType<typeof setTimeout>>();
  const countdownInterval = useRef<ReturnType<typeof setInterval>>();

  const warningAt = timeoutMs - warningBeforeMs;

  const forceLogout = useCallback(() => {
    clearAuth();
    localStorage.removeItem("srl_last_activity");
    router.replace(`${loginPath}?expired=1`);
  }, [clearAuth, router, loginPath]);

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
