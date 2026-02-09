"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { AuthGuard } from "@/components/auth/AuthGuard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-navy">
        <Sidebar />
        <main className="flex-1 p-4 pt-16 lg:pt-6 lg:p-8 overflow-x-hidden min-w-0">{children}</main>
      </div>
    </AuthGuard>
  );
}
