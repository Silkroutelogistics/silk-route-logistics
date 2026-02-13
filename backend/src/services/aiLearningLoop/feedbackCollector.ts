import { prisma } from "../../config/database";
import { Prisma } from "@prisma/client";

/** Cast a plain object to Prisma InputJsonValue safely. */
const toJson = (v: Record<string, unknown>): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

/**
 * Feedback Collector — The nervous system of the AI learning loop.
 *
 * Collects signals from platform interactions (load status changes, rate
 * negotiations, carrier responses, payments, AI API calls) and routes them
 * to the appropriate learning services via a durable queue.
 *
 * Design principles:
 *   - Hooks NEVER throw — every public function swallows errors internally
 *     and pushes a compensating event to LearningEventQueue on failure.
 *   - Queue processing is idempotent and retry-safe (max 3 attempts before
 *     dead-lettering).
 *   - Downstream service calls are stubs for now; they log to AILearningLog
 *     and will be replaced with real implementations.
 */

// ─── Cost Estimation Helpers ─────────────────────────────────────────────────

const TOKEN_COST_MAP: Record<string, { input: number; output: number }> = {
  // Cost per 1 000 tokens (USD)
  "gpt-4o":         { input: 0.0025, output: 0.01 },
  "gpt-4o-mini":    { input: 0.00015, output: 0.0006 },
  "gpt-4-turbo":    { input: 0.01, output: 0.03 },
  "gpt-4":          { input: 0.03, output: 0.06 },
  "gpt-3.5-turbo":  { input: 0.0005, output: 0.0015 },
  "claude-3-opus":  { input: 0.015, output: 0.075 },
  "claude-3-sonnet": { input: 0.003, output: 0.015 },
  "claude-3-haiku": { input: 0.00025, output: 0.00125 },
  "claude-3.5-sonnet": { input: 0.003, output: 0.015 },
};

function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = TOKEN_COST_MAP[model];
  if (!costs) {
    // Unknown model — use a conservative mid-range estimate
    return ((inputTokens * 0.005) + (outputTokens * 0.015)) / 1000;
  }
  return ((inputTokens * costs.input) + (outputTokens * costs.output)) / 1000;
}

// ─── Queue Helper ────────────────────────────────────────────────────────────

async function enqueue(
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  await prisma.learningEventQueue.create({
    data: {
      eventType,
      payload: toJson(payload),
      status: "PENDING",
    },
  });
}

// ─── Downstream Stubs (to be replaced with real service calls) ───────────────

async function processLoadDelivered(payload: Record<string, unknown>): Promise<void> {
  // Will be replaced with carrierScoring.recordDelivery() + facilityRating.record()
  await prisma.aILearningLog.create({
    data: {
      serviceName: "carrierScoring",
      eventType: "LOAD_DELIVERED",
      dataJson: toJson(payload),
      outcome: "QUEUED",
    },
  });

  await prisma.aILearningLog.create({
    data: {
      serviceName: "facilityRating",
      eventType: "LOAD_DELIVERED",
      dataJson: toJson(payload),
      outcome: "QUEUED",
    },
  });
}

async function processLoadPickedUp(payload: Record<string, unknown>): Promise<void> {
  // Will be replaced with tracking/checkpoint service call
  await prisma.aILearningLog.create({
    data: {
      serviceName: "tracking",
      eventType: "LOAD_PICKED_UP",
      dataJson: toJson(payload),
      outcome: "QUEUED",
    },
  });
}

async function processLoadCancelled(payload: Record<string, unknown>): Promise<void> {
  // Will be replaced with cancellation analytics service call
  await prisma.aILearningLog.create({
    data: {
      serviceName: "cancellationAnalytics",
      eventType: "LOAD_CANCELLED",
      dataJson: toJson(payload),
      outcome: "QUEUED",
    },
  });
}

async function processRateEvent(payload: Record<string, unknown>): Promise<void> {
  // Will be replaced with actual rateIntelligence.recordRateEvent() call
  await prisma.aILearningLog.create({
    data: {
      serviceName: "rateIntelligence",
      eventType: "RATE_EVENT",
      dataJson: toJson(payload),
      outcome: "QUEUED",
    },
  });
}

async function processCarrierResponse(payload: Record<string, unknown>): Promise<void> {
  // Will be replaced with carrierScoring.recordResponse() + preferenceEngine.learn()
  await prisma.aILearningLog.create({
    data: {
      serviceName: "carrierScoring",
      eventType: "CARRIER_RESPONSE",
      dataJson: toJson(payload),
      outcome: "QUEUED",
    },
  });
}

async function processPaymentEvent(payload: Record<string, unknown>): Promise<void> {
  // Will be replaced with shipperIntelligence.recordPayment() + carrierScoring.recordPayment()
  await prisma.aILearningLog.create({
    data: {
      serviceName: "shipperIntelligence",
      eventType: "PAYMENT_EVENT",
      dataJson: toJson(payload),
      outcome: "QUEUED",
    },
  });

  await prisma.aILearningLog.create({
    data: {
      serviceName: "carrierScoring",
      eventType: "PAYMENT_EVENT",
      dataJson: toJson(payload),
      outcome: "QUEUED",
    },
  });
}

// ─── Event Type → Handler Dispatch ───────────────────────────────────────────

type EventHandler = (payload: Record<string, unknown>) => Promise<void>;

const EVENT_HANDLERS: Record<string, EventHandler> = {
  LOAD_DELIVERED:   processLoadDelivered,
  LOAD_PICKED_UP:   processLoadPickedUp,
  LOAD_CANCELLED:   processLoadCancelled,
  RATE_EVENT:       processRateEvent,
  CARRIER_RESPONSE: processCarrierResponse,
  PAYMENT_EVENT:    processPaymentEvent,
};

// ─── Public Hooks ────────────────────────────────────────────────────────────

/**
 * Called whenever a load transitions to a new status.
 * Routes DELIVERED, PICKED_UP, and CANCELLED events to the appropriate
 * learning services. Other transitions are silently ignored.
 */
export async function onLoadStatusChange(
  loadId: string,
  oldStatus: string,
  newStatus: string,
  timestamp: Date
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      loadId,
      oldStatus,
      newStatus,
      timestamp: timestamp.toISOString(),
    };

    if (newStatus === "DELIVERED") {
      try {
        await processLoadDelivered(payload);
      } catch (err) {
        await enqueue("LOAD_DELIVERED", payload);
      }

      return;
    }

    if (newStatus === "PICKED_UP") {
      try {
        await processLoadPickedUp(payload);
      } catch (err) {
        await enqueue("LOAD_PICKED_UP", payload);
      }

      return;
    }

    if (newStatus === "CANCELLED") {
      try {
        await processLoadCancelled(payload);
      } catch (err) {
        await enqueue("LOAD_CANCELLED", payload);
      }

      return;
    }

    // Other status transitions are not currently tracked
  } catch (error) {
    // Last-resort catch — hook must never crash the parent
    console.error("[feedbackCollector] onLoadStatusChange failed:", error);
  }
}

/**
 * Called when a rate is quoted/negotiated on a lane.
 * Records whether the rate was accepted or rejected so the rate intelligence
 * engine can learn optimal pricing.
 */
export async function onRateEvent(
  originZip: string,
  destZip: string,
  equipmentType: string,
  rate: number,
  outcome: string,
  carrierId?: string,
  shipperId?: string
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      originZip,
      destZip,
      equipmentType,
      rate,
      outcome,
      carrierId: carrierId ?? null,
      shipperId: shipperId ?? null,
      timestamp: new Date().toISOString(),
    };

    await enqueue("RATE_EVENT", payload);
  } catch (error) {
    console.error("[feedbackCollector] onRateEvent failed:", error);
  }
}

/**
 * Called when a carrier responds (or fails to respond) to a load offer.
 * Feeds into carrier scoring and preference-learning models.
 */
export async function onCarrierResponse(
  carrierId: string,
  loadId: string,
  response: string,
  responseTimeMs: number
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      carrierId,
      loadId,
      response,
      responseTimeMs,
      timestamp: new Date().toISOString(),
    };

    await enqueue("CARRIER_RESPONSE", payload);
  } catch (error) {
    console.error("[feedbackCollector] onCarrierResponse failed:", error);
  }
}

/**
 * Called when a payment event occurs between a shipper and carrier.
 * Tracks payment velocity and dispute rates for credit intelligence.
 */
export async function onPaymentEvent(
  shipperId: string,
  carrierId: string,
  amount: number,
  daysToPayment: number,
  disputed: boolean
): Promise<void> {
  try {
    const payload: Record<string, unknown> = {
      shipperId,
      carrierId,
      amount,
      daysToPayment,
      disputed,
      timestamp: new Date().toISOString(),
    };

    await enqueue("PAYMENT_EVENT", payload);
  } catch (error) {
    console.error("[feedbackCollector] onPaymentEvent failed:", error);
  }
}

/**
 * Called after every AI API call (OpenAI, Anthropic, etc.).
 * Records directly to AIApiUsage — no queue needed because this is a
 * simple, fast insert with no downstream fan-out.
 */
export async function onAIQuery(
  provider: string,
  model: string,
  tokens: { input: number; output: number },
  latencyMs: number,
  queryType: string,
  success: boolean,
  errorType?: string,
  userId?: string,
  source?: string
): Promise<void> {
  try {
    const costUsd = estimateCostUsd(model, tokens.input, tokens.output);

    await prisma.aIApiUsage.create({
      data: {
        provider,
        model,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        costUsd,
        latencyMs,
        queryType,
        source: source ?? "api",
        success,
        errorType: errorType ?? null,
        userId: userId ?? null,
      },
    });
  } catch (error) {
    console.error("[feedbackCollector] onAIQuery failed:", error);
  }
}

// ─── Queue Processor ─────────────────────────────────────────────────────────

const MAX_ATTEMPTS = 3;

/**
 * Drains the LearningEventQueue, processing all PENDING items in FIFO order.
 *
 * For each item:
 *   - Increments `attempts`
 *   - Dispatches to the matching event handler
 *   - On success: marks PROCESSED with a timestamp
 *   - On failure (attempts < 3): resets to PENDING with error saved
 *   - On failure (attempts >= 3): marks DEAD_LETTER
 *
 * Returns a summary of processed / failed / dead-lettered counts.
 */
export async function processQueue(): Promise<{
  processed: number;
  failed: number;
  dead: number;
}> {
  const counts = { processed: 0, failed: 0, dead: 0 };

  try {
    const pendingItems = await prisma.learningEventQueue.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
    });

    for (const item of pendingItems) {
      const newAttempts = item.attempts + 1;

      const handler = EVENT_HANDLERS[item.eventType];

      if (!handler) {
        // Unknown event type — dead-letter immediately
        await prisma.learningEventQueue.update({
          where: { id: item.id },
          data: {
            attempts: newAttempts,
            status: "DEAD_LETTER",
            lastError: `Unknown eventType: ${item.eventType}`,
          },
        });
        counts.dead++;
        continue;
      }

      try {
        await handler(item.payload as Record<string, unknown>);

        await prisma.learningEventQueue.update({
          where: { id: item.id },
          data: {
            attempts: newAttempts,
            status: "PROCESSED",
            processedAt: new Date(),
          },
        });
        counts.processed++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        if (newAttempts >= MAX_ATTEMPTS) {
          await prisma.learningEventQueue.update({
            where: { id: item.id },
            data: {
              attempts: newAttempts,
              status: "DEAD_LETTER",
              lastError: errorMessage,
            },
          });
          counts.dead++;
        } else {
          await prisma.learningEventQueue.update({
            where: { id: item.id },
            data: {
              attempts: newAttempts,
              status: "PENDING",
              lastError: errorMessage,
            },
          });
          counts.failed++;
        }
      }
    }
  } catch (error) {
    console.error("[feedbackCollector] processQueue failed:", error);
  }

  return counts;
}
