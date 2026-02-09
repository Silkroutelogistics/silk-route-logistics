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
router.get("/trucks", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"), getTrucks);
router.get("/trucks/stats", getTruckStats);
router.get("/trucks/:id", getTruckById);
router.post("/trucks", authorize("ADMIN", "CEO", "OPERATIONS"), createTruck);
router.patch("/trucks/:id", authorize("ADMIN", "CEO", "OPERATIONS"), updateTruck);
router.delete("/trucks/:id", authorize("ADMIN", "CEO"), deleteTruck);
router.patch("/trucks/:id/assign", authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS"), assignDriverToTruck);

// ─── Trailers ────────────────────────────────────────────
router.get("/trailers", getTrailers);
router.get("/trailers/stats", getTrailerStats);
router.get("/trailers/:id", getTrailerById);
router.post("/trailers", authorize("ADMIN", "CEO", "OPERATIONS"), createTrailer);
router.patch("/trailers/:id", authorize("ADMIN", "CEO", "OPERATIONS"), updateTrailer);
router.delete("/trailers/:id", authorize("ADMIN", "CEO"), deleteTrailer);

// ─── Overview ────────────────────────────────────────────
router.get("/overview", getFleetOverview);

export default router;
