/**
 * B1c-2 (2026-09-17) — the AE console can reset a carrier's authenticator,
 * and it spends the admin's step-up at the AE door, not the carrier's.
 *
 * The endpoint (bcj) demands a fresh step-up minted from the ADMIN's own
 * authenticator. The hook that turns 403 STEP_UP_REQUIRED into a prompt was
 * hardcoded to /carrier-auth/step-up, which refuses anyone who is not a
 * CARRIER — so an admin using it would have been told their code was wrong
 * forever. The load-bearing assertion here is which URL the code goes to.
 *
 * Adversarially verified at authoring: pointing the hook back at the carrier
 * door turns the step-up case red; dropping the isAdmin gate turns the
 * non-admin case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.setConfig({ testTimeout: 30_000 });

const { post, signals } = vi.hoisted(() => ({ post: vi.fn(), signals: {
  geo: {
    registrationCountry: "US",
    emailVerifiedAt: null,
    emailVerifiedFromIp: null,
    emailVerifiedFromCountry: null,
    lastLoginAt: null,
    lastLoginIp: null,
    lastLoginCountry: null,
    geoMismatch: false,
    rawMismatch: false,
    overriddenAt: null,
    overrideNote: null,
  },
  authEvents: [],
  sessions: [],
  events: [],
  chameleonMatches: [],
  unusualOtpSmsOverride: null,
} }));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: signals, isLoading: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post } }));

import { SecuritySignalsCard } from "./SecuritySignalsCard";

const REASON = "Carrier lost the phone; identity confirmed by phone call";
const stepUpRefusal = { response: { status: 403, data: { code: "STEP_UP_REQUIRED", error: "Enter the code from your authenticator app to confirm this change." } } };

async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Reset authenticator" }));
  await user.type(screen.getByPlaceholderText(/carrier lost the phone/i), REASON);
  return screen.getByRole("button", { name: "Reset and require re-enrolment" });
}

beforeEach(() => {
  post.mockReset();
});

describe("who sees it", () => {
  it("a non-admin gets no reset control at all", () => {
    render(<SecuritySignalsCard carrierId="cp-1" isAdmin={false} />);
    expect(screen.queryByTestId("mfa-reset")).toBeNull();
    expect(screen.queryByRole("button", { name: "Reset authenticator" })).toBeNull();
  });

  it("an admin gets the control, and the submit stays disabled until the reason is ten characters", async () => {
    const user = userEvent.setup();
    render(<SecuritySignalsCard carrierId="cp-1" isAdmin />);
    await user.click(screen.getByRole("button", { name: "Reset authenticator" }));
    const submit = screen.getByRole("button", { name: "Reset and require re-enrolment" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/carrier lost the phone/i), "lost it");
    expect(submit).toBeDisabled();
    await user.type(screen.getByPlaceholderText(/carrier lost the phone/i), " yesterday");
    expect(submit).toBeEnabled();
  });
});

describe("the step-up goes through the AE door", () => {
  it("403 STEP_UP_REQUIRED opens the prompt; the code is verified at /auth/step-up and the reset replays with the token", async () => {
    const user = userEvent.setup();
    post.mockImplementation((url: string, _body: unknown, opts?: { headers?: Record<string, string> }) => {
      if (url === "/carriers/cp-1/mfa-reset") {
        if (opts?.headers?.["x-step-up-token"] === "tok-1") return Promise.resolve({ data: { ok: true, userId: "u-carrier-1" } });
        return Promise.reject(stepUpRefusal);
      }
      if (url === "/auth/step-up") return Promise.resolve({ data: { stepUpToken: "tok-1", expiresInMinutes: 10 } });
      return Promise.reject(new Error(`unexpected post ${url}`));
    });
    render(<SecuritySignalsCard carrierId="cp-1" isAdmin />);
    await user.click(await openAndFill(user));

    // The prompt opened for the refusal, not an error line.
    expect(await screen.findByText("Confirm with your authenticator")).toBeTruthy();
    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(screen.getByText(/Authenticator cleared/)).toBeTruthy());

    const urls = post.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(["/carriers/cp-1/mfa-reset", "/auth/step-up", "/carriers/cp-1/mfa-reset"]);
    expect(urls).not.toContain("/carrier-auth/step-up");
    expect(post.mock.calls[1][1]).toEqual({ code: "123456", action: "mfa-reset" });
    expect(post.mock.calls[2][1]).toEqual({ reason: REASON });
    expect(post.mock.calls[2][2]).toEqual({ headers: { "x-step-up-token": "tok-1" } });
  });

  it("a carrier with nothing enrolled is told so, and nothing reads as done", async () => {
    const user = userEvent.setup();
    post.mockRejectedValue({ response: { status: 409, data: { code: "TOTP_NOT_ENABLED", error: "This carrier has no authenticator enrolled." } } });
    render(<SecuritySignalsCard carrierId="cp-1" isAdmin />);
    await user.click(await openAndFill(user));
    expect(await screen.findByText(/no authenticator enrolled/)).toBeTruthy();
    expect(screen.queryByText(/Authenticator cleared/)).toBeNull();
    expect(screen.queryByText("Confirm with your authenticator")).toBeNull();
  });
});
