"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useRoleGuard } from "@/hooks/useRoleGuard";
import { Logo } from "@/components/ui/Logo";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, user, loadUser } = useAuthStore();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!token) {
      window.location.href = "/auth/login";
      return;
    }
    if (!user) {
      loadUser().finally(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, [token, user, loadUser]);

  useRoleGuard();

  if (!token || checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Logo size="lg" />
          <p className="mt-4 text-sm text-slate-500 animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
