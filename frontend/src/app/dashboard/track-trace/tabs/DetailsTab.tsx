"use client";

export function DetailsTab({ load }: { load: any }) {
  const pickup = load.loadStops?.find((s: any) => s.stopType === "PICKUP") ?? {};
  const delivery = [...(load.loadStops ?? [])].reverse().find((s: any) => s.stopType === "DELIVERY") ?? {};

  return (
    <div className="space-y-6 text-sm">
      <Section title="Shipment info">
        <Field label="Load #"       value={load.loadNumber ?? load.referenceNumber} />
        <Field label="PO #"         value={(load.poNumbers || []).join(", ") || "—"} />
        <Field label="BOL #"        value={load.bolNumber} />
        <Field label="Mode"         value={(load.equipmentType || "").toUpperCase() === "LTL" ? "LTL" : "FTL"} />
        <Field label="Equipment"    value={load.equipmentType} />
        <Field label="Commodity"    value={load.commodity} />
        <Field label="Weight"       value={load.weight ? `${load.weight} lbs` : "—"} />
        <Field label="Pieces"       value={load.pieces} />
        <Field label="Hazmat"       value={load.hazmat ? "Yes" : "No"} />
        {load.temperatureControlled && (
          <Field label="Temp"       value={`${load.tempMin ?? "—"}°F – ${load.tempMax ?? "—"}°F`} />
        )}
      </Section>

      <Section title="Origin (pickup)">
        <Field label="Facility"     value={pickup.facilityName || load.shipperFacility || load.originCompany} />
        <Field label="Address"      value={`${pickup.address ?? load.originAddress ?? ""}, ${pickup.city ?? load.originCity}, ${pickup.state ?? load.originState} ${pickup.zip ?? load.originZip ?? ""}`} />
        <Field label="Contact"      value={pickup.contactName ?? load.originContactName} />
        <Field label="Phone"        value={pickup.contactPhone ?? load.originContactPhone} />
        <Field label="Pickup date"  value={fmtDate(load.pickupDate)} />
        <Field label="Window"       value={`${load.pickupTimeStart ?? "—"} – ${load.pickupTimeEnd ?? "—"}`} />
        <Field
          label="Actual pickup"
          value={fmtDate(load.actualPickupDatetime)}
          tone={pickup.onTime === false ? "red" : pickup.onTime ? "green" : "neutral"}
        />
        <Field label="Dock/Bay"     value={load.dockAssignment} />
        <Field label="Seal #"       value={load.sealNumber ?? pickup.sealNumber} />
      </Section>

      <Section title="Destination (delivery)">
        <Field label="Facility"     value={delivery.facilityName ?? load.consigneeFacility ?? load.destCompany} />
        <Field label="Address"      value={`${delivery.address ?? load.destAddress ?? ""}, ${delivery.city ?? load.destCity}, ${delivery.state ?? load.destState} ${delivery.zip ?? load.destZip ?? ""}`} />
        <Field label="Contact"      value={delivery.contactName ?? load.destContactName} />
        <Field label="Phone"        value={delivery.contactPhone ?? load.destContactPhone} />
        <Field label="Delivery date" value={fmtDate(load.deliveryDate)} />
        <Field label="Window"       value={`${load.deliveryTimeStart ?? "—"} – ${load.deliveryTimeEnd ?? "—"}`} />
        <Field label="Appt #"       value={load.appointmentNumber} />
        <Field label="Actual delivery" value={fmtDate(load.actualDeliveryDatetime)} />
      </Section>

      <Section title="Carrier & driver">
        <Field label="Carrier"      value={load.carrier?.company || `${load.carrier?.firstName ?? ""} ${load.carrier?.lastName ?? ""}`.trim() || "—"} />
        <Field label="Driver"       value={load.driverName} />
        <Field label="Driver phone" value={load.driverPhone} />
        <Field label="Truck #"      value={load.truckNumber} />
        <Field label="Trailer #"    value={load.trailerNumber} />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 border border-gray-200 rounded-lg p-4 bg-gray-50">
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, tone }: { label: string; value: any; tone?: "green" | "red" | "neutral" }) {
  const toneCls = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-gray-900";
  return (
    <div>
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className={`text-sm ${toneCls}`}>{value ?? "—"}</div>
    </div>
  );
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
