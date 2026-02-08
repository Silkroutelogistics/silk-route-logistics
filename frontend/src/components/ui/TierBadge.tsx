import { cn } from "@/lib/utils";

const tierConfig: Record<string, { bg: string; text: string }> = {
  PLATINUM: { bg: "bg-slate-200", text: "text-slate-800" },
  GOLD: { bg: "bg-yellow-300", text: "text-yellow-900" },
  SILVER: { bg: "bg-slate-400", text: "text-white" },
  BRONZE: { bg: "bg-amber-600", text: "text-white" },
};

export function TierBadge({ tier, size = "sm" }: { tier: string; size?: "sm" | "lg" }) {
  const config = tierConfig[tier] || tierConfig.BRONZE;
  return (
    <span className={cn(
      "inline-flex items-center font-semibold rounded-full",
      config.bg, config.text,
      size === "lg" ? "px-4 py-1.5 text-sm" : "px-2.5 py-0.5 text-xs"
    )}>
      {tier}
    </span>
  );
}
