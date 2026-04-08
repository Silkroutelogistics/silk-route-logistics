/**
 * Hook Initializer — registers all built-in hooks.
 * Import once at server startup: import "./lib/hooksInit";
 */

import { hooks } from "./hooks";
import { prisma } from "../config/database";

// ─── Audit Log: log every state change ─────────────────

hooks.on("PostLoadStateChange", async (ctx) => {
  await prisma.loadTrackingEvent.create({
    data: {
      loadId: ctx.loadId,
      eventType: "STATUS_CHANGE",
      statusFrom: ctx.from,
      statusTo: ctx.to,
      locationSource: "AE_MANUAL",
    },
  });
});

// ─── Audit Log: log carrier assignments ─────────────────

hooks.on("PostCarrierAssignment", async (ctx) => {
  await prisma.systemLog.create({
    data: {
      logType: "STATUS_CHANGE",
      severity: "INFO",
      source: "hooks/PostCarrierAssignment",
      message: `Carrier ${ctx.carrierId} assigned to load ${ctx.loadId} by ${ctx.actor}`,
      details: { loadId: ctx.loadId, carrierId: ctx.carrierId, rate: ctx.rate },
      userId: ctx.actor,
    },
  });
});

// ─── Audit Log: log tender accepts ──────────────────────

hooks.on("PostTenderAccept", async (ctx) => {
  await prisma.systemLog.create({
    data: {
      logType: "STATUS_CHANGE",
      severity: "INFO",
      source: "hooks/PostTenderAccept",
      message: `Tender ${ctx.tenderId} accepted for load ${ctx.loadId}`,
      details: { tenderId: ctx.tenderId, loadId: ctx.loadId, carrierId: ctx.carrierId, rate: ctx.rate },
      userId: ctx.actor,
    },
  });
});

console.log("[Hooks] 3 built-in hooks registered (PostLoadStateChange, PostCarrierAssignment, PostTenderAccept)");
