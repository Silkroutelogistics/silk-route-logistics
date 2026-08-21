"use client";

// Step-up verification, client side (Arc 11 B2).
//
// The backend answers a sensitive write with 403 STEP_UP_REQUIRED when there is
// no fresh authenticator code behind it. This turns that into a prompt and a
// retry, so a call site opts in by wrapping its request rather than by learning
// the protocol.
//
// SHAPE: run(fn) where fn takes the headers to send. The caller stays in charge
// of its own request — this does not own the axios call, because the call sites
// differ (post, patch, different bodies) and a wrapper that owned them would
// have to grow an option for each.
//
// The token is deliberately NOT cached across calls even though it stays valid
// for its window. Caching it would mean a second sensitive change inside ten
// minutes goes through with no prompt, which is exactly the thing step-up
// exists to prevent — the carrier consented to one change, not to a ten-minute
// window of them. The action binding on the token enforces the same rule
// server-side; this keeps the client honest about it too.

import { useState, useCallback } from "react";
import { api } from "@/lib/api";

type StepUpAction = "quickpay-election" | "insurance-update";

interface PendingRun {
  fn: (headers: Record<string, string>) => Promise<unknown>;
  resolve: (v: boolean) => void;
}

export function useStepUp(action: StepUpAction) {
  const [prompting, setPrompting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRun | null>(null);

  /**
   * Attempt the write. If the backend demands a step-up, open the prompt and
   * resolve once the carrier has satisfied it (or cancelled).
   *
   * Resolves true when the write went through, false when it did not — the
   * caller does its own success handling either way, so a cancelled prompt is
   * not an error to report.
   */
  const run = useCallback(
    (fn: (headers: Record<string, string>) => Promise<unknown>): Promise<boolean> =>
      new Promise((resolve) => {
        fn({})
          .then(() => resolve(true))
          .catch((e: any) => {
            if (e?.response?.status === 403 && e?.response?.data?.code === "STEP_UP_REQUIRED") {
              setError(null);
              setPrompting(true);
              setPending({ fn, resolve });
              return;
            }
            // Any other failure belongs to the caller's own error handling.
            resolve(false);
          });
      }),
    [],
  );

  /** Verify the code, then replay the original request with the token. */
  const submitCode = useCallback(
    async (code: string) => {
      if (!pending) return;
      setVerifying(true);
      setError(null);
      try {
        const { data } = await api.post("/carrier-auth/step-up", { code: code.trim(), action });
        // Header, not body: it keeps the credential out of request payloads that
        // get logged, and out of reach of the Zod body-stripping that would drop
        // an undeclared field on any route whose schema forgot it.
        await pending.fn({ "x-step-up-token": data.stepUpToken });
        setPrompting(false);
        setPending(null);
        pending.resolve(true);
      } catch (e: any) {
        setError(
          e?.response?.data?.error ||
            "We could not confirm that code. Check your authenticator app and try the current one.",
        );
      } finally {
        setVerifying(false);
      }
    },
    [pending, action],
  );

  const cancel = useCallback(() => {
    setPrompting(false);
    setError(null);
    pending?.resolve(false);
    setPending(null);
  }, [pending]);

  return { run, prompting, verifying, error, submitCode, cancel };
}
