"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, MapPin, Package, Calendar, FileText, Truck, DollarSign, MessageSquare, AlertCircle, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CustomerPicker, type CustomerSummary } from "@/components/shared/CustomerPicker";

/**
 * Sprint 59 (v3.8.acj) Item 176 — Carrier Engagement Drawer.
 *
 * Single-file unified component for build-and-tender, review, finalize,
 * and recovery flows. Mirrors ProspectDrawer canonical (a11y: role=
 * dialog + aria-modal + ESC + click-out + popstate; width 720px;
 * slide-in-right animation; body lock).
 *
 * Sprint 59 SHIPS Mode 1 (build-and-tender) only. Modes 2/3/4 are
 * STUBBED with runtime throw guards per Risk 5 — calling the drawer
 * in those modes will throw a clear error referencing the sprint that
 * will implement them.
 *
 * Submit path: POST /api/loads/with-tender (Sprint 59 atomic endpoint)
 * with full Load + Tender + RC creation in a single prisma.$transaction.
 *
 * Field/validator mapping: see Phase A report §3 (drawer spec) for the
 * 70%-overlap of Load schema + RC formData. Drawer captures once, the
 * backend autoGenerateRateConfirmation helper builds the RC shape.
 *
 * Section nav uses the same tab-pattern as ProspectDrawer but with
 * sections (not features) — 7 sections in Sprint 59. The 8th (Artifacts)
 * is Mode 3 only and stubbed for now.
 */

export type DrawerMode = "build-and-tender" | "review" | "finalize" | "recovery";

interface CarrierSearchResult {
  id: string;
  companyName: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  tier: string | null;
  onboardingStatus: string | null;
  insuranceExpiry: string | null;
  user?: { firstName?: string; lastName?: string; email?: string; phone?: string };
}

interface DrawerFormState {
  // Lane
  originCity: string;
  originState: string;
  originZip: string;
  originAddress: string;
  originCompany: string;
  originContactName: string;
  originContactPhone: string;
  destCity: string;
  destState: string;
  destZip: string;
  destAddress: string;
  destCompany: string;
  destContactName: string;
  destContactPhone: string;
  distance: string;

  // Equipment & Freight (Sprint 59: single-line freight; multi-line via lineItems[] expansion is Sprint 60+)
  equipmentType: string;
  commodity: string;
  pieces: string;
  packageType: string;
  weight: string;
  description: string;
  hazmat: boolean;
  temperatureControlled: boolean;
  tempMin: string;
  tempMax: string;

  // Schedule
  pickupDate: string;
  pickupTimeStart: string;
  pickupTimeEnd: string;
  deliveryDate: string;
  deliveryTimeStart: string;
  deliveryTimeEnd: string;

  // Stops & References
  poNumbersText: string; // comma-separated; backend split
  shipperReference: string;
  deliveryReference: string;
  appointmentNumber: string;

  // Carrier
  carrierId: string;

  // Financials
  customerRate: string;
  offeredRate: string; // → tender.offeredRate
  fuelSurcharge: string;
  expiresAtHours: string; // tender window in hours from now

  // Instructions
  specialInstructions: string;
  pickupInstructions: string;
  deliveryInstructions: string;
}

export interface CarrierEngagementDrawerProps {
  open: boolean;
  mode: DrawerMode;
  /** Customer pre-selected (Order Builder draft) or null (drawer-direct entry) */
  initialCustomer?: CustomerSummary | null;
  /** Order draft ID — drawer marks it status=load_created + sets loadId on submit */
  orderId?: string;
  /** Existing load ID (Mode 2/3/4) — null for Mode 1 */
  loadId?: string;
  /** Seed values for form state (drawer launched from Order Builder draft) */
  initialFormData?: Partial<DrawerFormState>;
  onClose: () => void;
  onSubmitSuccess?: (result: { loadId: string; tenderId: string; rcId: string | null }) => void;
}

type SectionKey = "lane" | "freight" | "schedule" | "stops" | "carrier" | "financials" | "instructions";

const SECTIONS: { key: SectionKey; label: string; Icon: typeof MapPin }[] = [
  { key: "lane",          label: "Lane",         Icon: MapPin },
  { key: "freight",       label: "Freight",      Icon: Package },
  { key: "schedule",      label: "Schedule",     Icon: Calendar },
  { key: "stops",         label: "Refs",         Icon: FileText },
  { key: "carrier",       label: "Carrier",      Icon: Truck },
  { key: "financials",    label: "Financials",   Icon: DollarSign },
  { key: "instructions",  label: "Instructions", Icon: MessageSquare },
];

const EMPTY_FORM: DrawerFormState = {
  originCity: "", originState: "", originZip: "", originAddress: "", originCompany: "", originContactName: "", originContactPhone: "",
  destCity: "", destState: "", destZip: "", destAddress: "", destCompany: "", destContactName: "", destContactPhone: "",
  distance: "",
  equipmentType: "Dry Van 53'", commodity: "", pieces: "1", packageType: "PLT", weight: "", description: "General Freight",
  hazmat: false, temperatureControlled: false, tempMin: "", tempMax: "",
  pickupDate: "", pickupTimeStart: "", pickupTimeEnd: "",
  deliveryDate: "", deliveryTimeStart: "", deliveryTimeEnd: "",
  poNumbersText: "", shipperReference: "", deliveryReference: "", appointmentNumber: "",
  carrierId: "",
  customerRate: "", offeredRate: "", fuelSurcharge: "0", expiresAtHours: "24",
  specialInstructions: "", pickupInstructions: "", deliveryInstructions: "",
};

export function CarrierEngagementDrawer(props: CarrierEngagementDrawerProps) {
  const { open, mode, initialCustomer, orderId, loadId, initialFormData, onClose, onSubmitSuccess } = props;

  // Risk 5 — runtime throw guards for un-implemented modes
  if (mode === "review")    throw new Error("CarrierEngagementDrawer Mode 'review' — implementation deferred to Sprint 60");
  if (mode === "finalize")  throw new Error("CarrierEngagementDrawer Mode 'finalize' — implementation deferred to Sprint 61");
  if (mode === "recovery")  throw new Error("CarrierEngagementDrawer Mode 'recovery' — implementation deferred to Sprint 62");

  const router = useRouter();
  const [section, setSection] = useState<SectionKey>("lane");
  const [customer, setCustomer] = useState<CustomerSummary | null>(initialCustomer ?? null);
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierSearchResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit, watch, control, formState: { errors } } = useForm<DrawerFormState>({
    defaultValues: { ...EMPTY_FORM, ...(initialFormData ?? {}) },
  });

  // a11y per Sprint 42 canonical
  const handleKeyDown = useCallback((e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }, [onClose]);
  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  // Browser back button closes the drawer (Sprint 42 popstate canonical)
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ carrierDrawer: true }, "");
    const onPop = () => onClose();
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [open, onClose]);

  const submitMutation = useMutation({
    mutationFn: async (data: DrawerFormState) => {
      if (!customer) throw new Error("Select a customer first");
      if (!selectedCarrier) throw new Error("Select a carrier first");
      if (!data.pickupDate || !data.deliveryDate) throw new Error("Pickup and delivery dates required");
      if (!data.offeredRate || Number(data.offeredRate) <= 0) throw new Error("Offered rate must be > 0");

      const expiresAtHours = Number(data.expiresAtHours) || 24;
      const expiresAt = new Date(Date.now() + expiresAtHours * 60 * 60 * 1000).toISOString();
      const poNumbers = data.poNumbersText.split(",").map((s) => s.trim()).filter(Boolean);

      const payload = {
        orderId: orderId ?? undefined,
        customerId: customer.id,
        originCity: data.originCity, originState: data.originState, originZip: data.originZip,
        originAddress: data.originAddress || null,
        originCompany: data.originCompany || null,
        originContactName: data.originContactName || null,
        originContactPhone: data.originContactPhone || null,
        destCity: data.destCity, destState: data.destState, destZip: data.destZip,
        destAddress: data.destAddress || null,
        destCompany: data.destCompany || null,
        destContactName: data.destContactName || null,
        destContactPhone: data.destContactPhone || null,
        distance: data.distance ? Number(data.distance) : null,
        equipmentType: data.equipmentType,
        commodity: data.commodity || null,
        weight: data.weight ? Number(data.weight) : null,
        pieces: data.pieces ? parseInt(data.pieces, 10) : null,
        lineItems: [{
          lineNumber: 1,
          pieces: parseInt(data.pieces, 10) || 1,
          packageType: data.packageType || "PLT",
          description: data.description || "General Freight",
          weight: Number(data.weight) || 0,
        }],
        hazmat: data.hazmat,
        temperatureControlled: data.temperatureControlled,
        tempMin: data.tempMin ? Number(data.tempMin) : null,
        tempMax: data.tempMax ? Number(data.tempMax) : null,
        pickupDate: new Date(data.pickupDate).toISOString(),
        pickupTimeStart: data.pickupTimeStart || null,
        pickupTimeEnd: data.pickupTimeEnd || null,
        deliveryDate: new Date(data.deliveryDate).toISOString(),
        deliveryTimeStart: data.deliveryTimeStart || null,
        deliveryTimeEnd: data.deliveryTimeEnd || null,
        isMultiStop: false,
        poNumbers,
        appointmentNumber: data.appointmentNumber || null,
        shipperReference: data.shipperReference || null,
        deliveryReference: data.deliveryReference || null,
        tender: {
          carrierId: selectedCarrier.id,
          offeredRate: Number(data.offeredRate),
          expiresAt,
        },
        customerRate: data.customerRate ? Number(data.customerRate) : null,
        fuelSurcharge: data.fuelSurcharge ? Number(data.fuelSurcharge) : 0,
        specialInstructions: data.specialInstructions || null,
        pickupInstructions: data.pickupInstructions || null,
        deliveryInstructions: data.deliveryInstructions || null,
      };

      const res = await api.post("/loads/with-tender", payload);
      return res.data;
    },
    onSuccess: (data) => {
      onSubmitSuccess?.({
        loadId: data.load.id,
        tenderId: data.tender.id,
        rcId: data.rateConfirmation?.id ?? null,
      });
      onClose();
      router.push(`/dashboard/loads?selected=${data.load.id}`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? err?.response?.data?.error ?? err?.message ?? "Submit failed";
      setSubmitError(msg);
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="carrier-drawer-title"
        className="absolute top-0 bottom-0 right-0 w-full max-w-[720px] bg-white shadow-2xl flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 shrink-0 flex items-center justify-between gap-3">
          <div>
            <h2 id="carrier-drawer-title" className="text-lg font-semibold text-slate-900">
              Carrier Engagement {mode === "build-and-tender" && <span className="text-xs font-normal text-slate-500 ml-2">Build &amp; Tender</span>}
            </h2>
            <div className="text-xs text-slate-500 mt-0.5">
              {customer ? customer.name : "No customer selected"}
              {selectedCarrier && customer && " · "}
              {selectedCarrier && <span className="text-[#BA7517] font-medium">{selectedCarrier.companyName ?? "Carrier"} (MC# {selectedCarrier.mcNumber ?? "—"})</span>}
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section nav (horizontal tabs) */}
        <div className="px-4 pt-3 border-b border-slate-100 shrink-0 overflow-x-auto">
          <div className="flex gap-1">
            {SECTIONS.map(({ key, label, Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setSection(key)}
                className={`px-3 py-2 text-xs rounded-t-md flex items-center gap-1.5 shrink-0 ${section === key ? "bg-slate-100 text-slate-900 font-semibold" : "text-slate-500 hover:text-slate-700"}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Form body */}
        <form onSubmit={handleSubmit((d) => submitMutation.mutate(d))} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

            {/* ── LANE ── */}
            {section === "lane" && (
              <div className="space-y-3">
                {!customer && (
                  <div>
                    <Label>Customer</Label>
                    <CustomerPicker value={customer} onChange={setCustomer} />
                  </div>
                )}
                <Label>Origin</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="City" {...register("originCity", { required: true })} />
                  <Input placeholder="State (2-letter)" {...register("originState", { required: true })} />
                  <Input placeholder="ZIP" {...register("originZip", { required: true })} />
                  <Input placeholder="Company" {...register("originCompany")} />
                  <Input placeholder="Address" className="col-span-2" {...register("originAddress")} />
                  <Input placeholder="Contact name" {...register("originContactName")} />
                  <Input placeholder="Contact phone" {...register("originContactPhone")} />
                </div>
                <Label>Destination</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="City" {...register("destCity", { required: true })} />
                  <Input placeholder="State (2-letter)" {...register("destState", { required: true })} />
                  <Input placeholder="ZIP" {...register("destZip", { required: true })} />
                  <Input placeholder="Company" {...register("destCompany")} />
                  <Input placeholder="Address" className="col-span-2" {...register("destAddress")} />
                  <Input placeholder="Contact name" {...register("destContactName")} />
                  <Input placeholder="Contact phone" {...register("destContactPhone")} />
                </div>
                <div>
                  <Label>Distance (mi)</Label>
                  <Input type="number" placeholder="Auto" {...register("distance")} />
                </div>
              </div>
            )}

            {/* ── FREIGHT ── */}
            {section === "freight" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Equipment</Label>
                    <Input {...register("equipmentType", { required: true })} />
                  </div>
                  <div>
                    <Label>Commodity</Label>
                    <Input placeholder="e.g. Wellness Wands" {...register("commodity")} />
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 italic">
                  Sprint 59 ships single-line freight. Multi-line items + NMFC + density-based class auto-suggest expand in Sprint 60+.
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div>
                    <Label>Pieces</Label>
                    <Input type="number" {...register("pieces")} />
                  </div>
                  <div>
                    <Label>Pkg type</Label>
                    <Input {...register("packageType")} />
                  </div>
                  <div className="col-span-2">
                    <Label>Description</Label>
                    <Input {...register("description")} />
                  </div>
                  <div className="col-span-2">
                    <Label>Weight (lbs)</Label>
                    <Input type="number" {...register("weight")} />
                  </div>
                </div>
                <div className="flex gap-4 pt-2">
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" {...register("hazmat")} /> Hazmat
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" {...register("temperatureControlled")} /> Temperature controlled
                  </label>
                </div>
                {watch("temperatureControlled") && (
                  <div className="grid grid-cols-2 gap-2">
                    <Input type="number" placeholder="Min °F" {...register("tempMin")} />
                    <Input type="number" placeholder="Max °F" {...register("tempMax")} />
                  </div>
                )}
              </div>
            )}

            {/* ── SCHEDULE ── */}
            {section === "schedule" && (
              <div className="space-y-3">
                <div>
                  <Label>Pickup date</Label>
                  <Input type="date" {...register("pickupDate", { required: true })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="time" placeholder="Window start" {...register("pickupTimeStart")} />
                  <Input type="time" placeholder="Window end" {...register("pickupTimeEnd")} />
                </div>
                <div>
                  <Label>Delivery date</Label>
                  <Input type="date" {...register("deliveryDate", { required: true })} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input type="time" placeholder="Window start" {...register("deliveryTimeStart")} />
                  <Input type="time" placeholder="Window end" {...register("deliveryTimeEnd")} />
                </div>
              </div>
            )}

            {/* ── STOPS & REFS ── */}
            {section === "stops" && (
              <div className="space-y-3">
                <div className="text-[11px] text-slate-500 italic">
                  Multi-stop UX expands in Sprint 60+. Sprint 59 ships single pickup/delivery + references.
                </div>
                <div>
                  <Label>PO numbers (comma-separated)</Label>
                  <Input placeholder="PO123, PO456" {...register("poNumbersText")} />
                </div>
                <div>
                  <Label>Shipper reference</Label>
                  <Input {...register("shipperReference")} />
                </div>
                <div>
                  <Label>Delivery reference</Label>
                  <Input {...register("deliveryReference")} />
                </div>
                <div>
                  <Label>Appointment #</Label>
                  <Input {...register("appointmentNumber")} />
                </div>
              </div>
            )}

            {/* ── CARRIER ── */}
            {section === "carrier" && (
              <CarrierSection
                selected={selectedCarrier}
                onSelect={setSelectedCarrier}
              />
            )}

            {/* ── FINANCIALS ── */}
            {section === "financials" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Customer rate ($)</Label>
                    <Input type="number" step="0.01" {...register("customerRate")} />
                  </div>
                  <div>
                    <Label>Offered rate ($)</Label>
                    <Input type="number" step="0.01" {...register("offeredRate", { required: true })} />
                  </div>
                  <div>
                    <Label>Fuel surcharge ($)</Label>
                    <Input type="number" step="0.01" {...register("fuelSurcharge")} />
                  </div>
                  <div>
                    <Label>Tender expiry (hours)</Label>
                    <Input type="number" {...register("expiresAtHours")} />
                  </div>
                </div>
                {customer && watch("offeredRate") && watch("customerRate") && (
                  <div className="text-[11px] p-2 rounded bg-slate-50 border border-slate-200 text-slate-600">
                    Projected margin: ${(Number(watch("customerRate")) - Number(watch("offeredRate"))).toFixed(2)} ·{" "}
                    {((1 - Number(watch("offeredRate")) / Number(watch("customerRate"))) * 100).toFixed(1)}%
                  </div>
                )}
              </div>
            )}

            {/* ── INSTRUCTIONS ── */}
            {section === "instructions" && (
              <div className="space-y-3">
                <div>
                  <Label>Special instructions (carrier-facing)</Label>
                  <textarea
                    rows={3}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40"
                    {...register("specialInstructions")}
                  />
                </div>
                <div>
                  <Label>Pickup instructions</Label>
                  <textarea rows={2} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" {...register("pickupInstructions")} />
                </div>
                <div>
                  <Label>Delivery instructions</Label>
                  <textarea rows={2} className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm" {...register("deliveryInstructions")} />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 shrink-0 bg-slate-50">
            {submitError && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>{submitError}</div>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg">
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitMutation.isPending || !customer || !selectedCarrier}
                className="px-5 py-2 text-sm font-semibold bg-[#BA7517] hover:bg-[#A0660F] text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
              >
                {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Tender
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ───────── Subcomponents ─────────

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-600 mb-1">{children}</label>;
}

const Input = ((props: React.InputHTMLAttributes<HTMLInputElement>) => (
  <input
    {...props}
    className={`w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40 ${props.className ?? ""}`}
  />
));

interface CarrierSectionProps {
  selected: CarrierSearchResult | null;
  onSelect: (c: CarrierSearchResult | null) => void;
}

function CarrierSection({ selected, onSelect }: CarrierSectionProps) {
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);

  const { data, isFetching } = useQuery({
    queryKey: ["drawer-carrier-search", search],
    queryFn: async () =>
      (await api.get("/carrier/all", { params: { search, limit: 10 } })).data,
    enabled: showResults && search.length >= 2 && !selected,
  });

  const eligible = (c: CarrierSearchResult): boolean => {
    if (c.onboardingStatus !== "APPROVED") return false;
    if (c.insuranceExpiry && new Date(c.insuranceExpiry) <= new Date()) return false;
    return true;
  };

  const filteredCarriers = (data?.carriers ?? data ?? []).filter(eligible);

  if (selected) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-[#BA7517] bg-[#FAEEDA]/30 p-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 truncate">{selected.companyName ?? "Carrier"}</span>
              {selected.tier && (
                <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${selected.tier === "PLATINUM" || selected.tier === "GOLD" ? "bg-[#C5A572]/20 text-[#BA7517]" : "bg-slate-200 text-slate-700"}`}>
                  {selected.tier}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              MC# {selected.mcNumber ?? "—"} · DOT# {selected.dotNumber ?? "—"}
              {selected.user?.email && ` · ${selected.user.email}`}
            </div>
          </div>
          <button type="button" onClick={() => onSelect(null)} className="text-[11px] text-slate-500 hover:text-slate-900 shrink-0">
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-slate-500">Search approved + insured carriers. Carriers blocked by compliance won&apos;t appear.</div>
      <div className="relative">
        <input
          type="text"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShowResults(true); }}
          onFocus={() => setShowResults(true)}
          placeholder="Search by company, MC#, DOT#…"
          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40"
        />
        {showResults && search.length >= 2 && (
          <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-72 overflow-y-auto">
            {isFetching && <div className="px-3 py-2 text-xs text-slate-500">Searching…</div>}
            {!isFetching && filteredCarriers.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-500">No eligible carriers found. Try a broader search.</div>
            )}
            {filteredCarriers.map((c: CarrierSearchResult) => (
              <button
                key={c.id}
                type="button"
                onClick={() => { onSelect(c); setShowResults(false); setSearch(""); }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{c.companyName ?? "Carrier"}</div>
                    <div className="text-[11px] text-slate-500">MC# {c.mcNumber ?? "—"} · DOT# {c.dotNumber ?? "—"}</div>
                  </div>
                  {c.tier && (
                    <span className={`px-2 py-0.5 text-[10px] rounded font-medium shrink-0 ${c.tier === "PLATINUM" || c.tier === "GOLD" ? "bg-[#C5A572]/20 text-[#BA7517]" : "bg-slate-100 text-slate-600"}`}>
                      {c.tier}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
