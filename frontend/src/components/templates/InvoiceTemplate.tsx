"use client";

import { useRef } from "react";
import { Printer, X } from "lucide-react";

/* ═══════════════════════════════════════════════════════════
   FREIGHT INVOICE — Industry-Standard Printable Template
   Silk Route Logistics Inc.
   ═══════════════════════════════════════════════════════════ */

export interface InvoiceLineItem {
  id?: string;
  description: string;
  type?: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface InvoiceData {
  // Invoice identifiers
  invoiceNumber: string;
  status?: string;
  createdAt: string;
  dueDate?: string;
  paidAt?: string;
  paymentReference?: string;
  paymentMethod?: string;
  notes?: string;

  // Amounts
  amount: number;
  lineHaulAmount?: number;
  fuelSurchargeAmount?: number;
  accessorialsAmount?: number;
  totalAmount?: number;
  factoringFee?: number;
  advanceRate?: number;
  advanceAmount?: number;

  // Line items
  lineItems?: InvoiceLineItem[];

  // Load info
  load?: {
    referenceNumber?: string;
    originCompany?: string;
    originCity: string;
    originState: string;
    originZip?: string;
    destCompany?: string;
    destCity: string;
    destState: string;
    destZip?: string;
    pickupDate?: string;
    deliveryDate?: string;
    equipmentType?: string;
    weight?: number;
    distance?: number;
    commodity?: string;
  };

  // Bill-to (customer/shipper)
  billTo?: {
    company: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    contactName?: string;
    email?: string;
    phone?: string;
  };

  // Created by
  user?: {
    firstName: string;
    lastName: string;
    company?: string | null;
  };
}

interface InvoiceTemplateProps {
  data: InvoiceData;
  onClose?: () => void;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return d; }
}

function fmtCurrency(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function InvoiceTemplate({ data, onClose }: InvoiceTemplateProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${data.invoiceNumber}</title><style>${printStyles}</style></head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  const dueDate = data.dueDate ? fmtDate(data.dueDate) : "NET 30";
  const total = data.totalAmount || data.amount;
  const hasLineItems = data.lineItems && data.lineItems.length > 0;

  // Build summary rows if no line items
  const summaryRows: { label: string; amount: number }[] = [];
  if (!hasLineItems) {
    if (data.lineHaulAmount) summaryRows.push({ label: "Line Haul", amount: data.lineHaulAmount });
    if (data.fuelSurchargeAmount) summaryRows.push({ label: "Fuel Surcharge", amount: data.fuelSurchargeAmount });
    if (data.accessorialsAmount) summaryRows.push({ label: "Accessorials", amount: data.accessorialsAmount });
    if (summaryRows.length === 0) summaryRows.push({ label: "Freight Charges", amount: data.amount });
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[850px] max-h-[95vh] overflow-auto">
        {/* Action Bar */}
        <div className="sticky top-0 bg-[#0D1B2A] px-6 py-3 flex items-center justify-between rounded-t-xl z-10 no-print">
          <span className="text-white font-semibold text-sm">Invoice — {data.invoiceNumber}</span>
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
          <div className="inv-page">
            {/* Header */}
            <div className="inv-header">
              <div className="inv-logo-block">
                <img src="/logo-full.png" alt="Silk Route Logistics" className="inv-logo" />
                <div className="inv-company-info">
                  <div className="inv-company-name">SILK ROUTE LOGISTICS INC.</div>
                  <div className="inv-company-detail">MC: 01474731 &nbsp;|&nbsp; DOT: 4298498</div>
                  <div className="inv-company-detail">info@silkroutelogistics.ai</div>
                  <div className="inv-company-detail">silkroutelogistics.ai</div>
                </div>
              </div>
              <div className="inv-title-block">
                <div className="inv-title">INVOICE</div>
                <table className="inv-ref-table">
                  <tbody>
                    <tr><td className="inv-ref-label">Invoice #:</td><td className="inv-ref-value">{data.invoiceNumber}</td></tr>
                    <tr><td className="inv-ref-label">Date:</td><td className="inv-ref-value">{fmtDate(data.createdAt)}</td></tr>
                    <tr><td className="inv-ref-label">Due:</td><td className="inv-ref-value inv-due">{dueDate}</td></tr>
                    {data.load?.referenceNumber && <tr><td className="inv-ref-label">Load Ref:</td><td className="inv-ref-value">{data.load.referenceNumber}</td></tr>}
                    {data.status && <tr><td className="inv-ref-label">Status:</td><td className="inv-ref-value inv-status">{data.status.replace(/_/g, " ")}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bill To / Remit To */}
            <div className="inv-addresses">
              <div className="inv-addr-box">
                <div className="inv-addr-label">BILL TO</div>
                {data.billTo ? (
                  <>
                    <div className="inv-addr-name">{data.billTo.company}</div>
                    {data.billTo.address && <div className="inv-addr-detail">{data.billTo.address}</div>}
                    {data.billTo.city && <div className="inv-addr-detail">{data.billTo.city}, {data.billTo.state} {data.billTo.zip}</div>}
                    {data.billTo.contactName && <div className="inv-addr-detail">Attn: {data.billTo.contactName}</div>}
                    {data.billTo.email && <div className="inv-addr-detail">{data.billTo.email}</div>}
                  </>
                ) : data.load?.originCompany ? (
                  <>
                    <div className="inv-addr-name">{data.load.originCompany}</div>
                    <div className="inv-addr-detail">{data.load.originCity}, {data.load.originState} {data.load.originZip || ""}</div>
                  </>
                ) : (
                  <div className="inv-addr-detail">—</div>
                )}
              </div>
              <div className="inv-addr-box">
                <div className="inv-addr-label">REMIT PAYMENT TO</div>
                <div className="inv-addr-name">Silk Route Logistics Inc.</div>
                <div className="inv-addr-detail">Accounts Receivable</div>
                <div className="inv-addr-detail">ar@silkroutelogistics.ai</div>
                <div className="inv-addr-detail">Payment Ref: {data.invoiceNumber}</div>
              </div>
            </div>

            {/* Load Details */}
            {data.load && (
              <>
                <div className="inv-section-label">SHIPMENT DETAILS</div>
                <div className="inv-shipment-grid">
                  <div className="inv-ship-item">
                    <span className="inv-ship-label">Origin</span>
                    <span className="inv-ship-value">{data.load.originCompany && `${data.load.originCompany}, `}{data.load.originCity}, {data.load.originState}</span>
                  </div>
                  <div className="inv-ship-item">
                    <span className="inv-ship-label">Destination</span>
                    <span className="inv-ship-value">{data.load.destCompany && `${data.load.destCompany}, `}{data.load.destCity}, {data.load.destState}</span>
                  </div>
                  <div className="inv-ship-item">
                    <span className="inv-ship-label">Pickup Date</span>
                    <span className="inv-ship-value">{fmtDate(data.load.pickupDate)}</span>
                  </div>
                  <div className="inv-ship-item">
                    <span className="inv-ship-label">Delivery Date</span>
                    <span className="inv-ship-value">{fmtDate(data.load.deliveryDate)}</span>
                  </div>
                  {data.load.equipmentType && (
                    <div className="inv-ship-item">
                      <span className="inv-ship-label">Equipment</span>
                      <span className="inv-ship-value">{data.load.equipmentType}</span>
                    </div>
                  )}
                  {data.load.weight && (
                    <div className="inv-ship-item">
                      <span className="inv-ship-label">Weight</span>
                      <span className="inv-ship-value">{Number(data.load.weight).toLocaleString()} lbs</span>
                    </div>
                  )}
                  {data.load.distance && (
                    <div className="inv-ship-item">
                      <span className="inv-ship-label">Miles</span>
                      <span className="inv-ship-value">{data.load.distance} mi</span>
                    </div>
                  )}
                  {data.load.commodity && (
                    <div className="inv-ship-item">
                      <span className="inv-ship-label">Commodity</span>
                      <span className="inv-ship-value">{data.load.commodity}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Line Items or Summary */}
            <div className="inv-section-label">CHARGES</div>
            <table className="inv-charges-table">
              <thead>
                <tr>
                  <th style={{ width: "45%" }}>Description</th>
                  {hasLineItems && <th style={{ width: "12%" }}>Type</th>}
                  <th style={{ width: "12%", textAlign: "right" }}>Qty</th>
                  <th style={{ width: "15%", textAlign: "right" }}>Rate</th>
                  <th style={{ width: "16%", textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {hasLineItems ? (
                  data.lineItems!.map((li, i) => (
                    <tr key={li.id || i}>
                      <td>{li.description}</td>
                      <td>{(li.type || "").replace(/_/g, " ")}</td>
                      <td style={{ textAlign: "right" }}>{li.quantity}</td>
                      <td style={{ textAlign: "right" }}>${fmtCurrency(li.rate)}</td>
                      <td style={{ textAlign: "right" }} className="inv-amount">${fmtCurrency(li.amount)}</td>
                    </tr>
                  ))
                ) : (
                  summaryRows.map((r, i) => (
                    <tr key={i}>
                      <td colSpan={hasLineItems ? 1 : 1}>{r.label}</td>
                      <td style={{ textAlign: "right" }}>1</td>
                      <td style={{ textAlign: "right" }}>${fmtCurrency(r.amount)}</td>
                      <td style={{ textAlign: "right" }} className="inv-amount">${fmtCurrency(r.amount)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Totals */}
            <div className="inv-totals">
              <div className="inv-totals-inner">
                <div className="inv-total-row">
                  <span>Subtotal</span>
                  <span>${fmtCurrency(data.amount)}</span>
                </div>
                {data.factoringFee != null && data.factoringFee > 0 && (
                  <div className="inv-total-row">
                    <span>Factoring Fee</span>
                    <span>-${fmtCurrency(data.factoringFee)}</span>
                  </div>
                )}
                {data.advanceAmount != null && data.advanceAmount > 0 && (
                  <div className="inv-total-row">
                    <span>Advance ({data.advanceRate || 0}%)</span>
                    <span>${fmtCurrency(data.advanceAmount)}</span>
                  </div>
                )}
                <div className="inv-total-row inv-total-grand">
                  <span>TOTAL DUE</span>
                  <span>${fmtCurrency(total)}</span>
                </div>
              </div>
            </div>

            {/* Payment Info */}
            {data.paidAt && (
              <div className="inv-paid-banner">
                PAID — {fmtDate(data.paidAt)}
                {data.paymentMethod && ` via ${data.paymentMethod.replace(/_/g, " ")}`}
                {data.paymentReference && ` (Ref: ${data.paymentReference})`}
              </div>
            )}

            {/* Notes */}
            {data.notes && (
              <>
                <div className="inv-section-label">NOTES</div>
                <div className="inv-notes">{data.notes}</div>
              </>
            )}

            {/* Terms */}
            <div className="inv-section-label">TERMS &amp; CONDITIONS</div>
            <div className="inv-terms">
              <div>1. Payment is due within 30 days of invoice date unless otherwise agreed in writing.</div>
              <div>2. Late payments are subject to a 1.5% monthly finance charge.</div>
              <div>3. Disputes must be reported within 10 business days of receipt.</div>
              <div>4. This invoice constitutes acceptance of the freight charges for the shipment described above.</div>
            </div>

            {/* Footer */}
            <div className="inv-footer">
              <div className="inv-footer-brand">
                Silk Route Logistics Inc. &nbsp;|&nbsp; silkroutelogistics.ai &nbsp;|&nbsp; ar@silkroutelogistics.ai
              </div>
              <div className="inv-footer-note">Thank you for your business.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   PRINT STYLES
   ═══════════════════════════════════════════════════════════ */
const printStyles = `
  @page { size: letter; margin: 0.6in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 11px; color: #1a1a1a; line-height: 1.45; }

  .inv-page { max-width: 7.5in; margin: 0 auto; }

  /* Header */
  .inv-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0D1B2A; padding-bottom: 10px; margin-bottom: 16px; }
  .inv-logo-block { display: flex; align-items: center; gap: 10px; }
  .inv-logo { height: 52px; width: auto; }
  .inv-company-name { font-family: 'Playfair Display', Georgia, serif; font-size: 14px; font-weight: 700; color: #0D1B2A; letter-spacing: 0.5px; }
  .inv-company-detail { font-size: 9px; color: #6b7280; margin-top: 1px; }
  .inv-company-info { margin-top: 2px; }

  .inv-title-block { text-align: right; }
  .inv-title { font-family: 'Playfair Display', Georgia, serif; font-size: 28px; font-weight: 700; color: #0D1B2A; line-height: 1.1; margin-bottom: 6px; }
  .inv-ref-table { font-size: 10px; margin-left: auto; border-collapse: collapse; }
  .inv-ref-label { text-align: right; color: #6b7280; padding-right: 6px; padding-top: 2px; }
  .inv-ref-value { font-weight: 600; color: #0D1B2A; padding-top: 2px; }
  .inv-due { color: #C9A84C; font-weight: 700; }
  .inv-status { font-size: 9px; padding: 1px 6px; background: #f3f4f6; border-radius: 3px; }

  /* Addresses */
  .inv-addresses { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
  .inv-addr-box { border: 1px solid #d1d5db; border-radius: 4px; padding: 10px 12px; }
  .inv-addr-label { font-size: 8px; font-weight: 700; color: #C9A84C; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 4px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px; }
  .inv-addr-name { font-size: 12px; font-weight: 700; color: #0D1B2A; margin-bottom: 2px; }
  .inv-addr-detail { font-size: 10px; color: #4b5563; line-height: 1.5; }

  /* Shipment Details */
  .inv-section-label { font-size: 8px; font-weight: 700; color: #C9A84C; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 6px; margin-top: 4px; }
  .inv-shipment-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 16px; background: #f9fafb; padding: 8px; border-radius: 4px; border: 1px solid #e5e7eb; }
  .inv-ship-item { display: flex; flex-direction: column; }
  .inv-ship-label { font-size: 8px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; }
  .inv-ship-value { font-size: 10px; font-weight: 600; color: #0D1B2A; }

  /* Charges Table */
  .inv-charges-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  .inv-charges-table th { background: #0D1B2A; color: white; font-size: 9px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; padding: 5px 8px; text-align: left; }
  .inv-charges-table td { border: 1px solid #d1d5db; padding: 6px 8px; font-size: 11px; }
  .inv-charges-table tr:nth-child(even) td { background: #f9fafb; }
  .inv-amount { font-weight: 600; }

  /* Totals */
  .inv-totals { display: flex; justify-content: flex-end; margin-bottom: 16px; }
  .inv-totals-inner { width: 260px; }
  .inv-total-row { display: flex; justify-content: space-between; padding: 4px 8px; font-size: 11px; }
  .inv-total-row span:first-child { color: #6b7280; }
  .inv-total-row span:last-child { font-weight: 600; }
  .inv-total-grand { background: #0D1B2A; color: white !important; border-radius: 3px; padding: 6px 8px; margin-top: 4px; font-size: 13px; }
  .inv-total-grand span:first-child { color: white; font-weight: 700; }
  .inv-total-grand span:last-child { color: #C9A84C; font-weight: 700; font-size: 14px; }

  /* Paid banner */
  .inv-paid-banner { text-align: center; padding: 8px; background: #ecfdf5; border: 2px solid #10b981; border-radius: 4px; color: #065f46; font-weight: 700; font-size: 13px; letter-spacing: 1px; margin-bottom: 16px; }

  /* Notes */
  .inv-notes { font-size: 10px; color: #374151; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 16px; line-height: 1.6; }

  /* Terms */
  .inv-terms { font-size: 8.5px; color: #6b7280; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 4px; margin-bottom: 16px; line-height: 1.7; }
  .inv-terms div { margin-bottom: 2px; }

  /* Footer */
  .inv-footer { border-top: 2px solid #0D1B2A; padding-top: 8px; margin-top: 8px; text-align: center; }
  .inv-footer-brand { font-size: 9px; color: #C9A84C; font-weight: 600; }
  .inv-footer-note { font-size: 10px; color: #6b7280; margin-top: 2px; font-style: italic; }

  .no-print { display: none !important; }
`;
