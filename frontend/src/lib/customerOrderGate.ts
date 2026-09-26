/**
 * v3.8.bky — whether an order may be started for a customer, and if not,
 * the sentence that says why. One rule for the two doors that start an order
 * for a named customer: the CRM Orders tab's "New order" button and the Order
 * Builder's ?customerId= deep link.
 *
 * The Order Builder's own customer search already lists APPROVED customers
 * only (context=crm, v3.8.rr). The deep link skipped that search, so a
 * customer still in onboarding could be put on an order from its CRM drawer.
 *
 * Fails CLOSED: a customer whose onboardingStatus is missing is treated as not
 * approved. Both callers read a customer record that carries the field, so a
 * missing value means the data is not what we think, and that is not a reason
 * to let an order through.
 *
 * This is the console's half. The server does not yet refuse a load for an
 * unapproved customer (checkCustomerActive reads isActive only), which is
 * banked as its own decision.
 */
export interface OrderGateCustomer {
  onboardingStatus?: string | null;
  isActive?: boolean | null;
}

export function customerOrderBlock(c: OrderGateCustomer | null | undefined): string | null {
  if (!c) return null;
  if (c.isActive === false) {
    return "This customer is inactive. Reactivate it on its profile before starting an order.";
  }
  if (c.onboardingStatus !== "APPROVED") {
    const status = (c.onboardingStatus ?? "PENDING").replace(/_/g, " ").toLowerCase();
    return `This customer is ${status}, not approved. Approve it on its profile before starting an order; an unapproved customer cannot be tendered freight.`;
  }
  return null;
}
