/**
 * Capability probes for /api/health — does it WORK, not is it CONFIGURED.
 *
 * v3.8.awg. `/api/health` reported `parser: { configured: true }` for the entire
 * time the COI parser and Marco Polo were dead on a retired model, because that
 * field asked whether GEMINI_API_KEY was SET. The credential was set. The model
 * was gone. A field named for a capability was reporting a credential, and it
 * was green throughout a public outage.
 *
 * §19: **configured is not functional.** A health field must observe the
 * capability, not the credential. Anything that answers by reading an env var is
 * reporting its own configuration back to itself.
 *
 * THREE CONSTRAINTS SHAPE THIS:
 *
 * 1. Health must stay FAST. A live model call per request would put a network
 *    round-trip on the endpoint monitors poll most often.
 * 2. Health must NEVER THROW. The endpoint that reports an outage has to survive
 *    one. Every probe is wrapped; a probe that fails reports `functional: false`
 *    with the reason, and never propagates.
 * 3. Health must not LIE while it waits. Before the first check completes the
 *    answer is `null` — unknown — not `true`. Optimistic defaults on a health
 *    field are how this class happened in the first place.
 *
 * So: serve from cache, refresh in the background when stale. The first call
 * after boot reports unknown and triggers a check; a few seconds later it is
 * real, and it stays real within the TTL.
 */
import { log } from "./logger";

export interface CapabilityResult {
  configured: boolean;
  /** null = not yet checked. Never optimistically true. */
  functional: boolean | null;
  checkedAt: string | null;
  detail?: string;
}

interface CacheEntry extends CapabilityResult {
  expiresAt: number;
  inFlight: boolean;
}

/** Long enough that health stays cheap, short enough that an outage surfaces. */
const TTL_MS = 5 * 60_000;

const cache = new Map<string, CacheEntry>();

/**
 * Serve the cached verdict; refresh in the background when stale.
 *
 * Deliberately NOT awaited by the caller. Health returns what it knows now, and
 * the check that will answer the next call runs behind it.
 */
export function cachedCapability(
  key: string,
  configured: boolean,
  check: () => Promise<{ ok: boolean; detail?: string }>,
): CapabilityResult {
  const now = Date.now();
  const hit = cache.get(key);

  if (!configured) {
    // Nothing to probe. Report it as unconfigured rather than "not working" —
    // an unset key is a deployment state, not a failure.
    return { configured: false, functional: null, checkedAt: null, detail: "not configured" };
  }

  const stale = !hit || hit.expiresAt <= now;
  if (stale && !hit?.inFlight) {
    const entry: CacheEntry = hit
      ? { ...hit, inFlight: true }
      : { configured, functional: null, checkedAt: null, expiresAt: 0, inFlight: true };
    cache.set(key, entry);

    void (async () => {
      try {
        const r = await check();
        cache.set(key, {
          configured: true,
          functional: r.ok,
          checkedAt: new Date().toISOString(),
          detail: r.detail,
          expiresAt: Date.now() + TTL_MS,
          inFlight: false,
        });
        if (!r.ok) log.error({ capability: key, detail: r.detail }, "[Health] capability check FAILED");
      } catch (err) {
        // A probe that throws is a probe that answers false, not one that takes
        // health down with it.
        cache.set(key, {
          configured: true,
          functional: false,
          checkedAt: new Date().toISOString(),
          detail: err instanceof Error ? err.message.slice(0, 160) : "probe threw",
          expiresAt: Date.now() + TTL_MS,
          inFlight: false,
        });
        log.error({ capability: key, err }, "[Health] capability probe threw");
      }
    })();
  }

  const cur = cache.get(key);
  return {
    configured: true,
    functional: cur?.functional ?? null,
    checkedAt: cur?.checkedAt ?? null,
    ...(cur?.detail ? { detail: cur.detail } : {}),
  };
}

/** Test seam — the cache is process-global and would leak between cases. */
export function __resetCapabilityCache(): void {
  cache.clear();
}
