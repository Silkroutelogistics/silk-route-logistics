import { Router } from "express";
import {
  getTrucks, getTruckById, createTruck, updateTruck, deleteTruck, assignDriverToTruck, getTruckStats,
  getTrailers, getTrailerById, createTrailer, updateTrailer, deleteTrailer, getTrailerStats,
  getFleetOverview,
} from "../controllers/fleetController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";

const router = Router();

router.use(authenticate);

// Trucks
router.get("/trucks", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"), getTrucks);
router.get("/trucks/stats", getTruckStats);
router.get("/trucks/:id", getTruckById);
router.post("/trucks", authorize("ADMIN", "CEO", "OPERATIONS"), auditLog("CREATE", "Truck"), createTruck);
router.patch("/trucks/:id", authorize("ADMIN", "CEO", "OPERATIONS"), auditLog("UPDATE", "Truck"), updateTruck);
router.delete("/trucks/:id", authorize("ADMIN", "CEO"), auditLog("DELETE", "Truck"), deleteTruck);
router.patch("/trucks/:id/assign", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS"), auditLog("ASSIGN_DRIVER", "Truck"), assignDriverToTruck);

// Trailers
router.get("/trailers", getTrailers);
router.get("/trailers/stats", getTrailerStats);
router.get("/trailers/:id", getTrailerById);
router.post("/trailers", authorize("ADMIN", "CEO", "OPERATIONS"), auditLog("CREATE", "Trailer"), createTrailer);
router.patch("/trailers/:id", authorize("ADMIN", "CEO", "OPERATIONS"), auditLog("UPDATE", "Trailer"), updateTrailer);
router.delete("/trailers/:id", authorize("ADMIN", "CEO"), auditLog("DELETE", "Trailer"), deleteTrailer);

// Overview
router.get("/overview", getFleetOverview);

export default router;
