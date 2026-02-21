"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Sentry } from "@/lib/sentry";
import { useAuthStore } from "@/hooks/useAuthStore";
import { ToastProvider } from "@/components/ui/Toast";

function SentryUserSync() {
  const user = useAuthStore((s) => s.user);
  useEffect(() => {
    if (user) {
      Sentry.setUser({ id: user.id, email: user.email });
      Sentry.setTag("user.role", user.role);
    } else {
      Sentry.setUser(null);
    }
  }, [user]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, retry: 1 },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Sentry.ErrorBoundary fallback={<p>Something went wrong.</p>}>
          <SentryUserSync />
          {children}
        </Sentry.ErrorBoundary>
      </ToastProvider>
    </QueryClientProvider>
  );
}
