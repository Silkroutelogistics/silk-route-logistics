/**
 * What the driver ping page promises a driver about their own location.
 *
 * WHAT WAS WRONG. The page said, flatly, "It does not track you" and "We do not
 * receive your location at any other time." Under the mandatory-ELD arc those
 * become false for any driver whose carrier has connected a telematics feed:
 * SRL receives that truck's position while the load is active, whether or not
 * the driver ever taps the button. A privacy promise that stops being true is
 * worse than no promise, because the driver acted on it.
 *
 * THE NOTICE IS CONDITIONAL IN ITS OWN TEXT rather than varied per carrier. The
 * page deliberately performs no load lookup -- rendering it must not disclose
 * lane detail before the driver acts, nor cost a query per scan of a forwarded
 * link -- so it cannot know whether this carrier has a feed. "If your carrier
 * has connected a telematics or ELD feed" is true for both populations, needs
 * nothing looked up, and is something the driver can go and verify.
 *
 * DRIVEN OVER THE REAL ROUTE, not read out of the source. A guard that greps the
 * template proves a string is written; this proves it is what a driver receives,
 * through the real token check and the real handler.
 *
 * Phase 1 of the mandatory-ELD arc, commit 6 of 7.
 */
import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import request from "supertest";

// driverPingToken reads process.env.JWT_SECRET directly rather than the mocked
// config/env module, so it has to be set here before anything mints.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-for-vitest";

import driverPingRouter from "../../../src/routes/driverPing";
import { mintDriverPingToken } from "../../../src/lib/driverPingToken";
import { DRIVER_SMS_CONSENT_TEXT } from "../../../src/services/driverVerificationService";

const app = express();
app.use(express.json());
app.use("/api/ping", driverPingRouter);

// The route is rate limited to 30 requests per ten minutes per IP. Fetching the
// page once and asserting against the captured body keeps a growing file of copy
// assertions from quietly becoming a 429, which would read as a failure of the
// page rather than of the harness.
let html = "";
let policy = "";
let expiredStatus = 0;
let expiredBody = "";
let expiredPolicy = "";

beforeAll(async () => {
  const token = mintDriverPingToken("load-1", "+15555550100");
  const res = await request(app).get(`/api/ping/${token}`);
  expect(res.status, "a freshly minted token must render the page").toBe(200);
  html = res.text;
  policy = String(res.headers["permissions-policy"] ?? "");

  const gone = await request(app).get("/api/ping/not-a-real-token");
  expiredStatus = gone.status;
  expiredBody = gone.text;
  expiredPolicy = String(gone.headers["permissions-policy"] ?? "");
});

describe("the page no longer promises something the ELD feed contradicts", () => {
  it("does not claim it does not track the driver", () => {
    expect(html).not.toContain("does not track you");
  });

  it("does not claim SRL receives no location at any other time", () => {
    expect(html).not.toContain("at any other time");
    expect(html).not.toMatch(/do not receive your location/i);
  });

  it("discloses the telematics feed, and scopes it to the active load", () => {
    expect(html).toMatch(/telematics or ELD feed/i);
    expect(html).toMatch(/while this load is active/i);
    // The load-bearing half: the feed runs whether or not the driver taps, so a
    // driver who ignores the button is not thereby unobserved.
    expect(html).toMatch(/whether\s+or not you tap/i);
  });

  it("names the carrier as the party who connected it, not SRL as one who took it", () => {
    expect(html).toMatch(/your carrier has connected/i);
  });

  it("tells the driver where to find out which case they are in", () => {
    expect(html).toMatch(/ask your carrier/i);
  });
});

describe("the reassurances that are still true are still made", () => {
  it("the tap itself is one time", () => {
    expect(html).toContain("one time");
    expect(html).toContain("Share my location once");
  });

  it("ignoring it costs the driver nothing", () => {
    expect(html).toMatch(/no\s+effect on your load or your pay/i);
  });

  it("sharing once still changes nothing on the phone", () => {
    expect(html).toMatch(/does not turn anything on or off on your phone/i);
  });
});

describe("the two consent surfaces do not contradict each other", () => {
  // The SMS consent is stored verbatim on the verification row and is what a
  // TCPA dispute reads. It is about MESSAGING -- who is texting, about what, how
  // to stop -- and makes no claim about location retention. If it ever gains
  // one, it would contradict the notice above, on the record.
  it("the stored SMS consent makes no location-retention promise", () => {
    expect(DRIVER_SMS_CONSENT_TEXT).not.toMatch(/at any other time/i);
    expect(DRIVER_SMS_CONSENT_TEXT).not.toMatch(/does not track/i);
    expect(DRIVER_SMS_CONSENT_TEXT).not.toMatch(/only when you tap/i);
  });

  it("it still says what it is for, so this cannot pass on an empty string", () => {
    expect(DRIVER_SMS_CONSENT_TEXT).toMatch(/share your location/i);
    expect(DRIVER_SMS_CONSENT_TEXT).toMatch(/Reply STOP to stop/);
  });
});

describe("the page still behaves as it did", () => {
  it("an invalid token gets the expired page and shares nothing", () => {
    expect(expiredStatus).toBe(410);
    expect(expiredBody).toContain("Nothing was shared.");
  });

  it("the GET still allows geolocation for this page only", () => {
    // The global policy denies geolocation to every document this API serves,
    // which would kill the one button this page exists for.
    expect(policy).toContain("geolocation=(self)");
    expect(policy).toContain("camera=()");
  });

  it("the expired page carries no geolocation grant", () => {
    expect(expiredPolicy).not.toContain("geolocation=(self)");
  });
});

describe("vacuity tripwire", () => {
  it("the page under test is a real page, not an empty body", () => {
    expect(html.length).toBeGreaterThan(500);
    expect(html).toContain("Share your location");
  });
});
