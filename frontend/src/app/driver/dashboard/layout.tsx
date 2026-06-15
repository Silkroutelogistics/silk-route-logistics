"use client";

// v3.8.amz — SRL Driver Academy Sprint T2: driver portal shell + auth gate.
// Single controlled redirect (matches the carrier/shipper layout pattern):
// await loadDriver() once, then redirect to /driver/login if no valid driver
// session resolved. No second state-watching effect racing the api 401
// interceptor — one source of truth for the gate. Minimal top bar (logo +
// name + sign out); the training course UI lands in Sprint T4.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { GraduationCap, LogOut, Loader2 } from "lucide-react";
import { useDriverAuth } from "@/hooks/useDriverAuth";

export default function DriverDashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { driver, carrierName, loadDriver, logout } = useDriverAuth();
  const [checking, setChecking] = useState(!driver);

  useEffect(() => {
    if (driver) {
      setChecking(false);
      return;
    }
    loadDriver().then(() => {
      if (!useDriverAuth.getState().driver) {
        router.replace("/driver/login");
        return;
      }
      setChecking(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checking || !driver) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#faf9f7" }}>
        <Loader2 size={32} className="text-[#BA7517] animate-spin" />
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.replace("/driver/login");
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#faf9f7" }}>
      <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center">
              <GraduationCap size={17} className="text-[#0F1117]" />
            </div>
            <div className="leading-tight">
              <div className="text-[12px] font-bold text-[#0F1117] tracking-wide">SRL DRIVER ACADEMY</div>
              {carrierName && <div className="text-[10px] text-gray-400">{carrierName}</div>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-gray-600 hidden sm:inline">{driver.firstName} {driver.lastName}</span>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-800 transition-colors"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
