"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import {
  X,
  FileText,
  MapPin,
  Building2,
  Truck,
  DollarSign,
  ClipboardList,
  Scale,
  Send,
  Download,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Route,
  Users,
  CreditCard,
  ScrollText,
  MessageSquare,
  Search,
  Loader2,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════════════════════ */

interface RateConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  load: any;
}

interface Stop {
  id: string;
  type: "PICKUP" | "DELIVERY" | "STOP";
  company: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact: string;
  phone: string;
  reference: string;
  instructions: string;
  appointmentTime: string;
}

interface Accessorial {
  id: string;
  description: string;
  amount: string;
}

interface DocumentCheck {
  key: string;
  label: string;
  checked: boolean;
}

interface FormState {
  // 1 - Broker Info
  brokerCompany: string;
  brokerMC: string;
  brokerDOT: string;
  brokerAddress: string;
  brokerPhone: string;
  brokerEmail: string;
  brokerContact: string;
  brokerContactPhone: string;
  brokerContactEmail: string;
  loadReference: string;

  // 2 - Load Details
  originCity: string;
  originState: string;
  originZip: string;
  destCity: string;
  destState: string;
  destZip: string;
  distance: string;
  equipmentType: string;
  trailerLength: string;
  commodity: string;
  weight: string;
  pieces: string;
  pallets: string;
  freightClass: string;
  dimLength: string;
  dimWidth: string;
  dimHeight: string;
  stackable: boolean;
  hazmat: boolean;
  hazmatUnNumber: string;
  hazmatClass: string;
  hazmatPlacardRequired: boolean;
  hazmatEmergencyContact: string;
  temperatureControlled: boolean;
  tempMin: string;
  tempMax: string;
  tempContinuousMonitoring: boolean;
  crossBorder: boolean;
  borderCrossingPoint: string;
  customsBrokerName: string;
  customsBrokerPhone: string;
  bondType: string;
  parsPapsNumber: string;

  // 3 - Shipper / Pickup
  shipperCompany: string;
  shipperAddress: string;
  shipperCity: string;
  shipperState: string;
  shipperZip: string;
  shipperContact: string;
  shipperPhone: string;
  shipperEmail: string;
  shipperReference: string;
  shipperPO: string;
  pickupNumber: string;
  pickupDate: string;
  pickupTimeStart: string;
  pickupTimeEnd: string;
  pickupHours: string;
  pickupInstructions: string;
  loadingType: string;

  // 4 - Consignee / Delivery
  consigneeCompany: string;
  consigneeAddress: string;
  consigneeCity: string;
  consigneeState: string;
  consigneeZip: string;
  consigneeContact: string;
  consigneePhone: string;
  consigneeEmail: string;
  deliveryReference: string;
  deliveryAppointment: string;
  deliveryDate: string;
  deliveryTimeStart: string;
  deliveryTimeEnd: string;
  deliveryHours: string;
  deliveryInstructions: string;
  unloadingType: string;

  // 5 - Stops
  isMultiStop: boolean;
  stops: Stop[];

  // 6 - Carrier / Driver
  assignmentType: "COMPANY_DRIVER" | "PARTNER_CARRIER";
  carrierId: string;
  carrierCompany: string;
  carrierMC: string;
  carrierDOT: string;
  carrierContact: string;
  carrierPhone: string;
  carrierEmail: string;
  driverName: string;
  driverPhone: string;
  truckNumber: string;
  trailerNumber: string;

  // 7 - Financials
  customerRate: string;
  carrierLineHaul: string;
  fuelSurcharge: string;
  fuelSurchargeType: "FLAT" | "PER_MILE";
  accessorials: Accessorial[];
  totalCarrierPay: string;

  // 8 - Payment Terms
  paymentTier: string;
  quickPayFeePercent: string;
  netPayAmount: string;
  documentChecklist: DocumentCheck[];

  // 9 - Terms & Conditions
  termsConditions: string;

  // 10 - Special Instructions
  specialInstructions: string;

  // Email send
  recipientEmail: string;
  recipientName: string;
  emailMessage: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════ */

const SECTIONS = [
  { key: "broker", label: "Broker Info", icon: Building2, num: 1 },
  { key: "load", label: "Load Details", icon: FileText, num: 2 },
  { key: "shipper", label: "Shipper / Pickup", icon: MapPin, num: 3 },
  { key: "consignee", label: "Consignee / Delivery", icon: MapPin, num: 4 },
  { key: "stops", label: "Stops", icon: Route, num: 5 },
  { key: "carrier", label: "Carrier / Driver", icon: Truck, num: 6 },
  { key: "financials", label: "Financials", icon: DollarSign, num: 7 },
  { key: "payment", label: "Payment Terms", icon: CreditCard, num: 8 },
  { key: "terms", label: "Terms & Conditions", icon: Scale, num: 9 },
  { key: "instructions", label: "Special Instructions", icon: MessageSquare, num: 10 },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

const EQUIPMENT_TYPES = [
  "Dry Van", "Reefer", "Flatbed", "Step Deck", "Lowboy",
  "Tanker", "Car Hauler", "Conestoga", "Power Only", "Box Truck",
];

const LOADING_TYPES = ["Live Load", "Drop Trailer", "Driver Assist"];
const UNLOADING_TYPES = ["Live Unload", "Drop Trailer", "Driver Assist"];

const PAYMENT_TIERS: Record<string, { label: string; days: string; fee: number }> = {
  FLASH: { label: "Flash Pay", days: "Same Day", fee: 5 },
  EXPRESS: { label: "Express Pay", days: "2 Business Days", fee: 3.5 },
  PRIORITY: { label: "Priority Pay", days: "7 Business Days", fee: 2 },
  PARTNER: { label: "Partner Pay", days: "15 Business Days", fee: 1 },
  ELITE: { label: "Elite Pay", days: "21 Business Days", fee: 0.5 },
  STANDARD: { label: "Standard Pay", days: "30 Business Days", fee: 0 },
};

const DEFAULT_DOCUMENT_CHECKLIST: DocumentCheck[] = [
  { key: "rateConfirmation", label: "Signed Rate Confirmation", checked: false },
  { key: "bol", label: "Bill of Lading (BOL)", checked: false },
  { key: "pod", label: "Proof of Delivery (POD)", checked: false },
  { key: "lumperReceipt", label: "Lumper Receipt (if applicable)", checked: false },
  { key: "scaleTicket", label: "Scale Ticket (if applicable)", checked: false },
  { key: "w9", label: "W-9 on File", checked: false },
  { key: "insurance", label: "Certificate of Insurance (COI)", checked: false },
  { key: "carrierAuthority", label: "Carrier Authority Verification", checked: false },
];

const DEFAULT_TERMS = `CARRIER-BROKER AGREEMENT - TERMS & CONDITIONS

1. TRANSPORTATION SERVICES: Carrier agrees to transport the shipment(s) described herein from origin to destination in accordance with the terms of this Rate Confirmation. This Rate Confirmation, when signed by Carrier, shall constitute a binding contract.

2. INSURANCE REQUIREMENTS: Carrier shall maintain at minimum: (a) Commercial Auto Liability - $1,000,000 combined single limit; (b) Cargo Insurance - $100,000 minimum; (c) General Liability - $1,000,000 per occurrence. Certificates must be provided upon request.

3. EQUIPMENT: Carrier shall furnish suitable, clean, and properly maintained equipment in compliance with all DOT/FMCSA regulations. Equipment must be free of contaminants and odors.

4. DOUBLE BROKERING PROHIBITED: Carrier shall not re-broker, co-broker, or assign this shipment to any other carrier, broker, or third party without prior written consent from Broker. Violation of this clause shall result in immediate forfeiture of payment.

5. DETENTION: Free time of two (2) hours is allowed at each stop. After free time, detention will be paid at $75.00/hour with prior authorization from Broker.

6. TONU (Truck Ordered Not Used): If Carrier is dispatched and load is cancelled by shipper after Carrier has been dispatched, a TONU fee of $250.00 will be paid to Carrier, subject to Broker verification.

7. CLAIMS: Carrier is liable for all cargo loss and damage claims. Claims must be filed within nine (9) months of delivery. Carrier must maintain cargo insurance for the full declared value of goods.

8. PAYMENT TERMS: Payment will be processed per the selected payment tier upon receipt of all required documentation including signed BOL, POD, and any applicable accessorial receipts.

9. TRACKING/COMMUNICATION: Carrier must provide tracking updates via GPS/ELD integration or manual check calls as specified. Failure to provide timely updates may result in service penalties.

10. COMPLIANCE: Carrier shall comply with all applicable federal, state, and local laws, including FMCSA regulations, FMCSA Hours of Service, drug and alcohol testing requirements, and hazmat regulations where applicable.

11. CONFIDENTIALITY: Carrier shall not contact Broker's customer(s) directly or disclose any rate, financial, or business information to any third party.

12. GOVERNING LAW: This agreement shall be governed by the laws of the State of Texas and applicable federal transportation law (49 U.S.C. Section 14101(b)).`;

const SRL_INFO = {
  company: "Silk Route Logistics Inc.",
  mc: "MC-1234567",
  dot: "DOT-9876543",
  address: "8950 Westheimer Rd, Suite 200, Houston, TX 77063",
  phone: "(832) 555-0175",
  email: "dispatch@silkroutelogistics.ai",
};

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

function fmtMoney(val: string | number | undefined | null): string {
  const n = typeof val === "string" ? parseFloat(val) : (val ?? 0);
  if (isNaN(n)) return "$0.00";
  return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function toNum(val: string): number {
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

/* ═══════════════════════════════════════════════════════════════════════════
   INIT FORM STATE
   ═══════════════════════════════════════════════════════════════════════════ */

function initForm(load: any, user: any): FormState {
  const brokerName = user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() : "";
  const brokerEmail = user?.email || "";
  const brokerPhone = user?.phone || "";

  return {
    // 1 - Broker Info
    brokerCompany: SRL_INFO.company,
    brokerMC: SRL_INFO.mc,
    brokerDOT: SRL_INFO.dot,
    brokerAddress: SRL_INFO.address,
    brokerPhone: SRL_INFO.phone,
    brokerEmail: SRL_INFO.email,
    brokerContact: brokerName,
    brokerContactPhone: brokerPhone,
    brokerContactEmail: brokerEmail,
    loadReference: load?.referenceNumber || "",

    // 2 - Load Details
    originCity: load?.originCity || "",
    originState: load?.originState || "",
    originZip: load?.originZip || "",
    destCity: load?.destCity || "",
    destState: load?.destState || "",
    destZip: load?.destZip || "",
    distance: load?.distance ? String(load.distance) : "",
    equipmentType: load?.equipmentType || "Dry Van",
    trailerLength: load?.trailerLength || "",
    commodity: load?.commodity || "",
    weight: load?.weight ? String(load.weight) : "",
    pieces: load?.pieces ? String(load.pieces) : "",
    pallets: load?.pallets ? String(load.pallets) : "",
    freightClass: load?.freightClass || "",
    dimLength: load?.dimensionsLength ? String(load.dimensionsLength) : "",
    dimWidth: load?.dimensionsWidth ? String(load.dimensionsWidth) : "",
    dimHeight: load?.dimensionsHeight ? String(load.dimensionsHeight) : "",
    stackable: load?.stackable ?? true,
    hazmat: load?.hazmat || false,
    hazmatUnNumber: load?.hazmatUnNumber || "",
    hazmatClass: load?.hazmatClass || "",
    hazmatPlacardRequired: load?.hazmatPlacardRequired || false,
    hazmatEmergencyContact: load?.hazmatEmergencyContact || "",
    temperatureControlled: load?.temperatureControlled || false,
    tempMin: load?.tempMin ? String(load.tempMin) : "",
    tempMax: load?.tempMax ? String(load.tempMax) : "",
    tempContinuousMonitoring: load?.tempContinuousMonitoring || false,
    crossBorder: load?.shipmentType === "CROSS_BORDER",
    borderCrossingPoint: load?.borderCrossingPoint || "",
    customsBrokerName: load?.customsBrokerName || "",
    customsBrokerPhone: load?.customsBrokerPhone || "",
    bondType: load?.bondType || "",
    parsPapsNumber: load?.parsPapsNumber || "",

    // 3 - Shipper / Pickup
    shipperCompany: load?.originCompany || "",
    shipperAddress: load?.originAddress || "",
    shipperCity: load?.originCity || "",
    shipperState: load?.originState || "",
    shipperZip: load?.originZip || "",
    shipperContact: load?.originContactName || load?.contactName || "",
    shipperPhone: load?.originContactPhone || load?.contactPhone || "",
    shipperEmail: "",
    shipperReference: load?.shipperReference || "",
    shipperPO: load?.shipperPoNumber || "",
    pickupNumber: load?.pickupNumber || "",
    pickupDate: load?.pickupDate ? load.pickupDate.split("T")[0] : "",
    pickupTimeStart: load?.pickupTimeStart || "",
    pickupTimeEnd: load?.pickupTimeEnd || "",
    pickupHours: load?.pickupHours || "",
    pickupInstructions: load?.pickupInstructions || "",
    loadingType: load?.loadingType || "",

    // 4 - Consignee / Delivery
    consigneeCompany: load?.destCompany || "",
    consigneeAddress: load?.destAddress || "",
    consigneeCity: load?.destCity || "",
    consigneeState: load?.destState || "",
    consigneeZip: load?.destZip || "",
    consigneeContact: load?.destContactName || "",
    consigneePhone: load?.destContactPhone || "",
    consigneeEmail: "",
    deliveryReference: load?.deliveryReference || "",
    deliveryAppointment: load?.deliveryAppointment || "",
    deliveryDate: load?.deliveryDate ? load.deliveryDate.split("T")[0] : "",
    deliveryTimeStart: load?.deliveryTimeStart || "",
    deliveryTimeEnd: load?.deliveryTimeEnd || "",
    deliveryHours: load?.deliveryHours || "",
    deliveryInstructions: load?.deliveryInstructions || "",
    unloadingType: load?.unloadingType || "",

    // 5 - Stops
    isMultiStop: load?.isMultiStop || false,
    stops: load?.stops ? (Array.isArray(load.stops) ? load.stops : []) : [],

    // 6 - Carrier / Driver
    assignmentType: load?.assignmentType || "PARTNER_CARRIER",
    carrierId: load?.carrierId || "",
    carrierCompany: load?.carrier?.company || "",
    carrierMC: load?.carrier?.carrierProfile?.mcNumber || "",
    carrierDOT: load?.carrier?.carrierProfile?.dotNumber || "",
    carrierContact: load?.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}` : "",
    carrierPhone: load?.carrier?.phone || "",
    carrierEmail: load?.carrier?.email || "",
    driverName: load?.driverName || "",
    driverPhone: load?.driverPhone || "",
    truckNumber: load?.truckNumber || "",
    trailerNumber: load?.trailerNumber || "",

    // 7 - Financials
    customerRate: load?.customerRate ? String(load.customerRate) : (load?.rate ? String(load.rate) : ""),
    carrierLineHaul: load?.carrierRate ? String(load.carrierRate) : (load?.rate ? String(load.rate) : ""),
    fuelSurcharge: load?.fuelSurcharge ? String(load.fuelSurcharge) : "0",
    fuelSurchargeType: load?.fuelSurchargeType || "FLAT",
    accessorials: load?.accessorials && Array.isArray(load.accessorials)
      ? load.accessorials.map((a: any) => ({ id: generateId(), description: a.description || a, amount: a.amount ? String(a.amount) : "0" }))
      : [],
    totalCarrierPay: load?.totalCarrierPay ? String(load.totalCarrierPay) : "",

    // 8 - Payment Terms
    paymentTier: load?.carrierPaymentTier || "STANDARD",
    quickPayFeePercent: load?.quickPayFeePercent ? String(load.quickPayFeePercent) : "",
    netPayAmount: "",
    documentChecklist: DEFAULT_DOCUMENT_CHECKLIST.map((d) => ({ ...d })),

    // 9 - Terms & Conditions
    termsConditions: load?.termsConditions || DEFAULT_TERMS,

    // 10 - Special Instructions
    specialInstructions: load?.specialInstructions || "",

    // Email
    recipientEmail: load?.carrier?.email || "",
    recipientName: load?.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}` : "",
    emailMessage: "",
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */

export function RateConfirmationModal({ open, onClose, load }: RateConfirmationModalProps) {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<SectionKey>("broker");
  const [form, setForm] = useState<FormState>(() => initForm(null, null));
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open && load) {
      setForm(initForm(load, user));
      setSection("broker");
    }
  }, [open, load, user]);

  // Generic updater
  const set = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Compute financials
  const financials = useMemo(() => {
    const customerRate = toNum(form.customerRate);
    const lineHaul = toNum(form.carrierLineHaul);
    const fuel = toNum(form.fuelSurcharge);
    const accTotal = form.accessorials.reduce((sum, a) => sum + toNum(a.amount), 0);
    const totalCarrier = lineHaul + fuel + accTotal;
    const margin = customerRate - totalCarrier;
    const marginPct = customerRate > 0 ? (margin / customerRate) * 100 : 0;
    const tierInfo = PAYMENT_TIERS[form.paymentTier] || PAYMENT_TIERS.STANDARD;
    const feePercent = form.paymentTier !== "STANDARD" ? tierInfo.fee : 0;
    const feeAmount = totalCarrier * (feePercent / 100);
    const netPay = totalCarrier - feeAmount;

    return { customerRate, lineHaul, fuel, accTotal, totalCarrier, margin, marginPct, tierInfo, feePercent, feeAmount, netPay };
  }, [form.customerRate, form.carrierLineHaul, form.fuelSurcharge, form.accessorials, form.paymentTier]);

  // Auto-update total carrier pay
  useEffect(() => {
    set("totalCarrierPay", String(financials.totalCarrier));
    set("netPayAmount", String(financials.netPay));
    set("quickPayFeePercent", String(financials.feePercent));
  }, [financials.totalCarrier, financials.netPay, financials.feePercent, set]);

  // Build API payload from form
  function buildPayload() {
    return {
      ...form,
      lineHaulRate: toNum(form.carrierLineHaul),
      fuelSurcharge: toNum(form.fuelSurcharge),
      totalCharges: financials.totalCarrier,
      customerRate: financials.customerRate,
      weight: form.weight ? parseFloat(form.weight) : undefined,
      pieces: form.pieces ? parseInt(form.pieces) : undefined,
      accessorials: form.accessorials
        .filter((a) => a.description.trim())
        .map((a) => ({ description: a.description, amount: toNum(a.amount) })),
    };
  }

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: { loadId: string; formData: Record<string, any> }) =>
      api.post("/rate-confirmations", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load"] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
    },
  });

  const sendMutation = useMutation({
    mutationFn: (data: { id: string; recipientEmail: string; recipientName?: string; message?: string }) =>
      api.post(`/rate-confirmations/${data.id}/send`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load"] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      onClose();
    },
  });

  const updateLoadMutation = useMutation({
    mutationFn: (data: { loadId: string; status: string; formData: Record<string, any> }) =>
      api.patch(`/loads/${data.loadId}/status`, { status: data.status }),
  });

  async function handleSaveDraft() {
    if (!load) return;
    setSaving(true);
    try {
      await createMutation.mutateAsync({ loadId: load.id, formData: buildPayload() });
      onClose();
    } catch (err) {
      console.error("Failed to save draft:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePdf() {
    if (!load) return;
    setSaving(true);
    try {
      const res = await api.post("/rate-confirmations", { loadId: load.id, formData: buildPayload() });
      const pdfRes = await api.get(`/rate-confirmations/${res.data.id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([pdfRes.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `RC-${load.referenceNumber}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate PDF:", err);
    } finally {
      setSaving(false);
    }
  }

  async function handleSendTender() {
    if (!load) return;
    setSaving(true);
    try {
      // 1. Create the rate confirmation
      const rcRes = await createMutation.mutateAsync({ loadId: load.id, formData: buildPayload() });

      // 2. Update load status to TENDERED
      try {
        await updateLoadMutation.mutateAsync({ loadId: load.id, status: "TENDERED", formData: buildPayload() });
      } catch {
        // Status update is best-effort; the RC was still created
      }

      // 3. Send email if recipient is specified
      if (form.recipientEmail.trim()) {
        await sendMutation.mutateAsync({
          id: rcRes.data.id,
          recipientEmail: form.recipientEmail.trim(),
          recipientName: form.recipientName || form.carrierCompany,
          message: form.emailMessage,
        });
      } else {
        onClose();
      }
    } catch (err) {
      console.error("Failed to send tender:", err);
    } finally {
      setSaving(false);
    }
  }

  if (!open || !load) return null;

  const sectionIdx = SECTIONS.findIndex((s) => s.key === section);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-stretch">
      <div className="flex w-full h-full">
        {/* ─── LEFT SIDEBAR ─── */}
        <div className="w-64 bg-[#0a1025] border-r border-white/10 flex flex-col shrink-0">
          {/* Header */}
          <div className="px-5 py-5 border-b border-white/10">
            <h2 className="text-lg font-bold text-[#C8963E]">Rate Confirmation</h2>
            <p className="text-xs text-slate-500 mt-1 font-mono">{load.referenceNumber}</p>
            <div className="mt-2 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-[#C8963E] animate-pulse" />
              <span className="text-[11px] text-slate-400">
                {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setSection(s.key)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all cursor-pointer ${
                    active
                      ? "bg-[#C8963E]/15 text-[#C8963E] border border-[#C8963E]/30"
                      : "text-slate-400 hover:text-white hover:bg-white/5 border border-transparent"
                  }`}
                >
                  <span
                    className={`flex items-center justify-center w-6 h-6 rounded text-[10px] font-bold shrink-0 ${
                      active ? "bg-[#C8963E]/20 text-[#C8963E]" : "bg-white/5 text-slate-500"
                    }`}
                  >
                    {s.num}
                  </span>
                  <span className="truncate">{s.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Sidebar Footer */}
          <div className="px-4 py-4 border-t border-white/10 space-y-2">
            <button
              onClick={handleGeneratePdf}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg text-xs font-medium transition disabled:opacity-40"
            >
              <Download className="w-3.5 h-3.5" />
              Generate PDF
            </button>
          </div>
        </div>

        {/* ─── MAIN CONTENT ─── */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0f172a]">
          {/* Top Bar */}
          <div className="flex items-center justify-between px-8 py-4 border-b border-white/10 bg-[#0f172a]">
            <div className="flex items-center gap-3">
              {(() => {
                const Icon = SECTIONS[sectionIdx].icon;
                return <Icon className="w-5 h-5 text-[#C8963E]" />;
              })()}
              <div>
                <h3 className="text-white font-semibold text-lg">{SECTIONS[sectionIdx].label}</h3>
                <p className="text-xs text-slate-500">
                  Section {SECTIONS[sectionIdx].num} of {SECTIONS.length}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-8 py-6">
            {section === "broker" && <SectionBroker form={form} set={set} />}
            {section === "load" && <SectionLoadDetails form={form} set={set} />}
            {section === "shipper" && <SectionShipper form={form} set={set} />}
            {section === "consignee" && <SectionConsignee form={form} set={set} />}
            {section === "stops" && <SectionStops form={form} set={set} />}
            {section === "carrier" && <SectionCarrier form={form} set={set} />}
            {section === "financials" && <SectionFinancials form={form} set={set} financials={financials} />}
            {section === "payment" && <SectionPayment form={form} set={set} financials={financials} />}
            {section === "terms" && <SectionTerms form={form} set={set} />}
            {section === "instructions" && <SectionInstructions form={form} set={set} />}
          </div>

          {/* Bottom Buttons */}
          <div className="flex items-center justify-between px-8 py-4 border-t border-white/10 bg-[#0a1025]">
            <button
              onClick={onClose}
              className="px-5 py-2.5 text-sm text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition font-medium"
            >
              Cancel
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveDraft}
                disabled={saving}
                className="px-5 py-2.5 text-sm text-white bg-white/10 hover:bg-white/15 rounded-lg transition font-medium disabled:opacity-40 flex items-center gap-2"
              >
                {saving && createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Save as Draft
              </button>

              <button
                onClick={handleSendTender}
                disabled={saving}
                className="px-6 py-2.5 text-sm text-[#0f172a] bg-[#C8963E] hover:bg-[#C8963E]/90 rounded-lg transition font-semibold disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-[#C8963E]/20"
              >
                {saving && sendMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                <Send className="w-4 h-4" />
                Send Tender to Carrier
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SHARED FIELD COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

const inputCls =
  "w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-600 focus:outline-none focus:border-[#C8963E]/50 focus:ring-1 focus:ring-[#C8963E]/20 transition";
const labelCls = "block text-xs font-medium text-slate-400 mb-1.5";
const sectionCardCls = "bg-white/[0.03] border border-white/[0.06] rounded-xl p-5";
const sectionTitleCls = "text-sm font-semibold text-[#C8963E] mb-4 flex items-center gap-2";

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  disabled,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className={labelCls}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`${inputCls} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} appearance-none pr-8`}
        >
          {placeholder && (
            <option value="" className="bg-[#0f172a]">
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#0f172a]">
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
      </div>
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className={`${inputCls} resize-y`}
      />
    </div>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
  description,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  description?: string;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 rounded border-white/20 bg-white/5 text-[#C8963E] focus:ring-[#C8963E]/30 cursor-pointer"
      />
      <div>
        <span className="text-sm text-slate-300 group-hover:text-white transition">{label}</span>
        {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
      </div>
    </label>
  );
}

function InfoBadge({ children, variant = "default" }: { children: React.ReactNode; variant?: "default" | "gold" | "green" | "red" }) {
  const colors = {
    default: "bg-white/5 border-white/10 text-slate-400",
    gold: "bg-[#C8963E]/10 border-[#C8963E]/20 text-[#C8963E]",
    green: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
    red: "bg-red-500/10 border-red-500/20 text-red-400",
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${colors[variant]}`}>
      {children}
    </span>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 1 - BROKER INFO
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionBroker({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Company Info */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <Building2 className="w-4 h-4" />
          Brokerage Company
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Company Name" value={form.brokerCompany} onChange={(v) => set("brokerCompany", v)} disabled />
          <Field label="MC Number" value={form.brokerMC} onChange={(v) => set("brokerMC", v)} disabled />
          <Field label="DOT Number" value={form.brokerDOT} onChange={(v) => set("brokerDOT", v)} disabled />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <div className="col-span-2">
            <Field label="Address" value={form.brokerAddress} onChange={(v) => set("brokerAddress", v)} disabled />
          </div>
          <Field label="Phone" value={form.brokerPhone} onChange={(v) => set("brokerPhone", v)} disabled />
        </div>
        <div className="mt-3">
          <Field label="Company Email" value={form.brokerEmail} onChange={(v) => set("brokerEmail", v)} disabled />
        </div>
      </div>

      {/* Broker Contact */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <Users className="w-4 h-4" />
          Broker Contact (You)
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Contact Name" value={form.brokerContact} onChange={(v) => set("brokerContact", v)} />
          <Field label="Direct Phone" value={form.brokerContactPhone} onChange={(v) => set("brokerContactPhone", v)} />
          <Field label="Email" value={form.brokerContactEmail} onChange={(v) => set("brokerContactEmail", v)} />
        </div>
      </div>

      {/* Load Reference */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <FileText className="w-4 h-4" />
          Reference
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Load Reference #" value={form.loadReference} onChange={(v) => set("loadReference", v)} disabled />
          <div>
            <label className={labelCls}>Date Issued</label>
            <input type="date" value={new Date().toISOString().split("T")[0]} readOnly className={`${inputCls} opacity-50`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 2 - LOAD DETAILS
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionLoadDetails({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Route */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <Route className="w-4 h-4" />
          Route
        </h4>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <p className="text-xs font-medium text-emerald-400">ORIGIN</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City" value={form.originCity} onChange={(v) => set("originCity", v)} className="col-span-1" />
              <Field label="State" value={form.originState} onChange={(v) => set("originState", v)} />
              <Field label="Zip" value={form.originZip} onChange={(v) => set("originZip", v)} />
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs font-medium text-red-400">DESTINATION</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="City" value={form.destCity} onChange={(v) => set("destCity", v)} className="col-span-1" />
              <Field label="State" value={form.destState} onChange={(v) => set("destState", v)} />
              <Field label="Zip" value={form.destZip} onChange={(v) => set("destZip", v)} />
            </div>
          </div>
        </div>
        <div className="mt-4">
          <Field label="Distance (miles)" value={form.distance} onChange={(v) => set("distance", v)} type="number" />
        </div>
      </div>

      {/* Equipment & Freight */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <Truck className="w-4 h-4" />
          Equipment & Freight
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <SelectField
            label="Equipment Type"
            value={form.equipmentType}
            onChange={(v) => set("equipmentType", v)}
            options={EQUIPMENT_TYPES.map((t) => ({ value: t, label: t }))}
          />
          <Field label="Trailer Length" value={form.trailerLength} onChange={(v) => set("trailerLength", v)} placeholder="e.g. 53ft" />
          <Field label="Commodity" value={form.commodity} onChange={(v) => set("commodity", v)} />
        </div>
        <div className="grid grid-cols-4 gap-4 mt-4">
          <Field label="Weight (lbs)" value={form.weight} onChange={(v) => set("weight", v)} type="number" />
          <Field label="Pieces" value={form.pieces} onChange={(v) => set("pieces", v)} type="number" />
          <Field label="Pallets" value={form.pallets} onChange={(v) => set("pallets", v)} type="number" />
          <Field label="Freight Class" value={form.freightClass} onChange={(v) => set("freightClass", v)} />
        </div>
        <div className="grid grid-cols-4 gap-4 mt-4">
          <Field label="Length (in)" value={form.dimLength} onChange={(v) => set("dimLength", v)} type="number" />
          <Field label="Width (in)" value={form.dimWidth} onChange={(v) => set("dimWidth", v)} type="number" />
          <Field label="Height (in)" value={form.dimHeight} onChange={(v) => set("dimHeight", v)} type="number" />
          <div className="flex items-end pb-1">
            <Checkbox label="Stackable" checked={form.stackable} onChange={(v) => set("stackable", v)} />
          </div>
        </div>
      </div>

      {/* Hazmat */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <AlertTriangle className="w-4 h-4" />
          Hazmat
        </h4>
        <Checkbox label="Hazardous Materials" checked={form.hazmat} onChange={(v) => set("hazmat", v)} description="Check if this shipment contains hazardous materials" />
        {form.hazmat && (
          <div className="grid grid-cols-4 gap-4 mt-4 pl-7">
            <Field label="UN Number" value={form.hazmatUnNumber} onChange={(v) => set("hazmatUnNumber", v)} />
            <Field label="Hazmat Class" value={form.hazmatClass} onChange={(v) => set("hazmatClass", v)} />
            <Field label="Emergency Contact" value={form.hazmatEmergencyContact} onChange={(v) => set("hazmatEmergencyContact", v)} />
            <div className="flex items-end pb-1">
              <Checkbox label="Placard Required" checked={form.hazmatPlacardRequired} onChange={(v) => set("hazmatPlacardRequired", v)} />
            </div>
          </div>
        )}
      </div>

      {/* Temperature */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>Temperature Control</h4>
        <Checkbox label="Temperature Controlled" checked={form.temperatureControlled} onChange={(v) => set("temperatureControlled", v)} />
        {form.temperatureControlled && (
          <div className="grid grid-cols-3 gap-4 mt-4 pl-7">
            <Field label="Min Temp (F)" value={form.tempMin} onChange={(v) => set("tempMin", v)} type="number" placeholder="e.g. 34" />
            <Field label="Max Temp (F)" value={form.tempMax} onChange={(v) => set("tempMax", v)} type="number" placeholder="e.g. 38" />
            <div className="flex items-end pb-1">
              <Checkbox label="Continuous Monitoring" checked={form.tempContinuousMonitoring} onChange={(v) => set("tempContinuousMonitoring", v)} />
            </div>
          </div>
        )}
      </div>

      {/* Cross-Border */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>Cross-Border / Customs</h4>
        <Checkbox label="Cross-Border Shipment" checked={form.crossBorder} onChange={(v) => set("crossBorder", v)} />
        {form.crossBorder && (
          <div className="space-y-4 mt-4 pl-7">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Border Crossing Point" value={form.borderCrossingPoint} onChange={(v) => set("borderCrossingPoint", v)} />
              <Field label="Bond Type" value={form.bondType} onChange={(v) => set("bondType", v)} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Customs Broker Name" value={form.customsBrokerName} onChange={(v) => set("customsBrokerName", v)} />
              <Field label="Customs Broker Phone" value={form.customsBrokerPhone} onChange={(v) => set("customsBrokerPhone", v)} />
              <Field label="PARS/PAPS #" value={form.parsPapsNumber} onChange={(v) => set("parsPapsNumber", v)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 3 - SHIPPER / PICKUP
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionShipper({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Shipper Company */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <Building2 className="w-4 h-4" />
          Shipper Company
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company Name" value={form.shipperCompany} onChange={(v) => set("shipperCompany", v)} />
          <Field label="Contact Name" value={form.shipperContact} onChange={(v) => set("shipperContact", v)} />
        </div>
        <div className="mt-4">
          <Field label="Street Address" value={form.shipperAddress} onChange={(v) => set("shipperAddress", v)} />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <Field label="City" value={form.shipperCity} onChange={(v) => set("shipperCity", v)} />
          <Field label="State" value={form.shipperState} onChange={(v) => set("shipperState", v)} />
          <Field label="Zip" value={form.shipperZip} onChange={(v) => set("shipperZip", v)} />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field label="Phone" value={form.shipperPhone} onChange={(v) => set("shipperPhone", v)} />
          <Field label="Email" value={form.shipperEmail} onChange={(v) => set("shipperEmail", v)} type="email" />
        </div>
      </div>

      {/* References */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <ClipboardList className="w-4 h-4" />
          References & Pickup
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Shipper Reference #" value={form.shipperReference} onChange={(v) => set("shipperReference", v)} />
          <Field label="PO Number" value={form.shipperPO} onChange={(v) => set("shipperPO", v)} />
          <Field label="Pickup Number" value={form.pickupNumber} onChange={(v) => set("pickupNumber", v)} />
        </div>
      </div>

      {/* Pickup Schedule */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>Pickup Schedule</h4>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Pickup Date" value={form.pickupDate} onChange={(v) => set("pickupDate", v)} type="date" />
          <Field label="Earliest Time" value={form.pickupTimeStart} onChange={(v) => set("pickupTimeStart", v)} type="time" />
          <Field label="Latest Time" value={form.pickupTimeEnd} onChange={(v) => set("pickupTimeEnd", v)} type="time" />
        </div>
        <div className="mt-4">
          <Field label="Dock Hours" value={form.pickupHours} onChange={(v) => set("pickupHours", v)} placeholder="e.g. Mon-Fri 7:00 AM - 3:00 PM" />
        </div>
      </div>

      {/* Loading & Instructions */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>Loading Instructions</h4>
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Loading Type"
            value={form.loadingType}
            onChange={(v) => set("loadingType", v)}
            options={LOADING_TYPES.map((t) => ({ value: t, label: t }))}
            placeholder="Select loading type..."
          />
        </div>
        <div className="mt-4">
          <TextArea
            label="Pickup Instructions"
            value={form.pickupInstructions}
            onChange={(v) => set("pickupInstructions", v)}
            rows={3}
            placeholder="Enter any special pickup instructions, dock details, check-in procedures..."
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 4 - CONSIGNEE / DELIVERY
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionConsignee({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Consignee Company */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <Building2 className="w-4 h-4" />
          Consignee Company
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Company Name" value={form.consigneeCompany} onChange={(v) => set("consigneeCompany", v)} />
          <Field label="Contact Name" value={form.consigneeContact} onChange={(v) => set("consigneeContact", v)} />
        </div>
        <div className="mt-4">
          <Field label="Street Address" value={form.consigneeAddress} onChange={(v) => set("consigneeAddress", v)} />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-4">
          <Field label="City" value={form.consigneeCity} onChange={(v) => set("consigneeCity", v)} />
          <Field label="State" value={form.consigneeState} onChange={(v) => set("consigneeState", v)} />
          <Field label="Zip" value={form.consigneeZip} onChange={(v) => set("consigneeZip", v)} />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <Field label="Phone" value={form.consigneePhone} onChange={(v) => set("consigneePhone", v)} />
          <Field label="Email" value={form.consigneeEmail} onChange={(v) => set("consigneeEmail", v)} type="email" />
        </div>
      </div>

      {/* References */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <ClipboardList className="w-4 h-4" />
          Delivery References
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Delivery Reference #" value={form.deliveryReference} onChange={(v) => set("deliveryReference", v)} />
          <Field label="Appointment #" value={form.deliveryAppointment} onChange={(v) => set("deliveryAppointment", v)} />
        </div>
      </div>

      {/* Delivery Schedule */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>Delivery Schedule</h4>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Delivery Date" value={form.deliveryDate} onChange={(v) => set("deliveryDate", v)} type="date" />
          <Field label="Earliest Time" value={form.deliveryTimeStart} onChange={(v) => set("deliveryTimeStart", v)} type="time" />
          <Field label="Latest Time" value={form.deliveryTimeEnd} onChange={(v) => set("deliveryTimeEnd", v)} type="time" />
        </div>
        <div className="mt-4">
          <Field label="Receiver Hours" value={form.deliveryHours} onChange={(v) => set("deliveryHours", v)} placeholder="e.g. Mon-Fri 8:00 AM - 5:00 PM" />
        </div>
      </div>

      {/* Unloading & Instructions */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>Unloading Instructions</h4>
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            label="Unloading Type"
            value={form.unloadingType}
            onChange={(v) => set("unloadingType", v)}
            options={UNLOADING_TYPES.map((t) => ({ value: t, label: t }))}
            placeholder="Select unloading type..."
          />
        </div>
        <div className="mt-4">
          <TextArea
            label="Delivery Instructions"
            value={form.deliveryInstructions}
            onChange={(v) => set("deliveryInstructions", v)}
            rows={3}
            placeholder="Enter any special delivery instructions, dock details, check-in procedures..."
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 5 - STOPS
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionStops({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  const addStop = () => {
    const newStop: Stop = {
      id: generateId(),
      type: "STOP",
      company: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      contact: "",
      phone: "",
      reference: "",
      instructions: "",
      appointmentTime: "",
    };
    set("stops", [...form.stops, newStop]);
  };

  const updateStop = (id: string, key: keyof Stop, value: string) => {
    set(
      "stops",
      form.stops.map((s) => (s.id === id ? { ...s, [key]: value } : s))
    );
  };

  const removeStop = (id: string) => {
    set(
      "stops",
      form.stops.filter((s) => s.id !== id)
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className={sectionCardCls}>
        <div className="flex items-center justify-between mb-5">
          <h4 className={`${sectionTitleCls} mb-0`}>
            <Route className="w-4 h-4" />
            Route Type
          </h4>
        </div>

        {/* Toggle */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => set("isMultiStop", false)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition border cursor-pointer ${
              !form.isMultiStop
                ? "bg-[#C8963E]/15 border-[#C8963E]/40 text-[#C8963E]"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            Direct (Point-to-Point)
          </button>
          <button
            onClick={() => set("isMultiStop", true)}
            className={`px-5 py-2.5 rounded-lg text-sm font-medium transition border cursor-pointer ${
              form.isMultiStop
                ? "bg-[#C8963E]/15 border-[#C8963E]/40 text-[#C8963E]"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            Multi-Stop
          </button>
        </div>

        {!form.isMultiStop && (
          <div className="bg-white/5 rounded-lg p-4 text-sm text-slate-400 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            Direct route: {form.originCity}, {form.originState} &rarr; {form.destCity}, {form.destState}
            {form.distance && <span className="ml-auto text-xs text-slate-500">{form.distance} mi</span>}
          </div>
        )}

        {form.isMultiStop && (
          <div className="space-y-4">
            {/* Origin marker */}
            <div className="flex items-center gap-3 text-sm">
              <span className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xs font-bold">A</span>
              <span className="text-slate-300">
                {form.shipperCompany || "Origin"} &mdash; {form.shipperCity || form.originCity}, {form.shipperState || form.originState}
              </span>
            </div>

            {/* Stops */}
            {form.stops.map((stop, idx) => (
              <div key={stop.id} className="relative ml-3 pl-7 border-l-2 border-white/10">
                <div className="absolute -left-[11px] top-0 w-5 h-5 rounded-full bg-[#C8963E]/20 text-[#C8963E] flex items-center justify-center text-[10px] font-bold">
                  {idx + 1}
                </div>
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <SelectField
                        label=""
                        value={stop.type}
                        onChange={(v) => updateStop(stop.id, "type", v)}
                        options={[
                          { value: "PICKUP", label: "Pickup" },
                          { value: "DELIVERY", label: "Delivery" },
                          { value: "STOP", label: "Stop-off" },
                        ]}
                      />
                    </div>
                    <button
                      onClick={() => removeStop(stop.id)}
                      className="text-red-400 hover:text-red-300 p-1.5 hover:bg-red-500/10 rounded-lg transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Company" value={stop.company} onChange={(v) => updateStop(stop.id, "company", v)} />
                    <Field label="Contact" value={stop.contact} onChange={(v) => updateStop(stop.id, "contact", v)} />
                  </div>
                  <div className="mt-3">
                    <Field label="Address" value={stop.address} onChange={(v) => updateStop(stop.id, "address", v)} />
                  </div>
                  <div className="grid grid-cols-4 gap-3 mt-3">
                    <Field label="City" value={stop.city} onChange={(v) => updateStop(stop.id, "city", v)} />
                    <Field label="State" value={stop.state} onChange={(v) => updateStop(stop.id, "state", v)} />
                    <Field label="Zip" value={stop.zip} onChange={(v) => updateStop(stop.id, "zip", v)} />
                    <Field label="Appointment" value={stop.appointmentTime} onChange={(v) => updateStop(stop.id, "appointmentTime", v)} type="datetime-local" />
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <Field label="Phone" value={stop.phone} onChange={(v) => updateStop(stop.id, "phone", v)} />
                    <Field label="Reference #" value={stop.reference} onChange={(v) => updateStop(stop.id, "reference", v)} />
                  </div>
                  <div className="mt-3">
                    <TextArea label="Instructions" value={stop.instructions} onChange={(v) => updateStop(stop.id, "instructions", v)} rows={2} />
                  </div>
                </div>
              </div>
            ))}

            {/* Destination marker */}
            <div className="flex items-center gap-3 text-sm">
              <span className="w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center text-xs font-bold">B</span>
              <span className="text-slate-300">
                {form.consigneeCompany || "Destination"} &mdash; {form.consigneeCity || form.destCity}, {form.consigneeState || form.destState}
              </span>
            </div>

            {/* Add Stop Button */}
            <button
              onClick={addStop}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-dashed border-white/20 rounded-lg text-sm text-slate-400 hover:text-white transition w-full justify-center cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Add Stop
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 6 - CARRIER / DRIVER ASSIGNMENT
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionCarrier({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  const [carrierSearch, setCarrierSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const { data: carriers } = useQuery({
    queryKey: ["carriers-all", carrierSearch],
    queryFn: () =>
      api.get("/carriers/all", { params: { search: carrierSearch, limit: 10 } }).then((r) => r.data),
    enabled: showSearch && carrierSearch.length >= 2,
  });

  const selectCarrier = (carrier: any) => {
    set("carrierId", carrier.userId || carrier.id);
    set("carrierCompany", carrier.company || carrier.user?.company || "");
    set("carrierMC", carrier.mcNumber || "");
    set("carrierDOT", carrier.dotNumber || "");
    set("carrierContact", carrier.user ? `${carrier.user.firstName} ${carrier.user.lastName}` : "");
    set("carrierPhone", carrier.user?.phone || carrier.phone || "");
    set("carrierEmail", carrier.user?.email || carrier.email || "");
    set("recipientEmail", carrier.user?.email || carrier.email || "");
    set("recipientName", carrier.user ? `${carrier.user.firstName} ${carrier.user.lastName}` : carrier.company || "");
    setShowSearch(false);
    setCarrierSearch("");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Assignment Type */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <Users className="w-4 h-4" />
          Assignment Type
        </h4>
        <div className="flex gap-3">
          <label
            className={`flex items-center gap-3 px-5 py-3 rounded-lg border cursor-pointer transition ${
              form.assignmentType === "COMPANY_DRIVER"
                ? "bg-[#C8963E]/15 border-[#C8963E]/40 text-[#C8963E]"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            <input
              type="radio"
              name="assignmentType"
              value="COMPANY_DRIVER"
              checked={form.assignmentType === "COMPANY_DRIVER"}
              onChange={() => set("assignmentType", "COMPANY_DRIVER")}
              className="text-[#C8963E] focus:ring-[#C8963E]/30"
            />
            <span className="text-sm font-medium">Company Driver</span>
          </label>
          <label
            className={`flex items-center gap-3 px-5 py-3 rounded-lg border cursor-pointer transition ${
              form.assignmentType === "PARTNER_CARRIER"
                ? "bg-[#C8963E]/15 border-[#C8963E]/40 text-[#C8963E]"
                : "bg-white/5 border-white/10 text-slate-400 hover:text-white"
            }`}
          >
            <input
              type="radio"
              name="assignmentType"
              value="PARTNER_CARRIER"
              checked={form.assignmentType === "PARTNER_CARRIER"}
              onChange={() => set("assignmentType", "PARTNER_CARRIER")}
              className="text-[#C8963E] focus:ring-[#C8963E]/30"
            />
            <span className="text-sm font-medium">Partner Carrier</span>
          </label>
        </div>
      </div>

      {/* Carrier Search & Info */}
      {form.assignmentType === "PARTNER_CARRIER" && (
        <div className={sectionCardCls}>
          <h4 className={sectionTitleCls}>
            <Truck className="w-4 h-4" />
            Carrier Information
          </h4>

          {/* Search */}
          <div className="relative mb-4">
            <label className={labelCls}>Search Carrier</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={carrierSearch}
                onChange={(e) => {
                  setCarrierSearch(e.target.value);
                  setShowSearch(true);
                }}
                onFocus={() => setShowSearch(true)}
                placeholder="Search by company name, MC#, or DOT#..."
                className={`${inputCls} pl-10`}
              />
            </div>

            {/* Search Results Dropdown */}
            {showSearch && carriers && (
              <div className="absolute z-20 w-full mt-1 bg-[#1a2340] border border-white/10 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
                {(carriers.carriers || carriers || []).length === 0 ? (
                  <div className="px-4 py-3 text-sm text-slate-500">No carriers found</div>
                ) : (
                  (carriers.carriers || carriers || []).map((c: any) => (
                    <button
                      key={c.id}
                      onClick={() => selectCarrier(c)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 text-left transition cursor-pointer"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{c.company || c.user?.company || "Unknown"}</p>
                        <p className="text-xs text-slate-500">
                          MC: {c.mcNumber || "N/A"} | DOT: {c.dotNumber || "N/A"}
                          {c.tier && <span className="ml-2">{c.tier}</span>}
                        </p>
                      </div>
                      {c.tier && (
                        <InfoBadge variant={c.tier === "PLATINUM" || c.tier === "GOLD" ? "gold" : "default"}>
                          {c.tier}
                        </InfoBadge>
                      )}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected carrier fields */}
          <div className="grid grid-cols-3 gap-4">
            <Field label="Carrier Company" value={form.carrierCompany} onChange={(v) => set("carrierCompany", v)} />
            <Field label="MC Number" value={form.carrierMC} onChange={(v) => set("carrierMC", v)} />
            <Field label="DOT Number" value={form.carrierDOT} onChange={(v) => set("carrierDOT", v)} />
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field label="Contact Name" value={form.carrierContact} onChange={(v) => set("carrierContact", v)} />
            <Field label="Phone" value={form.carrierPhone} onChange={(v) => set("carrierPhone", v)} />
            <Field label="Email" value={form.carrierEmail} onChange={(v) => set("carrierEmail", v)} type="email" />
          </div>
        </div>
      )}

      {/* Driver & Equipment */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>Driver & Equipment</h4>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Driver Name" value={form.driverName} onChange={(v) => set("driverName", v)} />
          <Field label="Driver Phone" value={form.driverPhone} onChange={(v) => set("driverPhone", v)} />
          <Field label="Truck Number" value={form.truckNumber} onChange={(v) => set("truckNumber", v)} />
          <Field label="Trailer Number" value={form.trailerNumber} onChange={(v) => set("trailerNumber", v)} />
        </div>
      </div>

      {/* Send-to Email */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <Send className="w-4 h-4" />
          Tender Recipient
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Recipient Email"
            value={form.recipientEmail}
            onChange={(v) => set("recipientEmail", v)}
            type="email"
            placeholder="carrier@example.com"
          />
          <Field
            label="Recipient Name"
            value={form.recipientName}
            onChange={(v) => set("recipientName", v)}
          />
        </div>
        <div className="mt-4">
          <TextArea
            label="Email Message (optional)"
            value={form.emailMessage}
            onChange={(v) => set("emailMessage", v)}
            rows={2}
            placeholder="Please review and sign the attached rate confirmation for load..."
          />
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 7 - FINANCIALS
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionFinancials({
  form,
  set,
  financials,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  financials: any;
}) {
  const addAccessorial = () => {
    set("accessorials", [...form.accessorials, { id: generateId(), description: "", amount: "" }]);
  };

  const updateAccessorial = (id: string, key: "description" | "amount", value: string) => {
    set(
      "accessorials",
      form.accessorials.map((a) => (a.id === id ? { ...a, [key]: value } : a))
    );
  };

  const removeAccessorial = (id: string) => {
    set(
      "accessorials",
      form.accessorials.filter((a) => a.id !== id)
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Customer Rate */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <DollarSign className="w-4 h-4" />
          Customer Rate (Revenue)
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Customer Rate ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
              <input
                type="number"
                value={form.customerRate}
                onChange={(e) => set("customerRate", e.target.value)}
                className={`${inputCls} pl-7`}
                step="0.01"
              />
            </div>
          </div>
          {form.distance && (
            <div className="flex items-end">
              <div className="bg-white/5 rounded-lg px-4 py-2.5 text-sm">
                <span className="text-slate-500">Revenue/Mile: </span>
                <span className="text-[#C8963E] font-semibold">
                  {fmtMoney(financials.customerRate / toNum(form.distance))}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Carrier Pay Breakdown */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <Truck className="w-4 h-4" />
          Carrier Pay Breakdown
        </h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={labelCls}>Line Haul ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
              <input
                type="number"
                value={form.carrierLineHaul}
                onChange={(e) => set("carrierLineHaul", e.target.value)}
                className={`${inputCls} pl-7`}
                step="0.01"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Fuel Surcharge ($)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
              <input
                type="number"
                value={form.fuelSurcharge}
                onChange={(e) => set("fuelSurcharge", e.target.value)}
                className={`${inputCls} pl-7`}
                step="0.01"
              />
            </div>
          </div>
          <SelectField
            label="FSC Type"
            value={form.fuelSurchargeType}
            onChange={(v) => set("fuelSurchargeType", v as "FLAT" | "PER_MILE")}
            options={[
              { value: "FLAT", label: "Flat Amount" },
              { value: "PER_MILE", label: "Per Mile" },
            ]}
          />
        </div>
      </div>

      {/* Accessorials */}
      <div className={sectionCardCls}>
        <div className="flex items-center justify-between mb-4">
          <h4 className={`${sectionTitleCls} mb-0`}>Accessorials</h4>
          <button
            onClick={addAccessorial}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#C8963E] hover:bg-[#C8963E]/10 rounded-lg transition cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Accessorial
          </button>
        </div>

        {form.accessorials.length === 0 ? (
          <div className="text-center py-6 text-sm text-slate-500">
            No accessorials added. Click "Add Accessorial" to add charges.
          </div>
        ) : (
          <div className="space-y-2">
            {form.accessorials.map((acc) => (
              <div key={acc.id} className="flex items-center gap-3">
                <input
                  type="text"
                  value={acc.description}
                  onChange={(e) => updateAccessorial(acc.id, "description", e.target.value)}
                  placeholder="Description (e.g. Detention, Lumper)"
                  className={`flex-1 ${inputCls}`}
                />
                <div className="relative w-36">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">$</span>
                  <input
                    type="number"
                    value={acc.amount}
                    onChange={(e) => updateAccessorial(acc.id, "amount", e.target.value)}
                    placeholder="0.00"
                    className={`${inputCls} pl-7`}
                    step="0.01"
                  />
                </div>
                <button
                  onClick={() => removeAccessorial(acc.id)}
                  className="text-red-400 hover:text-red-300 p-2 hover:bg-red-500/10 rounded-lg transition shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {form.accessorials.length > 0 && (
          <div className="mt-3 flex justify-end text-sm text-slate-400">
            Accessorial Total: <span className="text-white font-medium ml-2">{fmtMoney(financials.accTotal)}</span>
          </div>
        )}
      </div>

      {/* Profit Summary */}
      <div className="bg-gradient-to-r from-[#C8963E]/10 via-[#C8963E]/5 to-transparent border border-[#C8963E]/20 rounded-xl p-6">
        <h4 className="text-sm font-bold text-[#C8963E] mb-4 uppercase tracking-wider">Profit Summary</h4>
        <div className="grid grid-cols-2 gap-6">
          {/* Left column - breakdown */}
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Customer Rate (Revenue)</span>
              <span className="text-white font-medium">{fmtMoney(financials.customerRate)}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Carrier Line Haul</span>
              <span className="text-white">{fmtMoney(financials.lineHaul)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Fuel Surcharge</span>
              <span className="text-white">{fmtMoney(financials.fuel)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Accessorials</span>
              <span className="text-white">{fmtMoney(financials.accTotal)}</span>
            </div>
            <div className="h-px bg-white/10" />
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-slate-300">Total Carrier Pay</span>
              <span className="text-white">{fmtMoney(financials.totalCarrier)}</span>
            </div>
          </div>

          {/* Right column - margin box */}
          <div className="flex flex-col items-center justify-center bg-white/5 rounded-xl p-5">
            <span className="text-xs text-slate-500 uppercase tracking-wider mb-2">Gross Margin</span>
            <span className={`text-3xl font-bold ${financials.margin >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {fmtMoney(financials.margin)}
            </span>
            <span className={`text-lg font-semibold mt-1 ${financials.marginPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {financials.marginPct.toFixed(1)}%
            </span>
            {form.distance && toNum(form.distance) > 0 && (
              <span className="text-xs text-slate-500 mt-2">
                {fmtMoney(financials.margin / toNum(form.distance))}/mile margin
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 8 - PAYMENT TERMS
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionPayment({
  form,
  set,
  financials,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  financials: any;
}) {
  const toggleDocCheck = (key: string) => {
    set(
      "documentChecklist",
      form.documentChecklist.map((d) => (d.key === key ? { ...d, checked: !d.checked } : d))
    );
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Payment Tier Selection */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <CreditCard className="w-4 h-4" />
          Payment Tier
        </h4>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(PAYMENT_TIERS).map(([key, tier]) => (
            <button
              key={key}
              onClick={() => set("paymentTier", key)}
              className={`relative p-4 rounded-xl border text-left transition cursor-pointer ${
                form.paymentTier === key
                  ? "bg-[#C8963E]/10 border-[#C8963E]/40"
                  : "bg-white/[0.02] border-white/10 hover:border-white/20"
              }`}
            >
              {form.paymentTier === key && (
                <CheckCircle2 className="absolute top-3 right-3 w-4 h-4 text-[#C8963E]" />
              )}
              <p className={`text-sm font-semibold ${form.paymentTier === key ? "text-[#C8963E]" : "text-white"}`}>
                {tier.label}
              </p>
              <p className="text-xs text-slate-500 mt-1">{tier.days}</p>
              <p className={`text-xs mt-2 font-medium ${tier.fee > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                {tier.fee > 0 ? `${tier.fee}% fee` : "No fee"}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Payment Summary */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>Payment Calculation</h4>
        <div className="space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-400">Total Carrier Pay</span>
            <span className="text-white font-medium">{fmtMoney(financials.totalCarrier)}</span>
          </div>
          {financials.feePercent > 0 && (
            <div className="flex justify-between items-center text-sm">
              <span className="text-amber-400">
                Quick Pay Fee ({financials.feePercent}%)
              </span>
              <span className="text-amber-400">-{fmtMoney(financials.feeAmount)}</span>
            </div>
          )}
          <div className="h-px bg-white/10" />
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-slate-300">Net Amount to Carrier</span>
            <span className="text-xl font-bold text-[#C8963E]">{fmtMoney(financials.netPay)}</span>
          </div>
          <div className="flex justify-between items-center text-xs text-slate-500">
            <span>Payment Schedule</span>
            <span>{financials.tierInfo.label} - {financials.tierInfo.days}</span>
          </div>
        </div>
      </div>

      {/* Document Checklist */}
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <ClipboardList className="w-4 h-4" />
          Required Documents for Payment
        </h4>
        <p className="text-xs text-slate-500 mb-4">
          Payment will be processed upon receipt of all checked documents.
        </p>
        <div className="space-y-3">
          {form.documentChecklist.map((doc) => (
            <label
              key={doc.key}
              className="flex items-center gap-3 p-3 bg-white/[0.02] hover:bg-white/[0.04] rounded-lg cursor-pointer transition group"
            >
              <input
                type="checkbox"
                checked={doc.checked}
                onChange={() => toggleDocCheck(doc.key)}
                className="rounded border-white/20 bg-white/5 text-[#C8963E] focus:ring-[#C8963E]/30"
              />
              <span className={`text-sm ${doc.checked ? "text-white" : "text-slate-400"} group-hover:text-white transition`}>
                {doc.label}
              </span>
              {doc.checked && <CheckCircle2 className="w-4 h-4 text-emerald-400 ml-auto" />}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 9 - TERMS & CONDITIONS
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionTerms({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className={sectionCardCls}>
        <div className="flex items-center justify-between mb-4">
          <h4 className={`${sectionTitleCls} mb-0`}>
            <ScrollText className="w-4 h-4" />
            Standard Terms & Conditions
          </h4>
          <button
            onClick={() => set("termsConditions", DEFAULT_TERMS)}
            className="text-xs text-[#C8963E] hover:text-[#C8963E]/80 transition cursor-pointer"
          >
            Reset to Default
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          These terms will be included in the Rate Confirmation document. You may edit them for this specific load.
        </p>
        <textarea
          value={form.termsConditions}
          onChange={(e) => set("termsConditions", e.target.value)}
          rows={20}
          className={`${inputCls} resize-y font-mono text-xs leading-relaxed`}
        />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECTION 10 - SPECIAL INSTRUCTIONS
   ═══════════════════════════════════════════════════════════════════════════ */

function SectionInstructions({ form, set }: { form: FormState; set: <K extends keyof FormState>(k: K, v: FormState[K]) => void }) {
  return (
    <div className="space-y-6 max-w-4xl">
      <div className={sectionCardCls}>
        <h4 className={sectionTitleCls}>
          <MessageSquare className="w-4 h-4" />
          Special Instructions
        </h4>
        <p className="text-xs text-slate-500 mb-4">
          Any additional notes, special requirements, or instructions for the carrier/driver on this load. These will appear on the Rate Confirmation.
        </p>
        <textarea
          value={form.specialInstructions}
          onChange={(e) => set("specialInstructions", e.target.value)}
          rows={12}
          className={`${inputCls} resize-y`}
          placeholder={`Examples:
- Driver must have TWIC card for port access
- Call dispatch 30 minutes prior to arrival at pickup and delivery
- Check calls required every 4 hours while loaded
- No lumper fees without prior authorization
- Tarp required - full coverage, no leaks
- Driver must wear PPE on-site (hard hat, vest, steel toes)
- Do not stack freight
- Temperature must be set to 34F, pulp at delivery
- Seal number must match BOL - do not break seal`}
        />
      </div>

      {/* Quick Add Buttons */}
      <div className={sectionCardCls}>
        <h4 className="text-xs font-medium text-slate-500 mb-3">Quick Add Common Instructions</h4>
        <div className="flex flex-wrap gap-2">
          {[
            "Check calls every 4 hours",
            "Call 30 min before arrival",
            "TWIC card required",
            "No lumper without authorization",
            "Tarp required",
            "PPE required on-site",
            "Do not stack freight",
            "Do not break seal",
            "Photos required at pickup and delivery",
            "Driver must be HAZMAT certified",
            "No double brokering",
            "GPS tracking required",
          ].map((instruction) => (
            <button
              key={instruction}
              onClick={() => {
                const current = form.specialInstructions.trim();
                const bullet = `- ${instruction}`;
                set("specialInstructions", current ? `${current}\n${bullet}` : bullet);
              }}
              className="px-3 py-1.5 text-xs text-slate-400 bg-white/5 hover:bg-white/10 hover:text-white border border-white/10 rounded-lg transition cursor-pointer"
            >
              + {instruction}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
