"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { MarcoPolo } from "@/components/MarcoPolo";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useTheme } from "@/hooks/useTheme";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  const { darkMode } = useTheme();
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-navy transition-colors duration-300">
        <Sidebar />
        <main className="flex-1 p-4 pt-16 lg:pt-6 lg:p-8 overflow-x-hidden min-w-0 transition-colors duration-300">{children}</main>
        <MarcoPolo isAuthenticated={true} token={token} darkMode={darkMode} />
      </div>
    </AuthGuard>
  );
}
