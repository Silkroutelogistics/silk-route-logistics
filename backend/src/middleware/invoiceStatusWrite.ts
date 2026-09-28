import { Request, Response, NextFunction } from "express";

/**
 * v3.8.bno — ruling 2026-09-27, 6: an invoice's status is not writable through
 * any edit or request-body path. It moves only when the invoice is sent, paid,
 * voided, or passes its due day (services/invoiceAging), each from its own act.
 *
 * Mounted ahead of the invoice routes on both routers that carry them. A write
 * whose body names `status` is refused with 400 rather than silently ignored,
 * so a caller that thinks it moved an invoice is told it did not. A `status`
 * query parameter on a read is a filter and is left alone.
 */
export function rejectInvoiceStatusWrite(req: Request, res: Response, next: NextFunction): void {
  const body = req.body;
  if (req.method !== "GET" && body && typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "status")) {
    res.status(400).json({
      error: "An invoice's status cannot be set directly. It moves when the invoice is sent, paid, voided, or passes its due date.",
      code: "INVOICE_STATUS_NOT_WRITABLE",
    });
    return;
  }
  next();
}
