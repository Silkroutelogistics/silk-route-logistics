// A rejected code and a failed write are different sentences.
//
// THE BUG THIS EXISTS FOR. submitCode wrapped the verify call and the replayed
// write in ONE try, so any failure in the replay was reported as "We could not
// confirm that code." A live carrier entered a correct code repeatedly and was
// told it was wrong, because X-Step-Up-Token was missing from CORS
// Access-Control-Allow-Headers and the browser blocked the replay before it was
// sent — a network error with no response, which fell through to the generic
// code message. The least accurate sentence available, on the one screen where
// the carrier can do nothing but re-read a code that was already right.
//
// Once the server has ACCEPTED the code, nothing that fails afterwards may
// blame it.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { post } }));

import { useStepUp } from "./useStepUp";

/** The 403 the backend returns when a write needs a fresh code. */
const stepUpRequired = Object.assign(new Error("step up"), {
  response: { status: 403, data: { code: "STEP_UP_REQUIRED" } },
});

/** A blocked CORS preflight: axios throws with NO response at all. */
const blockedByBrowser = Object.assign(new Error("Network Error"), { response: undefined });

async function armPrompt(write: ReturnType<typeof vi.fn>) {
  const hook = renderHook(() => useStepUp("quickpay-election"));
  write.mockRejectedValueOnce(stepUpRequired);
  act(() => {
    void hook.result.current.run(write);
  });
  await waitFor(() => expect(hook.result.current.prompting).toBe(true));
  return hook;
}

beforeEach(() => vi.clearAllMocks());

describe("a failed replay does not blame the code", () => {
  it("THE CASE — the code was accepted and the write was blocked", async () => {
    const write = vi.fn();
    const hook = await armPrompt(write);

    post.mockResolvedValueOnce({ data: { stepUpToken: "tok" } });
    write.mockRejectedValueOnce(blockedByBrowser);

    await act(async () => {
      await hook.result.current.submitCode("715674");
    });

    expect(hook.result.current.error).not.toMatch(/could not confirm that code/i);
    expect(hook.result.current.error).toMatch(/code was accepted/i);
  });

  it("still blames the code when the code is what failed", async () => {
    // The split must not disarm the real case: a wrong code has to read as one.
    const write = vi.fn();
    const hook = await armPrompt(write);

    post.mockRejectedValueOnce({
      response: { status: 401, data: { error: "That code did not match. Check your authenticator app and try the current code." } },
    });

    await act(async () => {
      await hook.result.current.submitCode("000000");
    });

    expect(hook.result.current.error).toMatch(/did not match/i);
    // And the write must never have been attempted with an unverified code.
    expect(write).toHaveBeenCalledTimes(1); // the original probe only
  });

  it("sends the step-up token as a header on the replay", async () => {
    // The header name is half of the CORS contract the backend guard pins.
    const write = vi.fn();
    const hook = await armPrompt(write);

    post.mockResolvedValueOnce({ data: { stepUpToken: "tok-123" } });
    write.mockResolvedValueOnce(undefined);

    await act(async () => {
      await hook.result.current.submitCode("715674");
    });

    expect(write).toHaveBeenLastCalledWith({ "x-step-up-token": "tok-123" });
    expect(hook.result.current.prompting).toBe(false);
  });
});
