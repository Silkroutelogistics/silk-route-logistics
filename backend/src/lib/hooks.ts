/**
 * Hook System — Pre/Post interceptors for state transitions.
 *
 * Inspired by claude-brain's HookSet pattern. Centralizes compliance gates,
 * audit logging, and side-effect triggers instead of scattering them across controllers.
 *
 * Usage:
 *   await hooks.run("PreLoadStateChange", { loadId, from: "POSTED", to: "TENDERED", actor: userId });
 *   // ...do the state change...
 *   await hooks.run("PostLoadStateChange", { loadId, from: "POSTED", to: "TENDERED", actor: userId });
 */

export type HookContext = Record<string, any>;

export type HookHandler = (ctx: HookContext) => Promise<void | { blocked: true; reason: string }>;

type HookEvent =
  | "PreLoadStateChange"
  | "PostLoadStateChange"
  | "PreCarrierAssignment"
  | "PostCarrierAssignment"
  | "PreTenderCreate"
  | "PostTenderAccept"
  | "PostTenderDecline"
  | "PreInvoiceSubmit"
  | "PostInvoiceApprove";

class HookRegistry {
  private handlers = new Map<HookEvent, HookHandler[]>();

  /** Register a handler for an event */
  on(event: HookEvent, handler: HookHandler) {
    const list = this.handlers.get(event) || [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  /**
   * Run all handlers for an event in registration order.
   * If any Pre* handler returns { blocked: true }, execution stops and the reason is returned.
   */
  async run(event: HookEvent, ctx: HookContext): Promise<{ blocked: boolean; reason?: string }> {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return { blocked: false };

    for (const handler of list) {
      try {
        const result = await handler(ctx);
        if (result && result.blocked) {
          // Hook blocked — logged by caller
          return { blocked: true, reason: result.reason };
        }
      } catch (err) {
        // Hook error — Pre hooks fail-safe, Post hooks continue
        // Pre hooks: fail-safe blocks on error; Post hooks: log and continue
        if (event.startsWith("Pre")) {
          return { blocked: true, reason: "Internal hook error" };
        }
      }
    }

    return { blocked: false };
  }
}

export const hooks = new HookRegistry();
