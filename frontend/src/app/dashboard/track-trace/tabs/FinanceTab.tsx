"use client";

export function FinanceTab({ load }: { load: any }) {
  const distance = load.distance || 1;
  const customerTotal = load.customerRate ?? load.rate ?? 0;
  const carrierTotal  = load.totalCarrierPay ?? load.carrierRate ?? 0;
  const margin        = customerTotal - carrierTotal;
  const marginPct     = customerTotal > 0 ? (margin / customerTotal) * 100 : 0;

  const fmt = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  const accessorials = load.loadAccessorials ?? [];

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-3 gap-3">
        <Card label="Customer rate" value={fmt(customerTotal)} subtitle={`${fmt(customerTotal / distance)}/mi`} />
        <Card label="Carrier cost"  value={fmt(carrierTotal)}  subtitle={`${fmt(carrierTotal / distance)}/mi`} />
        <Card
          label="Margin" value={fmt(margin)}
          subtitle={`${marginPct.toFixed(1)}%`}
          tone="green"
        />
      </div>

      <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rate breakdown</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <div className="text-[11px] uppercase text-gray-500 mb-1">Customer side</div>
            <Line label="Base linehaul" value={fmt(customerTotal - (load.fuelSurcharge ?? 0))} />
            <Line label="Fuel surcharge" value={fmt(load.fuelSurcharge ?? 0)} />
            <Line label="Accessorials" value={fmt(accessorials.filter((a: any) => a.billedTo === "SHIPPER").reduce((s: number, a: any) => s + Number(a.amount ?? 0), 0))} />
            <Line label="Total" value={fmt(customerTotal)} bold />
          </div>
          <div>
            <div className="text-[11px] uppercase text-gray-500 mb-1">Carrier side</div>
            <Line label="Base linehaul" value={fmt(carrierTotal - (load.fuelSurcharge ?? 0))} />
            <Line label="Fuel surcharge" value={fmt(load.fuelSurcharge ?? 0)} />
            <Line label="Accessorials" value={fmt(accessorials.filter((a: any) => a.billedTo !== "SHIPPER").reduce((s: number, a: any) => s + Number(a.amount ?? 0), 0))} />
            <Line label="Total" value={fmt(carrierTotal)} bold />
          </div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg bg-white p-4 space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invoice status</h3>
        <div className="flex justify-between">
          <span className="text-gray-600">Customer invoice</span>
          <Pill ok={load.customerInvoiced}>{load.customerInvoiced ? "Invoiced" : "Pending"}</Pill>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Carrier settlement</span>
          <Pill ok={load.carrierSettled}>{load.carrierSettled ? "Settled" : "Pending"}</Pill>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">POD verified</span>
          <Pill ok={load.podVerified}>{load.podVerified ? "Yes" : "No"}</Pill>
        </div>
        {load.carrierPaymentTier && (
          <div className="flex justify-between">
            <span className="text-gray-600">Quick pay tier</span>
            <span className="text-gray-900">{load.carrierPaymentTier}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, subtitle, tone }: { label: string; value: string; subtitle?: string; tone?: "green" }) {
  const cls = tone === "green" ? "border-green-200 bg-green-50" : "border-gray-200 bg-white";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="text-[11px] uppercase text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-white">{value}</div>
      {subtitle && <div className="text-[11px] text-gray-500">{subtitle}</div>}
    </div>
  );
}

function Line({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between text-sm ${bold ? "border-t border-gray-200 mt-1 pt-1 font-semibold" : ""}`}>
      <span className="text-slate-400">{label}</span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function Pill({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  const cls = ok ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600";
  return <span className={`px-2 py-0.5 text-[11px] rounded ${cls}`}>{children}</span>;
}
