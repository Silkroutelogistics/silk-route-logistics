"use client";

import { useRef } from "react";
import { Printer, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   BILL OF LADING — Industry-Standard Printable Template
   Silk Route Logistics Inc.
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

  // Hazmat
  hazmat?: boolean;
  hazmatUnNumber?: string;
  hazmatClass?: string;
  hazmatEmergencyContact?: string;

  // Temp
  temperatureControlled?: boolean;
  tempMin?: number;
  tempMax?: number;

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
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

function fmtTime(start?: string, end?: string) {
  if (!start && !end) return "";
  if (start && end) return `${start} — ${end}`;
  return start || end || "";
}

export function BOLTemplate({ data, onClose }: BOLTemplateProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>BOL - ${data.referenceNumber}</title><style>${printStyles}</style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const bolNum = data.bolNumber || `BOL-${data.referenceNumber}`;
  const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[850px] max-h-[95vh] overflow-auto">
        {/* Action Bar */}
        <div className="sticky top-0 bg-[#0D1B2A] px-6 py-3 flex items-center justify-between rounded-t-xl z-10 no-print">
          <span className="text-white font-semibold text-sm">Bill of Lading — {bolNum}</span>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#C9A84C] text-[#0D1B2A] text-xs font-bold rounded-md hover:bg-[#D4B85E]">
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
            {/* Header */}
            <div className="bol-header">
              <div className="bol-logo-block">
                <img src="/logo-full.png" alt="Silk Route Logistics" className="bol-logo" />
                <div className="bol-company-info">
                  <div className="bol-company-name">SILK ROUTE LOGISTICS INC.</div>
                  <div className="bol-company-detail">MC: 01474731 &nbsp;|&nbsp; DOT: 4298498</div>
                  <div className="bol-company-detail">info@silkroutelogistics.ai &nbsp;|&nbsp; silkroutelogistics.ai</div>
                </div>
              </div>
              <div className="bol-title-block">
                <div className="bol-title">BILL OF LADING</div>
                <div className="bol-title-sub">STRAIGHT — NON NEGOTIABLE</div>
                <table className="bol-ref-table">
                  <tbody>
                    <tr><td className="bol-ref-label">BOL #:</td><td className="bol-ref-value">{bolNum}</td></tr>
                    <tr><td className="bol-ref-label">Date:</td><td className="bol-ref-value">{today}</td></tr>
                    <tr><td className="bol-ref-label">Load Ref:</td><td className="bol-ref-value">{data.referenceNumber}</td></tr>
                    {data.shipperPoNumber && <tr><td className="bol-ref-label">PO #:</td><td className="bol-ref-value">{data.shipperPoNumber}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Shipper / Consignee / Carrier */}
            <div className="bol-parties">
              <div className="bol-party-box">
                <div className="bol-party-label">SHIPPER (ORIGIN)</div>
                <div className="bol-party-name">{data.originCompany || "—"}</div>
                {data.originAddress && <div className="bol-party-detail">{data.originAddress}</div>}
                <div className="bol-party-detail">{data.originCity}, {data.originState} {data.originZip}</div>
                {data.originContactName && <div className="bol-party-detail">Contact: {data.originContactName}</div>}
                {data.originContactPhone && <div className="bol-party-detail">Phone: {data.originContactPhone}</div>}
                <div className="bol-party-schedule">
                  <strong>Pickup:</strong> {fmtDate(data.pickupDate)} {fmtTime(data.pickupTimeStart, data.pickupTimeEnd)}
                </div>
                {data.pickupNumber && <div className="bol-party-detail">Pickup #: {data.pickupNumber}</div>}
              </div>
              <div className="bol-party-box">
                <div className="bol-party-label">CONSIGNEE (DESTINATION)</div>
                <div className="bol-party-name">{data.destCompany || "—"}</div>
                {data.destAddress && <div className="bol-party-detail">{data.destAddress}</div>}
                <div className="bol-party-detail">{data.destCity}, {data.destState} {data.destZip}</div>
                {data.destContactName && <div className="bol-party-detail">Contact: {data.destContactName}</div>}
                {data.destContactPhone && <div className="bol-party-detail">Phone: {data.destContactPhone}</div>}
                <div className="bol-party-schedule">
                  <strong>Delivery:</strong> {fmtDate(data.deliveryDate)} {fmtTime(data.deliveryTimeStart, data.deliveryTimeEnd)}
                </div>
                {data.deliveryReference && <div className="bol-party-detail">Del Ref #: {data.deliveryReference}</div>}
              </div>
              <div className="bol-party-box">
                <div className="bol-party-label">CARRIER</div>
                <div className="bol-party-name">{data.carrierCompany || "—"}</div>
                {data.carrierMC && <div className="bol-party-detail">MC: {data.carrierMC}</div>}
                {data.carrierDOT && <div className="bol-party-detail">DOT: {data.carrierDOT}</div>}
                {data.driverName && <div className="bol-party-detail">Driver: {data.driverName}</div>}
                {data.driverPhone && <div className="bol-party-detail">Driver Phone: {data.driverPhone}</div>}
                {data.truckNumber && <div className="bol-party-detail">Truck #: {data.truckNumber}</div>}
                {data.trailerNumber && <div className="bol-party-detail">Trailer #: {data.trailerNumber}</div>}
              </div>
            </div>

            {/* Freight Description */}
            <div className="bol-section-label">FREIGHT DESCRIPTION</div>
            <table className="bol-freight-table">
              <thead>
                <tr>
                  <th>Pieces</th>
                  <th>Pallets</th>
                  <th>Weight (lbs)</th>
                  <th>Commodity</th>
                  <th>Equipment</th>
                  <th>Class</th>
                  <th>Dims (L×W×H in)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{data.pieces ?? "—"}</td>
                  <td>{data.pallets ?? "—"}</td>
                  <td>{data.weight ? Number(data.weight).toLocaleString() : "—"}</td>
                  <td>{data.commodity || "FAK"}</td>
                  <td>{data.equipmentType}</td>
                  <td>{data.freightClass || "—"}</td>
                  <td>
                    {data.dimensionsLength && data.dimensionsWidth && data.dimensionsHeight
                      ? `${data.dimensionsLength}×${data.dimensionsWidth}×${data.dimensionsHeight}`
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Conditions Row */}
            <div className="bol-conditions">
              <div className="bol-cond-item">
                <span className="bol-cond-label">Stackable:</span> {data.stackable !== false ? "Yes" : "No"}
              </div>
              {data.temperatureControlled && (
                <div className="bol-cond-item">
                  <span className="bol-cond-label">Temp Range:</span> {data.tempMin ?? "—"}°F — {data.tempMax ?? "—"}°F
                </div>
              )}
              {data.hazmat && (
                <div className="bol-cond-item bol-hazmat">
                  <span className="bol-cond-label">⚠ HAZMAT</span> UN: {data.hazmatUnNumber || "—"} &nbsp; Class: {data.hazmatClass || "—"}
                  {data.hazmatEmergencyContact && <> &nbsp; Emergency: {data.hazmatEmergencyContact}</>}
                </div>
              )}
            </div>

            {/* Special Instructions */}
            {(data.pickupInstructions || data.deliveryInstructions || data.specialInstructions) && (
              <>
                <div className="bol-section-label">SPECIAL INSTRUCTIONS</div>
                <div className="bol-instructions">
                  {data.pickupInstructions && <div><strong>Pickup:</strong> {data.pickupInstructions}</div>}
                  {data.deliveryInstructions && <div><strong>Delivery:</strong> {data.deliveryInstructions}</div>}
                  {data.specialInstructions && <div>{data.specialInstructions}</div>}
                </div>
              </>
            )}

            {/* Signature Blocks */}
            <div className="bol-section-label">SIGNATURES</div>
            <div className="bol-signatures">
              <div className="bol-sig-block">
                <div className="bol-sig-label">Shipper</div>
                <div className="bol-sig-line" />
                <div className="bol-sig-fields">
                  <span>Signature</span><span>Date</span>
                </div>
                <div className="bol-sig-line" />
                <div className="bol-sig-fields">
                  <span>Print Name</span><span>Title</span>
                </div>
              </div>
              <div className="bol-sig-block">
                <div className="bol-sig-label">Carrier / Driver</div>
                <div className="bol-sig-line" />
                <div className="bol-sig-fields">
                  <span>Signature</span><span>Date</span>
                </div>
                <div className="bol-sig-line" />
                <div className="bol-sig-fields">
                  <span>Print Name</span><span>Seal #</span>
                </div>
              </div>
              <div className="bol-sig-block">
                <div className="bol-sig-label">Consignee</div>
                <div className="bol-sig-line" />
                <div className="bol-sig-fields">
                  <span>Signature</span><span>Date</span>
                </div>
                <div className="bol-sig-line" />
                <div className="bol-sig-fields">
                  <span>Print Name</span><span>Pieces Received</span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="bol-footer">
              <div className="bol-footer-note">
                This is to certify that the above-named materials are properly classified, packaged, marked, and labeled, and are in proper condition for transportation according to the applicable regulations of the DOT.
              </div>
              <div className="bol-footer-brand">
                Silk Route Logistics Inc. &nbsp;|&nbsp; silkroutelogistics.ai
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PRINT STYLES — injected into the popup window
   ═══════════════════════════════════════════════════════════ */
const printStyles = `
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.45; }

  .bol-page { max-width: 7.5in; margin: 0 auto; }

  /* Header */
  .bol-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0D1B2A; padding-bottom: 10px; margin-bottom: 14px; }
  .bol-logo-block { display: flex; align-items: center; gap: 10px; }
  .bol-logo { height: 52px; width: auto; }
  .bol-company-name { font-family: 'Playfair Display', Georgia, serif; font-size: 14px; font-weight: 700; color: #0D1B2A; letter-spacing: 0.5px; }
  .bol-company-detail { font-size: 9px; color: #6b7280; margin-top: 1px; }
  .bol-company-info { margin-top: 2px; }

  .bol-title-block { text-align: right; }
  .bol-title { font-family: 'Playfair Display', Georgia, serif; font-size: 22px; font-weight: 700; color: #0D1B2A; line-height: 1.1; }
  .bol-title-sub { font-size: 8px; color: #C9A84C; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 6px; }
  .bol-ref-table { font-size: 10px; margin-left: auto; border-collapse: collapse; }
  .bol-ref-label { text-align: right; color: #6b7280; padding-right: 6px; padding-top: 1px; }
  .bol-ref-value { font-weight: 600; color: #0D1B2A; padding-top: 1px; }

  /* Parties */
  .bol-parties { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 14px; }
  .bol-party-box { border: 1px solid #d1d5db; border-radius: 4px; padding: 8px 10px; }
  .bol-party-label { font-size: 8px; font-weight: 700; color: #C9A84C; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
  .bol-party-name { font-size: 12px; font-weight: 700; color: #0D1B2A; margin-bottom: 2px; }
  .bol-party-detail { font-size: 10px; color: #4b5563; line-height: 1.5; }
  .bol-party-schedule { font-size: 10px; color: #0D1B2A; margin-top: 4px; background: #f9fafb; padding: 3px 5px; border-radius: 2px; }

  /* Freight Table */
  .bol-section-label { font-size: 8px; font-weight: 700; color: #C9A84C; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; margin-top: 4px; }
  .bol-freight-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .bol-freight-table th { background: #0D1B2A; color: white; font-size: 9px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; padding: 5px 8px; text-align: left; }
  .bol-freight-table td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 11px; }
  .bol-freight-table tr:nth-child(even) td { background: #f9fafb; }

  /* Conditions */
  .bol-conditions { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; padding: 6px 8px; background: #f9fafb; border-radius: 3px; border: 1px solid #e5e7eb; }
  .bol-cond-item { font-size: 10px; color: #374151; }
  .bol-cond-label { font-weight: 700; color: #0D1B2A; }
  .bol-hazmat { color: #dc2626; font-weight: 600; }

  /* Instructions */
  .bol-instructions { font-size: 10px; color: #374151; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 14px; line-height: 1.6; }
  .bol-instructions div { margin-bottom: 4px; }
  .bol-instructions strong { color: #0D1B2A; }

  /* Signatures */
  .bol-signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .bol-sig-block { border: 1px solid #d1d5db; border-radius: 4px; padding: 8px 10px; }
  .bol-sig-label { font-size: 8px; font-weight: 700; color: #C9A84C; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 24px; }
  .bol-sig-line { border-bottom: 1px solid #9ca3af; margin-bottom: 2px; }
  .bol-sig-fields { display: flex; justify-content: space-between; font-size: 8px; color: #9ca3af; margin-bottom: 14px; }

  /* Footer */
  .bol-footer { border-top: 2px solid #0D1B2A; padding-top: 8px; margin-top: 8px; }
  .bol-footer-note { font-size: 8px; color: #6b7280; line-height: 1.5; margin-bottom: 4px; }
  .bol-footer-brand { font-size: 8px; color: #C9A84C; font-weight: 600; text-align: right; }

  .no-print { display: none !important; }
`;
