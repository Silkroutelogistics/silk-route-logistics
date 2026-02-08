import { Router } from "express";
import authRoutes from "./auth";
import loadRoutes from "./loads";
import invoiceRoutes from "./invoices";
import documentRoutes from "./documents";
import carrierRoutes from "./carrier";
import tenderRoutes from "./tenders";
import messageRoutes from "./messages";
import notificationRoutes from "./notifications";
import integrationRoutes from "./integrations";

const router = Router();

router.use("/auth", authRoutes);
router.use("/loads", loadRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/documents", documentRoutes);
router.use("/carrier", carrierRoutes);
router.use("/", tenderRoutes);
router.use("/messages", messageRoutes);
router.use("/notifications", notificationRoutes);
router.use("/integrations", integrationRoutes);

export default router;
