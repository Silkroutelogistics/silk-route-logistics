import crypto from "crypto";

/**
 * Verify a webhook signature using HMAC-SHA256.
 * Works with services like Stripe, GitHub, Resend, etc.
 *
 * @param payload   - The raw request body (string or Buffer)
 * @param signature - The signature from the webhook header
 * @param secret    - The webhook signing secret
 * @param encoding  - The encoding of the signature ("hex" or "base64")
 * @returns true if the signature is valid
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  encoding: "hex" | "base64" = "hex"
): boolean {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest(encoding);

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, encoding === "hex" ? "hex" : "base64"),
      Buffer.from(expected, encoding === "hex" ? "hex" : "base64")
    );
  } catch {
    return false;
  }
}

/**
 * Express middleware factory for webhook signature verification.
 * Expects the raw body to be available on req.body (use express.raw() for the route).
 *
 * @param headerName - The header containing the signature (e.g., "x-webhook-signature")
 * @param secret     - The webhook signing secret
 * @param encoding   - Signature encoding ("hex" or "base64")
 */
export function webhookGuard(headerName: string, secret: string, encoding: "hex" | "base64" = "hex") {
  return (req: any, res: any, next: any) => {
    const signature = req.headers[headerName.toLowerCase()];
    if (!signature || typeof signature !== "string") {
      return res.status(401).json({ error: "Missing webhook signature" });
    }

    const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    if (!verifyWebhookSignature(body, signature, secret, encoding)) {
      return res.status(403).json({ error: "Invalid webhook signature" });
    }

    next();
  };
}
