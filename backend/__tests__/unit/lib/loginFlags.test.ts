/**
 * B5a (2026-09-17) — unusual-activity flags on a carrier LOGIN row.
 *
 * Each flag is a comparison against the user's own prior LOGIN rows. The
 * cases below pin the three rules, the two-threshold IMPOSSIBLE_TRAVEL
 * amendment (distance AND speed — "300 km in 5 min does not flag"), the
 * first-login and unknown-device exemptions, the never-throws contract, and
 * that both write sites in carrierAuth actually decorate the row.
 *
 * Adversarially verified at authoring: dropping the distance threshold turns
 * the 300-km case red; letting the Unknown device hash count turns the
 * UA-less case red; removing withLoginFlags from the OTP row turns its
 * wiring case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";
import { computeLoginFlags, haversineKm, withLoginFlags, priorLoginsFor, type PriorLogin } from "../../../src/lib/loginFlags";
import { buildLoginDetails, deviceHashFor } from "../../../src/lib/loginDetails";

const mockPrisma = prisma as any;

const CHROME_WIN = deviceHashFor("Mozilla/5.0 (Windows NT 10.0) Chrome/129");
const FIREFOX_MAC = deviceHashFor("Mozilla/5.0 (Macintosh; Intel Mac OS X 14) Firefox/130");
const UNKNOWN = deviceHashFor(null);

// Detroit, Chicago, Grand Rapids, Kalamazoo — real distances a dispatcher knows.
const DETROIT = { lat: 42.3314, lon: -83.0458 };
const CHICAGO = { lat: 41.8781, lon: -87.6298 };
const KALAMAZOO = { lat: 42.2917, lon: -85.5872 };
const LONDON = { lat: 51.5074, lon: -0.1278 };

const geoAt = (p: { lat: number; lon: number }, country = "US") => ({ city: null, region: null, country, lat: p.lat, lon: p.lon });
const T0 = new Date("2026-09-17T12:00:00Z");
const minutes = (m: number) => new Date(T0.getTime() - m * 60_000);
const prior = (over: Partial<PriorLogin> & { at: Date }): PriorLogin => ({ deviceHash: CHROME_WIN, country: "US", lat: null, lon: null, ...over });

describe("distance", () => {
  it("Detroit to Chicago is about 380 km, Detroit to London about 5,700", () => {
    expect(haversineKm(DETROIT.lat, DETROIT.lon, CHICAGO.lat, CHICAGO.lon)).toBeGreaterThan(370);
    expect(haversineKm(DETROIT.lat, DETROIT.lon, CHICAGO.lat, CHICAGO.lon)).toBeLessThan(390);
    expect(haversineKm(DETROIT.lat, DETROIT.lon, LONDON.lat, LONDON.lon)).toBeGreaterThan(5600);
  });
});

describe("first login", () => {
  it("has nothing to compare against and carries no flags", () => {
    expect(computeLoginFlags({ deviceHash: CHROME_WIN, geo: geoAt(DETROIT), at: T0 }, [])).toEqual([]);
  });
});

describe("NEW_DEVICE", () => {
  it("fires when no prior row carries this device family", () => {
    const flags = computeLoginFlags({ deviceHash: FIREFOX_MAC, geo: null, at: T0 }, [prior({ at: minutes(60) })]);
    expect(flags).toEqual(["NEW_DEVICE"]);
  });
  it("does not fire for a device seen anywhere in the window, not only the latest", () => {
    const rows = [prior({ deviceHash: FIREFOX_MAC, at: minutes(60) }), prior({ deviceHash: CHROME_WIN, at: minutes(30 * 24 * 60) })];
    expect(computeLoginFlags({ deviceHash: CHROME_WIN, geo: null, at: T0 }, rows)).toEqual([]);
  });
  it("never fires for a missing user agent — every UA-less client shares that hash", () => {
    expect(computeLoginFlags({ deviceHash: UNKNOWN, geo: null, at: T0 }, [prior({ at: minutes(60) })])).toEqual([]);
  });
});

describe("NEW_COUNTRY", () => {
  it("fires when prior rows name countries and none is this one", () => {
    const flags = computeLoginFlags({ deviceHash: CHROME_WIN, geo: geoAt(LONDON, "GB"), at: T0 }, [prior({ at: minutes(60 * 24 * 3) })]);
    expect(flags).toContain("NEW_COUNTRY");
  });
  it("does not fire when the country was seen, nor when the current geo is unresolved, nor when no prior row has one", () => {
    expect(computeLoginFlags({ deviceHash: CHROME_WIN, geo: geoAt(DETROIT), at: T0 }, [prior({ at: minutes(60) })])).toEqual([]);
    expect(computeLoginFlags({ deviceHash: CHROME_WIN, geo: null, at: T0 }, [prior({ at: minutes(60) })])).toEqual([]);
    expect(computeLoginFlags({ deviceHash: CHROME_WIN, geo: geoAt(LONDON, "GB"), at: T0 }, [prior({ country: null, at: minutes(60) })])).toEqual([]);
  });
});

describe("IMPOSSIBLE_TRAVEL needs BOTH distance and speed", () => {
  it("300 km in 5 minutes does not flag — city-level geo lands on different blocks of one metro", () => {
    // Kalamazoo → Chicago is ~200 km; Detroit → Chicago ~380 km. Both under 500.
    const rows = [prior({ ...DETROIT, at: minutes(5) })];
    expect(computeLoginFlags({ deviceHash: CHROME_WIN, geo: geoAt(CHICAGO), at: T0 }, rows)).toEqual([]);
  });
  it("5,700 km in 5 minutes flags", () => {
    const rows = [prior({ ...DETROIT, at: minutes(5) })];
    expect(computeLoginFlags({ deviceHash: CHROME_WIN, geo: geoAt(LONDON, "US"), at: T0 }, rows)).toEqual(["IMPOSSIBLE_TRAVEL"]);
  });
  it("5,700 km in 8 hours does not flag — that is a flight", () => {
    const rows = [prior({ ...DETROIT, at: minutes(8 * 60) })];
    expect(computeLoginFlags({ deviceHash: CHROME_WIN, geo: geoAt(LONDON, "US"), at: T0 }, rows)).toEqual([]);
  });
  it("compares against the most RECENT prior row with coordinates, skipping unresolved ones", () => {
    const rows = [
      prior({ lat: null, lon: null, at: minutes(1) }),            // newest, no coordinates — skipped
      prior({ ...LONDON, at: minutes(5) }),                        // most recent WITH coordinates
      prior({ ...KALAMAZOO, at: minutes(60 * 24) }),
    ];
    expect(computeLoginFlags({ deviceHash: CHROME_WIN, geo: geoAt(DETROIT), at: T0 }, rows)).toEqual(["IMPOSSIBLE_TRAVEL"]);
  });
  it("does not fire without coordinates on the current row", () => {
    const rows = [prior({ ...LONDON, at: minutes(5) })];
    expect(computeLoginFlags({ deviceHash: CHROME_WIN, geo: { city: null, region: null, country: "US", lat: null, lon: null }, at: T0 }, rows)).toEqual([]);
  });
});

describe("the read and the decoration", () => {
  beforeEach(() => {
    mockPrisma.auditLog.findMany = vi.fn();
  });
  it("priorLoginsFor reads this user's LOGIN rows, newest first, through the indexed shape", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([
      { createdAt: minutes(5), details: { deviceHash: CHROME_WIN, geo: geoAt(DETROIT) } },
      { createdAt: minutes(60), details: null },
    ]);
    const rows = await priorLoginsFor("u-1");
    expect(mockPrisma.auditLog.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: "u-1", action: "LOGIN" },
      orderBy: { createdAt: "desc" },
      select: { details: true, createdAt: true },
    });
    expect(rows[0]).toMatchObject({ deviceHash: CHROME_WIN, country: "US", lat: DETROIT.lat });
    expect(rows[1]).toMatchObject({ deviceHash: null, country: null, lat: null, lon: null });
  });
  it("withLoginFlags decorates the built details and keeps every original field", async () => {
    mockPrisma.auditLog.findMany.mockResolvedValue([{ createdAt: minutes(5), details: { deviceHash: FIREFOX_MAC, geo: geoAt(DETROIT) } }]);
    const base = buildLoginDetails({ userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129", otpChannel: "EMAIL", mfaUsed: false, ip: "10.0.0.1" });
    const d = await withLoginFlags("u-1", base, T0);
    expect(d).toMatchObject({ ...base, flags: ["NEW_DEVICE"] });
  });
  it("never throws — a failed read writes the row without flags", async () => {
    mockPrisma.auditLog.findMany.mockRejectedValue(new Error("db down"));
    const base = buildLoginDetails({ userAgent: null, otpChannel: "EMAIL", mfaUsed: false });
    await expect(withLoginFlags("u-1", base, T0)).resolves.toMatchObject({ ...base, flags: [] });
  });
});

describe("both carrier LOGIN rows are decorated (wiring, read from source)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../../src/routes/carrierAuth.ts"), "utf8");
  const stripped = src.split(/\r?\n/).map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  function loginRow(note: string): string {
    const at = stripped.indexOf(`changes: "${note}"`);
    expect(at, `LOGIN row with note ${note}`).toBeGreaterThan(0);
    return stripped.slice(stripped.lastIndexOf("prisma.auditLog.create(", at), stripped.indexOf("});", at));
  }
  it("the email-OTP row and the authenticator row both pass their details through withLoginFlags for that user", () => {
    for (const note of ["Carrier login via OTP", "Carrier login via OTP + 2FA"]) {
      const row = loginRow(note);
      expect(row, note).toContain("details: await withLoginFlags(user.id, buildLoginDetails(");
    }
  });
});
