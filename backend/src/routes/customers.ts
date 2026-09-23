import { Router } from "express";
import {
  createCustomer, getCustomers, getCustomerById, getCustomerStats, updateCustomer, deleteCustomer, restoreCustomer,
  getCustomerContacts, addCustomerContact, updateCustomerContact, deleteCustomerContact, updateCustomerCredit,
  bulkCreateCustomers, sendMassEmail, bulkUpdateStage, getCustomerIndustries, getActivityFeed,
  markNotInterested, approveCustomer, sendPortalInvite, inactivateCustomer, reactivateCustomer,
} from "../controllers/customerController";
import { authenticate, authorize } from "../middleware/auth";
import { auditLog } from "../middleware/audit";
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
  receivesOperationalUpdates: z.boolean().optional(),
  salesRole: z.enum(SALES_ROLES).nullable().optional(),
  introducedVia: z.string().max(120).nullable().optional(),
  doNotContact: z.boolean().optional(),
});

const creditSchema = z.object({
  creditStatus: z.enum(["NOT_CHECKED", "APPROVED", "CONDITIONAL", "DENIED", "PENDING_REVIEW"]).optional(),
  creditLimit: z.number().positive().optional(),
  creditCheckDate: z.string().optional(),
});

// B6b (lifecycle-gaps, finding #24): every mutation route carries auditLog(),
// so the Audit Log page (audit_logs) shows the act and its actor. This router
// had none. The lifecycle acts (inactivate, reactivate, delete, restore) ALSO
// write the substantive AuditTrail row through lib/lifecycleAudit from the
// controller — reason, fault party, previous/new — which this middleware never
// carries. Two records, two questions: "was it hit" here, "what did it do" there.
const router = Router();
router.use(authenticate);
router.use(authorize("ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"));

router.post("/", validateBody(createCustomerSchema), auditLog("CREATE", "Customer"), createCustomer);
router.post("/bulk", authorize("ADMIN", "CEO", "BROKER"), auditLog("BULK_CREATE", "Customer"), bulkCreateCustomers);
router.post("/mass-email", authorize("ADMIN", "CEO", "BROKER"), auditLog("MASS_EMAIL", "Customer"), sendMassEmail);
router.get("/", validateQuery(customerQuerySchema), getCustomers);
router.get("/stats", getCustomerStats);
router.get("/industries", getCustomerIndustries);
router.get("/activity-feed", getActivityFeed);
router.get("/:id", getCustomerById);
router.patch("/bulk-stage", authorize("ADMIN", "CEO", "BROKER"), auditLog("BULK_STAGE", "Customer"), bulkUpdateStage);
router.post("/:id/mark-not-interested", auditLog("STATUS_CHANGE", "Customer"), markNotInterested);
router.post("/:id/approve", authorize("ADMIN", "CEO"), auditLog("APPROVE", "Customer"), approveCustomer);
router.post("/:id/send-portal-invite", authorize("ADMIN", "CEO"), auditLog("SEND_PORTAL_INVITE", "Customer"), sendPortalInvite);
router.post("/:id/inactivate", authorize("ADMIN", "CEO", "OPERATIONS"), validateBody(z.object({ reason: z.string().min(5).max(500) })), auditLog("INACTIVATE", "Customer"), inactivateCustomer);
router.post("/:id/reactivate", authorize("ADMIN", "CEO", "OPERATIONS"), auditLog("REACTIVATE", "Customer"), reactivateCustomer);
router.patch("/:id", validateBody(updateCustomerSchema), auditLog("UPDATE", "Customer"), updateCustomer);
router.delete("/:id", authorize("ADMIN", "CEO", "BROKER"), auditLog("DELETE", "Customer"), deleteCustomer);
// audit-pass1: MISSING-UI — soft-delete restore has no console affordance.
router.put("/:id/restore", authorize("ADMIN", "CEO", "BROKER"), auditLog("RESTORE", "Customer"), restoreCustomer);

// Customer contacts
router.get("/:id/contacts", getCustomerContacts);
router.post("/:id/contacts", validateBody(contactSchema), auditLog("CREATE", "CustomerContact"), addCustomerContact);
router.patch("/:id/contacts/:cid", validateBody(contactSchema.partial()), auditLog("UPDATE", "CustomerContact"), updateCustomerContact);
// No auditLog here, deliberately: that middleware wraps res.json and this
// handler answers 204 .send(), so the declaration never once fired and read as
// cover it did not provide. deleteCustomerContact writes its own AuditTrail row
// (bhg), which carries the actor and the consent the contact held — strictly
// more than the middleware could. See §13.3 Item 306 for the middleware itself.
router.delete("/:id/contacts/:cid", deleteCustomerContact);

// Customer credit
// audit-pass1: DUPLICATE — frontend uses PUT /accounting/credit/:id. Consolidation candidate, not deleted (both reachable).
router.patch("/:id/credit", validateBody(creditSchema), auditLog("UPDATE_CREDIT", "Customer"), updateCustomerCredit);

export default router;
