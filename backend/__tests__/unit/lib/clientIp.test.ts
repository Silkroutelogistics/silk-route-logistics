/**
 * Client IP attribution.
 *
 * The defect this closes was live on production: every executed Broker-Carrier
 * Agreement recorded a Cloudflare edge address as the signer's IP —
 * 172.71.254.101, 104.22.64.131, 172.69.17.162 — because `trust proxy` is 1 and
 * the real chain is client → Cloudflare → Render → app.
 *
 * The three real addresses above are used as fixtures deliberately: if the
 * vendored ranges are ever edited wrongly, these stop being recognised as
 * Cloudflare and the first case fails with a value someone can go and check.
 */
import { describe, it, expect } from "vitest";
import { clientIp, clientUserAgent, isCloudflareIp, CLOUDFLARE_IPV4, CLOUDFLARE_IPV6 } from "../../../src/lib/clientIp";

const CLIENT = "203.0.113.77";
const DIRECT = "198.51.100.9";          // TEST-NET-2, not Cloudflare
const EDGE = "172.71.254.101";           // observed on production

function req(ip: string, headers: Record<string, string | string[] | undefined> = {}) {
  return { ip, headers, socket: { remoteAddress: ip } };
}

describe("isCloudflareIp — the vendored ranges", () => {
  it("recognises the three edge addresses production actually recorded", () => {
    for (const ip of ["172.71.254.101", "104.22.64.131", "172.69.17.162"]) {
      expect(isCloudflareIp(ip), `${ip} should be inside a published Cloudflare range`).toBe(true);
    }
  });

  it("recognises the first address of every vendored v4 range", () => {
    for (const cidr of CLOUDFLARE_IPV4) {
      expect(isCloudflareIp(cidr.split("/")[0]), cidr).toBe(true);
    }
  });

  it("recognises the base address of every vendored v6 range", () => {
    for (const cidr of CLOUDFLARE_IPV6) {
      expect(isCloudflareIp(cidr.split("/")[0]), cidr).toBe(true);
    }
  });

  it("does NOT claim ordinary addresses", () => {
    for (const ip of [DIRECT, CLIENT, "127.0.0.1", "10.0.0.4", "8.8.8.8", "2001:db8::1"]) {
      expect(isCloudflareIp(ip), ip).toBe(false);
    }
  });

  it("handles IPv4-mapped IPv6, which Express hands back on dual-stack sockets", () => {
    // Without normalisation every v4 comparison silently fails and a Cloudflare
    // request reads as direct — the failure would look like the old bug.
    expect(isCloudflareIp("::ffff:172.71.254.101")).toBe(true);
    expect(isCloudflareIp("::ffff:198.51.100.9")).toBe(false);
  });

  it("is not fooled by a near-miss outside the range", () => {
    expect(isCloudflareIp("172.63.255.255")).toBe(false); // just below 172.64.0.0/13
    expect(isCloudflareIp("172.72.0.0")).toBe(false);     // just above it
    expect(isCloudflareIp("104.28.0.0")).toBe(false);     // between /13 and /14
  });

  it("refuses junk rather than throwing", () => {
    for (const junk of ["", "not-an-ip", "999.1.1.1", "1.2.3", undefined, null]) {
      expect(isCloudflareIp(junk as any), String(junk)).toBe(false);
    }
  });
});

describe("clientIp — who is actually calling", () => {
  it("a Cloudflare request resolves to cf-connecting-ip", () => {
    // The live case. req.ip is the edge; the client is in the header.
    expect(clientIp(req(EDGE, { "cf-connecting-ip": CLIENT }))).toBe(CLIENT);
  });

  it("a DIRECT request with a SPOOFED cf-connecting-ip resolves to req.ip", () => {
    // The attack the range check exists to defeat: anyone may send the header,
    // so it is believed only when the transport proves Cloudflare set it.
    expect(clientIp(req(DIRECT, { "cf-connecting-ip": "1.2.3.4" }))).toBe(DIRECT);
  });

  it("a spoofed x-forwarded-for changes nothing, in either position", () => {
    expect(clientIp(req(DIRECT, { "x-forwarded-for": "9.9.9.9" }))).toBe(DIRECT);
    expect(clientIp(req(EDGE, { "x-forwarded-for": "9.9.9.9", "cf-connecting-ip": CLIENT }))).toBe(CLIENT);
    // Even a forged header claiming to be the edge cannot promote itself.
    expect(clientIp(req(DIRECT, { "x-forwarded-for": `${CLIENT}, ${EDGE}` }))).toBe(DIRECT);
  });

  it("a Cloudflare request with NO cf-connecting-ip keeps the edge address", () => {
    // Odd, but inventing an address would be worse than recording the truest
    // thing available.
    expect(clientIp(req(EDGE, {}))).toBe(EDGE);
  });

  it("falls back to the socket when Express has not populated req.ip", () => {
    expect(clientIp({ ip: undefined, headers: {}, socket: { remoteAddress: DIRECT } })).toBe(DIRECT);
    expect(clientIp({ ip: undefined, headers: {}, socket: {} })).toBeNull();
  });

  it("normalises an IPv4-mapped result", () => {
    expect(clientIp(req("::ffff:" + DIRECT, {}))).toBe(DIRECT);
    expect(clientIp(req(EDGE, { "cf-connecting-ip": "::ffff:" + CLIENT }))).toBe(CLIENT);
  });

  it("takes the first value when a header arrives repeated", () => {
    expect(clientIp(req(EDGE, { "cf-connecting-ip": [CLIENT, "6.6.6.6"] }))).toBe(CLIENT);
  });
});

describe("clientUserAgent", () => {
  it("returns the header and caps its length", () => {
    expect(clientUserAgent(req(DIRECT, { "user-agent": "Mozilla/5.0" }))).toBe("Mozilla/5.0");
    expect(clientUserAgent(req(DIRECT, { "user-agent": "x".repeat(900) }))!.length).toBe(400);
    expect(clientUserAgent(req(DIRECT, {}))).toBeNull();
  });
});
