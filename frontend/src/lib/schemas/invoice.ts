import { z } from "zod";

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1, "Description is required"),
  type: z.string().min(1, "Type is required"),
  quantity: z.coerce.number().positive("Quantity must be positive"),
  rate: z.coerce.number().nonnegative("Rate cannot be negative"),
  amount: z.coerce.number().nonnegative("Amount cannot be negative"),
});

export const createInvoiceSchema = z.object({
  loadId: z.string().min(1, "Load is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  lineItems: z.array(invoiceLineItemSchema).optional(),
});

export type InvoiceLineItem = z.infer<typeof invoiceLineItemSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
