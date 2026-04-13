import { prisma } from "../config/database";

// Shipper defaults are stored as JSON on the Customer model
// This service manages the defaults configuration

interface ShipperDefaults {
  // Pallet & Dimensions
  defaultPalletDimensions?: string;         // e.g. "48 x 40 in"
  preferredPalletDimensions?: string;       // e.g. "48 x 48 x 52 H in"
  fractionalPalletHeightPadding?: boolean;
  fullPalletWeight?: number;                // lbs
  palletWeight?: number;                    // tare weight

  // Freight
  defaultFreightClass?: string;
  defaultCommodityDescription?: string;
  defaultCargoValue?: number;
  ftlWeight?: number;                       // max FTL weight threshold
  loadNote?: string;                        // default note on all loads

  // Reefer
  defaultReeferSettings?: { tempMin: number; tempMax: number; continuous: boolean };

  // Quoting
  defaultOrderFilter?: string;              // filter preset for order page
  enableQuickFetchFacilities?: boolean;
  preferredBrokers?: string[];              // broker user IDs
  additionalRatesChecked?: boolean;

  // On-Time Performance
  pickupGracePeriod?: number;               // minutes
  dropoffGracePeriod?: number;              // minutes

  // Quoting Requirements
  defaultPickupQuotingRequirements?: string;
  defaultDropoffQuotingRequirements?: string;

  // Tendering
  competitiveBidVisibility?: string;        // "default", "hidden", "visible"
  supportsTwoStepTendering?: boolean;

  // Carrier Controls
  blockedCarrierSCACs?: string[];
  showReferenceNumbersToCarriersBeforeTender?: boolean;
  contactCarrierDefaultAccountManagers?: boolean;

  // Display
  hideDimensions?: boolean;
  hidePickupDropoffDate?: boolean;

  // Pre-2025 Rules
  preLegacyFreightClassRules?: string;

  // Quoting Ranges
  quotingPickupDateRange?: number;          // days
  quotingDropoffDateRange?: number;         // days
}

export async function getShipperDefaults(customerId: string): Promise<ShipperDefaults> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, notes: true },
  });
  if (!customer) throw new Error("Customer not found");

  // Defaults stored in a dedicated field — we use the customer's notes as JSON for now
  // In production, this should be a separate ShipperDefaults table or a JSON column
  try {
    const raw = (customer as any).shipperDefaults;
    return raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {};
  } catch {
    return {};
  }
}

export async function updateShipperDefaults(customerId: string, defaults: Partial<ShipperDefaults>) {
  // Since we don't have a dedicated column yet, store in a JSON field
  // For now, use prisma.$executeRaw to update
  const existing = await getShipperDefaults(customerId);
  const merged = { ...existing, ...defaults };

  await prisma.$executeRawUnsafe(
    `UPDATE customers SET notes = $1 WHERE id = $2`,
    JSON.stringify({ _shipperDefaults: merged, _originalNotes: (await prisma.customer.findUnique({ where: { id: customerId }, select: { notes: true } }))?.notes }),
    customerId
  );

  return merged;
}

// Get all configurable fields with their current values
export async function getShipperDefaultsSchema(customerId: string) {
  const defaults = await getShipperDefaults(customerId);
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, name: true, preferredEquipment: true },
  });

  return {
    customer: { id: customer?.id, name: customer?.name },
    defaults,
    schema: [
      // Pallet & Dimensions
      { key: "defaultPalletDimensions", label: "Default Pallet Dimensions", category: "PALLET_DIMENSIONS", type: "text", description: "This is the contact used for quoting and general communication, when search comes in." },
      { key: "preferredPalletDimensions", label: "Preferred Pallet Dimensions", category: "PALLET_DIMENSIONS", type: "text", description: "These are preferred pallet dimensions that are used for quoting." },
      { key: "fractionalPalletHeightPadding", label: "Fractional Pallet Height Padding", category: "PALLET_DIMENSIONS", type: "boolean", description: "Whether to add extra height padding for fractional pallets." },
      { key: "fullPalletWeight", label: "Full Pallet Weight", category: "PALLET_DIMENSIONS", type: "number", description: "The assumed weight of a full pallet with items on it." },
      { key: "palletWeight", label: "Pallet Weight", category: "PALLET_DIMENSIONS", type: "number", description: "The assumed tare weight of a pallet." },

      // Freight
      { key: "defaultFreightClass", label: "Default Freight Class", category: "FREIGHT", type: "text", description: "This is used to set the class portion in a quote." },
      { key: "defaultCommodityDescription", label: "Default Commodity Description", category: "FREIGHT", type: "text", description: "Default commodity description for load creation." },
      { key: "defaultCargoValue", label: "Default Cargo Value", category: "FREIGHT", type: "number", description: "Used to prefill quotes and bills." },
      { key: "ftlWeight", label: "FTL Weight", category: "FREIGHT", type: "number", description: "Used when quoting FTL. The weight of this item as an unknown." },
      { key: "loadNote", label: "Load Note", category: "FREIGHT", type: "text", description: "This will be used to prefill the notes portion in a quote." },

      // Reefer
      { key: "defaultReeferSettings", label: "Default Reefer Settings", category: "REEFER", type: "json", description: "Default temperature settings for reefer loads." },

      // Quoting
      { key: "defaultOrderFilter", label: "Default Order Filter", category: "QUOTING", type: "text", description: "This is a quick filter for orders you are interested in." },
      { key: "enableQuickFetchFacilities", label: "Enable Quick Fetch Facilities", category: "QUOTING", type: "boolean", description: "This is used to enable quick fetch facilities." },
      { key: "preferredBrokers", label: "Preferred Brokers", category: "QUOTING", type: "array", description: "These will be selected by default when quoting." },
      { key: "additionalRatesChecked", label: "Additional Rates Checked", category: "QUOTING", type: "boolean", description: "Whether to include Delivery and relaxed rates from brokers." },

      // Performance
      { key: "pickupGracePeriod", label: "Pickup Grace Period (min)", category: "PERFORMANCE", type: "number", description: "These fields are used to define how we compute on-time performance." },
      { key: "dropoffGracePeriod", label: "Dropoff Grace Period (min)", category: "PERFORMANCE", type: "number", description: "Grace period for dropoff times." },

      // Quoting Requirements
      { key: "defaultPickupQuotingRequirements", label: "Default Pickup Quoting Requirements", category: "QUOTING_REQUIREMENTS", type: "text", description: "Default requirements for pickup stops." },
      { key: "defaultDropoffQuotingRequirements", label: "Default Dropoff Quoting Requirements", category: "QUOTING_REQUIREMENTS", type: "text", description: "Default requirements for dropoff stops." },

      // Tendering
      { key: "competitiveBidVisibility", label: "Competitive Bid Visibility", category: "TENDERING", type: "select", options: ["default", "hidden", "visible"], description: "Whether carriers can see competing bids." },
      { key: "supportsTwoStepTendering", label: "Supports Two Step Tendering", category: "TENDERING", type: "boolean", description: "Enable two-step tender process." },

      // Carrier Controls
      { key: "blockedCarrierSCACs", label: "Blocked Carrier SCACs", category: "CARRIER_CONTROLS", type: "array", description: "SCACs of carriers you do not want to receive bids from." },
      { key: "showReferenceNumbersToCarriersBeforeTender", label: "Show Reference Numbers to Carriers Before Tender", category: "CARRIER_CONTROLS", type: "boolean", description: "Whether carriers can see reference numbers before tender." },
      { key: "contactCarrierDefaultAccountManagers", label: "Contact Carrier Default Account Managers", category: "CARRIER_CONTROLS", type: "boolean", description: "Auto-notify carrier account managers." },

      // Display
      { key: "hideDimensions", label: "Hide Dimensions", category: "DISPLAY", type: "boolean", description: "Whether to hide dimensions on quotes." },
      { key: "hidePickupDropoffDate", label: "Hide Pickup/Dropoff Date", category: "DISPLAY", type: "boolean", description: "Whether to hide dates on the quote." },

      // Ranges
      { key: "quotingPickupDateRange", label: "Quoting Pickup Date Range (days)", category: "QUOTING_RANGES", type: "number", description: "If a delivery date is not specified when quoting, go with this range." },
      { key: "quotingDropoffDateRange", label: "Quoting Dropoff Date Range (days)", category: "QUOTING_RANGES", type: "number", description: "If a delivery date is not specified when quoting, go with this range." },
    ],
  };
}
