"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { X, AlertCircle, AlertTriangle, ShieldAlert, Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { type CustomerSummary } from "@/components/shared/CustomerPicker";
import { OverrideComplianceModal } from "@/components/loads/OverrideComplianceModal";

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

// Sprint 63 (v3.8.afi) — SectionKey deprecated. Drawer no longer uses IconTabs.

// Strip leading "MC-" / "MC " / "MC#" / "MC# " from carrier.mcNumber so
// header rendering produces "MC# 596655" not "MC# MC-596655". Some
// CarrierProfile rows store the prefix verbatim from FMCSA snapshots.
function cleanMcNumber(raw: string | null | undefined): string {
  if (!raw) return "not on file";
  return String(raw).replace(/^MC[#\s-]*/i, "").trim() || "not on file";
}

type InstructionsAudience = "special" | "pickup" | "delivery";

interface ComplianceResult {
  allowed: boolean;
  blocked_reasons: string[];
  warnings: string[];
}

// Sprint 63 (v3.8.afi) — IconTabs SECTIONS array deprecated. Drawer
// collapses to 3 stacked sections (Carrier / Financials / Instructions)
// + read-only SummaryHeader. AE no longer tabs through order data
// already entered in Order Builder.

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
  const [customer, setCustomer] = useState<CustomerSummary | null>(initialCustomer ?? null);
  const [selectedCarrier, setSelectedCarrier] = useState<CarrierSearchResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Sprint 63 (v3.8.afi) — Instructions audience tabs (mirrors Order
  // Builder Section 4 Sprint 61 pattern). One textarea binds to the
  // active audience field; underlying 3 fields (specialInstructions /
  // pickupInstructions / deliveryInstructions) preserved on submit.
  const [instructionsAudience, setInstructionsAudience] = useState<InstructionsAudience>("special");
  // Sprint 63 — compliance override modal state. Mounts the existing
  // Sprint 40 OverrideComplianceModal (Item 58) when ADMIN/CEO clicks
  // "Override compliance block" next to the blocked-reasons banner.
  const [showOverrideModal, setShowOverrideModal] = useState(false);

  // Sprint 63 — role gate for compliance override button. Mirrors
  // Load Board pattern at loads/page.tsx:144.
  const { user } = useAuthStore();
  const isAdminOrCeo = user?.role === "ADMIN" || user?.role === "CEO";

  const { register, handleSubmit, watch, reset, setValue, formState } = useForm<DrawerFormState>({
    defaultValues: { ...EMPTY_FORM, ...(initialFormData ?? {}) },
  });

  // Sprint 63 (v3.8.afi) — compliance pre-check. Fires when AE selects
  // a carrier so the blocked_reasons surface BEFORE the AE clicks Send
  // Tender. Mirrors Load Board TenderForm pattern at loads/page.tsx:851.
  // GET /compliance/carrier/:id/check returns { allowed, blocked_reasons[], warnings[] }
  // per complianceMonitorService.ts:22-167.
  const complianceQuery = useQuery<ComplianceResult>({
    queryKey: ["drawer-compliance", selectedCarrier?.id],
    queryFn: async () => {
      // POST per backend signature at routes/compliance.ts:58. Endpoint is
      // idempotent + read-shaped; POST is the existing contract.
      const { data } = await api.post(`/compliance/carrier/${selectedCarrier!.id}/check`);
      return data as ComplianceResult;
    },
    enabled: !!selectedCarrier?.id,
    staleTime: 30_000,
  });

  const compliance = complianceQuery.data ?? null;
  const isCarrierBlocked = compliance !== null && !compliance.allowed;
  const hasComplianceWarnings = compliance !== null && compliance.allowed && compliance.warnings.length > 0;

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
      // Sprint 65.b diagnostic — confirms mutationFn was reached.
      // Will be removed in 65.c once root cause is captured.
      // eslint-disable-next-line no-console
      console.log("[Sprint 65.b diag] mutationFn REACHED. data:", data);
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

  // Instructions audience tab metadata (mirrors Order Builder Section 4 Sprint 61).
  const INSTR_TABS = [
    { key: "special" as const,  label: "Carrier (rate con + email)", field: "specialInstructions" as const, hint: "Carrier sees this on the Rate Confirmation PDF and tender email." },
    { key: "pickup" as const,   label: "Pickup",                     field: "pickupInstructions" as const,  hint: "Pickup-specific notes for the driver." },
    { key: "delivery" as const, label: "Delivery",                   field: "deliveryInstructions" as const, hint: "Delivery-specific notes for the driver." },
  ];
  const activeInstr = INSTR_TABS.find((t) => t.key === instructionsAudience)!;

  // Sprint 63 — block submit when compliance is loaded + blocked. AE must
  // override (or pick a different carrier) before Send Tender enables.
  // Sprint 65.a (v3.8.afn) — drop complianceQuery.isLoading from sendBlocked.
  // Over-conservative: the server re-validates compliance on submit, and
  // TanStack v5.66 keeps isLoading=false after the initial fetch (only
  // isFetching toggles during refetch). The check was creating a false
  // disable window post-override-refetch. isCarrierBlocked alone is the
  // load-bearing gate (compliance.allowed=false → block).
  const sendBlocked =
    submitMutation.isPending ||
    !customer ||
    !selectedCarrier ||
    isCarrierBlocked;

  // Sprint 65.a — diagnostic tooltip when disabled so AE sees the WHY
  // (or surfaces a stale-state bug if none of these reasons apply).
  const sendBlockedReason = (() => {
    if (submitMutation.isPending) return "Submitting…";
    if (!customer) return "Customer not selected. Close drawer and pick a customer in Order Builder.";
    if (!selectedCarrier) return "Select a carrier first.";
    if (isCarrierBlocked) return "Carrier blocked. Override or pick a different carrier.";
    return undefined;
  })();

  return (
    // Sprint 65 (v3.8.afm) hotfix — z-[60] so the drawer wrapper stacks
    // above the Marco Polo chat widget (fixed bottom-6 right-6 z-50).
    // Pre-hotfix the widget at the same z-50 + later in DOM (mounted at
    // dashboard layout level) was overlapping the Send Tender button at
    // bottom-right of the drawer footer; clicks landed on the chat
    // widget instead of the button.
    <div className="fixed inset-0 z-[60]">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="carrier-drawer-title"
        className="absolute top-0 bottom-0 right-0 w-full max-w-[720px] bg-white shadow-2xl flex flex-col animate-slide-in-right"
      >
        {/* Sprint 63 (v3.8.afi) — IconTabs dropped. 3-section drawer scrolls
            vertically; tabs canonical (§13.3 Item 63) was for ≥5 sections.
            Customer breadcrumb dropped in Mode 1 — Order Builder already
            shows it. Carrier line stays since that's the new pick. */}
        <div className="px-6 py-4 border-b border-slate-200 shrink-0 flex items-center justify-between gap-3">
          <div>
            <h2 id="carrier-drawer-title" className="text-lg font-semibold text-slate-900">
              Carrier Engagement
              {mode === "build-and-tender" && <span className="text-xs font-normal text-slate-500 ml-2">Build &amp; Tender</span>}
            </h2>
            {selectedCarrier && (
              <div className="text-xs mt-0.5">
                <span className="text-[#BA7517] font-medium">
                  {selectedCarrier.company ?? "Carrier"}
                </span>
                <span className="text-slate-500"> · MC# {cleanMcNumber(selectedCarrier.mcNumber)}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600 transition focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sprint 63 — read-only SummaryHeader. Replaces the 4 dropped data-
            entry tabs (Lane / Freight / Schedule / Refs). AE who needs to
            edit lane data closes the drawer and edits in Order Builder. */}
        <SummaryHeader
          customer={customer}
          originCity={watch("originCity")} originState={watch("originState")} originCompany={watch("originCompany")}
          destCity={watch("destCity")} destState={watch("destState")} destCompany={watch("destCompany")}
          distance={watch("distance")}
          equipmentType={watch("equipmentType")}
          pickupDate={watch("pickupDate")} pickupTimeStart={watch("pickupTimeStart")} pickupTimeEnd={watch("pickupTimeEnd")}
          deliveryDate={watch("deliveryDate")} deliveryTimeStart={watch("deliveryTimeStart")} deliveryTimeEnd={watch("deliveryTimeEnd")}
          pieces={watch("pieces")} weight={watch("weight")} description={watch("description")}
          lineItemsRestCount={lineItemsRest?.length ?? 0}
          poNumbersText={watch("poNumbersText")}
        />

        {/* Sprint 65.b diagnostic — wraps handleSubmit to log form event +
            sendBlocked terms + formState.errors. Removed in 65.c after root
            cause captured. Two failed fix attempts (65 z-index, 65.a state
            relaxation) without click-time evidence. This pass captures the
            ground truth on a real click. */}
        <form
          onSubmit={(e) => {
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag] FORM onSubmit fired ────────────────");
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag] sendBlocked:", sendBlocked, "reason:", sendBlockedReason);
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag]   submitMutation.isPending:", submitMutation.isPending);
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag]   !customer:", !customer, "customer:", customer);
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag]   !selectedCarrier:", !selectedCarrier, "selectedCarrier:", selectedCarrier);
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag]   isCarrierBlocked:", isCarrierBlocked, "compliance:", compliance);
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag] formState.errors:", formState.errors);
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag] formState.isValid:", formState.isValid);
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag] formState.isSubmitting:", formState.isSubmitting);
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag] watched offeredRate:", watch("offeredRate"));
            // eslint-disable-next-line no-console
            console.log("[Sprint 65.b diag] watched carrierId:", watch("carrierId"));
            return handleSubmit(
              (d) => {
                // eslint-disable-next-line no-console
                console.log("[Sprint 65.b diag] handleSubmit VALID — invoking mutationFn with data:", d);
                submitMutation.mutate(d);
              },
              (errors) => {
                // eslint-disable-next-line no-console
                console.log("[Sprint 65.b diag] handleSubmit INVALID — errors:", errors);
              }
            )(e);
          }}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* ── CARRIER ── */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#BA7517] mb-2">Carrier</h3>
              <CarrierSection selected={selectedCarrier} onSelect={setSelectedCarrier} />

              {/* Compliance state — surfaces the specific blocked_reasons
                  the backend already returns. Pre-Sprint-63 the drawer
                  hid these behind a generic "Carrier is not eligible for
                  tender" toast. */}
              {complianceQuery.isLoading && selectedCarrier && (
                <div className="mt-3 p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Checking carrier compliance…
                </div>
              )}
              {isCarrierBlocked && compliance && (
                <div className="mt-3 p-3 rounded-lg bg-[#F6E3E3] border border-[#9B2C2C]/30">
                  <div className="flex items-center gap-2 mb-2">
                    <ShieldAlert className="w-4 h-4 text-[#9B2C2C]" />
                    <span className="text-sm font-semibold text-[#9B2C2C]">Carrier blocked from tender</span>
                  </div>
                  <ul className="space-y-1 pl-1">
                    {compliance.blocked_reasons.map((r, i) => (
                      <li key={i} className="text-xs text-[#9B2C2C]">· {r}</li>
                    ))}
                  </ul>
                  {/* Sprint 40 Item 58 — admin override path (mirrored from
                      Load Board TenderForm). ADMIN/CEO only; modal owns
                      reason capture + quota check + audit trail. */}
                  {isAdminOrCeo && (
                    <button
                      type="button"
                      onClick={() => setShowOverrideModal(true)}
                      className="mt-3 px-3 py-1.5 text-xs font-medium bg-[#BA7517] hover:bg-[#8f5a11] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40"
                      data-testid="drawer-override-compliance-btn"
                    >
                      Override compliance block
                    </button>
                  )}
                  {!isAdminOrCeo && (
                    <div className="mt-2 text-[11px] text-[#9B2C2C]/80 italic">
                      Override requires ADMIN or CEO role. Contact compliance@silkroutelogistics.ai.
                    </div>
                  )}
                </div>
              )}
              {hasComplianceWarnings && compliance && (
                <div className="mt-3 p-3 rounded-lg bg-[#FBEFD4] border border-[#B07A1A]/30">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4 text-[#B07A1A]" />
                    <span className="text-sm font-semibold text-[#B07A1A]">Compliance warnings</span>
                  </div>
                  <ul className="space-y-0.5">
                    {compliance.warnings.map((w, i) => (
                      <li key={i} className="text-xs text-[#B07A1A]">· {w}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {/* ── FINANCIALS ── */}
            {/* Sprint 65.a (v3.8.afn) — Wasi 2026-05-20: drawer "Offered
                rate to carrier" looked duplicative of Order Builder
                "Target carrier cost" since both are filled with the
                same number initially. They ARE conceptually distinct
                (target = budget set at order build; offer = actual rate
                sent to THIS specific carrier, may diverge for negotiation
                purposes), but the labels obscured the relationship.
                Restructured: show BOTH customer rate + target as read-
                only context from Order Builder, then the editable offer
                input clearly labeled with carrier name + delta from
                target if AE adjusts. */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#BA7517] mb-2">Financials</h3>
              <div className="space-y-3">
                {/* Context block — Customer rate + Target carrier cost both
                    pulled from Order Builder. Read-only here; AE who needs to
                    adjust either closes the drawer and edits in Order Builder. */}
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs space-y-1">
                  {watch("customerRate") && (
                    <div className="flex justify-between text-slate-600">
                      <span>Customer rate (from order)</span>
                      <strong className="text-slate-900">${Number(watch("customerRate")).toLocaleString()}</strong>
                    </div>
                  )}
                  {watch("offeredRate") && (
                    <div className="flex justify-between text-slate-600">
                      <span>Target carrier cost (from order)</span>
                      <strong className="text-slate-900">${Number(watch("offeredRate")).toLocaleString()}</strong>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>
                      Offer to {selectedCarrier?.company ? `${selectedCarrier.company.split(" ")[0]}` : "this carrier"} ($)
                    </Label>
                    <Input type="number" step="0.01" {...register("offeredRate", { required: true })} />
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Defaults to target. Edit to negotiate up or down for this specific carrier.
                    </div>
                  </div>
                  <div>
                    <Label>Tender expiry (hours)</Label>
                    <Input type="number" {...register("expiresAtHours")} />
                  </div>
                </div>
                {customer && watch("offeredRate") && watch("customerRate") && (
                  <div className="text-[11px] p-2 rounded bg-slate-50 border border-slate-200 text-slate-600">
                    Projected margin: <strong className="text-slate-900">${(Number(watch("customerRate")) - Number(watch("offeredRate"))).toFixed(2)}</strong> ·{" "}
                    {((1 - Number(watch("offeredRate")) / Number(watch("customerRate"))) * 100).toFixed(1)}%
                  </div>
                )}
                <div className="text-[11px] text-slate-500 italic">
                  Fuel surcharge is set on the Rate Confirmation PDF surface after the carrier accepts. Not collected here.
                </div>
              </div>
            </section>

            {/* ── INSTRUCTIONS ── Sprint 63 (v3.8.afi) syncs to Order Builder
                Section 4 Sprint 61 canonical: 1 textarea + 3 audience tabs
                (Carrier / Pickup / Delivery). Underlying 3 form fields
                preserved on submit for BOL/rate-con/driver separation. */}
            <section>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#BA7517] mb-2">Instructions</h3>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {INSTR_TABS.map((t) => {
                  const isActive = t.key === instructionsAudience;
                  const hasContent = !!(watch(t.field) || "").trim();
                  return (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setInstructionsAudience(t.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded-lg border transition focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40 ${
                        isActive
                          ? "border-[#BA7517] bg-[#FAEEDA] text-slate-900"
                          : "border-slate-200 bg-white text-slate-600 hover:border-[#C5A572]/40"
                      }`}
                    >
                      <span>{t.label}</span>
                      {hasContent && <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-[#BA7517]" : "bg-green-500"}`} />}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={watch(activeInstr.field) ?? ""}
                onChange={(e) => setValue(activeInstr.field, e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40"
                placeholder="Add notes…"
              />
              <div className="mt-1.5 text-[10px] text-slate-500">{activeInstr.hint}</div>
            </section>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-200 shrink-0 bg-slate-50">
            {submitError && !isCarrierBlocked && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>{submitError}</div>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40">
                Cancel
              </button>
              <button
                type="submit"
                disabled={sendBlocked}
                onClick={(e) => {
                  // Sprint 65.b diagnostic — confirms click is reaching the
                  // button (rules out z-index / overlay interception). Removed
                  // in 65.c after root cause captured.
                  // eslint-disable-next-line no-console
                  console.log("[Sprint 65.b diag] SEND TENDER BUTTON onClick fired. disabled prop:", sendBlocked, "event.defaultPrevented:", e.defaultPrevented);
                }}
                className="px-5 py-2 text-sm font-semibold bg-[#BA7517] hover:bg-[#8f5a11] text-white rounded-lg disabled:opacity-50 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-[#C5A572]/40"
                title={sendBlockedReason}
              >
                {submitMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Send Tender
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Sprint 63 — Override modal mounts above drawer per Sprint 40 Item
          58 pattern. On success, re-fetch compliance so the amber "Active
          compliance override in effect" warning renders + Send Tender
          enables (override grants 24h pass per backend). */}
      {showOverrideModal && selectedCarrier && compliance && (
        <OverrideComplianceModal
          carrierId={selectedCarrier.id}
          carrierName={selectedCarrier.company ?? "Carrier"}
          blockedReasons={compliance.blocked_reasons}
          onClose={() => setShowOverrideModal(false)}
          onSuccess={() => {
            setShowOverrideModal(false);
            complianceQuery.refetch();
          }}
        />
      )}
    </div>
  );
}

// ───────── Sprint 63 SummaryHeader ─────────
// Read-only summary of order data captured in Order Builder. Replaces the
// 4 IconTabs (Lane / Freight / Schedule / Refs) that Sprint 59 added.
// AE who needs to edit any of these closes the drawer and edits in Order
// Builder. Compact horizontal pill row, ~140px tall.

function SummaryHeader(props: {
  customer: CustomerSummary | null;
  originCity: string; originState: string; originCompany: string;
  destCity: string; destState: string; destCompany: string;
  distance: string;
  equipmentType: string;
  pickupDate: string; pickupTimeStart: string; pickupTimeEnd: string;
  deliveryDate: string; deliveryTimeStart: string; deliveryTimeEnd: string;
  pieces: string; weight: string; description: string;
  lineItemsRestCount: number;
  poNumbersText: string;
}) {
  const lane = (() => {
    const o = [props.originCity, props.originState].filter(Boolean).join(", ");
    const d = [props.destCity, props.destState].filter(Boolean).join(", ");
    if (!o && !d) return null;
    return `${o || "?"} → ${d || "?"}`;
  })();
  const distance = props.distance ? `${Number(props.distance).toLocaleString()} mi` : null;
  const equipment = props.equipmentType || null;
  const pickup = props.pickupDate ? `PU ${props.pickupDate}${props.pickupTimeStart ? ` ${props.pickupTimeStart}` : ""}${props.pickupTimeEnd ? `–${props.pickupTimeEnd}` : ""}` : null;
  const delivery = props.deliveryDate ? `DEL ${props.deliveryDate}${props.deliveryTimeStart ? ` ${props.deliveryTimeStart}` : ""}${props.deliveryTimeEnd ? `–${props.deliveryTimeEnd}` : ""}` : null;
  const freight = (() => {
    const parts: string[] = [];
    const totalLines = 1 + props.lineItemsRestCount;
    if (totalLines > 1) parts.push(`${totalLines} lines`);
    if (props.pieces) parts.push(`${props.pieces} pcs`);
    if (props.weight) parts.push(`${Number(props.weight).toLocaleString()} lb`);
    if (props.description && totalLines === 1) parts.push(props.description);
    return parts.length > 0 ? parts.join(" · ") : null;
  })();
  const refs = props.poNumbersText
    ? `PO ${props.poNumbersText.split(",").map((s) => s.trim()).filter(Boolean).join(", ")}`
    : null;

  const rows: Array<{ label: string; value: string }> = [];
  if (props.customer) rows.push({ label: "Customer", value: props.customer.name });
  if (lane) rows.push({ label: "Lane", value: `${lane}${distance ? ` · ${distance}` : ""}${equipment ? ` · ${equipment}` : ""}` });
  if (pickup || delivery) rows.push({ label: "Schedule", value: [pickup, delivery].filter(Boolean).join(" · ") });
  if (freight) rows.push({ label: "Freight", value: freight });
  if (refs) rows.push({ label: "Refs", value: refs });

  if (rows.length === 0) return null;

  return (
    <div className="px-6 py-3 bg-[#FBF7F0] border-b border-slate-200 shrink-0">
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-2 text-[11px]">
            <span className="uppercase tracking-wider text-[#6B7685] font-medium w-16 shrink-0">{r.label}</span>
            <span className="text-slate-900 truncate">{r.value}</span>
          </div>
        ))}
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
              MC# {cleanMcNumber(selected.mcNumber)} · DOT# {selected.dotNumber ?? "n/a"}
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
                    <div className="text-[11px] text-slate-500">MC# {cleanMcNumber(c.mcNumber)} · DOT# {c.dotNumber ?? "n/a"}</div>
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
