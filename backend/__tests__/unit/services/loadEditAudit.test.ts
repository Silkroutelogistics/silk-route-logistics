import { describe, it, expect } from "vitest";
import { diffLoadChanges } from "../../../src/services/loadAuditService";

/**
 * An edit that leaves no audit row is an edit nobody can account for later.
 *
 * `diffLoadChanges` decides what gets recorded, and it only considers fields on
 * its TRACKED_FIELDS list. Dock contacts were not on it — so the change most
 * likely to be argued about afterwards ("who was supposed to be at the dock, and
 * when did that stop being true") was the change that recorded nothing. The
 * per-side appointment columns were not on it either, because they did not exist.
 *
 * These assert the DIFF, not the controller, because the diff is what the audit
 * writer is handed. A test that drove the controller and asserted a 200 would
 * have passed throughout the period the audit was silent.
 */
describe("diffLoadChanges — a window edit is recorded", () => {
  it("records a pickup window change", () => {
    const changes = diffLoadChanges(
      { pickupTimeStart: "09:00", pickupTimeEnd: "10:00" } as any,
      { pickupTimeStart: "11:00", pickupTimeEnd: "12:00" },
    );
    const fields = changes.map((c) => c.field);
    expect(fields).toContain("pickupTimeStart");
    expect(fields).toContain("pickupTimeEnd");
    const start = changes.find((c) => c.field === "pickupTimeStart")!;
    expect(start.oldValue).toBe("09:00");
    expect(start.newValue).toBe("11:00");
  });

  it("records a delivery window change", () => {
    const changes = diffLoadChanges(
      { deliveryTimeStart: "14:00", deliveryTimeEnd: "15:00" } as any,
      { deliveryTimeStart: "15:30", deliveryTimeEnd: "16:30" },
    );
    expect(changes.map((c) => c.field)).toEqual(
      expect.arrayContaining(["deliveryTimeStart", "deliveryTimeEnd"]),
    );
  });

  it("records a window being set for the first time on a load that had none", () => {
    // SRL-121497's shape: both ends NULL because the create path dropped them.
    const changes = diffLoadChanges(
      { pickupTimeStart: null, pickupTimeEnd: null } as any,
      { pickupTimeStart: "09:00", pickupTimeEnd: "10:00" },
    );
    expect(changes.map((c) => c.field)).toContain("pickupTimeStart");
  });
});

describe("diffLoadChanges — dock contacts and per-side appointments are recorded", () => {
  it("records all four dock-contact columns", () => {
    const changes = diffLoadChanges(
      {
        originContactName: null, originContactPhone: null,
        destContactName: null, destContactPhone: null,
      } as any,
      {
        originContactName: "Carlos", originContactPhone: "9724903300",
        destContactName: "Brynn", destContactPhone: "502-219-3219",
      },
    );
    expect(changes.map((c) => c.field)).toEqual(
      expect.arrayContaining([
        "originContactName", "originContactPhone", "destContactName", "destContactPhone",
      ]),
    );
  });

  it("records both per-side appointments separately", () => {
    const changes = diffLoadChanges(
      { pickupAppointment: null, deliveryAppointment: "15160360" } as any,
      { pickupAppointment: "PU-4471", deliveryAppointment: "15160361" },
    );
    const byField = Object.fromEntries(changes.map((c) => [c.field, c]));
    expect(byField.pickupAppointment.newValue).toBe("PU-4471");
    expect(byField.deliveryAppointment.oldValue).toBe("15160360");
    expect(byField.deliveryAppointment.newValue).toBe("15160361");
  });

  it("records pallets, so the column stops being invisible once it is wired", () => {
    const changes = diffLoadChanges({ pallets: null } as any, { pallets: 12 });
    expect(changes.map((c) => c.field)).toContain("pallets");
  });

  it("records nothing when nothing changed", () => {
    const changes = diffLoadChanges(
      { pickupTimeStart: "09:00", originContactName: "Carlos" } as any,
      { pickupTimeStart: "09:00", originContactName: "Carlos" },
    );
    expect(changes).toHaveLength(0);
  });
});
