"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search, ClipboardEdit, AlertTriangle, CheckCircle,
  Plus, X, Send, Save, Flame, FileText,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import { DirectTenderPicker } from "@/components/ui/DirectTenderPicker";
import { OrderSidebar } from "./OrderSidebar";
import { FacilityPicker, type Facility } from "./FacilityPicker";
import { LineItemsSection } from "@/components/orders/LineItemsSection";
import {
  emptyLineItem,
  emptyOrderForm,
  EQUIPMENT_OPTIONS,
  type LineItemFormData,
  type OrderForm,
  type Accessorial,
} from "./types";

/**
 * Order Builder v3.5 — single-page 5-section form with pricing sidebar.
 * Replaces the v3.4 accordion-plus-3-column form. Keeps single-page
 * philosophy (no steps, no wizard) but restructures into numbered
 * sections for clarity and adds the sticky right sidebar for pricing
 * intelligence.
 *
 * The form auto-saves every 30 seconds to /orders as a JSONB snapshot.
 * Send quote and Create load both route through /orders endpoints so
 * the full lifecycle (draft → quote_sent → quote_approved → load_created)
 * is persisted consistently.
 */

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  status: string;
  industry: string | null;
  industryType?: string | null;
  city: string | null;
  state: string | null;
  creditLimit: number | null;
  creditStatus: string;
  paymentTerms: string | null;
  totalRevenue?: number;
  totalShipments?: number;
  _count?: { shipments?: number; loads?: number };
}

type SaveState = "idle" | "saving" | "saved" | "error";

const ACCESSORIAL_TYPES = ["Detention", "Lumper", "TONU", "Layover", "Reweigh", "Driver assist", "Other"];

export default function OrderBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [form, setForm] = useState<OrderForm>(emptyOrderForm);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [customerRateSource, setCustomerRateSource] = useState<"agreement" | "manual" | null>(null);
  const [autoFillBanner, setAutoFillBanner] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);
  // v3.8.d.3 — track loadId so resumed drafts that have already been
  // converted gate the Create-load button instead of producing an HTTP
  // 409 "Order already converted" surprise. Set by resumeDraft from
  // the backend's order.loadId field.
  const [convertedLoadId, setConvertedLoadId] = useState<string | null>(null);
  const [convertedLoadRef, setConvertedLoadRef] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [manualOriginMode, setManualOriginMode] = useState(false);
  const [manualDestMode, setManualDestMode] = useState(false);
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  // v3.8.c — commodity→freight-class auto-suggest moved to per-line logic
  // inside LineItemsSection. The old form.commodity → form.freightClass
  // effect is gone with the flat fields.

  // ─── Draft list banner (v3.5.b) ───────────────────────────
  const draftsQuery = useQuery<{ orders: any[] }>({
    queryKey: ["ob-drafts"],
    queryFn: async () => (await api.get("/orders", { params: { status: "draft" } })).data,
    staleTime: 30_000,
  });
  // v3.8.d.3 — defensive client-side filter to drop already-converted
  // orders. The backend GET /orders?status=draft adds the same filter,
  // but this guard handles stale backend responses or any future code
  // path that PATCHes status without clearing loadId.
  const drafts = (draftsQuery.data?.orders ?? [])
    .filter((d) => d.id !== orderId)
    .filter((d) => !d.loadId);
  const showDraftBanner = !draftBannerDismissed && drafts.length > 0 && !selectedCustomer;

  const resumeDraft = async (draftId: string) => {
    try {
      const res = await api.get<{ order: any }>(`/orders/${draftId}`);
      const order = res.data?.order;
      if (!order) return;
      const formData = order.formData ?? {};
      setOrderId(draftId);
      // v3.8.d.3 — surface already-converted state so the UI can gate
      // Create load instead of letting the user re-attempt and hit the
      // backend's 409.
      setConvertedLoadId(order.loadId ?? null);
      setConvertedLoadRef(order.loadReferenceNumber ?? null);
      // v3.8.c legacy-draft hydration: if formData has no lineItems (pre-
      // v3.8.c draft captured flat fields only), synthesize 1 pre-filled
      // line item so the user can edit + save without re-entering freight.
      const hydrated: OrderForm = { ...emptyOrderForm(), ...formData };
      if (!Array.isArray(formData.lineItems) || formData.lineItems.length === 0) {
        const hasLegacyFreight =
          !!formData.commodity ||
          (formData.pieces && formData.pieces !== "") ||
          (formData.pallets && formData.pallets !== "") ||
          (formData.weight && formData.weight !== "");
        if (hasLegacyFreight) {
          const syn = emptyLineItem();
          syn.pieces = String(
            parseInt(formData.pieces ?? "", 10) ||
            parseInt(formData.pallets ?? "", 10) ||
            1,
          );
          syn.packageType = "PLT";
          syn.description = formData.commodity ?? "General Freight";
          syn.weight = formData.weight ?? "";
          syn.dimensionsLength = formData.length ?? "";
          syn.dimensionsWidth = formData.width ?? "";
          syn.dimensionsHeight = formData.height ?? "";
          syn.freightClass = formData.freightClass ?? "";
          syn.nmfcCode = formData.nmfcCode ?? "";
          syn.hazmat = !!formData.hazmat;
          syn.hazmatUnNumber = formData.hazmatUnNumber ?? "";
          syn.hazmatClass = formData.hazmatClass ?? "";
          syn.hazmatEmergencyContact = formData.hazmatEmergencyContact ?? "";
          syn.hazmatPlacardRequired = !!formData.hazmatPlacardRequired;
          syn.stackable = formData.stackable == null ? true : !!formData.stackable;
          syn.turnable = formData.turnable == null ? true : !!formData.turnable;
          hydrated.lineItems = [syn];
        } else {
          hydrated.lineItems = [emptyLineItem()];
        }
      }
      setForm(hydrated);
      if (order.customerId && order.customer) {
        setSelectedCustomer(order.customer as Customer);
        setCustomerSearch(order.customer.name ?? "");
        setAutoFillBanner(true);
      }
      setDraftBannerDismissed(true);
    } catch {
      // non-blocking
    }
  };

  // ─── BOL preview on mount (v3.5.b) ────────────────────────
  useQuery<{ bolNumber: string }>({
    queryKey: ["ob-next-bol"],
    queryFn: async () => {
      const { data } = await api.get("/loads/next-bol");
      if (data?.bolNumber && !form.bolNumber) {
        setForm((f) => ({ ...f, bolNumber: data.bolNumber }));
      }
      return data;
    },
    staleTime: Infinity,
  });

  // ─── Customer search + selection ───────────────────────────
  // v3.8.rr — context=crm restricts the search to onboardingStatus=APPROVED
  // customers, so Lead Hunter prospects (Contacted, Qualified, Proposal,
  // Won, Not Interested) cannot be selected for order creation. You can
  // only build orders for fully approved CRM customers.
  const customerQuery = useQuery<{ customers: Customer[] }>({
    queryKey: ["ob-customer-search", customerSearch],
    queryFn: async () =>
      (await api.get("/customers", { params: { search: customerSearch, context: "crm", limit: 10 } })).data,
    enabled: customerSearch.length >= 2 && !selectedCustomer,
    staleTime: 30_000,
  });

  const selectCustomer = async (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerSearch(c.name);
    setShowCustomerDropdown(false);
    setForm((f) => ({ ...f, customerId: c.id }));
    setAutoFillBanner(true);

    // Auto-fill cascade: facilities, shipping/receiving notes
    try {
      const notesRes = await api.get<{ notes: Array<{ title: string | null; content: string; noteType: string }> }>(
        `/customers/${c.id}/notes/for-load`
      );
      const notes = notesRes.data?.notes ?? [];
      if (notes.length > 0) {
        const merged = notes
          .map((n) => (n.title ? `[${n.title}] ${n.content}` : n.content))
          .join("\n\n");
        setForm((f) => ({
          ...f,
          specialInstructions: f.specialInstructions ? f.specialInstructions + "\n\n" + merged : merged,
        }));
      }
    } catch { /* non-blocking */ }
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setForm((f) => ({ ...f, customerId: "" }));
    setAutoFillBanner(false);
    setCustomerRateSource(null);
  };

  // Auto-select customer from URL (e.g., from CRM "New order" button)
  useEffect(() => {
    const urlCustomerId = searchParams.get("customerId");
    if (urlCustomerId && !selectedCustomer) {
      api.get<Customer>(`/customers/${urlCustomerId}`).then((res) => {
        if (res.data) selectCustomer(res.data);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Facility selection handlers ──────────────────────────
  const selectOriginFacility = (f: Facility) => {
    setForm((prev) => ({
      ...prev,
      originFacilityId: f.id,
      originCompany: f.name,
      originAddress: f.address ?? "",
      originCity: f.city ?? "",
      originState: f.state ?? "",
      originZip: f.zip ?? "",
      originContactName: f.contactName ?? prev.originContactName,
      originContactPhone: f.contactPhone ?? prev.originContactPhone,
      originDockInfo: f.dockInfo ?? "",
      originLoadType: (f.loadType === "drop" ? "drop" : "live"),
      // If facility has lumper info, auto-fill the lumper estimate hint
      lumperEstimate: f.lumperInfo && !prev.lumperEstimate ? f.lumperInfo.replace(/[^0-9.]/g, "") : prev.lumperEstimate,
      // Append facility special instructions to the notes
      specialInstructions: f.specialInstructions
        ? (prev.specialInstructions ? prev.specialInstructions + "\n\n" + f.specialInstructions : f.specialInstructions)
        : prev.specialInstructions,
    }));
    setManualOriginMode(false);
  };

  const selectDestFacility = (f: Facility) => {
    setForm((prev) => ({
      ...prev,
      destFacilityId: f.id,
      destCompany: f.name,
      destAddress: f.address ?? "",
      destCity: f.city ?? "",
      destState: f.state ?? "",
      destZip: f.zip ?? "",
      destContactName: f.contactName ?? prev.destContactName,
      destContactPhone: f.contactPhone ?? prev.destContactPhone,
      destDockInfo: f.dockInfo ?? "",
      destLoadType: (f.loadType === "drop" ? "drop" : "live"),
      lumperEstimate: f.lumperInfo && !prev.lumperEstimate ? f.lumperInfo.replace(/[^0-9.]/g, "") : prev.lumperEstimate,
      specialInstructions: f.specialInstructions
        ? (prev.specialInstructions ? prev.specialInstructions + "\n\n" + f.specialInstructions : f.specialInstructions)
        : prev.specialInstructions,
    }));
    setManualDestMode(false);
  };

  // ─── Contract rate auto-fill ──────────────────────────────
  const [rateAutoFillKey, setRateAutoFillKey] = useState<string | null>(null);
  useEffect(() => {
    if (!form.customerId || !form.originState || !form.destState || !form.equipmentType) return;
    const key = `${form.customerId}|${form.originState}|${form.destState}|${form.equipmentType}`;
    if (rateAutoFillKey === key) return;

    api.get<{ rate: number; flatRate: number | null; fuelSurcharge: number }>("/contract-rates/lookup", {
      params: {
        customerId: form.customerId,
        originState: form.originState,
        destState: form.destState,
        equipmentType: form.equipmentType,
      },
    })
      .then((res) => {
        const flat = res.data?.flatRate;
        const perMile = res.data?.rate;
        const distance = parseFloat(form.distance || "0");
        const auto = flat ?? (perMile && distance ? perMile * distance : null);
        if (auto) {
          setForm((f) => ({ ...f, customerRate: String(Math.round(auto)), targetCost: f.targetCost || String(Math.round(auto * 0.85)) }));
          setCustomerRateSource("agreement");
        }
        setRateAutoFillKey(key);
      })
      .catch(() => setRateAutoFillKey(key));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customerId, form.originState, form.destState, form.equipmentType]);

  // ─── Priority auto-upgrade on high-value cargo ────────────
  useEffect(() => {
    const val = parseFloat(form.cargoValue || "0");
    if (val > 100000 && form.shipmentPriority !== "hot") {
      setForm((f) => ({ ...f, shipmentPriority: "hot", checkCallProtocol: "expedited" }));
    }
  }, [form.cargoValue, form.shipmentPriority]);

  // ─── Distance auto-calc via /mileage (v3.5.b) ─────────────
  // Fires when origin + destination cities/states are both populated.
  // Keyed so the call fires exactly once per unique lane.
  const [distanceKey, setDistanceKey] = useState<string | null>(null);
  useEffect(() => {
    if (!form.originCity || !form.originState || !form.destCity || !form.destState) return;
    const key = `${form.originCity}|${form.originState}|${form.destCity}|${form.destState}`;
    if (distanceKey === key) return;

    let cancelled = false;
    api.get<{ practical_miles?: number; shortest_miles?: number | null; miles?: number }>("/mileage/calculate", {
      params: {
        origin: `${form.originCity}, ${form.originState}`,
        destination: `${form.destCity}, ${form.destState}`,
        equipment: form.equipmentType,
      },
    })
      .then((res) => {
        if (cancelled) return;
        const miles = res.data?.practical_miles ?? res.data?.miles ?? res.data?.shortest_miles ?? null;
        if (miles) {
          setForm((f) => ({ ...f, distance: String(Math.round(miles)) }));
        }
        setDistanceKey(key);
      })
      .catch(() => setDistanceKey(key));
    return () => { cancelled = true; };
  }, [form.originCity, form.originState, form.destCity, form.destState, form.equipmentType, distanceKey]);

  // ─── Draft autosave (30s) ─────────────────────────────────
  const saveDraft = useMutation({
    mutationFn: async () => {
      const payload = {
        customerId: form.customerId || undefined,
        formData: form,
        customerRate: form.customerRate ? parseFloat(form.customerRate) : null,
        targetCost: form.targetCost ? parseFloat(form.targetCost) : null,
        equipmentType: form.equipmentType,
        originCity: form.originCity || null,
        originState: form.originState || null,
        destCity: form.destCity || null,
        destState: form.destState || null,
        pickupDate: form.pickupDate || null,
        deliveryDate: form.deliveryDate || null,
        dispatchMethod: form.dispatchMethod,
        status: "draft",
      };
      if (orderId) {
        return (await api.patch(`/orders/${orderId}`, payload)).data;
      }
      return (await api.post("/orders", payload)).data;
    },
    onMutate: () => setSaveState("saving"),
    onSuccess: (data) => {
      const id = data?.order?.id;
      if (id && !orderId) setOrderId(id);
      setSaveState("saved");
      setLastSavedAt(new Date());
    },
    onError: () => setSaveState("error"),
  });

  // Tick every 30s; only save when there's meaningful content
  useEffect(() => {
    if (!form.customerId && !form.originCity && !form.destCity) return;
    const t = setInterval(() => saveDraft.mutate(), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.customerId, form.originCity, form.destCity, orderId]);

  // ─── Quote send ───────────────────────────────────────────
  const [quoteResult, setQuoteResult] = useState<string | null>(null);
  const sendQuote = useMutation({
    mutationFn: async () => {
      // v3.8.c — ALWAYS flush the latest form state before reading on the
      // backend. The 30s autosave timer means client edits can drift ahead
      // of the persisted draft. Without this, the quote email would render
      // stale formData. Same race condition root cause as the createLoad
      // freight-data-loss bug; same fix here.
      const saveRes = await saveDraft.mutateAsync();
      const targetId = orderId ?? saveRes?.order?.id ?? null;
      if (!targetId) throw new Error("Could not create order");
      return (await api.post(`/orders/${targetId}/send-quote`)).data;
    },
    onSuccess: (data) => {
      setQuoteResult(data?.order?.orderNumber ?? "Quote sent");
    },
  });

  // ─── Create load ──────────────────────────────────────────
  const [createResult, setCreateResult] = useState<{ loadNumber: string; dispatchMethod: string } | null>(null);
  const createLoad = useMutation({
    mutationFn: async () => {
      // v3.8.c LAYER 1 — Force synchronous draft save BEFORE convert-to-load.
      // The autosave timer fires at most every 30s; if user edits line items
      // and clicks Create Load within the same window, the persisted draft is
      // stale and the backend's convert-to-load reads outdated formData. By
      // unconditionally awaiting saveDraft.mutateAsync() here, the latest
      // form state (including all current line items) lands in the DB before
      // we trigger the conversion read.
      const saveRes = await saveDraft.mutateAsync();
      const targetId = orderId ?? saveRes?.order?.id ?? null;
      if (!targetId) throw new Error("Could not create order");
      return (await api.post(`/orders/${targetId}/convert-to-load`)).data;
    },
    onSuccess: (data) => {
      const load = data?.load;
      setCreateResult({
        loadNumber: load?.loadNumber ?? load?.referenceNumber ?? "—",
        dispatchMethod: load?.dispatchMethod ?? form.dispatchMethod,
      });
      // Route to the appropriate board based on dispatch method
      setTimeout(() => {
        if (form.dispatchMethod === "waterfall" || form.dispatchMethod === "loadboard" || form.dispatchMethod === "dat") {
          router.push("/dashboard/waterfall");
        } else if (form.dispatchMethod === "direct_tender") {
          router.push("/dashboard/waterfall");
        }
      }, 1500);
    },
  });

  // ─── Validation ───────────────────────────────────────────
  const requiredMissing = useMemo(() => {
    const missing: string[] = [];
    if (!form.customerId) missing.push("Customer");
    if (!form.originCity || !form.originState) missing.push("Origin");
    if (!form.destCity || !form.destState) missing.push("Destination");
    if (!form.pickupDate) missing.push("Pickup date");
    if (!form.deliveryDate) missing.push("Delivery date");
    if (!form.equipmentType) missing.push("Equipment");
    if (!form.customerRate) missing.push("Customer rate");

    // v3.8.c LAYER 2 — line-item completeness. At least one row must pass:
    // pieces > 0, weight > 0, description non-empty, packageType valid.
    // If any line has hazmat=true, that line additionally requires UN# and
    // hazmat class. Empty/partial rows are tolerated in form state (user
    // mid-entry); we only block submit until ≥ 1 line is complete.
    const PACKAGE_TYPE_VALUES = ["PLT", "SKID", "CTN", "BOX", "DRUM", "BALE", "BUNDLE", "CRATE", "ROLL", "OTHER"] as const;
    const hasValidLine = form.lineItems.some((l) => {
      const piecesOk = (parseInt(l.pieces, 10) || 0) > 0;
      const weightOk = (parseFloat(l.weight) || 0) > 0;
      const descOk = l.description.trim().length > 0;
      const packageOk = (PACKAGE_TYPE_VALUES as readonly string[]).includes(l.packageType);
      return piecesOk && weightOk && descOk && packageOk;
    });
    if (!hasValidLine) {
      missing.push("At least one complete line item (pieces, weight, description, package type)");
    }
    const incompleteHazmat = form.lineItems.find((l) =>
      l.hazmat &&
      (!l.hazmatUnNumber.trim() || !l.hazmatClass.trim())
    );
    if (incompleteHazmat) {
      missing.push("Hazmat lines need UN # and hazmat class");
    }

    return missing;
  }, [form]);

  const isValid = requiredMissing.length === 0;

  // ─── Success screen after create ──────────────────────────
  if (createResult) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white/5 border border-green-500/30 rounded-2xl p-8 text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Load Created</h2>
          <p className="text-slate-300">
            Load <strong className="text-gold">{createResult.loadNumber}</strong> dispatched via <strong>{createResult.dispatchMethod}</strong>.
          </p>
          <p className="text-sm text-slate-400">Redirecting to Waterfall Dispatch…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 lg:h-[calc(100vh-48px)] flex flex-col max-w-[1600px] mx-auto">
      {/* ─── TOP BAR ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between mb-3 shrink-0 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardEdit className="w-5 h-5 text-gold" />
            <h1 className="text-lg font-bold text-white">Order builder</h1>
          </div>
          <p className="text-xs text-slate-500">Create a new load</p>
        </div>
        <div className="flex items-center gap-2">
          <DraftStatus state={saveState} at={lastSavedAt} />
          <button
            onClick={() => saveDraft.mutate()}
            disabled={saveDraft.isPending}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs rounded-lg disabled:opacity-50"
            style={{ color: "var(--srl-text-secondary)" }}
          >
            <Save className="w-3 h-3" /> Save draft
          </button>
          <button
            onClick={() => sendQuote.mutate()}
            disabled={!form.customerId || sendQuote.isPending}
            className="flex items-center gap-1 px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-xs rounded-lg disabled:opacity-50"
            style={{ color: "var(--srl-text-secondary)" }}
          >
            <Send className="w-3 h-3" /> {sendQuote.isPending ? "Sending…" : "Send quote"}
          </button>
          <button
            onClick={() => {
              if (!isValid) { setShowErrors(true); return; }
              createLoad.mutate();
            }}
            disabled={createLoad.isPending || !isValid || !!convertedLoadId}
            title={
              convertedLoadId
                ? "This order has already been converted to a load"
                : isValid
                  ? undefined
                  : `Cannot create load — missing: ${requiredMissing.join(", ")}`
            }
            className="flex items-center gap-1 px-4 py-1.5 bg-[#BA7517] hover:bg-[#8f5a11] text-xs font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ color: "#FFFFFF" }}
          >
            {createLoad.isPending ? "Creating…" : "Create load"}
          </button>
        </div>
      </div>

      {/* v3.8.d.3 — Already-converted gate. Resumed drafts whose order
          already has a loadId surface a banner with a deep-link to the
          load instead of letting the user re-attempt and hit the
          backend's HTTP 409. */}
      {convertedLoadId && (
        <div className="mb-3 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 flex items-start gap-2">
          <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-300" />
          <div className="flex-1">
            <div className="font-semibold">This order has already been converted to a load</div>
            <div className="mt-0.5 opacity-90">
              Load {convertedLoadRef ?? convertedLoadId.slice(0, 8)} was created from this draft.
              Editing here will not change the dispatched load.
            </div>
          </div>
          <button
            onClick={() => router.push("/dashboard/loads")}
            className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-[11px] font-medium"
          >
            View loads →
          </button>
        </div>
      )}

      {quoteResult && (
        <div className="mb-3 p-2 rounded-lg bg-green-500/10 border border-green-500/30 text-xs text-green-300">
          ✓ Quote {quoteResult} sent to customer.
        </div>
      )}
      {showErrors && !isValid && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Missing: {requiredMissing.join(", ")}
        </div>
      )}
      {createLoad.isError && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Create load failed</div>
            <div className="mt-0.5 opacity-90">
              {(() => {
                const err = createLoad.error as { response?: { data?: { error?: string; message?: string } }; message?: string } | null;
                const apiData = err?.response?.data;
                if (apiData?.error === "INVALID_LOAD_NO_FREIGHT") {
                  return apiData.message ?? "No shipment line items provided. Add at least one line item with pieces, weight, and description.";
                }
                return apiData?.message ?? apiData?.error ?? err?.message ?? "Unknown error. Check browser console + backend logs.";
              })()}
            </div>
          </div>
        </div>
      )}
      {saveDraft.isError && (
        <div className="mb-3 p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300 flex items-start gap-2">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Draft save failed</div>
            <div className="mt-0.5 opacity-90">
              {(() => {
                const err = saveDraft.error as { response?: { data?: { error?: string; message?: string } }; message?: string } | null;
                const apiData = err?.response?.data;
                return apiData?.message ?? apiData?.error ?? err?.message ?? "Unknown error.";
              })()}
            </div>
          </div>
        </div>
      )}
      {showDraftBanner && (
        <div className="mb-3 p-3 rounded-lg bg-[#FAEEDA]/10 border border-[#BA7517]/30">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-[#FAEEDA]">
              <FileText className="w-3 h-3" />
              You have {drafts.length} draft order{drafts.length === 1 ? "" : "s"}
            </div>
            <button
              onClick={() => setDraftBannerDismissed(true)}
              className="text-[10px] text-slate-400 hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {drafts.slice(0, 6).map((d) => {
              const lane = [
                d.originCity && d.originState ? `${d.originCity}, ${d.originState}` : null,
                d.destCity && d.destState ? `${d.destCity}, ${d.destState}` : null,
              ].filter(Boolean).join(" → ") || "No lane";
              const edited = d.updatedAt ? new Date(d.updatedAt).toLocaleDateString() : "—";
              return (
                <button
                  key={d.id}
                  onClick={() => resumeDraft(d.id)}
                  className="text-left px-2 py-1.5 rounded bg-white/5 border border-white/10 hover:border-[#BA7517] transition"
                >
                  <div className="text-[11px] text-white truncate">{d.customer?.name ?? "No customer"}</div>
                  <div className="text-[9px] text-slate-700 truncate">{lane}</div>
                  <div className="text-[9px] text-slate-700">Edited {edited}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── TWO-PANEL LAYOUT ─────────────────────────────── */}
      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
        {/* LEFT — scrollable form */}
        <div className="flex-1 min-w-0 overflow-y-auto pr-2">
          {/* SECTION 1 — Customer */}
          <Section number={1} title="Customer">
            {!selectedCustomer ? (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    placeholder="Search customers by name, email, industry…"
                    className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white"
                  />
                </div>
                {showCustomerDropdown && (customerQuery.data?.customers?.length ?? 0) > 0 && (
                  <div className="absolute z-20 top-full mt-1 w-full bg-[#161921] border border-white/10 rounded-lg shadow-xl max-h-72 overflow-y-auto">
                    {customerQuery.data!.customers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => selectCustomer(c)}
                        className="w-full text-left px-3 py-2 hover:bg-white/5 border-b border-white/5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-white font-medium truncate">{c.name}</span>
                              <StatusBadge status={c.status} />
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {[c.city && c.state ? `${c.city}, ${c.state}` : null, c.industry].filter(Boolean).join(" · ")}
                            </div>
                          </div>
                          <div className="text-right text-[11px] text-slate-500">
                            {c._count?.loads ?? c._count?.shipments ?? 0} loads
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-[#BA7517] bg-[#FAEEDA]/10 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#FAEEDA] text-[#BA7517] flex items-center justify-center text-sm font-bold">
                      {selectedCustomer.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{selectedCustomer.name}</span>
                        <StatusBadge status={selectedCustomer.status} />
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {[selectedCustomer.industry, selectedCustomer.paymentTerms, selectedCustomer.creditLimit ? `Credit $${selectedCustomer.creditLimit.toLocaleString()}` : null]
                          .filter(Boolean).join(" · ")}
                      </div>
                      {autoFillBanner && (
                        <div
                          className="mt-1 inline-block px-2 py-0.5 text-[9px] rounded bg-[#BA7517]"
                          style={{ color: "#FFFFFF" }}
                        >
                          Auto-filled: facilities, rates, contacts, instructions
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={clearCustomer}
                    className="text-[11px] text-slate-400 hover:text-white"
                  >
                    Change
                  </button>
                </div>
              </div>
            )}
          </Section>

          {/* SECTION 2 — Route */}
          <Section number={2} title="Route">
            <div className="grid grid-cols-2 gap-3">
              {/* Origin */}
              <div>
                <Label>Origin facility</Label>
                {!manualOriginMode ? (
                  <FacilityPicker
                    customerId={form.customerId || null}
                    side="pickup"
                    selectedFacilityId={form.originFacilityId || null}
                    onSelect={selectOriginFacility}
                    onAddNew={() => setManualOriginMode(true)}
                  />
                ) : (
                  <div className="space-y-2">
                    <AddressAutocomplete
                      label="Start typing an address…"
                      theme="dark"
                      value={{ address: form.originAddress, city: form.originCity, state: form.originState, zip: form.originZip }}
                      onSelect={(parts) => setForm((f) => ({ ...f, originAddress: parts.address, originCity: parts.city, originState: parts.state, originZip: parts.zip, originFacilityId: "" }))}
                    />
                    <input placeholder="Facility name" value={form.originCompany} onChange={(e) => setForm((f) => ({ ...f, originCompany: e.target.value }))} className={inp} />
                    <button type="button" onClick={() => setManualOriginMode(false)} className="text-[10px] text-slate-400 hover:text-white">← Back to saved facilities</button>
                  </div>
                )}
                {/* v3.8.g — Contact fields. Auto-populated by FacilityPicker
                    when a saved facility with contactName/contactPhone is
                    selected; otherwise typed manually. Optional; BOL renders
                    em-dash fallback per v3.8.d.1 binding when blank. */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input
                    placeholder="Contact name"
                    value={form.originContactName}
                    onChange={(e) => setForm((f) => ({ ...f, originContactName: e.target.value }))}
                    className={inp}
                  />
                  <input
                    placeholder="Contact phone"
                    value={form.originContactPhone}
                    onChange={(e) => setForm((f) => ({ ...f, originContactPhone: e.target.value }))}
                    className={inp}
                  />
                </div>
              </div>

              {/* Destination */}
              <div>
                <Label>Destination facility</Label>
                {!manualDestMode ? (
                  <FacilityPicker
                    customerId={form.customerId || null}
                    side="delivery"
                    selectedFacilityId={form.destFacilityId || null}
                    onSelect={selectDestFacility}
                    onAddNew={() => setManualDestMode(true)}
                  />
                ) : (
                  <div className="space-y-2">
                    <AddressAutocomplete
                      label="Start typing an address…"
                      theme="dark"
                      value={{ address: form.destAddress, city: form.destCity, state: form.destState, zip: form.destZip }}
                      onSelect={(parts) => setForm((f) => ({ ...f, destAddress: parts.address, destCity: parts.city, destState: parts.state, destZip: parts.zip, destFacilityId: "" }))}
                    />
                    <input placeholder="Facility name" value={form.destCompany} onChange={(e) => setForm((f) => ({ ...f, destCompany: e.target.value }))} className={inp} />
                    <button type="button" onClick={() => setManualDestMode(false)} className="text-[10px] text-slate-400 hover:text-white">← Back to saved facilities</button>
                  </div>
                )}
                {/* v3.8.g — Contact fields. See origin block above. */}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <input
                    placeholder="Contact name"
                    value={form.destContactName}
                    onChange={(e) => setForm((f) => ({ ...f, destContactName: e.target.value }))}
                    className={inp}
                  />
                  <input
                    placeholder="Contact phone"
                    value={form.destContactPhone}
                    onChange={(e) => setForm((f) => ({ ...f, destContactPhone: e.target.value }))}
                    className={inp}
                  />
                </div>
              </div>
            </div>

            {/* Dates & windows */}
            <div className="grid grid-cols-4 gap-2 mt-3">
              <Field label="Pickup date *">
                <input type="date" value={form.pickupDate} onChange={(e) => setForm((f) => ({ ...f, pickupDate: e.target.value }))} className={inp} />
              </Field>
              <Field label="Delivery date *">
                <input type="date" value={form.deliveryDate} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))} className={inp} />
              </Field>
              <Field label="PU window">
                <div className="flex gap-1">
                  <input type="time" value={form.pickupTimeStart} onChange={(e) => setForm((f) => ({ ...f, pickupTimeStart: e.target.value }))} className={inpSm} />
                  <input type="time" value={form.pickupTimeEnd} onChange={(e) => setForm((f) => ({ ...f, pickupTimeEnd: e.target.value }))} className={inpSm} />
                </div>
              </Field>
              <Field label="DEL window">
                <div className="flex gap-1">
                  <input type="time" value={form.deliveryTimeStart} onChange={(e) => setForm((f) => ({ ...f, deliveryTimeStart: e.target.value }))} className={inpSm} />
                  <input type="time" value={form.deliveryTimeEnd} onChange={(e) => setForm((f) => ({ ...f, deliveryTimeEnd: e.target.value }))} className={inpSm} />
                </div>
              </Field>
            </div>

            {/* Auto / ref fields */}
            <div className="grid grid-cols-4 gap-2 mt-3">
              <Field label="Distance (mi)" tag="Auto">
                <input
                  value={form.distance}
                  onChange={(e) => setForm((f) => ({ ...f, distance: e.target.value }))}
                  className={inpAuto}
                  placeholder="Auto"
                />
              </Field>
              <Field label="BOL #" tag="Auto">
                <input
                  value={form.bolNumber}
                  onChange={(e) => setForm((f) => ({ ...f, bolNumber: e.target.value }))}
                  className={inpAuto}
                  placeholder="Auto on save"
                  readOnly
                />
              </Field>
              <Field label="Appt #">
                <input value={form.appointmentNumber} onChange={(e) => setForm((f) => ({ ...f, appointmentNumber: e.target.value }))} className={inp} />
              </Field>
              <Field label="PO #">
                <PoInput pos={form.poNumbers} onChange={(list) => setForm((f) => ({ ...f, poNumbers: list }))} />
              </Field>
            </div>

            {/* Lumper estimate */}
            <div className="mt-3">
              <Field label="Lumper estimate ($)" tag={form.lumperEstimate ? "From facility" : undefined}>
                <input
                  type="number"
                  value={form.lumperEstimate}
                  onChange={(e) => setForm((f) => ({ ...f, lumperEstimate: e.target.value }))}
                  className={form.lumperEstimate ? inpAuto : inp}
                  placeholder="0"
                />
              </Field>
            </div>
          </Section>

          {/* SECTION 3 — Freight */}
          <Section number={3} title="Freight">
            {/* Load-level fields: mode, equipment, driver config, load type,
                cargo value, dock, temperature, customs. Per-line freight
                detail (commodity/pieces/weight/dims/class/NMFC/hazmat/
                stackable/turnable) lives in the LineItemsSection below. */}
            <div className="grid grid-cols-4 gap-2">
              <Field label="Mode *">
                <select value={form.mode} onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as "FTL" | "LTL" }))} className={inp}>
                  <option value="FTL">FTL</option>
                  <option value="LTL">LTL</option>
                </select>
              </Field>
              <Field label="Equipment *">
                <select value={form.equipmentType} onChange={(e) => setForm((f) => ({ ...f, equipmentType: e.target.value }))} className={inp}>
                  {EQUIPMENT_OPTIONS.map((e) => <option key={e}>{e}</option>)}
                </select>
              </Field>
              <Field label="Driver mode">
                <select value={form.driverMode} onChange={(e) => setForm((f) => ({ ...f, driverMode: e.target.value as "solo" | "team" }))} className={inp}>
                  <option value="solo">Solo</option>
                  <option value="team">Team</option>
                </select>
              </Field>
              <Field label="Load type">
                <select value={form.liveOrDrop} onChange={(e) => setForm((f) => ({ ...f, liveOrDrop: e.target.value as "live" | "drop" }))} className={inp}>
                  <option value="live">Live</option>
                  <option value="drop">Drop</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-4 gap-2 mt-2">
              <Field label="Cargo value ($)">
                <input type="number" value={form.cargoValue} onChange={(e) => setForm((f) => ({ ...f, cargoValue: e.target.value }))} className={inp} />
              </Field>
              <Field label="Dock #" tag={form.originDockInfo ? "From facility" : undefined}>
                <input value={form.dockAssignment} onChange={(e) => setForm((f) => ({ ...f, dockAssignment: e.target.value }))} className={form.originDockInfo ? inpAuto : inp} />
              </Field>
            </div>

            {/* Load-level checkboxes (temp controlled + customs only — hazmat
                and stackable moved to per-line in LineItemsSection). */}
            <div className="flex gap-4 mt-3 text-xs text-slate-300">
              <Check label="Temp controlled" checked={form.temperatureControlled} onChange={(v) => setForm((f) => ({ ...f, temperatureControlled: v }))} />
              <Check label="Customs" checked={form.customsRequired} onChange={(v) => setForm((f) => ({ ...f, customsRequired: v }))} />
            </div>

            {form.temperatureControlled && (
              <div className="grid grid-cols-3 gap-2 mt-2">
                <Field label="Min °F">
                  <input type="number" value={form.tempMin} onChange={(e) => setForm((f) => ({ ...f, tempMin: e.target.value }))} className={inp} />
                </Field>
                <Field label="Max °F">
                  <input type="number" value={form.tempMax} onChange={(e) => setForm((f) => ({ ...f, tempMax: e.target.value }))} className={inp} />
                </Field>
                <Field label="Mode">
                  <select value={form.tempMode} onChange={(e) => setForm((f) => ({ ...f, tempMode: e.target.value as "continuous" | "cycling" }))} className={inp}>
                    <option value="continuous">Continuous</option>
                    <option value="cycling">Cycling</option>
                  </select>
                </Field>
              </div>
            )}

            {/* Shipment line items (v3.8.c) — multi-commodity capture */}
            <div className="mt-4 pt-4 border-t border-white/5">
              <div className="text-xs text-slate-400 uppercase tracking-wider font-medium mb-2">
                Shipment Line Items
              </div>
              <LineItemsSection
                value={form.lineItems}
                onChange={(items: LineItemFormData[]) =>
                  setForm((f) => ({ ...f, lineItems: items }))
                }
              />
            </div>

            {/* Fuel surcharge */}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Field label="Fuel surcharge">
                <select value={form.fuelSurchargeType} onChange={(e) => setForm((f) => ({ ...f, fuelSurchargeType: e.target.value as "included" | "separate" }))} className={inp}>
                  <option value="included">Included in rate</option>
                  <option value="separate">Separate</option>
                </select>
              </Field>
              {form.fuelSurchargeType === "separate" && (
                <Field label="FSC amount ($)">
                  <input type="number" value={form.fuelSurchargeAmount} onChange={(e) => setForm((f) => ({ ...f, fuelSurchargeAmount: e.target.value }))} className={inp} />
                </Field>
              )}
            </div>

            {/* Accessorials */}
            <div className="mt-3">
              <Label>Accessorials</Label>
              <div className="space-y-1.5">
                {form.accessorials.map((a, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_100px_30px] gap-1 items-center">
                    <select
                      value={a.type}
                      onChange={(e) => {
                        const next = [...form.accessorials];
                        next[i] = { ...next[i], type: e.target.value };
                        setForm((f) => ({ ...f, accessorials: next }));
                      }}
                      className={inp}
                    >
                      {ACCESSORIAL_TYPES.map((t) => <option key={t}>{t}</option>)}
                    </select>
                    <input
                      type="number"
                      value={a.amount}
                      onChange={(e) => {
                        const next = [...form.accessorials];
                        next[i] = { ...next[i], amount: parseFloat(e.target.value) || 0 };
                        setForm((f) => ({ ...f, accessorials: next }));
                      }}
                      className={inp}
                      placeholder="$"
                    />
                    <select
                      value={a.payer}
                      onChange={(e) => {
                        const next = [...form.accessorials];
                        next[i] = { ...next[i], payer: e.target.value as Accessorial["payer"] };
                        setForm((f) => ({ ...f, accessorials: next }));
                      }}
                      className={inp}
                    >
                      <option>Customer</option>
                      <option>Carrier</option>
                      <option>SRL</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, accessorials: f.accessorials.filter((_, j) => j !== i) }))}
                      className="text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, accessorials: [...f.accessorials, { type: "Detention", amount: 0, payer: "Customer" }] }))}
                  className="flex items-center gap-1 text-[11px] text-[#C5A572] hover:text-white"
                >
                  <Plus className="w-3 h-3" /> Add accessorial
                </button>
              </div>
            </div>
          </Section>

          {/* SECTION 4 — Instructions */}
          <Section number={4} title="Instructions">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>
                  Special instructions (sent to carrier)
                  {autoFillBanner && <span className="ml-1 text-[9px] text-[#C5A572]">· Pre-filled from CRM notes + facility</span>}
                </Label>
                <textarea
                  value={form.specialInstructions}
                  onChange={(e) => setForm((f) => ({ ...f, specialInstructions: e.target.value }))}
                  rows={5}
                  className={`${inp} resize-none`}
                  placeholder="Pickup procedures, handling requirements…"
                />
              </div>
              <div>
                <Label>Driver instructions (printed on rate con)</Label>
                <textarea
                  value={form.driverInstructions}
                  onChange={(e) => setForm((f) => ({ ...f, driverInstructions: e.target.value }))}
                  rows={5}
                  className={`${inp} resize-none`}
                  placeholder="Check in at guard shack, dock 14…"
                />
              </div>
            </div>
            <div className="mt-2">
              <Label>Internal notes (not visible to carrier)</Label>
              <textarea
                value={form.internalNotes}
                onChange={(e) => setForm((f) => ({ ...f, internalNotes: e.target.value }))}
                rows={3}
                className={`${inp} resize-none`}
                placeholder="AE-only notes…"
              />
            </div>
          </Section>

          {/* SECTION 5 — Dispatch & Tracking */}
          <Section number={5} title="Dispatch &amp; tracking">
            <Label>Dispatch method</Label>
            <div className="grid grid-cols-2 gap-2">
              <DispatchCard
                active={form.dispatchMethod === "waterfall"}
                onClick={() => setForm((f) => ({ ...f, dispatchMethod: "waterfall" }))}
                title="Waterfall (auto-tender)"
                desc="System ranks carriers and auto-tenders in priority sequence. 20-min acceptance window per carrier."
              />
              <DispatchCard
                active={form.dispatchMethod === "loadboard"}
                onClick={() => setForm((f) => ({ ...f, dispatchMethod: "loadboard" }))}
                title="Load board (The Caravan)"
                desc="Post to SRL internal load board. Approved carriers see and bid."
              />
              <DispatchCard
                active={form.dispatchMethod === "direct_tender"}
                onClick={() => setForm((f) => ({ ...f, dispatchMethod: "direct_tender" }))}
                title="Direct tender"
                desc="Tender to one specific carrier through The Caravan."
              />
              <DispatchCard
                active={form.dispatchMethod === "dat"}
                onClick={() => setForm((f) => ({ ...f, dispatchMethod: "dat" }))}
                title="DAT load board"
                desc="Post to DAT open market. Any carrier can see it."
              />
            </div>

            {form.dispatchMethod === "waterfall" && (
              <div className="mt-2 flex gap-1 items-center text-[10px] text-slate-400">
                Mode:
                {(["manual", "semi_auto", "full_auto"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, waterfallMode: m }))}
                    className={`px-2 py-1 rounded ${form.waterfallMode === m ? "bg-[#C5A572] text-[#0F1117]" : "bg-white/5 text-slate-400"}`}
                  >
                    {m === "full_auto" ? "Full auto" : m === "semi_auto" ? "Semi-auto" : "Manual"}
                  </button>
                ))}
              </div>
            )}

            {form.dispatchMethod === "direct_tender" && (
              <div className="mt-2">
                <Label>Carrier</Label>
                <DirectTenderPicker
                  value={form.directTenderCarrierId}
                  onChange={(id) => setForm((f) => ({ ...f, directTenderCarrierId: id }))}
                />
              </div>
            )}

            {/* Priority + check call */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <Label>Shipment priority</Label>
                <div className="flex gap-1">
                  <TogglePill active={form.shipmentPriority === "standard"} onClick={() => setForm((f) => ({ ...f, shipmentPriority: "standard" }))} label="Standard" />
                  <TogglePill
                    active={form.shipmentPriority === "hot"}
                    onClick={() => setForm((f) => ({ ...f, shipmentPriority: "hot", checkCallProtocol: "expedited" }))}
                    label={<span className="flex items-center gap-1"><Flame className="w-3 h-3" /> Hot</span>}
                    activeCls="bg-red-500 text-white"
                  />
                </div>
                {form.shipmentPriority === "hot" && (
                  <div className="mt-1 text-[10px] text-red-400">
                    Expedited alerts · red HOT badge across all boards
                  </div>
                )}
              </div>
              <div>
                <Label>Check call protocol</Label>
                <div className="flex gap-1">
                  <TogglePill active={form.checkCallProtocol === "standard"} onClick={() => setForm((f) => ({ ...f, checkCallProtocol: "standard" }))} label="Standard (4h)" />
                  <TogglePill active={form.checkCallProtocol === "expedited"} onClick={() => setForm((f) => ({ ...f, checkCallProtocol: "expedited" }))} label="Expedited (2h)" />
                </div>
              </div>
            </div>

            {/* Info callout — theme-aware gold tint (readable in both light + dark) */}
            <div
              className="mt-3 p-2 rounded-lg border text-[11px]"
              style={{
                background: "var(--srl-gold-muted)",
                borderColor: "rgba(186,117,23,0.4)",
                color: "var(--srl-gold-text)",
              }}
            >
              Waterfall starts automatically. Eligible carriers matched for {form.originState || "—"} → {form.destState || "—"} ({form.equipmentType}).
            </div>

            {/* Tracking notifications */}
            <div className="mt-3">
              <Check
                label="Auto-send tracking link to shipper contacts"
                checked={form.trackingLinkAutoSend}
                onChange={(v) => setForm((f) => ({ ...f, trackingLinkAutoSend: v }))}
              />
            </div>
          </Section>

          <div className="h-6" />
        </div>

        {/* RIGHT — sticky sidebar */}
        <OrderSidebar
          customerId={form.customerId || null}
          customerSnapshot={selectedCustomer ? {
            name: selectedCustomer.name,
            status: selectedCustomer.status,
            paymentTerms: selectedCustomer.paymentTerms,
            creditLimit: selectedCustomer.creditLimit,
            creditStatus: selectedCustomer.creditStatus,
            totalRevenue: selectedCustomer.totalRevenue,
            totalShipments: selectedCustomer.totalShipments ?? selectedCustomer._count?.loads ?? selectedCustomer._count?.shipments,
          } : null}
          originState={form.originState}
          destState={form.destState}
          originCity={form.originCity}
          destCity={form.destCity}
          equipmentType={form.equipmentType}
          distance={form.distance ? parseFloat(form.distance) : null}
          customerRate={form.customerRate ? parseFloat(form.customerRate) : null}
          targetCost={form.targetCost ? parseFloat(form.targetCost) : null}
          onTargetCostChange={(v) => setForm((f) => ({ ...f, targetCost: String(v) }))}
          onCustomerRateChange={(v) => { setForm((f) => ({ ...f, customerRate: String(v) })); setCustomerRateSource("manual"); }}
          customerRateSource={customerRateSource}
        />
      </div>
    </div>
  );
}

// ─── Small UI helpers ───────────────────────────────────────

const inp = "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50";
const inpSm = "w-full px-2 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white";
const inpAuto = "w-full px-3 py-2 bg-[#FAEEDA]/20 border border-[#BA7517]/40 rounded-lg text-sm text-[#FAEEDA] focus:outline-none";

function Section({ number, title, children }: { number: number; title: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-5 bg-[#161921] border border-white/10 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-[#FAEEDA] text-[#BA7517] flex items-center justify-center text-xs font-bold">
          {number}
        </div>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">{children}</div>;
}

function Field({ label, tag, children }: { label: string; tag?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-1 text-[10px] text-slate-400 uppercase tracking-wider font-medium mb-1">
        {label}
        {tag && <span className="text-[8px] text-[#C5A572] normal-case">· {tag}</span>}
      </div>
      {children}
    </div>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function TogglePill({
  active, onClick, label, activeCls,
}: {
  active: boolean;
  onClick: () => void;
  label: React.ReactNode;
  activeCls?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 text-xs rounded-full border transition ${
        active
          ? activeCls ?? "bg-[#C5A572] text-[#0F1117] border-[#C5A572]"
          : "bg-white/5 text-slate-400 border-white/10"
      }`}
    >
      {label}
    </button>
  );
}

function DispatchCard({
  active, onClick, title, desc,
}: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-lg border transition ${
        active ? "border-[#C5A572] bg-[#C5A572]/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`w-3 h-3 rounded-full border ${active ? "bg-[#C5A572] border-[#C5A572]" : "border-white/30"}`} />
        <span className="text-xs font-semibold text-white">{title}</span>
      </div>
      <div className="text-[10px] text-slate-400 mt-1 ml-5">{desc}</div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "").toLowerCase();
  const cls = s.includes("prospect") ? "bg-amber-500/20 text-amber-400"
            : s.includes("inactive") ? "bg-gray-500/20 text-gray-400"
            : "bg-green-500/20 text-green-400";
  return <span className={`px-1.5 py-0.5 text-[9px] rounded ${cls}`}>{status || "Active"}</span>;
}

function DraftStatus({ state, at }: { state: SaveState; at: Date | null }) {
  if (state === "saving") return <span className="text-[10px] text-slate-400">Saving…</span>;
  if (state === "error") return <span className="text-[10px] text-red-400">Save failed</span>;
  if (state === "saved" && at) {
    const ago = Math.round((Date.now() - at.getTime()) / 1000);
    return <span className="text-[10px] text-slate-400">Draft saved {ago < 5 ? "just now" : `${ago}s ago`}</span>;
  }
  return null;
}

function PoInput({ pos, onChange }: { pos: string[]; onChange: (list: string[]) => void }) {
  const [input, setInput] = useState("");
  const add = () => {
    const v = input.trim();
    if (v && !pos.includes(v)) onChange([...pos, v]);
    setInput("");
  };
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder="PO#"
          className={inpSm}
        />
        <button type="button" onClick={add} className="px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-slate-300">
          <Plus className="w-3 h-3" />
        </button>
      </div>
      {pos.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {pos.map((p) => (
            <span key={p} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[9px] bg-white/5 rounded">
              {p}
              <button onClick={() => onChange(pos.filter((x) => x !== p))} className="text-slate-500 hover:text-white">
                <X className="w-2 h-2" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
