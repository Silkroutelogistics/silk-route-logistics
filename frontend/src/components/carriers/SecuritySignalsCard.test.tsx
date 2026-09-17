/**
 * B1c-2 (2026-09-17) — the AE console can reset a carrier's authenticator,
 * and it spends the admin's step-up at the AE door, not the carrier's.
 * B6b (2026-09-17) — the card shows sign-in security, and only offers the
 * reset when there is something to reset.
 *
 * The endpoint (bcj) demands a fresh step-up minted from the ADMIN's own
 * authenticator. The hook that turns 403 STEP_UP_REQUIRED into a prompt was
 * hardcoded to /carrier-auth/step-up, which refuses anyone who is not a
 * CARRIER — so an admin using it would have been told their code was wrong
 * forever. The load-bearing assertion here is which URL the code goes to.
 *
 * Adversarially verified at authoring: pointing the hook back at the carrier
 * door turns the step-up case red; dropping the isAdmin gate turns the
 * non-admin case red; offering the reset to a carrier with nothing enrolled
 * turns the not-enrolled case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.setConfig({ testTimeout: 30_000 });

const { post, state } = vi.hoisted(() => {
  const base = {
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
  };
  return { post: vi.fn(), state: { base, data: { ...base } as Record<string, unknown> } };
});

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.data, isLoading: false, isError: false }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post } }));

import { SecuritySignalsCard } from "./SecuritySignalsCard";

const REASON = "Carrier lost the phone; identity confirmed by phone call";
const stepUpRefusal = { response: { status: 403, data: { code: "STEP_UP_REQUIRED", error: "Enter the code from your authenticator app to confirm this change." } } };
const ENROLLED = {
  totpEnabled: true,
  enrolledAt: "2026-09-10T15:00:00.000Z",
  lastLogin: { at: "2026-09-17T12:00:00.000Z", ip: "203.0.113.9", city: "Detroit", region: "MI", country: "US", flags: ["NEW_DEVICE"] },
};

async function openAndFill(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Reset authenticator" }));
  await user.type(screen.getByPlaceholderText(/carrier lost the phone/i), REASON);
  return screen.getByRole("button", { name: "Reset and require re-enrolment" });
}

beforeEach(() => {
  post.mockReset();
  state.data = { ...state.base, security: ENROLLED };
});

describe("who sees it", () => {
  it("a non-admin sees the sign-in security block but no reset control", () => {
    render(<SecuritySignalsCard carrierId="cp-1" isAdmin={false} />);
    expect(screen.getByTestId("signin-security")).toBeTruthy();
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

describe("sign-in security (B6b)", () => {
  it("reads enrollment and the last sign-in — where from, and what was unusual", () => {
    render(<SecuritySignalsCard carrierId="cp-1" isAdmin />);
    const block = screen.getByTestId("signin-security");
    expect(block.textContent).toContain("Authenticator enrolled since");
    expect(block.textContent).toContain("Last sign-in");
    expect(block.textContent).toContain("from Detroit, MI, US");
    expect(block.textContent).toContain("203.0.113.9");
    expect(screen.getAllByTestId("signin-flag").map((f) => f.textContent)).toEqual(["new device"]);
  });

  it("a carrier with nothing enrolled is told so, and an admin is NOT offered a reset", () => {
    state.data = { ...state.base, security: { totpEnabled: false, enrolledAt: null, lastLogin: null } };
    render(<SecuritySignalsCard carrierId="cp-1" isAdmin />);
    expect(screen.getByTestId("signin-security").textContent).toContain("No authenticator enrolled");
    expect(screen.getByTestId("signin-security").textContent).toContain("No sign-in recorded yet");
    expect(screen.queryByRole("button", { name: "Reset authenticator" })).toBeNull();
  });

  it("a backend that predates the field says so, and keeps the reset available (the 409 carries the distinction)", () => {
    state.data = { ...state.base };
    render(<SecuritySignalsCard carrierId="cp-1" isAdmin />);
    expect(screen.getByTestId("signin-security").textContent).toContain("not reported");
    expect(screen.getByRole("button", { name: "Reset authenticator" })).toBeTruthy();
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
    expect(await screen.findByText(/no authenticator enrolled — there is nothing to reset/)).toBeTruthy();
    expect(screen.queryByText(/Authenticator cleared/)).toBeNull();
    expect(screen.queryByText("Confirm with your authenticator")).toBeNull();
  });
});
