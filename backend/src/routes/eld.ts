import { Router } from "express";
import { getHOSData, getDVIRs, getELDOverview, getDriverLocation, getAllLocations } from "../controllers/eldController";
import { authenticate, authorize } from "../middleware/auth";

const router = Router();

router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "DISPATCH", "OPERATIONS", "BROKER"));

router.get("/overview", getELDOverview);
router.get("/hos", getHOSData);
router.get("/dvir", getDVIRs);
router.get("/locations", getAllLocations);
router.get("/locations/:id", getDriverLocation);

export default router;
