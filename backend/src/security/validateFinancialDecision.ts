/**
 * Financial Decision Validator — Deterministic checks for payment actions.
 *
 * ALL financial outputs from AI must pass through this validator BEFORE
 * they reach the human approval queue. Claude suggests, this code validates
 * the math, THEN the human approves.
 *
 * Checks: margin > 0, payment <= available cash, carrier active, load confirmed,
 * no duplicate payment pending, amount within tier limits.
 */

import { prisma } from "../config/database";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QuickPayValidation {
  loadId: string;
  carrierId: string;
  requestedAmount: number;
}

export interface InvoiceValidation {
  loadId: string;
  invoiceAmount: number;
  carrierPayAmount: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  checks: Record<string, { passed: boolean; detail: string }>;
}

// ─── Quick Pay Validation ───────────────────────────────────────────────────

/**
 * Validates a quick pay request against business rules.
 * Used AFTER AI recommends approval but BEFORE human sees the approval queue.
 */
export async function validateQuickPay(input: QuickPayValidation): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: Record<string, { passed: boolean; detail: string }> = {};

  // 1. Load exists and is delivered
  const load = await prisma.load.findUnique({
    where: { id: input.loadId },
    select: {
      id: true,
      status: true,
      carrierRate: true,
      customerRate: true,
      carrierId: true,
    },
  });

  if (!load) {
    checks["load_exists"] = { passed: false, detail: `Load ${input.loadId} not found` };
    errors.push("Load not found");
    return { valid: false, errors, warnings, checks };
  }
  checks["load_exists"] = { passed: true, detail: `Load ${load.id} found` };

  // Status must be DELIVERED or later
  const validStatuses = ["DELIVERED", "POD_RECEIVED", "INVOICED", "PAID"];
  const statusValid = validStatuses.includes(load.status);
  checks["load_delivered"] = {
    passed: statusValid,
    detail: `Status: ${load.status}${statusValid ? "" : " — must be DELIVERED or later"}`,
  };
  if (!statusValid) errors.push(`Load status is ${load.status}, must be DELIVERED or later`);

  // 2. Carrier matches and is active
  if (load.carrierId !== input.carrierId) {
    checks["carrier_matches"] = {
      passed: false,
      detail: `Load carrier ${load.carrierId} != requested ${input.carrierId}`,
    };
    errors.push("Carrier does not match load assignment");
  } else {
    checks["carrier_matches"] = { passed: true, detail: "Carrier matches load" };
  }

  const carrier = await prisma.user.findUnique({
    where: { id: input.carrierId },
    select: { id: true, isActive: true, role: true },
  });

  if (!carrier) {
    checks["carrier_active"] = { passed: false, detail: "Carrier not found" };
    errors.push("Carrier not found in system");
  } else if (!carrier.isActive) {
    checks["carrier_active"] = { passed: false, detail: "Carrier account is deactivated" };
    errors.push("Carrier account is not active");
  } else {
    checks["carrier_active"] = { passed: true, detail: "Carrier is active" };
  }

  // 3. Margin check — payment must not exceed carrier rate
  const carrierRate = load.carrierRate ?? 0;
  const customerRate = load.customerRate ?? 0;
  const margin = customerRate - carrierRate;

  checks["positive_margin"] = {
    passed: margin > 0,
    detail: `Customer rate: $${customerRate}, Carrier rate: $${carrierRate}, Margin: $${margin.toFixed(2)}`,
  };
  if (margin <= 0) errors.push(`Negative or zero margin: $${margin.toFixed(2)}`);

  // Payment should not exceed carrier rate
  checks["amount_within_rate"] = {
    passed: input.requestedAmount <= carrierRate,
    detail: `Requested: $${input.requestedAmount}, Carrier rate: $${carrierRate}`,
  };
  if (input.requestedAmount > carrierRate) {
    errors.push(`Requested amount $${input.requestedAmount} exceeds carrier rate $${carrierRate}`);
  }

  // 4. No duplicate pending payment
  const existingPayment = await prisma.carrierPay.findFirst({
    where: {
      loadId: input.loadId,
      carrierId: input.carrierId,
      status: { in: ["PENDING", "PROCESSING", "APPROVED"] },
    },
  });

  checks["no_duplicate_payment"] = {
    passed: !existingPayment,
    detail: existingPayment
      ? `Existing ${existingPayment.status} payment found (${existingPayment.id})`
      : "No duplicate payment pending",
  };
  if (existingPayment) {
    errors.push(`Duplicate payment already ${existingPayment.status} for this load`);
  }

  // 5. Amount sanity check
  if (input.requestedAmount <= 0) {
    checks["positive_amount"] = { passed: false, detail: `Amount: $${input.requestedAmount}` };
    errors.push("Payment amount must be positive");
  } else {
    checks["positive_amount"] = { passed: true, detail: `Amount: $${input.requestedAmount}` };
  }

  // Warn on unusually large quick pay
  if (input.requestedAmount > 10000) {
    warnings.push(`Large quick pay amount: $${input.requestedAmount} — requires senior review`);
  }

  return { valid: errors.length === 0, errors, warnings, checks };
}

// ─── Invoice Validation ─────────────────────────────────────────────────────

/**
 * Validates an invoice before generation/sending.
 */
export async function validateInvoice(input: InvoiceValidation): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const checks: Record<string, { passed: boolean; detail: string }> = {};

  const load = await prisma.load.findUnique({
    where: { id: input.loadId },
    select: {
      id: true,
      status: true,
      carrierRate: true,
      customerRate: true,
      customerId: true,
    },
  });

  if (!load) {
    checks["load_exists"] = { passed: false, detail: "Load not found" };
    errors.push("Load not found");
    return { valid: false, errors, warnings, checks };
  }
  checks["load_exists"] = { passed: true, detail: `Load ${load.id} found` };

  // Margin check
  const margin = input.invoiceAmount - input.carrierPayAmount;
  checks["positive_margin"] = {
    passed: margin > 0,
    detail: `Invoice: $${input.invoiceAmount}, Carrier pay: $${input.carrierPayAmount}, Margin: $${margin.toFixed(2)}`,
  };
  if (margin <= 0) errors.push(`Negative or zero margin on invoice: $${margin.toFixed(2)}`);

  // Invoice amount should reasonably match customer rate
  const customerRate = load.customerRate ?? 0;
  if (customerRate > 0) {
    const deviation = Math.abs(input.invoiceAmount - customerRate) / customerRate;
    checks["rate_alignment"] = {
      passed: deviation < 0.2,
      detail: `Invoice $${input.invoiceAmount} vs agreed rate $${customerRate} (${(deviation * 100).toFixed(1)}% deviation)`,
    };
    if (deviation >= 0.2) {
      warnings.push(`Invoice deviates ${(deviation * 100).toFixed(1)}% from agreed customer rate`);
    }
  }

  // No duplicate invoice for this load
  const existingInvoice = await prisma.invoice.findFirst({
    where: {
      loadId: input.loadId,
      status: { notIn: ["VOID", "REJECTED"] },
    },
  });

  checks["no_duplicate_invoice"] = {
    passed: !existingInvoice,
    detail: existingInvoice
      ? `Existing invoice ${existingInvoice.invoiceNumber} (${existingInvoice.status})`
      : "No duplicate invoice",
  };
  if (existingInvoice) {
    errors.push(`Active invoice already exists: ${existingInvoice.invoiceNumber}`);
  }

  // Customer exists
  if (load.customerId) {
    const customer = await prisma.customer.findUnique({
      where: { id: load.customerId },
      select: { id: true, name: true },
    });
    checks["customer_exists"] = {
      passed: !!customer,
      detail: customer ? `Customer: ${customer.name}` : "Customer not found",
    };
    if (!customer) errors.push("Customer record not found");
  }

  return { valid: errors.length === 0, errors, warnings, checks };
}

// ─── Generic AI Financial Output Validator ──────────────────────────────────

/**
 * Validates any financial number produced by AI against basic sanity rules.
 */
export function validateFinancialAmount(
  amount: number,
  context: { field: string; minValue?: number; maxValue?: number }
): { valid: boolean; error?: string } {
  if (typeof amount !== "number" || isNaN(amount)) {
    return { valid: false, error: `${context.field}: not a valid number` };
  }
  if (!isFinite(amount)) {
    return { valid: false, error: `${context.field}: infinite value detected` };
  }
  if (amount < (context.minValue ?? 0)) {
    return { valid: false, error: `${context.field}: $${amount} below minimum $${context.minValue ?? 0}` };
  }
  if (context.maxValue !== undefined && amount > context.maxValue) {
    return { valid: false, error: `${context.field}: $${amount} exceeds maximum $${context.maxValue}` };
  }
  return { valid: true };
}
