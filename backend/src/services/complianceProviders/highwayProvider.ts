/**
 * Highway API Integration Provider
 * Provides carrier verification, monitoring, alerts, and fraud detection
 * via the Highway API (https://highway.com).
 *
 * Set HIGHWAY_API_KEY in your environment to enable real API calls.
 * When the key is NOT set, rich mock/demo data is returned instead.
 */

const HIGHWAY_API_KEY = process.env.HIGHWAY_API_KEY;
const HIGHWAY_BASE_URL = "https://api.highway.com/v1";

function isAvailable(): boolean {
  return !!HIGHWAY_API_KEY;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${HIGHWAY_API_KEY}`,
    "Content-Type": "application/json",
  };
}

// ---------------------------------------------------------------------------
// Carrier Verification
// ---------------------------------------------------------------------------

export async function verifyCarrier(mcNumber: string) {
  if (!isAvailable()) {
    // Return rich mock data for demo / development
    return {
      available: true,
      data: {
        mcNumber,
        dotNumber: "DOT-" + mcNumber.replace(/\D/g, ""),
        legalName: "Mock Transport LLC",
        dbaName: "Mock Transport",
        status: "AUTHORIZED",
        authorityType: "COMMON",
        authorityGrantedDate: "2019-03-15",
        insuranceOnFile: true,
        insuranceType: "AUTO_LIABILITY",
        insuranceAmount: 1000000,
        insuranceExpiry: "2026-08-15",
        safetyRating: "SATISFACTORY",
        totalDrivers: 24,
        totalPowerUnits: 18,
        totalInspections: 45,
        outOfServiceRate: 4.2,
        address: {
          street: "1234 Trucking Way",
          city: "Dallas",
          state: "TX",
          zip: "75201",
        },
        phone: "(214) 555-0100",
        email: "dispatch@mocktransport.com",
        lastUpdated: new Date().toISOString(),
      },
    };
  }

  try {
    const res = await fetch(`${HIGHWAY_BASE_URL}/carriers/${mcNumber}`, {
      method: "GET",
      headers: authHeaders(),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        available: true,
        error: `Highway API error ${res.status}: ${text}`,
        data: null,
      };
    }

    const data = await res.json();
    return { available: true, data };
  } catch (err: any) {
    return {
      available: true,
      error: err.message ?? "Unknown error calling Highway verifyCarrier",
      data: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Carrier Monitoring Enrollment
// ---------------------------------------------------------------------------

export async function monitorCarrier(mcNumber: string) {
  if (!isAvailable()) {
    return {
      available: true,
      data: {
        mcNumber,
        monitoringId: "MON-" + mcNumber.replace(/\D/g, ""),
        status: "ACTIVE",
        enrolledAt: new Date().toISOString(),
        alertTypes: [
          "AUTHORITY_CHANGE",
          "INSURANCE_CHANGE",
          "SAFETY_DOWNGRADE",
          "OUT_OF_SERVICE",
        ],
        lastChecked: new Date().toISOString(),
        nextCheck: new Date(Date.now() + 86400000).toISOString(),
      },
    };
  }

  try {
    const res = await fetch(
      `${HIGHWAY_BASE_URL}/carriers/${mcNumber}/monitor`,
      {
        method: "POST",
        headers: authHeaders(),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        available: true,
        error: `Highway API error ${res.status}: ${text}`,
        data: null,
      };
    }

    const data = await res.json();
    return { available: true, data };
  } catch (err: any) {
    return {
      available: true,
      error: err.message ?? "Unknown error calling Highway monitorCarrier",
      data: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Carrier Alerts
// ---------------------------------------------------------------------------

export async function getAlerts(mcNumber: string) {
  if (!isAvailable()) {
    return {
      available: true,
      data: {
        mcNumber,
        alerts: [
          {
            id: "ALT-001",
            type: "INSURANCE_EXPIRING",
            severity: "WARNING",
            message: "Auto liability insurance expires in 30 days",
            createdAt: "2026-02-15T10:00:00.000Z",
            acknowledged: false,
          },
          {
            id: "ALT-002",
            type: "SAFETY_RATING_CHANGE",
            severity: "INFO",
            message: "Safety rating review scheduled",
            createdAt: "2026-02-10T14:30:00.000Z",
            acknowledged: true,
          },
          {
            id: "ALT-003",
            type: "AUTHORITY_STATUS",
            severity: "LOW",
            message: "Biennial update due in 60 days",
            createdAt: "2026-02-01T09:15:00.000Z",
            acknowledged: false,
          },
        ],
        totalUnacknowledged: 2,
      },
    };
  }

  try {
    const res = await fetch(
      `${HIGHWAY_BASE_URL}/carriers/${mcNumber}/alerts`,
      {
        method: "GET",
        headers: authHeaders(),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        available: true,
        error: `Highway API error ${res.status}: ${text}`,
        data: null,
      };
    }

    const data = await res.json();
    return { available: true, data };
  } catch (err: any) {
    return {
      available: true,
      error: err.message ?? "Unknown error calling Highway getAlerts",
      data: null,
    };
  }
}

// ---------------------------------------------------------------------------
// Fraud Check
// ---------------------------------------------------------------------------

export async function checkFraud(mcNumber: string) {
  if (!isAvailable()) {
    return {
      available: true,
      data: {
        mcNumber,
        riskScore: 12,
        riskLevel: "LOW",
        identityVerified: true,
        authorityVerified: true,
        insuranceVerified: true,
        redFlags: [],
        checkDate: new Date().toISOString(),
        recommendation: "APPROVE",
      },
    };
  }

  try {
    const res = await fetch(
      `${HIGHWAY_BASE_URL}/carriers/${mcNumber}/fraud-check`,
      {
        method: "POST",
        headers: authHeaders(),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      return {
        available: true,
        error: `Highway API error ${res.status}: ${text}`,
        data: null,
      };
    }

    const data = await res.json();
    return { available: true, data };
  } catch (err: any) {
    return {
      available: true,
      error: err.message ?? "Unknown error calling Highway checkFraud",
      data: null,
    };
  }
}
