"use client";

import { AlertTriangle } from "lucide-react";
import { AccessorialReview } from "@/components/accessorials/AccessorialReview";
import { carrierPay } from "@/lib/rateDisplay";
import {
  type AccessorialRow,
  accessorialLabel, splitAccessorials, money, num,
} from "@/components/accessorials/accessorialPresentation";

/**
 * What this load is worth on each side, built the way the money paths build it.
 *
 * The previous version bucketed accessorials by `billedTo` as though it routed a
 * line to one side or the other. It does not. The carrier is owed every approved
 * line (carrierAccessorialsForLoad); `billedTo` decides only whether that SAME
 * line also passes through to the customer at cost (unbilledCustomerAccessorials).
 * Splitting them meant the carrier column omitted the detention it was about to
 * pay. It also summed PENDING and REJECTED rows as though they were money, and
 * then printed a stated total that its own lines did not add up to.
 *
 * Each column here is built from its own components and totalled from those
 * components, so the number at the bottom is the sum of the numbers above it.
 * Where a figure is also recorded elsewhere — a settlement that already exists —
 * it is shown beside the computed one and any divergence is called out rather
 * than hidden by displaying only one of them.
 */
export function FinanceTab({
  load,
  loadId,
  onChange,
}: {
  load: any;
  loadId: string | null;
  onChange?: () => void;
}) {
  const rows: AccessorialRow[] = load.loadAccessorials ?? [];
  const acc = splitAccessorials(rows);

  // v3.8.bki — a load that stopped does not earn its linehaul. The cancel
  // reversal (integrationService.onLoadCancelledOrTONU) voids the settlement and
  // the invoice, so a CANCELLED load bills and pays nothing at all; a TONU raises
  // only its TONU charge through the accessorial ledger, on an invoice and a
  // payable that carry no linehaul and no fuel. This tab priced both as though
  // the truck had run.
  const cancelled = load.status === "CANCELLED";
  const tonu = load.status === "TONU";
  const noLinehaul = cancelled || tonu;
  const accCustomerTotal = cancelled ? 0 : acc.customerTotal;
  const accCarrierTotal = cancelled ? 0 : acc.carrierTotal;
  const accReimbursements = cancelled ? 0 : acc.reimbursements;

  const fuelSurcharge = noLinehaul ? 0 : num(load.fuelSurcharge);

  // Customer side. invoiceService bills customerRate + FSC + approved
  // pass-through accessorials, and refuses to invoice at all when the customer
  // rate is unset rather than falling back to the carrier's rate.
  const customerRateSet = load.customerRate != null;
  const customerLinehaul = noLinehaul ? 0 : num(load.customerRate);
  const customerTotal = round2(customerLinehaul + fuelSurcharge + accCustomerTotal);

  // Carrier side. `rate` is the carrier's accepted rate; carrierRate overrides it.
  const carrierLinehaul = noLinehaul ? 0 : carrierPay(load) ?? 0;
  const carrierGross = round2(carrierLinehaul + fuelSurcharge + accCarrierTotal);

  // The Quick Pay fee is never charged on an at-cost reimbursement, so the base
  // is gross less those lines.
  const feePercent = num(load.quickPayFeePercent);
  const feeBase = Math.max(0, round2(carrierGross - accReimbursements));
  const feeAmount = round2(feeBase * (feePercent / 100));
  const carrierNet = round2(carrierGross - feeAmount);

  const margin = round2(customerTotal - carrierGross);
  const marginPct = customerTotal > 0 ? (margin / customerTotal) * 100 : null;

  // A settlement already written for this load. Shown against the computed
  // figure instead of replacing it, because a divergence is the thing worth
  // seeing. Load.totalCarrierPay is the RATE CONFIRMATION's total, so on a load
  // that stopped it no longer describes anything payable — comparing it would
  // raise a divergence alarm against a settlement that was voided.
  const recordedCarrierPay = load.totalCarrierPay != null ? num(load.totalCarrierPay) : null;
  const carrierDivergence =
    !noLinehaul && recordedCarrierPay !== null && Math.abs(recordedCarrierPay - carrierGross) >= 0.01
      ? round2(recordedCarrierPay - carrierGross)
      : null;

  const distance = num(load.distance);
  const perMile = (n: number) => (!noLinehaul && distance > 0 ? `${money(n / distance)}/mi` : "—");

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-3">
        <Card label="Customer billed" value={money(customerTotal)} subtitle={perMile(customerTotal)} />
        <Card label="Carrier gross" value={money(carrierGross)} subtitle={perMile(carrierGross)} />
        <Card
          label="Margin"
          value={money(margin)}
          subtitle={marginPct == null ? "—" : `${marginPct.toFixed(1)}%`}
          tone={margin >= 0 ? "green" : "red"}
        />
      </div>

      {cancelled && (
        <Notice tone="amber">
          This load was cancelled. Nothing is billed to the customer or paid to the carrier: any invoice or
          settlement was voided at cancellation.
          {acc.carrierLines.length > 0 && " Approved accessorials listed under claims are not raised on a cancelled load."}
          {recordedCarrierPay !== null && ` The rate confirmation total of ${money(recordedCarrierPay)} no longer applies.`}
        </Notice>
      )}

      {tonu && (
        <Notice tone="amber">
          Truck ordered, not used. Linehaul and fuel surcharge are neither billed nor paid; only the TONU charge
          and any other approved accessorials are.
          {recordedCarrierPay !== null && ` The rate confirmation total of ${money(recordedCarrierPay)} no longer applies.`}
        </Notice>
      )}

      {acc.pending.length > 0 && (
        <Notice tone="amber">
          {acc.pending.length} pending claim{acc.pending.length === 1 ? "" : "s"} worth{" "}
          {money(acc.pending.reduce((s, r) => s + num(r.amount), 0))} {acc.pending.length === 1 ? "is" : "are"}{" "}
          excluded from both columns. Approve below to move them into the settlement and the invoice.
        </Notice>
      )}

      {/* v3.8.asb — rejected claims got a bare count in the header while pending
          got a notice quantifying the money. Both are money held out of the
          columns, and the operator quotes these numbers to a carrier asking why
          their settlement is short. Say the amount, not just the count. */}
      {acc.rejected.length > 0 && (
        <Notice tone="amber">
          {acc.rejected.length} rejected claim{acc.rejected.length === 1 ? "" : "s"} worth{" "}
          {money(acc.rejected.reduce((s, r) => s + num(r.amount), 0))}{" "}
          {acc.rejected.length === 1 ? "is" : "are"} excluded from both columns and will not be
          paid or billed. If a rejection was wrong, the claim has to be raised again.
        </Notice>
      )}

      {!customerRateSet && !noLinehaul && (
        <Notice tone="red">
          No customer rate is set on this load, so no invoice will generate. The customer column below counts
          fuel surcharge and accessorials only.
        </Notice>
      )}

      {carrierDivergence !== null && (
        <Notice tone="red">
          A settlement is recorded at {money(recordedCarrierPay!)}, which is {money(Math.abs(carrierDivergence))}{" "}
          {carrierDivergence > 0 ? "above" : "below"} what these components add up to. One of the two is wrong.
          Check the settlement before paying it.
        </Notice>
      )}

      {/* ─── Rate breakdown ─────────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rate breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Customer */}
          <div>
            <div className="text-[11px] uppercase text-gray-500 mb-1">Customer side</div>
            {noLinehaul ? (
              <>
                <Line label="Linehaul" value="not billed" muted />
                <Line label="Fuel surcharge" value="not billed" muted />
              </>
            ) : (
              <>
                <Line label="Linehaul" value={customerRateSet ? money(customerLinehaul) : "not set"} muted={!customerRateSet} />
                <Line label="Fuel surcharge" value={money(fuelSurcharge)} />
              </>
            )}
            {!cancelled && acc.customerLines.map((l) => (
              <Line key={l.id} label={accessorialLabel(l.type)} value={money(num(l.amount))} indent />
            ))}
            {(cancelled || acc.customerLines.length === 0) && <Line label="Accessorials" value={money(0)} indent muted />}
            <Line label="Invoice total" value={money(customerTotal)} bold />
          </div>

          {/* Carrier */}
          <div>
            <div className="text-[11px] uppercase text-gray-500 mb-1">Carrier side</div>
            {noLinehaul ? (
              <>
                <Line label="Linehaul" value="not paid" muted />
                <Line label="Fuel surcharge" value="not paid" muted />
              </>
            ) : (
              <>
                <Line label="Linehaul" value={money(carrierLinehaul)} />
                <Line label="Fuel surcharge" value={money(fuelSurcharge)} />
              </>
            )}
            {!cancelled && acc.carrierLines.map((l) => (
              <Line key={l.id} label={accessorialLabel(l.type)} value={money(num(l.amount))} indent />
            ))}
            {(cancelled || acc.carrierLines.length === 0) && <Line label="Accessorials" value={money(0)} indent muted />}
            <Line label="Settlement gross" value={money(carrierGross)} bold />
            {feePercent > 0 && (
              <>
                <Line
                  label={`Quick Pay fee (${feePercent}% on ${money(feeBase)})`}
                  value={`− ${money(feeAmount)}`}
                />
                {accReimbursements > 0 && (
                  <div className="text-[11px] text-gray-500 pl-1 -mt-0.5">
                    {money(accReimbursements)} of at-cost reimbursement held out of the fee base
                  </div>
                )}
                <Line label="Net to carrier" value={money(carrierNet)} bold />
              </>
            )}
          </div>
        </div>

        {!cancelled && acc.carrierLines.length > 0 && (
          <p className="text-[11px] text-gray-500 border-t border-gray-100 pt-2">
            Accessorials appear on both sides on purpose. They pass through to the customer at cost, so SRL bills
            exactly what the carrier is owed and takes no margin on them.
          </p>
        )}
      </div>

      {/* ─── Accessorial claims ─────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Accessorial claims</h3>
          {acc.rejected.length > 0 && (
            <span className="text-[11px] text-gray-500">{acc.rejected.length} rejected</span>
          )}
        </div>
        {loadId && <AccessorialReview rows={rows} loadId={loadId} onChange={onChange} />}
      </div>

      {/* ─── Status ─────────────────────────────────────────────────────── */}
      <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invoice status</h3>
        {/* "Pending" on a cancelled load promised an invoice and a settlement
            that the cancellation voided. */}
        <StatusRow label="Customer invoice" ok={load.customerInvoiced} yes="Invoiced" no={cancelled ? "Not billed" : "Pending"} />
        <StatusRow label="Carrier settlement" ok={load.carrierSettled} yes="Settled" no={cancelled ? "Not paid" : "Pending"} />
        <StatusRow label="POD verified" ok={load.podVerified} yes="Yes" no="No" />
        {load.carrierPaymentTier && (
          <div className="flex justify-between">
            <span className="text-gray-600">Quick Pay tier</span>
            <span className="text-gray-900">{load.carrierPaymentTier}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function Card({
  label, value, subtitle, tone,
}: { label: string; value: string; subtitle?: string; tone?: "green" | "red" }) {
  const cls =
    tone === "green" ? "border-green-200 bg-green-50" :
    tone === "red"   ? "border-red-200 bg-red-50" :
    "border-gray-200 bg-white";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="text-[11px] uppercase text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      {subtitle && <div className="text-[11px] text-gray-500">{subtitle}</div>}
    </div>
  );
}

function Line({
  label, value, bold, indent, muted,
}: { label: string; value: string; bold?: boolean; indent?: boolean; muted?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "border-t border-gray-200 mt-1 pt-1 font-semibold" : ""}`}>
      <span className={`${indent ? "pl-3" : ""} ${muted ? "text-gray-400" : "text-gray-600"}`}>{label}</span>
      <span className={muted ? "text-gray-400" : "text-gray-900"}>{value}</span>
    </div>
  );
}

function StatusRow({ label, ok, yes, no }: { label: string; ok: boolean; yes: string; no: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`px-2 py-0.5 text-[11px] rounded ${ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
        {ok ? yes : no}
      </span>
    </div>
  );
}

function Notice({ tone, children }: { tone: "amber" | "red"; children: React.ReactNode }) {
  const cls = tone === "amber"
    ? "bg-amber-50 border-amber-200 text-amber-900"
    : "bg-red-50 border-red-200 text-red-800";
  return (
    <div className={`flex items-start gap-2 border rounded-lg px-3 py-2 text-[12px] ${cls}`}>
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
