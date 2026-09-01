import { Response } from "express";

/**
 * A minimal Express `Response` that records what a handler tried to send
 * instead of sending it.
 *
 * WHY IT EXISTS. Some routes need the behaviour of an existing controller, not
 * its HTTP surface. The magic-link tender route (`routes/tenderAction.ts`)
 * renders an HTML page rather than JSON; the carrier load-board self-accept
 * (`routes/carrierLoads.ts`) has its own response shape and its own follow-up
 * work. Both want everything `acceptTender` does — compliance re-check, atomic
 * transaction, carrier assignment, sibling withdrawal, shipment, auto-RC,
 * notifications, tracking-link fan-out — and none of what it says.
 *
 * The alternative was extracting that controller into a service. That is the
 * tidier shape in the abstract, and it was rejected here: acceptTender reads
 * `req.user`, `req.params` and `req.body` throughout, so the extraction is a
 * large refactor of the single most safety-critical path in the tender
 * lifecycle. Reusing it whole, unchanged, is the lower-risk way to get one
 * accept path rather than three.
 *
 * Extracted to lib in v3.8.axf when the second consumer appeared. It lived in
 * tenderAction.ts alone before that; a copy in the second caller would have
 * been two shims free to drift.
 */
export function makeCaptureRes() {
  // `body` is deliberately `any`: the shim captures whatever a controller chose
  // to send, and callers read shape-specific fields off it (e.g. `.error`).
  // Tightening it to `unknown` only moves casts to every call site without
  // adding safety, since the real contract belongs to the controller, not the shim.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const state: { statusCode: number; body: any } = { statusCode: 200, body: null };
  const shim: Record<string, unknown> = {
    status(code: number) { state.statusCode = code; return shim; },
    json(b: unknown) { state.body = b; return shim; },
    send(b: unknown) { state.body = b; return shim; },
  };
  return { shim: shim as unknown as Response, state };
}
