/**
 * v3.8.bky — one rule for starting an order: approved and active.
 */
import { describe, it, expect } from "vitest";
import { customerOrderBlock } from "./customerOrderGate";

describe("customerOrderBlock", () => {
  it("an approved, active customer may start an order", () => {
    expect(customerOrderBlock({ onboardingStatus: "APPROVED", isActive: true })).toBeNull();
    expect(customerOrderBlock({ onboardingStatus: "APPROVED" })).toBeNull();
  });

  it("a customer still in onboarding is refused, and the status is named", () => {
    const msg = customerOrderBlock({ onboardingStatus: "INFO_REQUESTED", isActive: true });
    expect(msg).toMatch(/info requested, not approved/);
  });

  it("fails closed: no onboardingStatus is treated as not approved", () => {
    expect(customerOrderBlock({ isActive: true })).toMatch(/pending, not approved/);
  });

  it("an inactive customer is refused even when approved, and told to reactivate", () => {
    expect(customerOrderBlock({ onboardingStatus: "APPROVED", isActive: false })).toMatch(/inactive.*Reactivate/);
  });

  it("no customer at all is not a refusal — there is nothing to judge yet", () => {
    expect(customerOrderBlock(null)).toBeNull();
  });
});
