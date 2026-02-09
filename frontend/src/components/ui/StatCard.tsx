"use client";

import { cn } from "@/lib/utils";
import { type LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconColor?: string;
  subtitle?: string;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, iconColor = "text-gold", subtitle, className }: StatCardProps) {
  return (
    <div className={cn("bg-white/5 border border-white/10 rounded-xl p-5", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-white/50">{label}</span>
        {Icon && <Icon className={cn("w-5 h-5", iconColor)} />}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {subtitle && <p className="text-xs text-white/40 mt-1">{subtitle}</p>}
    </div>
  );
}
