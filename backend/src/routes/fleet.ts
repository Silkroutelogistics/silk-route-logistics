import { Router } from "express";
import {
  getTrucks,
  getTruckById,
  createTruck,
  updateTruck,
  deleteTruck,
  assignDriverToTruck,
  getTruckStats,
  getTrailers,
  getTrailerById,
  createTrailer,
  updateTrailer,
  deleteTrailer,
  getTrailerStats,
  getFleetOverview,
} from "../controllers/fleetController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);

// ─── Trucks ──────────────────────────────────────────────
router.get("/trucks", authorize("ADMIN", "DISPATCH", "OPERATIONS", "BROKER"), getTrucks);
router.get("/trucks/stats", getTruckStats);
router.get("/trucks/:id", getTruckById);
router.post("/trucks", authorize("ADMIN", "OPERATIONS"), createTruck);
router.patch("/trucks/:id", authorize("ADMIN", "OPERATIONS"), updateTruck);
router.delete("/trucks/:id", authorize("ADMIN"), deleteTruck);
router.patch("/trucks/:id/assign", authorize("ADMIN", "DISPATCH", "OPERATIONS"), assignDriverToTruck);

// ─── Trailers ────────────────────────────────────────────
router.get("/trailers", getTrailers);
router.get("/trailers/stats", getTrailerStats);
router.get("/trailers/:id", getTrailerById);
router.post("/trailers", authorize("ADMIN", "OPERATIONS"), createTrailer);
router.patch("/trailers/:id", authorize("ADMIN", "OPERATIONS"), updateTrailer);
router.delete("/trailers/:id", authorize("ADMIN"), deleteTrailer);

// ─── Overview ────────────────────────────────────────────
router.get("/overview", getFleetOverview);

export default router;
