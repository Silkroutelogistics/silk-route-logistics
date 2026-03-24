"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { isShipper, isCarrier } from "@/lib/roles";
import { Logo } from "@/components/ui/Logo";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loadUser } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Auth is cookie-based (httpOnly) — verify session by calling /auth/profile
    if (!user) {
      loadUser().then(() => {
        const currentUser = useAuthStore.getState().user;
        if (!currentUser) {
          router.replace("/auth/login");
          return;
        }
        if (isShipper(currentUser.role)) {
          router.replace("/shipper/dashboard");
          return;
        }
        if (isCarrier(currentUser.role)) {
          router.replace("/carrier/dashboard");
          return;
        }
        setChecking(false);
      });
    } else {
      if (isShipper(user.role)) {
        router.replace("/shipper/dashboard");
        return;
      }
      if (isCarrier(user.role)) {
        router.replace("/carrier/dashboard");
        return;
      }
      setChecking(false);
    }
  }, [user, loadUser, router]);

  useRoleGuard();

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy">
        <div className="text-center">
          <Logo size="lg" />
          <p className="mt-4 text-sm text-white/50 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
