import { describe, it, expect } from "vitest";
import { isUrlSafe } from "../../../src/lib/urlSafety";

describe("urlSafety", () => {
  it("rejects invalid URLs", async () => {
    const result = await isUrlSafe("not a url");
    expect(result.safe).toBe(false);
    expect(result.reason).toBe("Invalid URL");
  });

  it("rejects non-HTTP protocols", async () => {
    const result = await isUrlSafe("ftp://example.com/file");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Unsupported protocol");
  });

  it("rejects localhost", async () => {
    const result = await isUrlSafe("http://localhost:3000/hook");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Localhost");
  });

  it("rejects 127.0.0.1", async () => {
    const result = await isUrlSafe("http://127.0.0.1:8080/api");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Private IP");
  });

  it("rejects 10.x.x.x private IPs", async () => {
    const result = await isUrlSafe("http://10.0.0.5/webhook");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Private IP");
  });

  it("rejects 192.168.x.x private IPs", async () => {
    const result = await isUrlSafe("http://192.168.1.1/hook");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Private IP");
  });

  it("rejects 0.0.0.0", async () => {
    const result = await isUrlSafe("http://0.0.0.0:4000/api");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Localhost");
  });

  it("rejects ::1 (IPv6 loopback)", async () => {
    const result = await isUrlSafe("http://[::1]:4000/api");
    expect(result.safe).toBe(false);
    // May be caught as "Localhost" or "Cannot resolve" depending on DNS
    expect(result.reason).toBeTruthy();
  });

  it("allows public IPs", async () => {
    const result = await isUrlSafe("https://8.8.8.8/webhook");
    expect(result.safe).toBe(true);
    expect(result.resolvedIP).toBe("8.8.8.8");
  });

  it("allows public hostnames", async () => {
    const result = await isUrlSafe("https://hooks.slack.com/services/T123/B456");
    expect(result.safe).toBe(true);
  });
});
