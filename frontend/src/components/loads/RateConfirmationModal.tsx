"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  X, FileText, MapPin, Building2, Truck, Package, CalendarDays,
  DollarSign, ClipboardList, Scale, PenTool, Send, Download, ChevronLeft, ChevronRight,
} from "lucide-react";

interface RateConfirmationModalProps {
  open: boolean;
  onClose: () => void;
  load: {
    id: string;
    referenceNumber: string;
    originCity: string; originState: string; originZip?: string;
    destCity: string; destState: string; destZip?: string;
    weight?: number | null; pieces?: number | null; equipmentType: string; commodity?: string | null;
    rate: number; distance?: number | null;
    pickupDate: string; deliveryDate?: string;
    specialInstructions?: string;
    contactName?: string; contactPhone?: string;
    poster?: { company: string | null; firstName: string; lastName: string; phone?: string } | null;
    carrier?: { company: string | null; firstName: string; lastName: string; phone?: string } | null;
  } | null;
}

interface FormData {
  // Section 1
  referenceNumber: string; loadNumber: string;
  // Section 2
  shipperName: string; shipperAddress: string; shipperCity: string; shipperState: string; shipperZip: string;
  shipperContact: string; shipperPhone: string; shipperEmail: string; shipperRefNumber: string;
  // Section 3
  consigneeName: string; consigneeAddress: string; consigneeCity: string; consigneeState: string; consigneeZip: string;
  consigneeContact: string; consigneePhone: string; consigneeEmail: string; consigneeRefNumber: string;
  // Section 4
  carrierName: string; carrierMcNumber: string; carrierDotNumber: string;
  carrierAddress: string; carrierCity: string; carrierState: string; carrierZip: string;
  carrierContact: string; carrierPhone: string; carrierEmail: string;
  driverName: string; driverPhone: string; truckNumber: string; trailerNumber: string;
  // Section 5
  equipmentType: string; commodity: string; weight: string; pieces: string; dims: string;
  hazmat: boolean; tempRequirements: string;
  // Section 6
  pickupDate: string; pickupTimeWindow: string; deliveryDate: string; deliveryTimeWindow: string;
  // Section 7
  lineHaulRate: string; fuelSurcharge: string; detentionRate: string;
  accessorials: { description: string; amount: string }[];
  totalCharges: string; paymentTerms: string;
  // Section 8
  specialInstructions: string; deliveryInstructions: string; pickupInstructions: string;
  appointmentRequired: boolean;
  // Section 9
  termsAccepted: boolean; customTerms: string;
  // Section 10
  brokerSignature: string; brokerSignDate: string; carrierSignature: string; carrierSignDate: string;
}

const SECTIONS = [
  { key: "load", label: "Load Info", icon: FileText },
  { key: "shipper", label: "Shipper/Origin", icon: MapPin },
  { key: "consignee", label: "Consignee/Dest", icon: MapPin },
  { key: "carrier", label: "Carrier Info", icon: Building2 },
  { key: "equipment", label: "Equipment", icon: Truck },
  { key: "dates", label: "Dates & Times", icon: CalendarDays },
  { key: "rates", label: "Rates & Charges", icon: DollarSign },
  { key: "instructions", label: "Instructions", icon: ClipboardList },
  { key: "terms", label: "Terms", icon: Scale },
  { key: "signatures", label: "Signatures", icon: PenTool },
] as const;

type SectionKey = typeof SECTIONS[number]["key"];

function initFormData(load: RateConfirmationModalProps["load"]): FormData {
  if (!load) return getEmptyFormData();
  return {
    referenceNumber: load.referenceNumber, loadNumber: load.referenceNumber,
    shipperName: "", shipperAddress: "", shipperCity: load.originCity, shipperState: load.originState, shipperZip: load.originZip || "",
    shipperContact: load.contactName || "", shipperPhone: load.contactPhone || "", shipperEmail: "", shipperRefNumber: "",
    consigneeName: "", consigneeAddress: "", consigneeCity: load.destCity, consigneeState: load.destState, consigneeZip: load.destZip || "",
    consigneeContact: "", consigneePhone: "", consigneeEmail: "", consigneeRefNumber: "",
    carrierName: load.carrier?.company || (load.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}` : ""),
    carrierMcNumber: "", carrierDotNumber: "",
    carrierAddress: "", carrierCity: "", carrierState: "", carrierZip: "",
    carrierContact: load.carrier ? `${load.carrier.firstName} ${load.carrier.lastName}` : "",
    carrierPhone: load.carrier?.phone || "", carrierEmail: "",
    driverName: "", driverPhone: "", truckNumber: "", trailerNumber: "",
    equipmentType: load.equipmentType, commodity: load.commodity || "", weight: load.weight ? String(load.weight) : "",
    pieces: load.pieces ? String(load.pieces) : "", dims: "", hazmat: false, tempRequirements: "",
    pickupDate: load.pickupDate ? load.pickupDate.split("T")[0] : "", pickupTimeWindow: "",
    deliveryDate: load.deliveryDate ? load.deliveryDate.split("T")[0] : "", deliveryTimeWindow: "",
    lineHaulRate: String(load.rate), fuelSurcharge: "", detentionRate: "",
    accessorials: [], totalCharges: String(load.rate), paymentTerms: "Net 30",
    specialInstructions: load.specialInstructions || "", deliveryInstructions: "", pickupInstructions: "",
    appointmentRequired: false,
    termsAccepted: false, customTerms: "",
    brokerSignature: "", brokerSignDate: "", carrierSignature: "", carrierSignDate: "",
  };
}

function getEmptyFormData(): FormData {
  return {
    referenceNumber: "", loadNumber: "",
    shipperName: "", shipperAddress: "", shipperCity: "", shipperState: "", shipperZip: "",
    shipperContact: "", shipperPhone: "", shipperEmail: "", shipperRefNumber: "",
    consigneeName: "", consigneeAddress: "", consigneeCity: "", consigneeState: "", consigneeZip: "",
    consigneeContact: "", consigneePhone: "", consigneeEmail: "", consigneeRefNumber: "",
    carrierName: "", carrierMcNumber: "", carrierDotNumber: "",
    carrierAddress: "", carrierCity: "", carrierState: "", carrierZip: "",
    carrierContact: "", carrierPhone: "", carrierEmail: "",
    driverName: "", driverPhone: "", truckNumber: "", trailerNumber: "",
    equipmentType: "", commodity: "", weight: "", pieces: "", dims: "", hazmat: false, tempRequirements: "",
    pickupDate: "", pickupTimeWindow: "", deliveryDate: "", deliveryTimeWindow: "",
    lineHaulRate: "", fuelSurcharge: "", detentionRate: "",
    accessorials: [], totalCharges: "", paymentTerms: "Net 30",
    specialInstructions: "", deliveryInstructions: "", pickupInstructions: "", appointmentRequired: false,
    termsAccepted: false, customTerms: "",
    brokerSignature: "", brokerSignDate: "", carrierSignature: "", carrierSignDate: "",
  };
}

export function RateConfirmationModal({ open, onClose, load }: RateConfirmationModalProps) {
  const [section, setSection] = useState<SectionKey>("load");
  const [form, setForm] = useState<FormData>(getEmptyFormData());
  const [sendEmail, setSendEmail] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open && load) setForm(initFormData(load));
  }, [open, load]);

  const createMutation = useMutation({
    mutationFn: (data: { loadId: string; formData: Record<string, any> }) =>
      api.post("/rate-confirmations", data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["load"] });
      if (sendEmail && recipientEmail) {
        sendMutation.mutate({ id: res.data.id, recipientEmail, recipientName: form.carrierName, message: emailMessage });
      } else {
        onClose();
      }
    },
  });

  const sendMutation = useMutation({
    mutationFn: (data: { id: string; recipientEmail: string; recipientName?: string; message?: string }) =>
      api.post(`/rate-confirmations/${data.id}/send`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load"] });
      onClose();
    },
  });

  const downloadPdf = async () => {
    if (!load) return;
    // Create the RC first, then download PDF
    const res = await api.post("/rate-confirmations", { loadId: load.id, formData: buildPayload() });
    const pdfRes = await api.get(`/rate-confirmations/${res.data.id}/pdf`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([pdfRes.data]));
    const a = document.createElement("a"); a.href = url; a.download = `RC-${load.referenceNumber}.pdf`; a.click();
    window.URL.revokeObjectURL(url);
  };

  function buildPayload() {
    return {
      ...form,
      lineHaulRate: form.lineHaulRate ? parseFloat(form.lineHaulRate) : undefined,
      fuelSurcharge: form.fuelSurcharge ? parseFloat(form.fuelSurcharge) : undefined,
      detentionRate: form.detentionRate ? parseFloat(form.detentionRate) : undefined,
      totalCharges: form.totalCharges ? parseFloat(form.totalCharges) : undefined,
      weight: form.weight ? parseFloat(form.weight) : undefined,
      pieces: form.pieces ? parseInt(form.pieces) : undefined,
      accessorials: form.accessorials.filter(a => a.description).map(a => ({ description: a.description, amount: parseFloat(a.amount) || 0 })),
    };
  }

  function handleSave() {
    if (!load) return;
    createMutation.mutate({ loadId: load.id, formData: buildPayload() });
  }

  const set = (key: keyof FormData, value: any) => setForm((f) => ({ ...f, [key]: value }));

  const sectionIdx = SECTIONS.findIndex(s => s.key === section);
  const prevSection = sectionIdx > 0 ? SECTIONS[sectionIdx - 1].key : null;
  const nextSection = sectionIdx < SECTIONS.length - 1 ? SECTIONS[sectionIdx + 1].key : null;

  if (!open || !load) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 bg-white/5 border-r border-white/10 py-4 flex flex-col shrink-0">
          <div className="px-4 mb-4">
            <h2 className="text-sm font-semibold text-gold">Rate Confirmation</h2>
            <p className="text-xs text-slate-500 mt-0.5">{load.referenceNumber}</p>
          </div>
          <nav className="flex-1 space-y-0.5 px-2 overflow-y-auto">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <button key={s.key} onClick={() => setSection(s.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer ${section === s.key ? "bg-gold/20 text-gold" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>
                  <Icon className="w-3.5 h-3.5 shrink-0" /> {s.label}
                </button>
              );
            })}
          </nav>
          <div className="px-3 pt-3 mt-auto space-y-2 border-t border-white/10">
            <button onClick={downloadPdf} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20">
              <Download className="w-3.5 h-3.5" /> Download PDF
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
            <h3 className="text-white font-semibold">{SECTIONS[sectionIdx].label}</h3>
            <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
          </div>

          {/* Form Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {section === "load" && <SectionLoad form={form} set={set} />}
            {section === "shipper" && <SectionShipper form={form} set={set} />}
            {section === "consignee" && <SectionConsignee form={form} set={set} />}
            {section === "carrier" && <SectionCarrier form={form} set={set} />}
            {section === "equipment" && <SectionEquipment form={form} set={set} />}
            {section === "dates" && <SectionDates form={form} set={set} />}
            {section === "rates" && <SectionRates form={form} set={set} />}
            {section === "instructions" && <SectionInstructions form={form} set={set} />}
            {section === "terms" && <SectionTerms form={form} set={set} />}
            {section === "signatures" && (
              <SectionSignatures form={form} set={set}
                sendEmail={sendEmail} setSendEmail={setSendEmail}
                recipientEmail={recipientEmail} setRecipientEmail={setRecipientEmail}
                emailMessage={emailMessage} setEmailMessage={setEmailMessage} />
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-3 border-t border-white/10">
            <div className="flex gap-2">
              {prevSection && (
                <button onClick={() => setSection(prevSection)} className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-400 hover:text-white bg-white/5 rounded-lg">
                  <ChevronLeft className="w-3.5 h-3.5" /> Back
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {nextSection ? (
                <button onClick={() => setSection(nextSection)} className="flex items-center gap-1 px-4 py-1.5 text-xs text-navy bg-gold rounded-lg font-medium hover:bg-gold/90">
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button onClick={handleSave} disabled={createMutation.isPending || sendMutation.isPending}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-navy bg-gold rounded-lg font-medium hover:bg-gold/90 disabled:opacity-50">
                  <Send className="w-4 h-4" /> {sendEmail ? "Save & Send" : "Save Rate Confirmation"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════ Section Components ════════════════════════════════════════════ */

const inputCls = "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50";
const labelCls = "block text-xs text-slate-400 mb-1";

function Field({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputCls} />
    </div>
  );
}

function SectionLoad({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Reference Number" value={form.referenceNumber} onChange={(v) => set("referenceNumber", v)} />
      <Field label="Load Number" value={form.loadNumber} onChange={(v) => set("loadNumber", v)} />
    </div>
  );
}

function SectionShipper({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Shipper Name" value={form.shipperName} onChange={(v) => set("shipperName", v)} />
        <Field label="Ref #" value={form.shipperRefNumber} onChange={(v) => set("shipperRefNumber", v)} />
      </div>
      <Field label="Address" value={form.shipperAddress} onChange={(v) => set("shipperAddress", v)} />
      <div className="grid grid-cols-3 gap-4">
        <Field label="City" value={form.shipperCity} onChange={(v) => set("shipperCity", v)} />
        <Field label="State" value={form.shipperState} onChange={(v) => set("shipperState", v)} />
        <Field label="Zip" value={form.shipperZip} onChange={(v) => set("shipperZip", v)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Contact" value={form.shipperContact} onChange={(v) => set("shipperContact", v)} />
        <Field label="Phone" value={form.shipperPhone} onChange={(v) => set("shipperPhone", v)} />
        <Field label="Email" value={form.shipperEmail} onChange={(v) => set("shipperEmail", v)} />
      </div>
    </div>
  );
}

function SectionConsignee({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Consignee Name" value={form.consigneeName} onChange={(v) => set("consigneeName", v)} />
        <Field label="Ref #" value={form.consigneeRefNumber} onChange={(v) => set("consigneeRefNumber", v)} />
      </div>
      <Field label="Address" value={form.consigneeAddress} onChange={(v) => set("consigneeAddress", v)} />
      <div className="grid grid-cols-3 gap-4">
        <Field label="City" value={form.consigneeCity} onChange={(v) => set("consigneeCity", v)} />
        <Field label="State" value={form.consigneeState} onChange={(v) => set("consigneeState", v)} />
        <Field label="Zip" value={form.consigneeZip} onChange={(v) => set("consigneeZip", v)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Contact" value={form.consigneeContact} onChange={(v) => set("consigneeContact", v)} />
        <Field label="Phone" value={form.consigneePhone} onChange={(v) => set("consigneePhone", v)} />
        <Field label="Email" value={form.consigneeEmail} onChange={(v) => set("consigneeEmail", v)} />
      </div>
    </div>
  );
}

function SectionCarrier({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Field label="Carrier Name" value={form.carrierName} onChange={(v) => set("carrierName", v)} />
        <Field label="MC #" value={form.carrierMcNumber} onChange={(v) => set("carrierMcNumber", v)} />
        <Field label="DOT #" value={form.carrierDotNumber} onChange={(v) => set("carrierDotNumber", v)} />
      </div>
      <Field label="Address" value={form.carrierAddress} onChange={(v) => set("carrierAddress", v)} />
      <div className="grid grid-cols-3 gap-4">
        <Field label="City" value={form.carrierCity} onChange={(v) => set("carrierCity", v)} />
        <Field label="State" value={form.carrierState} onChange={(v) => set("carrierState", v)} />
        <Field label="Zip" value={form.carrierZip} onChange={(v) => set("carrierZip", v)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Contact" value={form.carrierContact} onChange={(v) => set("carrierContact", v)} />
        <Field label="Phone" value={form.carrierPhone} onChange={(v) => set("carrierPhone", v)} />
        <Field label="Email" value={form.carrierEmail} onChange={(v) => set("carrierEmail", v)} />
      </div>
      <div className="pt-2 border-t border-white/10">
        <p className="text-xs text-slate-500 mb-3">Driver & Equipment Assignment</p>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Driver Name" value={form.driverName} onChange={(v) => set("driverName", v)} />
          <Field label="Driver Phone" value={form.driverPhone} onChange={(v) => set("driverPhone", v)} />
          <Field label="Truck #" value={form.truckNumber} onChange={(v) => set("truckNumber", v)} />
          <Field label="Trailer #" value={form.trailerNumber} onChange={(v) => set("trailerNumber", v)} />
        </div>
      </div>
    </div>
  );
}

function SectionEquipment({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Equipment Type</label>
          <select value={form.equipmentType} onChange={(e) => set("equipmentType", e.target.value)} className={inputCls}>
            {["Dry Van", "Reefer", "Flatbed", "Step Deck", "Lowboy", "Tanker", "Car Hauler", "Conestoga", "Power Only"].map(t =>
              <option key={t} value={t} className="bg-navy">{t}</option>
            )}
          </select>
        </div>
        <Field label="Commodity" value={form.commodity} onChange={(v) => set("commodity", v)} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Field label="Weight (lbs)" value={form.weight} onChange={(v) => set("weight", v)} type="number" />
        <Field label="Pieces" value={form.pieces} onChange={(v) => set("pieces", v)} type="number" />
        <Field label="Dimensions" value={form.dims} onChange={(v) => set("dims", v)} placeholder="L x W x H" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={form.hazmat} onChange={(e) => set("hazmat", e.target.checked)} className="rounded" />
          <label className="text-sm text-slate-300">Hazardous Materials</label>
        </div>
        <Field label="Temp Requirements" value={form.tempRequirements} onChange={(v) => set("tempRequirements", v)} placeholder="e.g. 34°F - 38°F" />
      </div>
    </div>
  );
}

function SectionDates({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Pickup Date" value={form.pickupDate} onChange={(v) => set("pickupDate", v)} type="date" />
        <Field label="Pickup Time Window" value={form.pickupTimeWindow} onChange={(v) => set("pickupTimeWindow", v)} placeholder="e.g. 08:00 - 12:00" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Delivery Date" value={form.deliveryDate} onChange={(v) => set("deliveryDate", v)} type="date" />
        <Field label="Delivery Time Window" value={form.deliveryTimeWindow} onChange={(v) => set("deliveryTimeWindow", v)} placeholder="e.g. 08:00 - 17:00" />
      </div>
    </div>
  );
}

function SectionRates({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
  const recalcTotal = (updates: Partial<FormData>) => {
    const lh = parseFloat(updates.lineHaulRate ?? form.lineHaulRate) || 0;
    const fs = parseFloat(updates.fuelSurcharge ?? form.fuelSurcharge) || 0;
    const accTotal = (updates.accessorials ?? form.accessorials).reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0);
    set("totalCharges", String(lh + fs + accTotal));
  };

  const addAccessorial = () => set("accessorials", [...form.accessorials, { description: "", amount: "" }]);
  const removeAccessorial = (i: number) => {
    const next = form.accessorials.filter((_, idx) => idx !== i);
    set("accessorials", next);
    recalcTotal({ accessorials: next });
  };
  const updateAccessorial = (i: number, key: "description" | "amount", value: string) => {
    const next = form.accessorials.map((a, idx) => idx === i ? { ...a, [key]: value } : a);
    set("accessorials", next);
    if (key === "amount") recalcTotal({ accessorials: next });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <Field label="Line Haul Rate ($)" value={form.lineHaulRate} onChange={(v) => { set("lineHaulRate", v); recalcTotal({ lineHaulRate: v }); }} type="number" />
        <Field label="Fuel Surcharge ($)" value={form.fuelSurcharge} onChange={(v) => { set("fuelSurcharge", v); recalcTotal({ fuelSurcharge: v }); }} type="number" />
        <Field label="Detention Rate ($/hr)" value={form.detentionRate} onChange={(v) => set("detentionRate", v)} type="number" />
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-slate-400">Accessorials</label>
          <button onClick={addAccessorial} className="text-xs text-gold hover:text-gold/80">+ Add</button>
        </div>
        {form.accessorials.map((acc, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input value={acc.description} onChange={(e) => updateAccessorial(i, "description", e.target.value)} placeholder="Description" className={`flex-1 ${inputCls}`} />
            <input value={acc.amount} onChange={(e) => updateAccessorial(i, "amount", e.target.value)} placeholder="Amount" type="number" className={`w-32 ${inputCls}`} />
            <button onClick={() => removeAccessorial(i)} className="text-red-400 hover:text-red-300 px-2"><X className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-white/10">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-300">Total Charges</span>
          <span className="text-xl font-bold text-gold">${form.totalCharges ? parseFloat(form.totalCharges).toLocaleString() : "0"}</span>
        </div>
      </div>

      <Field label="Payment Terms" value={form.paymentTerms} onChange={(v) => set("paymentTerms", v)} placeholder="e.g. Net 30" />
    </div>
  );
}

function SectionInstructions({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className={labelCls}>Special Instructions</label>
        <textarea value={form.specialInstructions} onChange={(e) => set("specialInstructions", e.target.value)} rows={3} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Pickup Instructions</label>
        <textarea value={form.pickupInstructions} onChange={(e) => set("pickupInstructions", e.target.value)} rows={2} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Delivery Instructions</label>
        <textarea value={form.deliveryInstructions} onChange={(e) => set("deliveryInstructions", e.target.value)} rows={2} className={inputCls} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={form.appointmentRequired} onChange={(e) => set("appointmentRequired", e.target.checked)} className="rounded" />
        <label className="text-sm text-slate-300">Appointment Required</label>
      </div>
    </div>
  );
}

function SectionTerms({ form, set }: { form: FormData; set: (k: keyof FormData, v: any) => void }) {
  return (
    <div className="space-y-4">
      <div className="bg-white/5 rounded-lg p-4 text-xs text-slate-400 leading-relaxed">
        <p className="font-medium text-slate-300 mb-2">Standard Terms & Conditions</p>
        <p>Carrier agrees to transport the above-described shipment under the terms and conditions set forth herein.
          Carrier shall maintain cargo insurance of not less than $100,000 and auto liability of not less than $1,000,000 combined single limit.
          Carrier shall comply with all applicable federal, state, and local laws and regulations.
          This rate confirmation, when signed by both parties, constitutes a binding contract.</p>
      </div>
      <div>
        <label className={labelCls}>Custom Terms (optional, appended to standard)</label>
        <textarea value={form.customTerms} onChange={(e) => set("customTerms", e.target.value)} rows={4} className={inputCls} placeholder="Additional terms specific to this load..." />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={form.termsAccepted} onChange={(e) => set("termsAccepted", e.target.checked)} className="rounded" />
        <label className="text-sm text-slate-300">I acknowledge the terms and conditions above</label>
      </div>
    </div>
  );
}

function SectionSignatures({
  form, set, sendEmail: doSend, setSendEmail, recipientEmail, setRecipientEmail, emailMessage, setEmailMessage
}: {
  form: FormData; set: (k: keyof FormData, v: any) => void;
  sendEmail: boolean; setSendEmail: (v: boolean) => void;
  recipientEmail: string; setRecipientEmail: (v: string) => void;
  emailMessage: string; setEmailMessage: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-slate-500 mb-3">Broker / Company</p>
          <Field label="Printed Name" value={form.brokerSignature} onChange={(v) => set("brokerSignature", v)} />
          <div className="mt-2">
            <Field label="Date" value={form.brokerSignDate} onChange={(v) => set("brokerSignDate", v)} type="date" />
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 mb-3">Carrier</p>
          <Field label="Printed Name" value={form.carrierSignature} onChange={(v) => set("carrierSignature", v)} />
          <div className="mt-2">
            <Field label="Date" value={form.carrierSignDate} onChange={(v) => set("carrierSignDate", v)} type="date" />
          </div>
        </div>
      </div>

      <div className="pt-4 border-t border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <input type="checkbox" checked={doSend} onChange={(e) => setSendEmail(e.target.checked)} className="rounded" />
          <label className="text-sm text-slate-300">Send Rate Confirmation via Email</label>
        </div>
        {doSend && (
          <div className="space-y-3 pl-6">
            <Field label="Recipient Email" value={recipientEmail} onChange={setRecipientEmail} type="email" placeholder="carrier@example.com" />
            <div>
              <label className={labelCls}>Message (optional)</label>
              <textarea value={emailMessage} onChange={(e) => setEmailMessage(e.target.value)} rows={2} className={inputCls} placeholder="Please review and sign the attached rate confirmation..." />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
