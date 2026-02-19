"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { isShipper } from "@/lib/roles";
import { Logo } from "@/components/ui/Logo";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, user, loadUser } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!token) {
      router.replace("/auth/login");
      return;
    }
    if (!user) {
      loadUser().finally(() => setChecking(false));
    } else {
      // Shipper users on the internal dashboard get redirected to shipper portal
      if (isShipper(user.role)) {
        router.replace("/shipper/dashboard");
        return;
      }
      setChecking(false);
    }
  }, [token, user, loadUser, router]);

  useRoleGuard();

  if (!token || checking) {
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
