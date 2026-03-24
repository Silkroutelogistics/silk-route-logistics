"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Command, Plus, Search, X, Zap } from "lucide-react";

type Cmd = { name: string; category: string; action: string };

const commands: Cmd[] = [
  // Navigation
  { name: "Go to Dashboard", category: "Navigation", action: "/dashboard/overview" },
  { name: "Go to Load Board", category: "Navigation", action: "/dashboard/loads" },
  { name: "Go to CRM", category: "Navigation", action: "/dashboard/crm" },
  { name: "Go to Carrier Pool", category: "Navigation", action: "/dashboard/carriers" },
  { name: "Go to Track & Trace", category: "Navigation", action: "/dashboard/tracking" },
  { name: "Go to Communications", category: "Navigation", action: "/dashboard/communications" },
  { name: "Go to Claims", category: "Navigation", action: "/dashboard/claims" },
  { name: "Go to Lead Hunter", category: "Navigation", action: "/dashboard/lead-hunter" },
  { name: "Go to Invoices", category: "Navigation", action: "/dashboard/invoices" },
  { name: "Go to Payables", category: "Navigation", action: "/dashboard/payables" },
  { name: "Go to Settlements", category: "Navigation", action: "/dashboard/settlements" },
  { name: "Go to Finance", category: "Navigation", action: "/dashboard/finance" },
  { name: "Go to Market Intel", category: "Navigation", action: "/dashboard/market" },
  { name: "Go to AI Insights", category: "Navigation", action: "/dashboard/ai-insights" },
  { name: "Go to EDI", category: "Navigation", action: "/dashboard/edi" },
  { name: "Go to Audit Log", category: "Navigation", action: "/dashboard/audit" },
  { name: "Go to Settings", category: "Navigation", action: "/dashboard/settings" },
  { name: "Go to Accounting", category: "Navigation", action: "/accounting" },
  { name: "Go to Messages", category: "Navigation", action: "/dashboard/messages" },
  { name: "Go to SOPs", category: "Navigation", action: "/dashboard/sops" },
  { name: "Go to Fleet", category: "Navigation", action: "/dashboard/fleet" },
  { name: "Go to Drivers", category: "Navigation", action: "/dashboard/drivers" },
  { name: "Go to Compliance", category: "Navigation", action: "/dashboard/compliance" },
  // Actions
  { name: "Create New Load", category: "Actions", action: "event:srl:create-load" },
  { name: "Search Loads", category: "Actions", action: "/dashboard/loads?focus=search" },
  { name: "Search Customers", category: "Actions", action: "/dashboard/crm?focus=search" },
  { name: "Search Carriers", category: "Actions", action: "/dashboard/carriers?focus=search" },
  { name: "Run Compliance Scan", category: "Actions", action: "/dashboard/compliance" },
  { name: "Export Invoices CSV", category: "Actions", action: "/accounting/analytics?tab=export" },
  // Quick Create
  { name: "New Customer", category: "Quick Create", action: "event:srl:create-customer" },
  { name: "New Carrier Onboard", category: "Quick Create", action: "/onboarding" },
  { name: "New Quote (Shipper)", category: "Quick Create", action: "/shipper/dashboard/quote" },
];

const categoryIcons: Record<string, typeof ArrowRight> = {
  Navigation: ArrowRight,
  Actions: Zap,
  "Quick Create": Plus,
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Global keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const openHandler = () => setOpen(true);
    window.addEventListener("keydown", handler);
    window.addEventListener("srl:open-command-palette", openHandler);
    return () => {
      window.removeEventListener("keydown", handler);
      window.removeEventListener("srl:open-command-palette", openHandler);
    };
  }, []);

  // Auto-focus input on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) => c.name.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    );
  }, [query]);

  // Group by category preserving order
  const grouped = useMemo(() => {
    const map = new Map<string, Cmd[]>();
    for (const c of filtered) {
      if (!map.has(c.category)) map.set(c.category, []);
      map.get(c.category)!.push(c);
    }
    return map;
  }, [filtered]);

  const execute = useCallback(
    (cmd: Cmd) => {
      setOpen(false);
      if (cmd.action.startsWith("event:")) {
        window.dispatchEvent(new CustomEvent(cmd.action.slice(6)));
      } else {
        router.push(cmd.action);
      }
    },
    [router]
  );

  // Keyboard navigation
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[active]) {
        e.preventDefault();
        execute(filtered[active]);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    },
    [active, filtered, execute]
  );

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  let idx = -1;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] animate-in fade-in duration-150"
      style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-white/10 bg-[#0f172a] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4">
          <Search className="h-4 w-4 text-white/40 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent py-3.5 text-sm text-white placeholder-white/40 outline-none focus:ring-0"
          />
          <button onClick={() => setOpen(false)} className="text-white/40 hover:text-white/70">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-80 overflow-y-auto overscroll-contain p-2">
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-white/40">No results found.</p>
          )}
          {Array.from(grouped.entries()).map(([cat, items]) => {
            const Icon = categoryIcons[cat] || ArrowRight;
            return (
              <div key={cat}>
                <div className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-white/30">
                  {cat}
                </div>
                {items.map((cmd) => {
                  idx++;
                  const i = idx;
                  return (
                    <button
                      key={cmd.name}
                      data-idx={i}
                      onClick={() => execute(cmd)}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        i === active ? "bg-amber-500/15 text-amber-400" : "text-white/70 hover:bg-white/5"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{cmd.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* Footer hints */}
        <div className="flex items-center gap-4 border-t border-white/10 px-4 py-2 text-[11px] text-white/30">
          <span><kbd className="rounded border border-white/20 px-1">↑↓</kbd> navigate</span>
          <span><kbd className="rounded border border-white/20 px-1">↵</kbd> select</span>
          <span><kbd className="rounded border border-white/20 px-1">esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

export function CommandPaletteTrigger() {
  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent("srl:open-command-palette"))}
      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/10 hover:text-white/70"
    >
      <Command className="h-3.5 w-3.5" />
      <span>Search</span>
      <kbd className="ml-1 rounded border border-white/20 px-1.5 py-0.5 text-[10px] font-medium">
        ⌘K
      </kbd>
    </button>
  );
}
