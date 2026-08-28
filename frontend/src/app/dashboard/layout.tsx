"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { MarcoPolo } from "@/components/MarcoPolo";
import { SessionWarningModal } from "@/components/auth/SessionWarningModal";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useTheme } from "@/hooks/useTheme";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { token, clearAuth } = useAuthStore();
  const { darkMode } = useTheme();

  // Arc final — the AE console had NO warning at all. Carrier and shipper each
  // carried an inline copy of the modal; the portal whose users hold the most
  // authority got signed out mid-task with no notice. Timings come from the
  // shared server mirror, so this counts down to the instant the server refuses.
  const { showWarning, countdown, extendSession, forceLogout } = useSessionTimeout({
    loginPath: "/auth/login",
    onLogout: clearAuth,
  });

  return (
    <AuthGuard>
      <a href="#main-content" className="sr-only">Skip to main content</a>
      <div className="flex min-h-screen transition-colors duration-300 bg-[#0F1117] text-white">
        <Sidebar />
        <main id="main-content" className="flex-1 p-4 pt-16 lg:pt-6 lg:p-8 overflow-x-hidden min-w-0 transition-colors duration-300">{children}</main>
        <MarcoPolo isAuthenticated={true} token={token} darkMode={darkMode} />
      </div>
      <SessionWarningModal
        open={showWarning}
        countdown={countdown}
        onExtend={extendSession}
        onLogout={forceLogout}
      />
    </AuthGuard>
  );
}
