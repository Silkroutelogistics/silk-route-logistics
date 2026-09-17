/**
 * B3a — the structured LOGIN details, and the two properties that matter:
 * the device hash survives a browser update, and the ip never rides in the
 * JSON beside the column that already holds it.
 *
 * Adversarially verified at authoring: hashing the raw UA instead of the
 * families turns the "same device across a Chrome update" case red; adding
 * an ip key turns the no-ip case red.
 */
import { describe, it, expect } from "vitest";
import { buildLoginDetails, deviceHashFor, uaFamilies, loginGeoFor } from "../../../src/lib/loginDetails";

const CHROME_128_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const CHROME_129_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const CHROME_129_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const EDGE_WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

describe("device hash is a family hash", () => {
  it("survives a browser version bump — the same device is the same device", () => {
    expect(deviceHashFor(CHROME_128_WIN)).toBe(deviceHashFor(CHROME_129_WIN));
  });
  it("differs across OS family with the same browser", () => {
    expect(deviceHashFor(CHROME_129_WIN)).not.toBe(deviceHashFor(CHROME_129_MAC));
  });
  it("does not read Edge as Chrome, or Android as Linux", () => {
    expect(uaFamilies(EDGE_WIN)).toEqual({ browser: "Edge", os: "Windows" });
    expect(uaFamilies(CHROME_ANDROID)).toEqual({ browser: "Chrome", os: "Android" });
    expect(uaFamilies(SAFARI_IOS)).toEqual({ browser: "Safari", os: "iOS" });
  });
  it("is 16 hex chars and never contains the UA itself", () => {
    const h = deviceHashFor(CHROME_129_WIN);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(h).not.toContain("Chrome");
  });
  it("a missing UA is Unknown|Unknown, stable, and documented as unable to fire NEW_DEVICE", () => {
    expect(uaFamilies(null)).toEqual({ browser: "Unknown", os: "Unknown" });
    expect(deviceHashFor(null)).toBe(deviceHashFor(""));
  });
});

describe("the details object", () => {
  it("carries the factors and the channel, and no ip", () => {
    const d = buildLoginDetails({ userAgent: CHROME_129_WIN, otpChannel: "EMAIL+SMS", mfaUsed: true });
    expect(d).toMatchObject({ authMethod: "PASSWORD", otpChannel: "EMAIL+SMS", mfaUsed: true, device: "Chrome on Windows" });
    expect(d.userAgent).toBe(CHROME_129_WIN);
    // audit_logs.ipAddress is the source; a copy here is a second answer to one question.
    expect(Object.keys(d)).not.toContain("ip");
    expect(Object.keys(d)).not.toContain("ipAddress");
  });
  it("mfaUsed is false on the email-OTP-only path", () => {
    expect(buildLoginDetails({ userAgent: null, otpChannel: "EMAIL", mfaUsed: false }).mfaUsed).toBe(false);
  });
  it("caps a pathological UA rather than storing it whole", () => {
    const d = buildLoginDetails({ userAgent: "x".repeat(5000), otpChannel: "EMAIL", mfaUsed: false });
    expect(d.userAgent!.length).toBe(512);
  });
});

describe("both carrier LOGIN rows carry the structured half (wiring, read from source)", () => {
  // Structural, and says so: the carrierAuth router drags Resend and OpenPhone
  // into a mount, which this unit suite does not do. The row shape itself is
  // proven above; this pins that both write sites use it, with the right
  // mfaUsed on each, and that the recorder's predicate names the same override
  // code the /login gate honours.
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const src = fs.readFileSync(path.join(__dirname, "../../../src/routes/carrierAuth.ts"), "utf8");
  // line comments first, then block comments — a line comment can name "/*" as prose
  const stripped = src
    .split(/\r?\n/).map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  function loginRow(note: string): string {
    const at = stripped.indexOf(`changes: "${note}"`);
    expect(at, `LOGIN row with note ${note}`).toBeGreaterThan(0);
    const start = stripped.lastIndexOf("prisma.auditLog.create(", at);
    const end = stripped.indexOf("});", at);
    return stripped.slice(start, end);
  }

  it("the email-OTP login row records details with mfaUsed: false", () => {
    const row = loginRow("Carrier login via OTP");
    expect(row).toContain("details: buildLoginDetails(");
    expect(row).toContain("mfaUsed: false");
    expect(row).toContain("ip: clientIp(req)");
  });

  it("the authenticator login row records details with mfaUsed: true", () => {
    const row = loginRow("Carrier login via OTP + 2FA");
    expect(row).toContain("details: buildLoginDetails(");
    expect(row).toContain("mfaUsed: true");
    expect(row).toContain("ip: clientIp(req)");
  });

  it("the channel recorder honours the same suppression override as the gate", () => {
    const fn = stripped.slice(stripped.indexOf("async function otpChannelFor("), stripped.indexOf("router.post(\"/login\""));
    expect(fn).toContain('checkCode: "UNUSUAL_OTP_SMS_DISABLE"');
    expect(fn).toContain("detectUnusualActivity(");
  });
});


// v3.8.bcl — where the sign-in came from. Real geoip-lite lookups: the database
// ships with the package, so these are offline and deterministic for the
// well-known blocks below.
describe("geo on the row", () => {
  it("a public IP resolves to a country with coordinates, and the ip itself is still not stored", () => {
    const d = buildLoginDetails({ userAgent: CHROME_129_WIN, otpChannel: "EMAIL", mfaUsed: false, ip: "8.8.8.8" });
    expect(d.geo).not.toBeNull();
    expect(d.geo!.country).toBe("US");
    expect(typeof d.geo!.lat).toBe("number");
    expect(typeof d.geo!.lon).toBe("number");
    expect(Object.keys(d)).not.toContain("ip");
    expect(JSON.stringify(d)).not.toContain("8.8.8.8");
  });
  it("a private, loopback, or absent IP is recorded as unknown, never guessed", () => {
    for (const ip of ["10.0.0.1", "192.168.1.9", "127.0.0.1", "::1", null, undefined, ""]) {
      expect(loginGeoFor(ip), String(ip)).toBeNull();
    }
  });
  it("an IPv6-mapped IPv4 resolves like the bare address", () => {
    expect(loginGeoFor("::ffff:8.8.8.8")).toEqual(loginGeoFor("8.8.8.8"));
  });
  it("geo carries only place fields — no ip, no timezone, nothing that is not a coordinate or a name", () => {
    const g = loginGeoFor("8.8.8.8")!;
    expect(Object.keys(g).sort()).toEqual(["city", "country", "lat", "lon", "region"]);
  });
});