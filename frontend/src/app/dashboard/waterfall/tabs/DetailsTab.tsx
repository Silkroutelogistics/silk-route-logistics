"use client";

export function DetailsTab({ load }: { load: any }) {
  const custRate = load.customerRate ?? load.rate ?? 0;
  const carrRate = load.carrierRate ?? 0;
  const margin = custRate - carrRate;
  const marginPct = custRate > 0 ? (margin / custRate) * 100 : 0;
  const distance = load.distance ?? 0;

  const fmt = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <div className="space-y-6 text-sm">
      <Section title="Shipment">
        <Field label="Load #"     value={load.loadNumber ?? load.referenceNumber} />
        <Field label="BOL #"      value={load.bolNumber} />
        <Field label="Mode"       value={(load.equipmentType || "").toUpperCase() === "LTL" ? "LTL" : "FTL"} />
        <Field label="Equipment"  value={load.equipmentType} />
        <Field label="Commodity"  value={load.commodity} />
        <Field label="Weight"     value={load.weight ? `${load.weight} lbs` : "—"} />
        <Field label="Pieces"     value={load.pieces} />
        <Field label="Hazmat"     value={load.hazmat ? "Yes" : "No"} />
      </Section>

      <Section title="Origin">
        <Field label="Facility" value={load.shipperFacility ?? load.originCompany} />
        <Field label="Address"  value={`${load.originAddress ?? ""}, ${load.originCity}, ${load.originState} ${load.originZip ?? ""}`} />
        <Field label="Contact"  value={load.originContactName} />
        <Field label="Pickup"   value={fmtDate(load.pickupDate)} />
        <Field label="Window"   value={`${load.pickupTimeStart ?? "—"} – ${load.pickupTimeEnd ?? "—"}`} />
      </Section>

      <Section title="Destination">
        <Field label="Facility" value={load.consigneeFacility ?? load.destCompany} />
        <Field label="Address"  value={`${load.destAddress ?? ""}, ${load.destCity}, ${load.destState} ${load.destZip ?? ""}`} />
        <Field label="Contact"  value={load.destContactName} />
        <Field label="Delivery" value={fmtDate(load.deliveryDate)} />
        <Field label="Window"   value={`${load.deliveryTimeStart ?? "—"} – ${load.deliveryTimeEnd ?? "—"}`} />
      </Section>

      <Section title="Pricing">
        <Field label="Customer rate" value={`${fmt(custRate)}${distance ? ` · ${fmt(custRate / distance)}/mi` : ""}`} />
        <Field label="Target carrier cost" value={fmt(carrRate)} />
        <Field label="Target margin" value={`${fmt(margin)} · ${marginPct.toFixed(1)}%`} tone={margin > 0 ? "green" : "red"} />
        <Field label="Fuel surcharge" value={fmt(load.fuelSurcharge ?? 0)} />
      </Section>

      <Section title="Shipper">
        <Field label="Customer"  value={load.customer?.name} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border border-gray-200 rounded-lg p-4 bg-gray-50">{children}</div>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: any; tone?: "green" | "red" }) {
  const cls = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-gray-900";
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-sm ${cls}`}>{value ?? "—"}</div>
    </div>
  );
}

function fmtDate(d: any) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
