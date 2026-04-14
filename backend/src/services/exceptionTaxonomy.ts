/**
 * Exception reason taxonomy for Track & Trace.
 * Shared by AE Console and Carrier Portal so both sides log identical codes.
 * Keep keys stable — they are stored in load_exceptions.category.
 */

export type ExceptionUnitType = "truck" | "trailer" | "na";

export interface ExceptionReason {
  code: string;
  label: string;
  unitType: ExceptionUnitType;
  group: string;
}

export const EXCEPTION_GROUPS = [
  "Truck (power unit)",
  "Trailer",
  "Road / weather",
  "Facility",
  "Driver / compliance",
  "Freight",
  "Carrier",
  "External",
  "Other",
] as const;

export const EXCEPTION_REASONS: ExceptionReason[] = [
  // Truck
  { code: "truck_engine_failure",   label: "Engine failure / won't start", unitType: "truck", group: "Truck (power unit)" },
  { code: "truck_transmission",     label: "Transmission issue",           unitType: "truck", group: "Truck (power unit)" },
  { code: "truck_flat_tire_steer",  label: "Flat tire (steer / drive axle)", unitType: "truck", group: "Truck (power unit)" },
  { code: "truck_brake_failure",    label: "Brake failure / air leak",     unitType: "truck", group: "Truck (power unit)" },
  { code: "truck_coolant_overheat", label: "Coolant / overheating",        unitType: "truck", group: "Truck (power unit)" },
  { code: "truck_electrical",       label: "Electrical / lighting (truck)", unitType: "truck", group: "Truck (power unit)" },
  { code: "truck_def_emissions",    label: "DEF / emissions system",       unitType: "truck", group: "Truck (power unit)" },
  { code: "truck_fuel_battery",     label: "Fuel system / alternator / battery", unitType: "truck", group: "Truck (power unit)" },
  { code: "truck_steering",         label: "Steering issue",               unitType: "truck", group: "Truck (power unit)" },

  // Trailer
  { code: "trailer_flat_tire",      label: "Flat tire (trailer axle)",     unitType: "trailer", group: "Trailer" },
  { code: "trailer_brake_failure",  label: "Brake failure (trailer)",      unitType: "trailer", group: "Trailer" },
  { code: "trailer_landing_gear",   label: "Landing gear malfunction",     unitType: "trailer", group: "Trailer" },
  { code: "trailer_door",           label: "Door won't open / close",      unitType: "trailer", group: "Trailer" },
  { code: "trailer_reefer_unit",    label: "Reefer unit breakdown",        unitType: "trailer", group: "Trailer" },
  { code: "trailer_reefer_fuel",    label: "Reefer fuel out",              unitType: "trailer", group: "Trailer" },
  { code: "trailer_air_ride",       label: "Air ride / suspension leak",   unitType: "trailer", group: "Trailer" },
  { code: "trailer_lighting",       label: "Lighting / reflectors (trailer)", unitType: "trailer", group: "Trailer" },
  { code: "trailer_structural",     label: "Roof / wall / floor damage",   unitType: "trailer", group: "Trailer" },

  // Road / weather
  { code: "road_weather_delay",     label: "Weather delay",                unitType: "na", group: "Road / weather" },
  { code: "road_closure",           label: "Road closure / detour",        unitType: "na", group: "Road / weather" },
  { code: "road_traffic",           label: "Traffic congestion",           unitType: "na", group: "Road / weather" },
  { code: "road_accident_other",    label: "Accident (not involving our truck)", unitType: "na", group: "Road / weather" },
  { code: "road_accident_ours",     label: "Accident (involving our truck)", unitType: "na", group: "Road / weather" },

  // Facility
  { code: "facility_shipper_detention",   label: "Shipper detention (loading delays)",    unitType: "na", group: "Facility" },
  { code: "facility_consignee_detention", label: "Consignee detention (unloading delays)", unitType: "na", group: "Facility" },
  { code: "facility_appt_reschedule_shipper",   label: "Appointment reschedule (shipper)",   unitType: "na", group: "Facility" },
  { code: "facility_appt_reschedule_consignee", label: "Appointment reschedule (consignee)", unitType: "na", group: "Facility" },
  { code: "facility_refused_delivery", label: "Refused delivery",           unitType: "na", group: "Facility" },
  { code: "facility_wrong_address",    label: "Wrong address / address issue", unitType: "na", group: "Facility" },
  { code: "facility_closed",           label: "Facility closed",            unitType: "na", group: "Facility" },
  { code: "facility_lumper_dispute",   label: "Lumper dispute",             unitType: "na", group: "Facility" },

  // Driver / compliance
  { code: "driver_hos",              label: "HOS violation / ran out of hours", unitType: "na", group: "Driver / compliance" },
  { code: "driver_personal_emergency", label: "Driver personal emergency",  unitType: "na", group: "Driver / compliance" },
  { code: "driver_no_show",          label: "Driver no-show",               unitType: "na", group: "Driver / compliance" },
  { code: "driver_comm_failure",     label: "Communication failure (can't reach driver)", unitType: "na", group: "Driver / compliance" },

  // Freight
  { code: "freight_shortage",        label: "Shortage",                     unitType: "na", group: "Freight" },
  { code: "freight_overage",         label: "Overage",                      unitType: "na", group: "Freight" },
  { code: "freight_damaged",         label: "Damaged freight",              unitType: "na", group: "Freight" },
  { code: "freight_wrong",           label: "Wrong freight / mis-pick",     unitType: "na", group: "Freight" },
  { code: "freight_temp_excursion",  label: "Temperature excursion (reefer)", unitType: "na", group: "Freight" },

  // Carrier
  { code: "carrier_no_show",         label: "Carrier no-show / TONU",       unitType: "na", group: "Carrier" },
  { code: "carrier_cancelled",       label: "Carrier cancelled",            unitType: "na", group: "Carrier" },
  { code: "carrier_double_brokered", label: "Double brokered (unauthorized)", unitType: "na", group: "Carrier" },

  // External
  { code: "ext_customs_delay",       label: "Customs / border delay",       unitType: "na", group: "External" },
  { code: "ext_scale_inspection",    label: "Scale / inspection delay",     unitType: "na", group: "External" },
  { code: "ext_fuel_shortage",       label: "Fuel shortage",                unitType: "na", group: "External" },

  // Other
  { code: "other",                   label: "Other (specify in notes)",     unitType: "na", group: "Other" },
];

const CODE_SET = new Set(EXCEPTION_REASONS.map(r => r.code));

export function isValidExceptionCode(code: string): boolean {
  return CODE_SET.has(code);
}

export function getExceptionReason(code: string): ExceptionReason | undefined {
  return EXCEPTION_REASONS.find(r => r.code === code);
}
