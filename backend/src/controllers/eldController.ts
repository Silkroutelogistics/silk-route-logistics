import { Response } from "express";
import { AuthRequest } from "../middleware/auth";
import { getDriverHOSData, getDVIRReports, getELDSummary, getVehicleLocation } from "../services/eldService";
import { prisma } from "../config/database";

export async function getHOSData(req: AuthRequest, res: Response) {
  const hosData = await getDriverHOSData();
  res.json(hosData);
}

export async function getDVIRs(req: AuthRequest, res: Response) {
  const reports = await getDVIRReports();
  res.json(reports);
}

export async function getELDOverview(req: AuthRequest, res: Response) {
  const summary = await getELDSummary();
  res.json(summary);
}

export async function getDriverLocation(req: AuthRequest, res: Response) {
  const driver = await prisma.driver.findUnique({
    where: { id: req.params.id },
    select: { currentLocation: true },
  });
  if (!driver) { res.status(404).json({ error: "Driver not found" }); return; }
  const location = getVehicleLocation(driver.currentLocation);
  res.json(location);
}

export async function getAllLocations(req: AuthRequest, res: Response) {
  const drivers = await prisma.driver.findMany({
    where: { status: { in: ["AVAILABLE", "ON_ROUTE"] } },
    select: { id: true, firstName: true, lastName: true, currentLocation: true, status: true },
  });

  const locations = drivers.map(d => ({
    driverId: d.id,
    driverName: `${d.firstName} ${d.lastName}`,
    status: d.status,
    location: getVehicleLocation(d.currentLocation),
  }));

  res.json(locations);
}
