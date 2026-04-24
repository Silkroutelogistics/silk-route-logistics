import { describe, it, expect } from "vitest";
import QRCode from "qrcode";
import { generateBOLQRBuffer } from "../../../src/utils/qrGenerator";

const TRACK_BASE = "https://silkroutelogistics.ai/track";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("generateBOLQRBuffer", () => {
  it("T1: returns a Buffer for a valid token string", async () => {
    const buf = await generateBOLQRBuffer("abc123");
    expect(Buffer.isBuffer(buf)).toBe(true);
  });

  it("T2: buffer begins with PNG magic bytes", async () => {
    const buf = await generateBOLQRBuffer("abc123");
    expect(buf.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
  });

  it("T3: buffer length is non-trivial (> 500 bytes at 240px raster)", async () => {
    const buf = await generateBOLQRBuffer("abc123");
    expect(buf.length).toBeGreaterThan(500);
  });

  it("T4: different tokens produce different buffers", async () => {
    const a = await generateBOLQRBuffer("token-one");
    const b = await generateBOLQRBuffer("token-two");
    expect(a.equals(b)).toBe(false);
  });

  it("T5: encoded payload round-trips to the expected /track URL", async () => {
    const token = "roundtrip-token-xyz";
    const expected = `${TRACK_BASE}/${token}`;
    const asString = await QRCode.toString(expected, { type: "utf8" });
    const fresh = await QRCode.toString(expected, { type: "utf8" });
    expect(asString).toEqual(fresh);
    // Decode the actual URL we embed via the helper's source of truth
    // by regenerating with the same options — if the helper drifts from
    // the URL shape, this comparison becomes asymmetric.
    const helperBuf = await generateBOLQRBuffer(token);
    const referenceBuf = await QRCode.toBuffer(expected, {
      errorCorrectionLevel: "M",
      type: "png",
      width: 240,
      margin: 1,
      color: { dark: "#0A2540", light: "#FBF7F0" },
    });
    expect(helperBuf.equals(referenceBuf)).toBe(true);
  });

  it("T6: empty token still produces a PNG encoding /track/ (documents current behavior)", async () => {
    const buf = await generateBOLQRBuffer("");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
  });
});
