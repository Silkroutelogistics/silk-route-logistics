"use client";

import { useState, useMemo, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SlideDrawer } from "@/components/ui/SlideDrawer";
import {
  Package, Plus, Search, Filter, X, ChevronRight, Truck,
  FileText, StickyNote, Upload, Trash2, Link2, Unlink, Loader2,
  Calendar, Building2, Hash, ClipboardList, Check, AlertCircle,
} from "lucide-react";

/* ─────────────────────── Types ─────────────────────── */

interface LineItem {
  id: string;
  sku: string;
  description: string;
  orderedQty: number;
  shippedQty: number;
  receivedQty: number;
}

interface LinkedLoad {
  id: string;
  loadNumber: string;
  status: string;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  type: "SALES" | "PURCHASE" | "TRANSFER";
  status: "OPEN" | "PARTIAL" | "CLOSED" | "CANCELLED";
  tradingPartner: string;
  customerName: string;
  customerId: string | null;
  orderDate: string;
  expectedDate: string;
  notes: string | null;
  lineItems: LineItem[];
  linkedLoads: LinkedLoad[];
  createdAt: string;
}

interface NewLineItem {
  sku: string;
  description: string;
  orderedQty: number;
}

/* ─────────────────────── Constants ─────────────────────── */

const TOP_TABS = ["Current", "Sales", "Purchase", "Transfer", "All"] as const;
type TopTab = (typeof TOP_TABS)[number];

const STATUS_FILTERS = ["OPEN", "PARTIAL", "CLOSED", "CANCELLED"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const DETAIL_TABS = ["Summary", "Items", "Loads", "Documents", "Notes"] as const;
type DetailTab = (typeof DETAIL_TABS)[number];

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  PARTIAL: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  CLOSED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  CANCELLED: "bg-red-500/20 text-red-400 border-red-500/30",
  // load statuses
  DRAFT: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  POSTED: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  BOOKED: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  DISPATCHED: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  IN_TRANSIT: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  DELIVERED: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  COMPLETED: "bg-green-500/20 text-green-400 border-green-500/30",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
        STATUS_COLORS[status] || "bg-gray-500/20 text-gray-400 border-gray-500/30"
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/* ─────────────────────── Page ─────────────────────── */

export default function PurchaseOrdersPage() {
  const qc = useQueryClient();

  // Filters
  const [topTab, setTopTab] = useState<TopTab>("Current");
  const [activeStatuses, setActiveStatuses] = useState<Set<StatusFilter>>(new Set(["OPEN", "PARTIAL"]));
  const [searchQuery, setSearchQuery] = useState("");

  // Detail panel
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("Summary");

  // Create drawer
  const [createOpen, setCreateOpen] = useState(false);

  // Link load input
  const [linkLoadId, setLinkLoadId] = useState("");

  /* ─── Build query params ─── */
  const queryParams = useMemo(() => {
    const p: Record<string, string> = {};
    if (topTab === "Sales") p.type = "SALES";
    else if (topTab === "Purchase") p.type = "PURCHASE";
    else if (topTab === "Transfer") p.type = "TRANSFER";
    else if (topTab === "Current") p.excludeClosed = "true";
    if (activeStatuses.size > 0 && activeStatuses.size < 4) {
      p.status = Array.from(activeStatuses).join(",");
    }
    if (searchQuery.trim()) p.search = searchQuery.trim();
    return p;
  }, [topTab, activeStatuses, searchQuery]);

  /* ─── Queries ─── */
  const { data: orders = [], isLoading } = useQuery<PurchaseOrder[]>({
    queryKey: ["purchase-orders", queryParams],
    queryFn: async () => {
      const res = await api.get("/purchase-orders", { params: queryParams });
      return res.data.data ?? res.data;
    },
  });

  const { data: poDetail, isLoading: detailLoading } = useQuery<PurchaseOrder>({
    queryKey: ["purchase-order-detail", selectedPO?.id],
    queryFn: async () => {
      const res = await api.get(`/purchase-orders/${selectedPO!.id}`);
      return res.data.data ?? res.data;
    },
    enabled: !!selectedPO?.id,
  });

  const detail = poDetail ?? selectedPO;

  /* ─── Mutations ─── */
  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await api.post("/purchase-orders", body);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      setCreateOpen(false);
    },
  });

  const updateShippedMutation = useMutation({
    mutationFn: async ({ lineItemId, shippedQty }: { lineItemId: string; shippedQty: number }) => {
      await api.patch(`/purchase-orders/line-items/${lineItemId}/shipped`, { shippedQty });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-order-detail", selectedPO?.id] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });

  const updateReceivedMutation = useMutation({
    mutationFn: async ({ lineItemId, receivedQty }: { lineItemId: string; receivedQty: number }) => {
      await api.patch(`/purchase-orders/line-items/${lineItemId}/received`, { receivedQty });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-order-detail", selectedPO?.id] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });

  const linkLoadMutation = useMutation({
    mutationFn: async ({ poId, loadId }: { poId: string; loadId: string }) => {
      await api.post(`/purchase-orders/${poId}/loads/${loadId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-order-detail", selectedPO?.id] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
      setLinkLoadId("");
    },
  });

  const unlinkLoadMutation = useMutation({
    mutationFn: async ({ poId, loadId }: { poId: string; loadId: string }) => {
      await api.delete(`/purchase-orders/${poId}/loads/${loadId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["purchase-order-detail", selectedPO?.id] });
      qc.invalidateQueries({ queryKey: ["purchase-orders"] });
    },
  });

  /* ─── Helpers ─── */
  function toggleStatus(s: StatusFilter) {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function formatDate(d: string | null | undefined) {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  /* ─── Render ─── */
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
            <Package className="w-5 h-5 text-[#C9A84C]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">Purchase Orders</h1>
            <p className="text-sm text-white/40">SKU tracking and order management</p>
          </div>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A84C] text-black font-medium text-sm hover:bg-[#C9A84C]/90 transition"
        >
          <Plus className="w-4 h-4" />
          Add Order
        </button>
      </div>

      {/* Top Tabs */}
      <div className="px-6 border-b border-white/5">
        <div className="flex gap-1">
          {TOP_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setTopTab(tab)}
              className={cn(
                "px-4 py-2.5 text-sm font-medium border-b-2 transition",
                topTab === tab
                  ? "border-[#C9A84C] text-[#C9A84C]"
                  : "border-transparent text-white/40 hover:text-white/70"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Filters Row */}
      <div className="px-6 py-4 flex items-center gap-4 flex-wrap">
        {/* Status pills */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-white/30" />
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => toggleStatus(s)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium border transition",
                activeStatuses.has(s)
                  ? STATUS_COLORS[s]
                  : "border-gray-200 text-white/30 hover:text-white/50"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative ml-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text"
            placeholder="Search PO#, partner, customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 pr-3 py-1.5 rounded-lg bg-white/[0.03] border border-gray-200 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400 w-64"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X className="w-3.5 h-3.5 text-white/30 hover:text-white/60" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content: Table + Detail Panel */}
      <div className="px-6 pb-6 flex gap-0">
        {/* Table */}
        <div className={cn("flex-1 transition-all", selectedPO ? "mr-0" : "")}>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[140px_1fr_100px_90px_120px_1fr] gap-4 px-4 py-3 border-b border-white/5 text-xs font-medium text-white/40 uppercase tracking-wider">
              <div>PO #</div>
              <div>Trading Partner</div>
              <div>Status</div>
              <div>Loads</div>
              <div>Expected</div>
              <div>Customer</div>
            </div>

            {/* Rows */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20 text-white/30">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading orders...
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-white/30">
                <Package className="w-8 h-8 mb-2 opacity-40" />
                <p className="text-sm">No purchase orders found</p>
                <p className="text-xs mt-1">Try adjusting your filters or create a new order</p>
              </div>
            ) : (
              orders.map((po) => (
                <button
                  key={po.id}
                  onClick={() => {
                    setSelectedPO(po);
                    setDetailTab("Summary");
                  }}
                  className={cn(
                    "grid grid-cols-[140px_1fr_100px_90px_120px_1fr] gap-4 px-4 py-3 border-b border-white/5 text-sm hover:bg-white/[0.02] transition w-full text-left",
                    selectedPO?.id === po.id && "bg-[#C9A84C]/5 border-l-2 border-l-[#C9A84C]"
                  )}
                >
                  <div className="font-mono text-[#C9A84C]">{po.poNumber}</div>
                  <div className="text-white/70 truncate">{po.tradingPartner}</div>
                  <div><StatusBadge status={po.status} /></div>
                  <div className="text-white/50 flex items-center gap-1">
                    <Truck className="w-3.5 h-3.5" />
                    {po.linkedLoads?.length ?? 0}
                  </div>
                  <div className="text-white/50">{formatDate(po.expectedDate)}</div>
                  <div className="text-white/70 truncate">{po.customerName}</div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Detail Panel (Cerry-style) */}
        {selectedPO && (
          <div className="w-[480px] shrink-0 ml-4 bg-white/[0.03] border border-white/5 rounded-xl overflow-hidden flex flex-col max-h-[calc(100vh-220px)]">
            {/* Panel header */}
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between shrink-0">
              <div>
                <span className="font-mono text-[#C9A84C] font-semibold">{detail?.poNumber}</span>
                <span className="ml-2"><StatusBadge status={detail?.status ?? "OPEN"} /></span>
              </div>
              <button
                onClick={() => setSelectedPO(null)}
                className="p-1 rounded hover:bg-gray-50 transition"
              >
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>

            {/* Detail tabs */}
            <div className="flex border-b border-white/5 px-2 shrink-0">
              {DETAIL_TABS.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setDetailTab(tab)}
                  className={cn(
                    "px-3 py-2 text-xs font-medium border-b-2 transition",
                    detailTab === tab
                      ? "border-[#C9A84C] text-[#C9A84C]"
                      : "border-transparent text-white/40 hover:text-white/70"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Detail content */}
            <div className="flex-1 overflow-y-auto p-4">
              {detailLoading && !detail ? (
                <div className="flex items-center justify-center py-10 text-white/30">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading...
                </div>
              ) : (
                <>
                  {detailTab === "Summary" && detail && <SummaryTab po={detail} formatDate={formatDate} />}
                  {detailTab === "Items" && detail && (
                    <ItemsTab
                      items={detail.lineItems ?? []}
                      onUpdateShipped={(lineItemId, shippedQty) =>
                        updateShippedMutation.mutate({ lineItemId, shippedQty })
                      }
                      onUpdateReceived={(lineItemId, receivedQty) =>
                        updateReceivedMutation.mutate({ lineItemId, receivedQty })
                      }
                    />
                  )}
                  {detailTab === "Loads" && detail && (
                    <LoadsTab
                      loads={detail.linkedLoads ?? []}
                      poId={detail.id}
                      linkLoadId={linkLoadId}
                      setLinkLoadId={setLinkLoadId}
                      onLink={(loadId) => linkLoadMutation.mutate({ poId: detail.id, loadId })}
                      onUnlink={(loadId) => unlinkLoadMutation.mutate({ poId: detail.id, loadId })}
                      linking={linkLoadMutation.isPending}
                    />
                  )}
                  {detailTab === "Documents" && <DocumentsTab />}
                  {detailTab === "Notes" && detail && <NotesTab notes={detail.notes} />}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create PO Drawer */}
      <SlideDrawer open={createOpen} onClose={() => setCreateOpen(false)} title="Create Purchase Order" width="max-w-xl">
        <CreatePOForm
          onSubmit={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
          error={createMutation.error as Error | null}
        />
      </SlideDrawer>
    </div>
  );
}

/* ═══════════════════════ Sub-Components ═══════════════════════ */

/* ─── Summary Tab ─── */
function SummaryTab({ po, formatDate }: { po: PurchaseOrder; formatDate: (d: string | null | undefined) => string }) {
  const fields = [
    { label: "PO Number", value: po.poNumber, icon: Hash },
    { label: "Customer", value: po.customerName, icon: Building2 },
    { label: "Trading Partner", value: po.tradingPartner, icon: Building2 },
    { label: "Type", value: po.type, icon: ClipboardList },
    { label: "Order Date", value: formatDate(po.orderDate), icon: Calendar },
    { label: "Expected Date", value: formatDate(po.expectedDate), icon: Calendar },
  ];

  const totalOrdered = po.lineItems?.reduce((s, li) => s + li.orderedQty, 0) ?? 0;
  const totalShipped = po.lineItems?.reduce((s, li) => s + li.shippedQty, 0) ?? 0;
  const totalReceived = po.lineItems?.reduce((s, li) => s + li.receivedQty, 0) ?? 0;
  const fulfillmentPct = totalOrdered > 0 ? Math.round((totalShipped / totalOrdered) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Ordered", value: totalOrdered, color: "text-blue-400" },
          { label: "Shipped", value: totalShipped, color: "text-amber-400" },
          { label: "Received", value: totalReceived, color: "text-emerald-400" },
        ].map((s) => (
          <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
            <div className={cn("text-lg font-semibold", s.color)}>{s.value.toLocaleString()}</div>
            <div className="text-xs text-white/40 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Fulfillment bar */}
      <div className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-white/50">Fulfillment</span>
          <span className="text-[#C9A84C] font-medium">{fulfillmentPct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#C9A84C] to-amber-500 rounded-full transition-all"
            style={{ width: `${fulfillmentPct}%` }}
          />
        </div>
      </div>

      {/* Detail fields */}
      <div className="space-y-2">
        {fields.map((f) => (
          <div key={f.label} className="flex items-center gap-3 py-2 border-b border-white/5 last:border-0">
            <f.icon className="w-4 h-4 text-white/20 shrink-0" />
            <span className="text-xs text-white/40 w-28 shrink-0">{f.label}</span>
            <span className="text-sm text-white/80">{f.value || "—"}</span>
          </div>
        ))}
        <div className="flex items-center gap-3 py-2">
          <AlertCircle className="w-4 h-4 text-white/20 shrink-0" />
          <span className="text-xs text-white/40 w-28 shrink-0">Status</span>
          <StatusBadge status={po.status} />
        </div>
      </div>
    </div>
  );
}

/* ─── Items Tab (with inline edit) ─── */
function ItemsTab({
  items,
  onUpdateShipped,
  onUpdateReceived,
}: {
  items: LineItem[];
  onUpdateShipped: (id: string, qty: number) => void;
  onUpdateReceived: (id: string, qty: number) => void;
}) {
  const [editingCell, setEditingCell] = useState<{ id: string; field: "shipped" | "received" } | null>(null);
  const [editValue, setEditValue] = useState("");

  function startEdit(item: LineItem, field: "shipped" | "received") {
    setEditingCell({ id: item.id, field });
    setEditValue(field === "shipped" ? String(item.shippedQty) : String(item.receivedQty));
  }

  function commitEdit() {
    if (!editingCell) return;
    const qty = Math.max(0, parseInt(editValue) || 0);
    if (editingCell.field === "shipped") onUpdateShipped(editingCell.id, qty);
    else onUpdateReceived(editingCell.id, qty);
    setEditingCell(null);
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-white/30">
        <Package className="w-6 h-6 mb-2 opacity-40" />
        <p className="text-sm">No line items</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Column headers */}
      <div className="grid grid-cols-[90px_1fr_60px_60px_60px] gap-2 text-[10px] font-medium text-white/30 uppercase tracking-wider px-2">
        <div>SKU</div>
        <div>Description</div>
        <div className="text-right">Ord</div>
        <div className="text-right">Ship</div>
        <div className="text-right">Rcv</div>
      </div>

      {items.map((item) => {
        const pct = item.orderedQty > 0 ? Math.round((item.shippedQty / item.orderedQty) * 100) : 0;
        return (
          <div key={item.id} className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5 space-y-1.5">
            <div className="grid grid-cols-[90px_1fr_60px_60px_60px] gap-2 items-center text-sm">
              <div className="font-mono text-[#C9A84C] text-xs">{item.sku}</div>
              <div className="text-white/70 truncate text-xs">{item.description}</div>
              <div className="text-right text-white/50">{item.orderedQty}</div>

              {/* Shipped - inline edit */}
              <div className="text-right">
                {editingCell?.id === item.id && editingCell.field === "shipped" ? (
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
                    className="w-14 bg-white/10 border border-[#C9A84C]/50 rounded px-1 py-0.5 text-xs text-right text-white focus:outline-none"
                    autoFocus
                    min={0}
                    max={item.orderedQty}
                  />
                ) : (
                  <button
                    onClick={() => startEdit(item, "shipped")}
                    className="text-amber-400 hover:text-amber-300 cursor-pointer transition"
                    title="Click to edit shipped qty"
                  >
                    {item.shippedQty}
                  </button>
                )}
              </div>

              {/* Received - inline edit */}
              <div className="text-right">
                {editingCell?.id === item.id && editingCell.field === "received" ? (
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditingCell(null); }}
                    className="w-14 bg-white/10 border border-[#C9A84C]/50 rounded px-1 py-0.5 text-xs text-right text-white focus:outline-none"
                    autoFocus
                    min={0}
                    max={item.shippedQty}
                  />
                ) : (
                  <button
                    onClick={() => startEdit(item, "received")}
                    className="text-emerald-400 hover:text-emerald-300 cursor-pointer transition"
                    title="Click to edit received qty"
                  >
                    {item.receivedQty}
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    pct >= 100 ? "bg-emerald-500" : pct > 0 ? "bg-[#C9A84C]" : "bg-transparent"
                  )}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <span className="text-[10px] text-white/30 w-8 text-right">{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Loads Tab ─── */
function LoadsTab({
  loads,
  poId,
  linkLoadId,
  setLinkLoadId,
  onLink,
  onUnlink,
  linking,
}: {
  loads: LinkedLoad[];
  poId: string;
  linkLoadId: string;
  setLinkLoadId: (v: string) => void;
  onLink: (loadId: string) => void;
  onUnlink: (loadId: string) => void;
  linking: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Link load input */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Load ID to link..."
          value={linkLoadId}
          onChange={(e) => setLinkLoadId(e.target.value)}
          className="flex-1 bg-white/[0.03] border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400"
        />
        <button
          onClick={() => linkLoadId.trim() && onLink(linkLoadId.trim())}
          disabled={!linkLoadId.trim() || linking}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#C9A84C]/10 text-[#C9A84C] text-sm font-medium hover:bg-[#C9A84C]/20 transition disabled:opacity-30"
        >
          {linking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Link2 className="w-3.5 h-3.5" />}
          Link
        </button>
      </div>

      {loads.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-white/30">
          <Truck className="w-6 h-6 mb-2 opacity-40" />
          <p className="text-sm">No linked loads</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {loads.map((load) => (
            <div key={load.id} className="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-lg px-3 py-2">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-white/30" />
                <span className="text-sm font-mono text-white/80">{load.loadNumber}</span>
                <StatusBadge status={load.status} />
              </div>
              <button
                onClick={() => onUnlink(load.id)}
                className="p-1 rounded hover:bg-red-500/10 transition text-white/20 hover:text-red-400"
                title="Unlink load"
              >
                <Unlink className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Documents Tab (placeholder) ─── */
function DocumentsTab() {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); /* TODO: handle file upload */ }}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center transition",
          isDragging
            ? "border-[#C9A84C] bg-[#C9A84C]/5"
            : "border-gray-200 hover:border-white/20"
        )}
      >
        <Upload className="w-8 h-8 mx-auto mb-3 text-white/20" />
        <p className="text-sm text-white/40">Drag and drop files here</p>
        <p className="text-xs text-white/25 mt-1">PDF, images, or documents up to 10MB</p>
        <button className="mt-3 px-4 py-1.5 rounded-lg bg-gray-50 border border-gray-200 text-xs text-white/50 hover:text-white/70 transition">
          Browse Files
        </button>
      </div>
      <p className="text-xs text-white/20 text-center">Document upload coming soon</p>
    </div>
  );
}

/* ─── Notes Tab ─── */
function NotesTab({ notes }: { notes: string | null | undefined }) {
  return (
    <div>
      {notes ? (
        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <StickyNote className="w-4 h-4 text-[#C9A84C]" />
            <span className="text-xs font-medium text-white/40 uppercase tracking-wider">Notes</span>
          </div>
          <p className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed">{notes}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-10 text-white/30">
          <StickyNote className="w-6 h-6 mb-2 opacity-40" />
          <p className="text-sm">No notes</p>
        </div>
      )}
    </div>
  );
}

/* ─── Create PO Form ─── */
function CreatePOForm({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (data: Record<string, unknown>) => void;
  isPending: boolean;
  error: Error | null;
}) {
  const [form, setForm] = useState({
    poNumber: "",
    type: "PURCHASE" as "SALES" | "PURCHASE" | "TRANSFER",
    tradingPartner: "",
    customerName: "",
    orderDate: new Date().toISOString().split("T")[0],
    expectedDate: "",
    notes: "",
  });

  const [lineItems, setLineItems] = useState<NewLineItem[]>([
    { sku: "", description: "", orderedQty: 1 },
  ]);

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function updateLineItem(idx: number, field: keyof NewLineItem, value: string | number) {
    setLineItems((prev) => prev.map((li, i) => (i === idx ? { ...li, [field]: value } : li)));
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, { sku: "", description: "", orderedQty: 1 }]);
  }

  function removeLineItem(idx: number) {
    if (lineItems.length <= 1) return;
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      ...form,
      lineItems: lineItems.filter((li) => li.sku.trim()),
    });
  }

  const inputClass =
    "w-full bg-[#0a0e1a] border border-gray-200 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400";
  const labelClass = "block text-xs text-white/40 mb-1 font-medium";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-sm text-red-400">
          {(error as Error).message || "Failed to create order"}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>PO Number *</label>
          <input
            type="text"
            required
            value={form.poNumber}
            onChange={(e) => updateField("poNumber", e.target.value)}
            placeholder="PO-2026-001"
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select
            value={form.type}
            onChange={(e) => updateField("type", e.target.value)}
            className={inputClass}
          >
            <option value="PURCHASE">Purchase</option>
            <option value="SALES">Sales</option>
            <option value="TRANSFER">Transfer</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Trading Partner *</label>
        <input
          type="text"
          required
          value={form.tradingPartner}
          onChange={(e) => updateField("tradingPartner", e.target.value)}
          placeholder="Partner company name"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Customer Name</label>
        <input
          type="text"
          value={form.customerName}
          onChange={(e) => updateField("customerName", e.target.value)}
          placeholder="Customer name"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Order Date</label>
          <input
            type="date"
            value={form.orderDate}
            onChange={(e) => updateField("orderDate", e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Expected Date</label>
          <input
            type="date"
            value={form.expectedDate}
            onChange={(e) => updateField("expectedDate", e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {/* Line Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelClass}>Line Items</label>
          <button
            type="button"
            onClick={addLineItem}
            className="flex items-center gap-1 text-xs text-[#C9A84C] hover:text-[#C9A84C]/80 transition"
          >
            <Plus className="w-3 h-3" /> Add Item
          </button>
        </div>
        <div className="space-y-2">
          {lineItems.map((li, idx) => (
            <div key={idx} className="flex items-start gap-2 bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
              <div className="flex-1 grid grid-cols-[100px_1fr_70px] gap-2">
                <input
                  type="text"
                  placeholder="SKU"
                  value={li.sku}
                  onChange={(e) => updateLineItem(idx, "sku", e.target.value)}
                  className="bg-[#0a0e1a] border border-gray-200 rounded px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400"
                />
                <input
                  type="text"
                  placeholder="Description"
                  value={li.description}
                  onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                  className="bg-[#0a0e1a] border border-gray-200 rounded px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400"
                />
                <input
                  type="number"
                  min={1}
                  placeholder="Qty"
                  value={li.orderedQty}
                  onChange={(e) => updateLineItem(idx, "orderedQty", parseInt(e.target.value) || 1)}
                  className="bg-[#0a0e1a] border border-gray-200 rounded px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-blue-400 text-right"
                />
              </div>
              <button
                type="button"
                onClick={() => removeLineItem(idx)}
                disabled={lineItems.length <= 1}
                className="p-1 rounded hover:bg-red-500/10 transition text-white/20 hover:text-red-400 disabled:opacity-20 mt-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className={labelClass}>Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => updateField("notes", e.target.value)}
          placeholder="Optional notes..."
          rows={3}
          className={cn(inputClass, "resize-none")}
        />
      </div>

      <button
        type="submit"
        disabled={isPending || !form.poNumber.trim() || !form.tradingPartner.trim()}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#C9A84C] text-black font-medium text-sm hover:bg-[#C9A84C]/90 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        {isPending ? "Creating..." : "Create Purchase Order"}
      </button>
    </form>
  );
}
