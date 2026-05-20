"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, MapPin, Package, Calendar, FileText, Truck, DollarSign, MessageSquare, AlertCircle, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CustomerPicker, type CustomerSummary } from "@/components/shared/CustomerPicker";
import { IconTabs, type IconTabDef } from "@/components/ui/IconTabs";

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

// Sprint 59.a (v3.8.acn) Bug #3 fix — Carrier search result shape matches
// /api/carrier/all response (carrierController.ts:772-790). The endpoint
// maps `c.user.company` to field `company` (NOT `companyName`); Sprint 59
// originally read `companyName` which was always undefined, falling back
// to the literal "Carrier" rendering. Same root cause class as Sprint 36
// Y1's broken picker (Item 49 closure precedent).
interface CarrierSearchResult {
  id: string;
  company: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  tier: string | null;
  onboardingStatus: string | null;
  insuranceExpiry: string | null;
  contactName?: string | null;
  email?: string | null;
  phone?: string | null;
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

  // Financials. Sprint 59.b (v3.8.act) Item 176 dropped fuelSurcharge
  // from drawer scope: FSC is an RC-PDF-generation concern, not a
  // tender-creation one. autoRateConfirmationService hardcodes 0 on
  // the seed RC; AE adjusts on the RC PDF surface post-acceptance.
  customerRate: string;
  offeredRate: string; // → tender.offeredRate
  expiresAtHours: string; // tender window in hours from now

  // Instructions
  specialInstructions: string;
  pickupInstructions: string;
  deliveryInstructions: string;
}

/**
 * Sprint 59.b (v3.8.act) Item 176 — Multi-line freight passthrough.
 *
 * Order Builder's lineItems[] is a per-row LineItemFormData[] (NOT a
 * JSON blob — maps 1:1 to backend LoadLineItem rows). Drawer's
 * freight UI is single-line for Sprint 59 scope, so the primary line
 * goes into the form's pieces/packageType/weight/description fields
 * via initialFormData. Lines 2..N pass through this separate prop so
 * they round-trip through the drawer without loss. On submit, the
 * mutation builds the final lineItems[] = [editedPrimary, ...lineItemsRest].
 * Multi-line edit UI is Item 178 / Sprint 60+ scope.
 */
export interface DrawerLineItemRest {
  pieces: number;
  packageType: string;
  description: string;
  weight: number;
  freightClass?: string | null;
  nmfcCode?: string | null;
  hazmat?: boolean;
  hazmatUnNumber?: string | null;
  hazmatClass?: string | null;
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
  /** Extra freight lines beyond the primary (lines 2..N). Pass-through only;
   *  drawer renders "+N more lines" chip and forwards on submit. */
  lineItemsRest?: DrawerLineItemRest[];
  onClose: () => void;
  onSubmitSuccess?: (result: { loadId: string; tenderId: string; rcId: string | null }) => void;
}

type SectionKey = "lane" | "freight" | "schedule" | "stops" | "carrier" | "financials" | "instructions";

// Sprint 59.a (v3.8.acn) Bug #1 fix — vertical IconTabs canonical (matches
// T&T LoadDetailDrawer pattern at frontend/src/app/dashboard/track-trace/
// LoadDetailDrawer.tsx:108-112). Sprint 59 originally shipped horizontal
// tabs in the form body; this restructures to match the canonical right-
// drawer pattern (IconTabs left strip + flex-1 content sibling).
const SECTIONS: IconTabDef<SectionKey>[] = [
  { id: "lane",          label: "Lane",         Icon: MapPin },
  { id: "freight",       label: "Freight",      Icon: Package },
  { id: "schedule",      label: "Schedule",     Icon: Calendar },
  { id: "stops",         label: "Refs",         Icon: FileText },
  { id: "carrier",       label: "Carrier",      Icon: Truck },
  { id: "financials",    label: "Financials",   Icon: DollarSign },
  { id: "instructions",  label: "Instructions", Icon: MessageSquare },
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
  customerRate: "", offeredRate: "", expiresAtHours: "24",
  specialInstructions: "", pickupInstructions: "", deliveryInstructions: "",
};

export function CarrierEngagementDrawer(props: CarrierEngagementDrawerProps) {
  const { open, mode, initialCustomer, orderId, loadId, initialFormData, lineItemsRest, onClose, onSubmitSuccess } = props;

  // Risk 5 — runtime throw guards for un-implemented modes
  if (mode === "review")    throw new Error("CarrierEngagementDrawer Mode 'review' is not yet implemented. Scheduled for Sprint 60.");
  if (mode === "finalize")  throw new Error("CarrierEngagementDrawer Mode 'finalize' is not yet implemented. Scheduled for Sprint 61.");
  if (mode === "recovery")  throw new Error("CarrierEngagementDrawer Mode 'recovery' is not yet implemented. Scheduled for Sprint 62.");

  const router = useRouter();
  const [section, setSection] = useState<SectionKey>("lane");
  const [customer, setCustomer] = useState<CustomerSummary | null>(initialCustomer ?? null);
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierSearchResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<DrawerFormState>({
    defaultValues: { ...EMPTY_FORM, ...(initialFormData ?? {}) },
  });

  // Sprint 59.a (v3.8.acn) Bug #2 fix — re-seed form on each `open` flip.
  // react-hook-form's useForm reads defaultValues only once at mount; the
  // drawer is rendered every Order Builder render with `open` toggling
  // visibility, so the initial mount captured EMPTY_FORM and never picked
  // up subsequent initialFormData from the filled Order Builder draft.
  // Calling reset() on each open=true hydrates the form from the latest
  // initialFormData prop. Sub-pattern 10 (hydration-effect-dep-array-audit)
  // applies: dep array intentionally watches [open] only, NOT
  // [initialFormData] which would re-fire on every parent render.
  useEffect(() => {
    if (open) reset({ ...EMPTY_FORM, ...(initialFormData ?? {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
        // Sprint 59.b (v3.8.act) Item 176 — combine primary line (from
        // form fields) with pass-through extra lines so multi-line BOL
        // round-trips through the drawer without loss. lineItemsRest is
        // typically populated when drawer is launched from an Order
        // Builder draft with form.lineItems.length > 1.
        lineItems: [
          {
            lineNumber: 1,
            pieces: parseInt(data.pieces, 10) || 1,
            packageType: data.packageType || "PLT",
            description: data.description || "General Freight",
            weight: Number(data.weight) || 0,
          },
          ...(lineItemsRest ?? []).map((li, i) => ({
            lineNumber: i + 2,
            pieces: li.pieces,
            packageType: li.packageType || "PLT",
            description: li.description,
            weight: li.weight,
            freightClass: li.freightClass ?? null,
            nmfcCode: li.nmfcCode ?? null,
            hazmat: li.hazmat ?? false,
            hazmatUnNumber: li.hazmatUnNumber ?? null,
            hazmatClass: li.hazmatClass ?? null,
          })),
        ],
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
        className="absolute top-0 bottom-0 right-0 w-full max-w-[720px] bg-white shadow-2xl flex animate-slide-in-right"
      >
        {/* Sprint 59.a (v3.8.acn) Bug #1 — vertical IconTabs strip canonical
            (matches T&T LoadDetailDrawer.tsx:108-112). Replaces Sprint 59's
            horizontal tab nav which violated the right-drawer canonical
            pattern. */}
        <IconTabs tabs={SECTIONS} active={section} onChange={setSection} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 shrink-0 flex items-center justify-between gap-3">
            <div>
              <h2 id="carrier-drawer-title" className="text-lg font-semibold text-slate-900">
                Carrier Engagement {mode === "build-and-tender" && <span className="text-xs font-normal text-slate-500 ml-2">Build &amp; Tender</span>}
              </h2>
              <div className="text-xs text-slate-500 mt-0.5">
                {customer ? customer.name : "No customer selected"}
                {selectedCarrier && customer && " · "}
                {selectedCarrier && <span className="text-[#BA7517] font-medium">{selectedCarrier.company ?? "Carrier"} (MC# {selectedCarrier.mcNumber ?? "not on file"})</span>}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
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
                {/* Sprint 59.b (v3.8.act) Item 176 — multi-line chip.
                    When Order Builder draft has >1 line item, primary is
                    editable in the form; extras pass through on submit. */}
                {lineItemsRest && lineItemsRest.length > 0 ? (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#FAEEDA]/40 border border-[#BA7517]/30">
                    <div className="text-[11px] text-slate-700">
                      Primary freight line shown below. <strong>+{lineItemsRest.length} more line{lineItemsRest.length === 1 ? "" : "s"}</strong> from the order draft will be included on the BOL.
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#BA7517] text-white font-medium">+{lineItemsRest.length}</span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-500 italic">
                    Single-line freight. Multi-line edit UI is Sprint 60+.
                  </div>
                )}
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
            {/* Sprint 59.b (v3.8.act) Item 176 — fuelSurcharge input
                removed. FSC is an RC-PDF-generation concern, not a
                tender-creation one. AE sets FSC on the RC modal post-
                acceptance; autoRateConfirmationService seeds the RC
                with fuelSurcharge=0 at tender creation. Drawer only
                captures carrier-facing values: offered rate + tender
                expiry. Customer rate flows from Order Builder via
                initialFormData → buildPayload → Load.customerRate. */}
            {section === "financials" && (
              <div className="space-y-3">
                {watch("customerRate") && (
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
                    Customer rate (from order): <strong className="text-slate-900">${Number(watch("customerRate")).toLocaleString()}</strong>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Offered rate to carrier ($)</Label>
                    <Input type="number" step="0.01" {...register("offeredRate", { required: true })} />
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
                <div className="text-[11px] text-slate-500 italic pt-1">
                  Fuel surcharge is set on the Rate Confirmation PDF surface after the carrier accepts. Not collected here.
                </div>
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
        </div>{/* close flex-1 main content sibling of IconTabs strip */}
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
              <span className="text-sm font-semibold text-slate-900 truncate">{selected.company ?? "Carrier"}</span>
              {selected.tier && (
                <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${selected.tier === "PLATINUM" || selected.tier === "GOLD" ? "bg-[#C5A572]/20 text-[#BA7517]" : "bg-slate-200 text-slate-700"}`}>
                  {selected.tier}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              MC# {selected.mcNumber ?? "n/a"} · DOT# {selected.dotNumber ?? "n/a"}
              {selected.email && ` · ${selected.email}`}
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
                    <div className="text-sm font-medium text-slate-900 truncate">{c.company ?? "Carrier"}</div>
                    <div className="text-[11px] text-slate-500">MC# {c.mcNumber ?? "n/a"} · DOT# {c.dotNumber ?? "n/a"}</div>
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
