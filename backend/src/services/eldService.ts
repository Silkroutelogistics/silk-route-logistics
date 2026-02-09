/**
 * ELD Integration Service
 * Provides simulated ELD data from Motive, Samsara, and Omnitracs.
 * When real API keys are configured, this service will pull live data
 * from each provider's REST API.
 */

import { prisma } from "../config/database";

interface ELDLocation {
  latitude: number;
  longitude: number;
  address: string;
  speed: number;
  heading: string;
  timestamp: string;
}

interface HOSData {
  driverId: string;
  driverName: string;
  status: string;
  drivingTimeRemaining: number;
  onDutyTimeRemaining: number;
  cycleTimeRemaining: number;
  currentDutyStatus: string;
  lastStatusChange: string;
  violations: string[];
}

interface DVIRReport {
  vehicleId: string;
  vehicleUnit: string;
  driverName: string;
  inspectionDate: string;
  defectsFound: boolean;
  defects: string[];
  status: string;
}

// Simulated city coordinates for GPS tracking
const CITY_COORDS: Record<string, { lat: number; lng: number }> = {
  "Kalamazoo, MI": { lat: 42.2917, lng: -85.5872 },
  "Detroit, MI": { lat: 42.3314, lng: -83.0458 },
  "Grand Rapids, MI": { lat: 42.9634, lng: -85.6681 },
  "Chicago, IL": { lat: 41.8781, lng: -87.6298 },
  "Indianapolis, IN": { lat: 39.7684, lng: -86.1581 },
  "Columbus, OH": { lat: 39.9612, lng: -82.9988 },
  "Nashville, TN": { lat: 36.1627, lng: -86.7816 },
  "Atlanta, GA": { lat: 33.7490, lng: -84.3880 },
  "Dallas, TX": { lat: 32.7767, lng: -96.7970 },
  "Houston, TX": { lat: 29.7604, lng: -95.3698 },
  "Phoenix, AZ": { lat: 33.4484, lng: -112.0740 },
  "Los Angeles, CA": { lat: 34.0522, lng: -118.2437 },
  "Denver, CO": { lat: 39.7392, lng: -104.9903 },
  "Minneapolis, MN": { lat: 44.9778, lng: -93.2650 },
  "St. Louis, MO": { lat: 38.6270, lng: -90.1994 },
  "Memphis, TN": { lat: 35.1495, lng: -90.0490 },
  "Charlotte, NC": { lat: 35.2271, lng: -80.8431 },
  "Jacksonville, FL": { lat: 30.3322, lng: -81.6557 },
  "New York, NY": { lat: 40.7128, lng: -74.0060 },
  "Philadelphia, PA": { lat: 39.9526, lng: -75.1652 },
};

const HEADINGS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const DUTY_STATUSES = ["DRIVING", "ON_DUTY", "SLEEPER_BERTH", "OFF_DUTY"];

function noise(val: number, pct: number = 0.01): number {
  return val + (Math.random() - 0.5) * 2 * val * pct;
}

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Get simulated GPS location for a driver/vehicle
 */
export function getVehicleLocation(driverLocation: string | null): ELDLocation {
  const cityKey = Object.keys(CITY_COORDS).find(k =>
    driverLocation?.toLowerCase().includes(k.split(",")[0].toLowerCase())
  );
  const coords = cityKey ? CITY_COORDS[cityKey] : { lat: 42.2917, lng: -85.5872 };

  return {
    latitude: noise(coords.lat, 0.005),
    longitude: noise(coords.lng, 0.005),
    address: driverLocation || "Unknown",
    speed: Math.floor(Math.random() * 65 + 5),
    heading: randomElement(HEADINGS),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get HOS data for all active drivers (simulated)
 */
export async function getDriverHOSData(): Promise<HOSData[]> {
  const drivers = await prisma.driver.findMany({
    where: { status: { in: ["AVAILABLE", "ON_ROUTE"] } },
    select: {
      id: true, firstName: true, lastName: true, status: true,
      hosDrivingUsed: true, hosOnDutyUsed: true, hosCycleUsed: true, hosCycleLimit: true,
    },
  });

  return drivers.map(d => {
    const drivingRemaining = Math.max(0, 11 - d.hosDrivingUsed);
    const onDutyRemaining = Math.max(0, 14 - d.hosOnDutyUsed);
    const cycleRemaining = Math.max(0, d.hosCycleLimit - d.hosCycleUsed);
    const violations: string[] = [];
    if (drivingRemaining <= 0) violations.push("11-hour driving limit exceeded");
    if (onDutyRemaining <= 0) violations.push("14-hour on-duty limit exceeded");
    if (cycleRemaining <= 0) violations.push("Cycle limit exceeded");

    return {
      driverId: d.id,
      driverName: `${d.firstName} ${d.lastName}`,
      status: d.status,
      drivingTimeRemaining: +drivingRemaining.toFixed(1),
      onDutyTimeRemaining: +onDutyRemaining.toFixed(1),
      cycleTimeRemaining: +cycleRemaining.toFixed(1),
      currentDutyStatus: d.status === "ON_ROUTE" ? "DRIVING" : randomElement(["ON_DUTY", "OFF_DUTY", "SLEEPER_BERTH"]),
      lastStatusChange: new Date(Date.now() - Math.random() * 3600000 * 4).toISOString(),
      violations,
    };
  });
}

/**
 * Get simulated DVIR reports
 */
export async function getDVIRReports(): Promise<DVIRReport[]> {
  const trucks = await prisma.truck.findMany({
    where: { status: { in: ["ACTIVE", "IN_SHOP"] } },
    include: { assignedDriver: { select: { firstName: true, lastName: true } } },
    take: 10,
  });

  return trucks.map(t => {
    const hasDefects = t.status === "IN_SHOP" || Math.random() < 0.15;
    const defects: string[] = [];
    if (hasDefects) {
      const possibleDefects = ["Low tire pressure (LF)", "Brake light out (rear)", "Cracked windshield", "Oil leak detected", "Loose mirror"];
      const numDefects = Math.floor(Math.random() * 2) + 1;
      for (let i = 0; i < numDefects; i++) defects.push(randomElement(possibleDefects));
    }

    return {
      vehicleId: t.id,
      vehicleUnit: t.unitNumber,
      driverName: t.assignedDriver ? `${t.assignedDriver.firstName} ${t.assignedDriver.lastName}` : "Unassigned",
      inspectionDate: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString(),
      defectsFound: hasDefects,
      defects,
      status: hasDefects ? "NEEDS_REPAIR" : "PASSED",
    };
  });
}

/**
 * Get ELD provider status summary
 */
export async function getELDSummary() {
  const [activeDrivers, activeVehicles, hosViolations] = await Promise.all([
    prisma.driver.count({ where: { status: { in: ["AVAILABLE", "ON_ROUTE"] } } }),
    prisma.truck.count({ where: { status: "ACTIVE" } }),
    prisma.driver.count({
      where: { status: { not: "INACTIVE" }, hosDrivingUsed: { gte: 11 } },
    }),
  ]);

  return {
    activeDrivers,
    activeVehicles,
    hosViolations,
    connectedDevices: activeVehicles, // Simulated: all active vehicles have ELD
    lastSync: new Date().toISOString(),
    providers: [
      { name: "Motive (KeepTruckin)", connected: true, devices: Math.ceil(activeVehicles * 0.5) },
      { name: "Samsara", connected: true, devices: Math.ceil(activeVehicles * 0.3) },
      { name: "Omnitracs", connected: true, devices: Math.ceil(activeVehicles * 0.2) },
    ],
  };
}
