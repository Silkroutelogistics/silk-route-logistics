"use client";

import { useRef } from "react";
import { Printer, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   BILL OF LADING — Industry-Standard Printable Template
   Silk Route Logistics Inc.
   v3.2 — Clean professional design, compass logo, proper structure
   ═══════════════════════════════════════════════════════════ */

export interface BOLData {
  // Identifiers
  bolNumber?: string;
  referenceNumber: string;
  loadNumber?: string;
  shipperReference?: string;
  shipperPoNumber?: string;
  pickupNumber?: string;
  deliveryReference?: string;
  sealNumber?: string;

  // Shipper (Origin)
  originCompany?: string;
  originAddress?: string;
  originCity: string;
  originState: string;
  originZip: string;
  originContactName?: string;
  originContactPhone?: string;

  // Consignee (Destination)
  destCompany?: string;
  destAddress?: string;
  destCity: string;
  destState: string;
  destZip: string;
  destContactName?: string;
  destContactPhone?: string;

  // Third Party Bill To
  thirdPartyBillTo?: string;
  thirdPartyAddress?: string;
  thirdPartyPhone?: string;

  // Carrier
  carrierCompany?: string;
  carrierMC?: string;
  carrierDOT?: string;
  driverName?: string;
  driverPhone?: string;
  truckNumber?: string;
  trailerNumber?: string;

  // Schedule
  pickupDate: string;
  pickupTimeStart?: string;
  pickupTimeEnd?: string;
  deliveryDate: string;
  deliveryTimeStart?: string;
  deliveryTimeEnd?: string;

  // Freight
  commodity?: string;
  weight?: number;
  pieces?: number;
  pallets?: number;
  equipmentType: string;
  freightClass?: string;
  stackable?: boolean;
  dimensionsLength?: number;
  dimensionsWidth?: number;
  dimensionsHeight?: number;
  nmfcNumber?: string;

  // Hazmat
  hazmat?: boolean;
  hazmatUnNumber?: string;
  hazmatClass?: string;
  hazmatEmergencyContact?: string;

  // Temp
  temperatureControlled?: boolean;
  tempMin?: number;
  tempMax?: number;

  // Payment
  freightTerms?: string; // PREPAID, COLLECT, 3RD_PARTY
  declaredValue?: string;

  // Instructions
  pickupInstructions?: string;
  deliveryInstructions?: string;
  specialInstructions?: string;
}

interface BOLTemplateProps {
  data: BOLData;
  onClose?: () => void;
}

function fmtDate(d: string) {
  try { return new Date(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

function fmtTime(start?: string, end?: string) {
  if (!start && !end) return "";
  if (start && end) return `${start} — ${end}`;
  return start || end || "";
}

// Inline SVG compass logo — no background, clean for print
const CompassLogo = () => (
  <svg viewBox="0 0 800 600" fill="none" xmlns="http://www.w3.org/2000/svg" className="bol-logo-svg">
    <circle cx="300" cy="300" r="145" stroke="#0F1A22" strokeWidth="26" strokeLinecap="round" fill="none" />
    <polygon points="300,117 278,161 322,161" fill="#0F1A22" />
    <polygon points="300,483 278,439 322,439" fill="#0F1A22" />
    <polygon points="117,300 161,278 161,322" fill="#0F1A22" />
    <polygon points="483,300 439,278 439,322" fill="#0F1A22" />
    <defs>
      <clipPath id="bolClipL"><rect x="0" y="0" width="300" height="600" /></clipPath>
      <clipPath id="bolClipR"><rect x="300" y="0" width="500" height="600" /></clipPath>
    </defs>
    <path d="M 280 395 C 225 330, 250 280, 310 255 C 385 225, 410 260, 435 285 C 475 330, 410 370, 345 395 C 290 415, 285 455, 315 485"
      stroke="#C9A24D" strokeWidth="86" strokeLinecap="round" strokeLinejoin="round" fill="none" clipPath="url(#bolClipL)" />
    <path d="M 280 395 C 225 330, 250 280, 310 255 C 385 225, 410 260, 435 285 C 475 330, 410 370, 345 395 C 290 415, 285 455, 315 485"
      stroke="#0F1A22" strokeWidth="86" strokeLinecap="round" strokeLinejoin="round" fill="none" clipPath="url(#bolClipR)" />
    <path d="M 280 395 C 225 330, 250 280, 310 255 C 385 225, 410 260, 435 285 C 475 330, 410 370, 345 395 C 290 415, 285 455, 315 485"
      stroke="#FFFFFF" strokeWidth="24" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.95" />
  </svg>
);

export function BOLTemplate({ data, onClose }: BOLTemplateProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    const doc = win.document;
    doc.open();
    doc.write("<!DOCTYPE html><html><head></head><body></body></html>");
    doc.close();
    const titleEl = doc.createElement("title");
    titleEl.textContent = `BOL - ${data.referenceNumber}`;
    doc.head.appendChild(titleEl);
    const styleEl = doc.createElement("style");
    styleEl.textContent = printStyles;
    doc.head.appendChild(styleEl);
    const cloned = content.cloneNode(true) as HTMLElement;
    doc.body.appendChild(cloned);
    win.focus();
    win.print();
  };

  const bolNum = data.bolNumber || `BOL-${data.referenceNumber}`;
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[850px] max-h-[95vh] overflow-auto">
        {/* Action Bar */}
        <div className="sticky top-0 bg-[#0F1A22] px-6 py-3 flex items-center justify-between rounded-t-xl z-10 no-print">
          <span className="text-white font-semibold text-sm">Bill of Lading — {bolNum}</span>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#C9A24D] text-[#0F1A22] text-xs font-bold rounded-md hover:bg-[#D4B85E]">
              <Printer size={14} /> Print / Save PDF
            </button>
            {onClose && (
              <button onClick={onClose} className="p-1.5 text-white/60 hover:text-white">
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Printable Content */}
        <div ref={printRef}>
          <div className="bol-page">

            {/* ═══ HEADER ═══ */}
            <div className="bol-header">
              <div className="bol-logo-block">
                <CompassLogo />
                <div className="bol-company-stack">
                  <div className="bol-company-name">SILK ROUTE LOGISTICS INC.</div>
                  <div className="bol-company-sub">2317 S 35th St, Galesburg, MI 49053</div>
                  <div className="bol-company-sub">(269) 220-6760 &nbsp;|&nbsp; whaider@silkroutelogistics.ai</div>
                  <div className="bol-company-sub">MC# 01794414 &nbsp;|&nbsp; DOT# 4526880</div>
                </div>
              </div>
              <div className="bol-title-block">
                <div className="bol-title">BILL OF LADING</div>
                <div className="bol-title-sub">STRAIGHT — NON NEGOTIABLE</div>
              </div>
            </div>

            {/* ═══ REFERENCE BAR ═══ */}
            <div className="bol-ref-bar">
              <div className="bol-ref-item"><span className="bol-ref-key">BOL #</span><span className="bol-ref-val">{bolNum}</span></div>
              <div className="bol-ref-item"><span className="bol-ref-key">Date</span><span className="bol-ref-val">{today}</span></div>
              <div className="bol-ref-item"><span className="bol-ref-key">Load Ref</span><span className="bol-ref-val">{data.referenceNumber}</span></div>
              {data.shipperPoNumber && <div className="bol-ref-item"><span className="bol-ref-key">PO #</span><span className="bol-ref-val">{data.shipperPoNumber}</span></div>}
              {data.sealNumber && <div className="bol-ref-item"><span className="bol-ref-key">Seal #</span><span className="bol-ref-val">{data.sealNumber}</span></div>}
            </div>

            {/* ═══ SHIPPER / CONSIGNEE ═══ */}
            <div className="bol-two-col">
              <div className="bol-box">
                <div className="bol-box-header">SHIPPER (PICKUP FROM)</div>
                <div className="bol-box-body">
                  <div className="bol-box-name">{data.originCompany || "—"}</div>
                  {data.originAddress && <div className="bol-box-line">{data.originAddress}</div>}
                  <div className="bol-box-line">{data.originCity}, {data.originState} {data.originZip}</div>
                  {data.originContactName && <div className="bol-box-line">Contact: {data.originContactName}</div>}
                  {data.originContactPhone && <div className="bol-box-line">Phone: {data.originContactPhone}</div>}
                  {data.pickupNumber && <div className="bol-box-line">Pickup/Release #: {data.pickupNumber}</div>}
                </div>
              </div>
              <div className="bol-box">
                <div className="bol-box-header">CONSIGNEE (DELIVER TO)</div>
                <div className="bol-box-body">
                  <div className="bol-box-name">{data.destCompany || "—"}</div>
                  {data.destAddress && <div className="bol-box-line">{data.destAddress}</div>}
                  <div className="bol-box-line">{data.destCity}, {data.destState} {data.destZip}</div>
                  {data.destContactName && <div className="bol-box-line">Contact: {data.destContactName}</div>}
                  {data.destContactPhone && <div className="bol-box-line">Phone: {data.destContactPhone}</div>}
                  {data.deliveryReference && <div className="bol-box-line">Delivery Ref #: {data.deliveryReference}</div>}
                </div>
              </div>
            </div>

            {/* ═══ SCHEDULE + CARRIER ═══ */}
            <div className="bol-two-col">
              <div className="bol-box">
                <div className="bol-box-header">SCHEDULE</div>
                <div className="bol-box-body">
                  <div className="bol-schedule-row">
                    <span className="bol-sched-label">Pickup:</span>
                    <span>{fmtDate(data.pickupDate)} {fmtTime(data.pickupTimeStart, data.pickupTimeEnd)}</span>
                  </div>
                  <div className="bol-schedule-row">
                    <span className="bol-sched-label">Delivery:</span>
                    <span>{fmtDate(data.deliveryDate)} {fmtTime(data.deliveryTimeStart, data.deliveryTimeEnd)}</span>
                  </div>
                  <div className="bol-schedule-row">
                    <span className="bol-sched-label">Equipment:</span>
                    <span>{data.equipmentType}</span>
                  </div>
                  {data.freightTerms && (
                    <div className="bol-schedule-row">
                      <span className="bol-sched-label">Freight Terms:</span>
                      <span>{data.freightTerms}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="bol-box">
                <div className="bol-box-header">CARRIER INFORMATION</div>
                <div className="bol-box-body">
                  <div className="bol-box-name">{data.carrierCompany || "—"}</div>
                  {data.carrierMC && <div className="bol-box-line">MC# {data.carrierMC}</div>}
                  {data.carrierDOT && <div className="bol-box-line">DOT# {data.carrierDOT}</div>}
                  {data.driverName && <div className="bol-box-line">Driver: {data.driverName} {data.driverPhone ? `| ${data.driverPhone}` : ""}</div>}
                  {data.truckNumber && <div className="bol-box-line">Truck #: {data.truckNumber} {data.trailerNumber ? `| Trailer #: ${data.trailerNumber}` : ""}</div>}
                </div>
              </div>
            </div>

            {/* ═══ FREIGHT DESCRIPTION TABLE ═══ */}
            <div className="bol-section-header">FREIGHT DESCRIPTION</div>
            <table className="bol-table">
              <thead>
                <tr>
                  <th>Pieces</th>
                  <th>Pallets</th>
                  <th>Description</th>
                  <th>Weight (lbs)</th>
                  <th>Class</th>
                  <th>NMFC#</th>
                  <th>Dims (L×W×H)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{data.pieces ?? "—"}</td>
                  <td>{data.pallets ?? "—"}</td>
                  <td className="bol-td-desc">{data.commodity || "Freight All Kinds (FAK)"}</td>
                  <td>{data.weight ? Number(data.weight).toLocaleString() : "—"}</td>
                  <td>{data.freightClass || "—"}</td>
                  <td>{data.nmfcNumber || "—"}</td>
                  <td>
                    {data.dimensionsLength && data.dimensionsWidth && data.dimensionsHeight
                      ? `${data.dimensionsLength}×${data.dimensionsWidth}×${data.dimensionsHeight}"`
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* ═══ CONDITIONS BAR ═══ */}
            <div className="bol-cond-bar">
              <span><b>Stackable:</b> {data.stackable !== false ? "Yes" : "No"}</span>
              {data.temperatureControlled && (
                <span><b>Temp:</b> {data.tempMin ?? "—"}°F — {data.tempMax ?? "—"}°F</span>
              )}
              {data.declaredValue && <span><b>Declared Value:</b> {data.declaredValue}</span>}
              {!data.declaredValue && <span><b>Declared Value:</b> NVD</span>}
              {data.hazmat && (
                <span className="bol-hazmat-flag">
                  ⚠ HAZMAT — UN: {data.hazmatUnNumber || "N/A"} | Class: {data.hazmatClass || "N/A"}
                  {data.hazmatEmergencyContact && <> | Emergency: {data.hazmatEmergencyContact}</>}
                </span>
              )}
            </div>

            {/* ═══ SPECIAL INSTRUCTIONS ═══ */}
            {(data.pickupInstructions || data.deliveryInstructions || data.specialInstructions) && (
              <>
                <div className="bol-section-header">SPECIAL INSTRUCTIONS</div>
                <div className="bol-instructions">
                  {data.pickupInstructions && <div><b>Pickup:</b> {data.pickupInstructions}</div>}
                  {data.deliveryInstructions && <div><b>Delivery:</b> {data.deliveryInstructions}</div>}
                  {data.specialInstructions && <div>{data.specialInstructions}</div>}
                </div>
              </>
            )}

            {/* ═══ SIGNATURES ═══ */}
            <div className="bol-section-header">SIGNATURES & ACKNOWLEDGMENT</div>
            <div className="bol-sig-grid">
              {/* Shipper */}
              <div className="bol-sig-card">
                <div className="bol-sig-title">Shipper / Representative</div>
                <div className="bol-sig-space" />
                <div className="bol-sig-line"><span>Signature</span><span>Date</span></div>
                <div className="bol-sig-space-sm" />
                <div className="bol-sig-line"><span>Print Name</span><span>Title</span></div>
              </div>
              {/* Carrier / Driver */}
              <div className="bol-sig-card">
                <div className="bol-sig-title">Carrier / Driver</div>
                <div className="bol-sig-space" />
                <div className="bol-sig-line"><span>Signature</span><span>Date</span></div>
                <div className="bol-sig-space-sm" />
                <div className="bol-sig-line"><span>Driver Name</span><span>Seal #</span></div>
              </div>
              {/* Consignee */}
              <div className="bol-sig-card">
                <div className="bol-sig-title">Consignee</div>
                <div className="bol-sig-space" />
                <div className="bol-sig-line"><span>Signature</span><span>Date</span></div>
                <div className="bol-sig-space-sm" />
                <div className="bol-sig-line"><span>Print Name</span><span>Pieces Received</span></div>
              </div>
            </div>

            {/* ═══ TERMS ═══ */}
            <div className="bol-terms">
              The goods declared herein are accepted in apparent good order and condition (except as noted) for carriage. This shipment is subject to the terms and conditions of the Uniform Straight Bill of Lading and applicable regulations of the U.S. Department of Transportation. The carrier&apos;s liability is limited as per the Carmack Amendment (49 U.S.C. §14706). The shipper certifies that the contents are fully and accurately described, properly classified, packaged, marked, and labeled, and are in proper condition for transportation.
            </div>

            {/* ═══ FOOTER ═══ */}
            <div className="bol-footer">
              <span>Silk Route Logistics Inc. &nbsp;|&nbsp; silkroutelogistics.ai &nbsp;|&nbsp; MC# 01794414 &nbsp;|&nbsp; DOT# 4526880</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PRINT STYLES
   Color scheme: Navy #0F1A22, Gold #C9A24D, Slate gray text
   Clean, professional, works on paper
   ═══════════════════════════════════════════════════════════ */
const printStyles = `
  @page { size: letter; margin: 0.4in 0.5in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 10px; color: #1a1a1a; line-height: 1.4; }

  .bol-page { max-width: 7.5in; margin: 0 auto; }
  .no-print { display: none !important; }

  /* ── Header ── */
  .bol-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 8px; margin-bottom: 0; }
  .bol-logo-block { display: flex; align-items: center; gap: 10px; }
  .bol-logo-svg { width: 56px; height: 42px; }
  .bol-company-stack { }
  .bol-company-name { font-size: 15px; font-weight: 800; color: #0F1A22; letter-spacing: 0.8px; }
  .bol-company-sub { font-size: 8.5px; color: #64748b; line-height: 1.5; }

  .bol-title-block { text-align: right; }
  .bol-title { font-size: 24px; font-weight: 800; color: #0F1A22; line-height: 1; }
  .bol-title-sub { font-size: 7.5px; color: #C9A24D; font-weight: 700; letter-spacing: 2.5px; text-transform: uppercase; margin-top: 2px; }

  /* ── Reference Bar ── */
  .bol-ref-bar { display: flex; gap: 0; border: 2px solid #0F1A22; border-radius: 0; margin-bottom: 10px; }
  .bol-ref-item { flex: 1; padding: 5px 10px; border-right: 1px solid #d1d5db; }
  .bol-ref-item:last-child { border-right: none; }
  .bol-ref-key { display: block; font-size: 7px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 1px; }
  .bol-ref-val { display: block; font-size: 11px; font-weight: 700; color: #0F1A22; }

  /* ── Two-Column Layout ── */
  .bol-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 0; margin-bottom: 10px; }

  /* ── Box (Shipper/Consignee/Carrier/Schedule) ── */
  .bol-box { border: 1px solid #cbd5e1; }
  .bol-box-header { background: #0F1A22; color: white; font-size: 8px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 10px; }
  .bol-box-body { padding: 8px 10px; min-height: 70px; }
  .bol-box-name { font-size: 12px; font-weight: 700; color: #0F1A22; margin-bottom: 2px; }
  .bol-box-line { font-size: 10px; color: #374151; line-height: 1.6; }

  .bol-schedule-row { display: flex; gap: 6px; font-size: 10px; color: #374151; line-height: 1.8; }
  .bol-sched-label { font-weight: 700; color: #0F1A22; min-width: 80px; }

  /* ── Section Header ── */
  .bol-section-header { background: #0F1A22; color: white; font-size: 8px; font-weight: 700; letter-spacing: 1.5px; text-transform: uppercase; padding: 4px 10px; margin-bottom: 0; }

  /* ── Freight Table ── */
  .bol-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
  .bol-table th { background: #f1f5f9; color: #0F1A22; font-size: 8px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; padding: 5px 8px; text-align: left; border: 1px solid #cbd5e1; }
  .bol-table td { border: 1px solid #cbd5e1; padding: 7px 8px; font-size: 10.5px; }
  .bol-td-desc { font-weight: 600; }

  /* ── Conditions Bar ── */
  .bol-cond-bar { display: flex; gap: 20px; flex-wrap: wrap; padding: 6px 10px; border: 1px solid #cbd5e1; border-top: none; margin-bottom: 10px; font-size: 9.5px; color: #374151; }
  .bol-cond-bar b { color: #0F1A22; }
  .bol-hazmat-flag { color: #dc2626; font-weight: 700; }

  /* ── Instructions ── */
  .bol-instructions { padding: 8px 10px; border: 1px solid #cbd5e1; border-top: none; margin-bottom: 10px; font-size: 10px; color: #374151; line-height: 1.6; }
  .bol-instructions div { margin-bottom: 3px; }
  .bol-instructions b { color: #0F1A22; }

  /* ── Signatures ── */
  .bol-sig-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; margin-bottom: 10px; }
  .bol-sig-card { border: 1px solid #cbd5e1; padding: 8px 10px; }
  .bol-sig-title { font-size: 8px; font-weight: 700; color: #0F1A22; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 2px; }
  .bol-sig-space { height: 32px; }
  .bol-sig-space-sm { height: 18px; }
  .bol-sig-line { display: flex; justify-content: space-between; font-size: 7.5px; color: #94a3b8; border-top: 1px solid #94a3b8; padding-top: 2px; margin-bottom: 2px; }

  /* ── Terms ── */
  .bol-terms { font-size: 7.5px; color: #64748b; line-height: 1.5; padding: 6px 0; border-top: 1px solid #e2e8f0; margin-top: 4px; }

  /* ── Footer ── */
  .bol-footer { border-top: 2px solid #0F1A22; padding-top: 5px; font-size: 8px; color: #C9A24D; font-weight: 600; text-align: center; }
`;
