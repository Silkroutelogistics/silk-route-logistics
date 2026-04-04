"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, Users, Settings, BarChart3, Activity } from "lucide-react";
import { useAuthStore } from "@/hooks/useAuthStore";

const adminNav = [
  { href: "/dashboard/audit", label: "Monitoring", icon: Activity },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/system", label: "System", icon: Settings },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const pathname = usePathname();

  if (user?.role !== "ADMIN") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0F1117]">
        <div className="bg-white/5 border border-white/10 rounded-xl p-8 text-center max-w-md">
          <Shield className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-semibold text-white mb-2">Access Denied</h1>
          <p className="text-slate-400 text-sm">
            You do not have permission to access the Admin Console. This area is restricted to administrators only.
          </p>
          <Link
            href="/dashboard/overview"
            className="inline-block mt-6 px-4 py-2 bg-gold/20 text-gold rounded-lg text-sm hover:bg-gold/30 transition"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[#0F1117]">
      {/* Admin Sidebar */}
      <aside className="w-56 bg-white/5 border-r border-white/10 flex flex-col shrink-0">
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-gold" />
            <span className="text-sm font-semibold text-white">Admin Console</span>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {adminNav.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm ${
                  isActive
                    ? "bg-gold/20 text-gold"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-white/10">
          <Link
            href="/dashboard/overview"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5"
          >
            Back to Dashboard
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
