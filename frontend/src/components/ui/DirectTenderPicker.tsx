"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ChevronDown } from "lucide-react";

/**
 * Shared searchable carrier picker for direct-tender flows.
 * First consumer: Waterfall follow-ups (v3.4.u) — originally built
 * inline in Order Builder. Extracted here (Rule 5) when the Order
 * Builder rewrite in v3.5 reset the file and lost the inline version.
 *
 * Fetches from /carriers?status=APPROVED and normalizes the response
 * shape defensively. Stores the CarrierProfile.userId (not the
 * CarrierProfile.id) because Load.directTenderCarrierId references
 * User.id per the Waterfall module semantics.
 */

interface DirectTenderCarrier {
  id: string;
  userId: string;
  companyName: string | null;
  mcNumber: string | null;
  cppTier: string;
}

interface Props {
  value: string;
  onChange: (userId: string) => void;
  /** Dark (default) for Order Builder / Waterfall; light for CRM / AE console */
  theme?: "dark" | "light";
}

export function DirectTenderPicker({ value, onChange, theme = "dark" }: Props) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const carriersQuery = useQuery<{ carriers: DirectTenderCarrier[]; total: number }>({
    queryKey: ["direct-tender-carriers", search],
    queryFn: async () => {
      const res = await api.get("/carriers", {
        params: { status: "APPROVED", search: search || undefined, limit: 50 },
      });
      const raw = (res.data?.carriers ?? res.data?.data ?? res.data ?? []) as any[];
      const carriers: DirectTenderCarrier[] = raw.map((c) => ({
        id: c.id,
        userId: c.userId ?? c.user?.id ?? "",
        companyName: c.companyName ?? c.user?.company ?? c.user?.firstName ?? null,
        mcNumber: c.mcNumber ?? null,
        cppTier: c.cppTier ?? c.tier ?? "NONE",
      })).filter((c) => !!c.userId);
      return { carriers, total: carriers.length };
    },
    staleTime: 60_000,
  });

  const selected = (carriersQuery.data?.carriers ?? []).find((c) => c.userId === value);

  const tierStyle = (t: string) => {
    const dark = {
      PLATINUM: "bg-purple-500/20 text-purple-300",
      GOLD:     "bg-yellow-500/20 text-yellow-300",
      SILVER:   "bg-slate-400/20 text-slate-300",
    };
    const light = {
      PLATINUM: "bg-purple-100 text-purple-700",
      GOLD:     "bg-yellow-100 text-yellow-700",
      SILVER:   "bg-slate-100 text-slate-700",
    };
    const palette = theme === "light" ? light : dark;
    return palette[t as keyof typeof palette] ?? (theme === "light" ? "bg-gray-100 text-gray-600" : "bg-white/10 text-slate-400");
  };

  const triggerCls = theme === "light"
    ? "w-full text-left px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 flex items-center justify-between"
    : "w-full text-left px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white flex items-center justify-between";

  const panelCls = theme === "light"
    ? "absolute z-50 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden"
    : "absolute z-50 top-full mt-1 w-full bg-[#161921] border border-white/10 rounded-lg shadow-2xl overflow-hidden";

  const searchCls = theme === "light"
    ? "w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-xs text-gray-900"
    : "w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white";

  const itemHover = theme === "light" ? "hover:bg-gray-50" : "hover:bg-white/5";
  const mutedText = theme === "light" ? "text-gray-500" : "text-slate-500";
  const bodyText  = theme === "light" ? "text-gray-900" : "text-white";

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className={triggerCls}>
        {selected ? (
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">{selected.companyName ?? "—"}</span>
            {selected.mcNumber && <span className={`text-[10px] ${mutedText}`}>MC-{selected.mcNumber}</span>}
            <span className={`px-1.5 py-0.5 text-[9px] rounded ${tierStyle(selected.cppTier)}`}>{selected.cppTier}</span>
          </span>
        ) : (
          <span className={mutedText}>Select approved carrier…</span>
        )}
        <ChevronDown className={`w-4 h-4 shrink-0 ${mutedText}`} />
      </button>

      {open && (
        <div className={panelCls}>
          <div className={`p-2 border-b ${theme === "light" ? "border-gray-200" : "border-white/10"}`}>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company or MC#…"
              className={searchCls}
              autoFocus
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {(carriersQuery.data?.carriers ?? []).length === 0 && (
              <div className={`p-4 text-center text-xs ${mutedText}`}>
                {carriersQuery.isLoading ? "Loading…" : "No approved carriers match"}
              </div>
            )}
            {(carriersQuery.data?.carriers ?? []).map((c) => (
              <button
                key={c.userId}
                type="button"
                onClick={() => { onChange(c.userId); setOpen(false); setSearch(""); }}
                className={`w-full text-left px-3 py-2 ${itemHover} flex items-center justify-between gap-2`}
              >
                <div className="min-w-0">
                  <div className={`text-sm truncate ${bodyText}`}>{c.companyName ?? "—"}</div>
                  {c.mcNumber && <div className={`text-[10px] ${mutedText}`}>MC-{c.mcNumber}</div>}
                </div>
                <span className={`px-1.5 py-0.5 text-[10px] rounded shrink-0 ${tierStyle(c.cppTier)}`}>{c.cppTier}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
