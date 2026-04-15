import { Router } from "express";
import {
  createCustomer, getCustomers, getCustomerById, getCustomerStats, updateCustomer, deleteCustomer, restoreCustomer,
  getCustomerContacts, addCustomerContact, updateCustomerContact, deleteCustomerContact, updateCustomerCredit,
  bulkCreateCustomers, sendMassEmail, bulkUpdateStage, getCustomerIndustries, getActivityFeed,
} from "../controllers/customerController";
import { authenticate, authorize } from "../middleware/auth";
import { validateBody, validateQuery } from "../middleware/validate";
import { createCustomerSchema, updateCustomerSchema, customerQuerySchema } from "../validators/customer";
import { z } from "zod";

const SALES_ROLES = ["DECISION_MAKER", "CHAMPION", "GATEKEEPER", "TECHNICAL", "BILLING", "OTHER"] as const;

const contactSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  isPrimary: z.boolean().optional(),
  isBilling: z.boolean().optional(),
  receivesTrackingLink: z.boolean().optional(),
  salesRole: z.enum(SALES_ROLES).nullable().optional(),
  introducedVia: z.string().max(120).nullable().optional(),
  doNotContact: z.boolean().optional(),
});

const creditSchema = z.object({
  creditStatus: z.enum(["NOT_CHECKED", "APPROVED", "CONDITIONAL", "DENIED", "PENDING_REVIEW"]).optional(),
  creditLimit: z.number().positive().optional(),
  creditCheckDate: z.string().optional(),
});

const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"));

router.post("/", validateBody(createCustomerSchema), createCustomer);
router.post("/bulk", authorize("ADMIN", "CEO", "BROKER"), bulkCreateCustomers);
router.post("/mass-email", authorize("ADMIN", "CEO", "BROKER"), sendMassEmail);
router.get("/", validateQuery(customerQuerySchema), getCustomers);
router.get("/stats", getCustomerStats);
router.get("/industries", getCustomerIndustries);
router.get("/activity-feed", getActivityFeed);
router.get("/:id", getCustomerById);
router.patch("/bulk-stage", authorize("ADMIN", "CEO", "BROKER"), bulkUpdateStage);
router.patch("/:id", validateBody(updateCustomerSchema), updateCustomer);
router.delete("/:id", authorize("ADMIN", "CEO", "BROKER"), deleteCustomer);
router.put("/:id/restore", authorize("ADMIN", "CEO", "BROKER"), restoreCustomer);

// Customer contacts
router.get("/:id/contacts", getCustomerContacts);
router.post("/:id/contacts", validateBody(contactSchema), addCustomerContact);
router.patch("/:id/contacts/:cid", validateBody(contactSchema.partial()), updateCustomerContact);
router.delete("/:id/contacts/:cid", deleteCustomerContact);

// Customer credit
router.patch("/:id/credit", validateBody(creditSchema), updateCustomerCredit);

export default router;
