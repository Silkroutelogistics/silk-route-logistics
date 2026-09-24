import { describe, it, expect } from "vitest";
import { createRateConfirmationSchema } from "../../../src/validators/rateConfirmation";

/**
 * WHY THIS IS BEHAVIOURAL AND NOT A GREP. `formData` is a plain `z.object()`,
 * which STRIPS undeclared keys — silently, with no error and no type failure.
 * v3.8.bhy taught the RC renderer to read `fd.pickupAppointment` and
 * `fd.deliveryAppointment`, and neither key was declared here, so the read was
 * wired to something that could never arrive from an AE edit. The document
 * still printed the right number, because it falls through to the Load columns
 * — which is exactly what made the gap invisible.
 *
 * So the assertion has to be that the key SURVIVES THE PARSE. A source grep for
 * "pickupAppointment" in the validator would pass with the key declared in a
 * different object, or commented out, or on a schema nothing uses.
 *
 * §13.3 Item 116 is the same defect on the carrier fields; §19 Sub-pattern 5.
 */

function parse(formData: Record<string, unknown>) {
  const out = createRateConfirmationSchema.parse({
    loadId: "load-1",
    formData: { ...formData },
  });
  return out.formData as Record<string, unknown>;
}

describe("RC formData — the per-side appointments survive validation", () => {
  it("keeps pickupAppointment, which the renderer reads as fd.pickupAppointment", () => {
    expect(parse({ pickupAppointment: "PU-4471" }).pickupAppointment).toBe("PU-4471");
  });

  it("keeps deliveryAppointment, which the renderer reads as fd.deliveryAppointment", () => {
    expect(parse({ deliveryAppointment: "15160360" }).deliveryAppointment).toBe("15160360");
  });

  it("keeps both together, which is the case an AE holding two numbers hits", () => {
    const fd = parse({ pickupAppointment: "PU-4471", deliveryAppointment: "15160360" });
    expect(fd.pickupAppointment).toBe("PU-4471");
    expect(fd.deliveryAppointment).toBe("15160360");
  });

  it("still keeps the legacy single key, so an un-updated caller loses nothing", () => {
    expect(parse({ appointmentNumber: "15163586" }).appointmentNumber).toBe("15163586");
  });

  it("proves the schema really does strip, so the assertions above mean something", () => {
    // The tripwire. If this schema ever became .passthrough(), every assertion
    // in this file would pass without the declarations existing at all.
    expect(parse({ notARealRcField: "x" }).notARealRcField).toBeUndefined();
  });
});
