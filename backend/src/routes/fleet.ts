import { Router } from "express";
import {
  getTrucks, getTruckById, createTruck, getTruckStats,
  getTrailers, getTrailerById, createTrailer, getTrailerStats,
  getFleetOverview,
} from "../controllers/fleetController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

// ARC 22 — the truck/trailer MUTATION routes are gone: DEAD-BY-STRATEGY.
// SRL is a pure broker. `Truck` and `Trailer` carry no owner column at all,
// and the only things that ever created a row were this module's POST and the
// seed — so they modelled SRL's OWN fleet, which §5 prohibits SRL from ever
// claiming ("our fleet" / "our trucks" / "we own"). Edit/delete/assign had no
// caller in any frontend, present or historical. Read + create remain because
// /dashboard/fleet calls them; retiring the module wholesale is §13.3 Item 228.
const router = Router();

router.use(authenticate);

// Trucks
router.get("/trucks", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"), getTrucks);
router.get("/trucks/stats", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"), getTruckStats);
router.get("/trucks/:id", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"), getTruckById);
router.post("/trucks", authorize("ADMIN", "CEO", "OPERATIONS"), auditLog("CREATE", "Truck"), createTruck);

// Trailers
router.get("/trailers", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"), getTrailers);
router.get("/trailers/stats", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"), getTrailerStats);
router.get("/trailers/:id", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"), getTrailerById);
router.post("/trailers", authorize("ADMIN", "CEO", "OPERATIONS"), auditLog("CREATE", "Trailer"), createTrailer);

// Overview
router.get("/overview", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"), getFleetOverview);

export default router;
