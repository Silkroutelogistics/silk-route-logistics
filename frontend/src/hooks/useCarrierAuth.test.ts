// The carrier auth store, and the lockout that lived in it (Arc 12 Phase 1).
//
// REPLACES A STATIC GUARD. Arc 11 could only assert that the string
// "data.pendingTotp" appeared in this file, ahead of "user: data.user", because
// there was no frontend runner. That proved the branch was WRITTEN. It could not
// prove the branch is REACHED, that the store lands in the right state, or that
// a caller can tell what happened — which is the whole seam the bug lived in.
//
// THE BUG. /verify-otp answers { pendingTotp, totpToken } when 2FA is armed and
// deliberately does NOT set the session cookie: the second factor has not been
// presented. The store had no branch for it, so it fell through to the success
// path, read data.user (undefined), stored null, and returned "success". The
// page routed to the dashboard, the layout found no cookie, and bounced back to
// login. Password, code, redirect, forever, with nothing on screen to explain it.
//
// Latent for as long as the endpoint existed, because no carrier had 2FA on.
// v3.8.atm made enrollment mandatory, which would have walked every carrier into
// it on their next sign-in.

import { describe, it, expect, vi, beforeEach } from "vitest";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { post, get: vi.fn() } }));

import { useCarrierAuth } from "./useCarrierAuth";

const FRESH = useCarrierAuth.getState();

beforeEach(() => {
  vi.clearAllMocks();
  useCarrierAuth.setState({
    ...FRESH,
    user: null,
    token: null,
    error: null,
    isLoading: false,
    mustChangePassword: false,
    pendingOtp: false,
    pendingEmail: null,
    pendingTotp: false,
    totpToken: null,
  });
});

describe("verify-otp, when the carrier has an authenticator armed", () => {
  it('reports "totp" rather than "success"', async () => {
    // The exact regression. "success" here is what sent the page to a dashboard
    // it had no cookie for.
    post.mockResolvedValue({ data: { pendingTotp: true, totpToken: "temp-token" } });

    const result = await useCarrierAuth.getState().verifyOtp("c@x.com", "12345678");

    expect(result).toBe("totp");
  });

  it("does not claim a user it was never given", async () => {
    // The response carries no user — the backend withholds it until the second
    // factor lands. Storing null while reporting success is what made the loop
    // silent instead of loud.
    post.mockResolvedValue({ data: { pendingTotp: true, totpToken: "temp-token" } });

    await useCarrierAuth.getState().verifyOtp("c@x.com", "12345678");

    const s = useCarrierAuth.getState();
    expect(s.user).toBeNull();
    expect(s.pendingTotp).toBe(true);
    expect(s.totpToken).toBe("temp-token");
  });

  it("closes the emailed-code step so the page cannot show both at once", async () => {
    useCarrierAuth.setState({ pendingOtp: true, pendingEmail: "c@x.com" });
    post.mockResolvedValue({ data: { pendingTotp: true, totpToken: "t" } });

    await useCarrierAuth.getState().verifyOtp("c@x.com", "12345678");

    expect(useCarrierAuth.getState().pendingOtp).toBe(false);
  });
});

describe("verify-otp, when there is no second factor", () => {
  it("still completes the session, unchanged", async () => {
    // The branch above must not have moved the ordinary path.
    post.mockResolvedValue({
      data: {
        user: { id: "u1", email: "c@x.com", firstName: "A", lastName: "B", role: "CARRIER" },
        carrier: { id: "p1", companyName: "Acme" },
      },
    });

    const result = await useCarrierAuth.getState().verifyOtp("c@x.com", "12345678");

    expect(result).toBe("success");
    expect(useCarrierAuth.getState().user?.id).toBe("u1");
    expect(useCarrierAuth.getState().pendingTotp).toBe(false);
  });

  it("routes a forced password change ahead of everything else", async () => {
    post.mockResolvedValue({ data: { mustChangePassword: true } });

    const result = await useCarrierAuth.getState().verifyOtp("c@x.com", "12345678");

    expect(result).toBe("password");
  });
});

describe("the authenticator step itself", () => {
  it("spends the temp token and completes the session", async () => {
    useCarrierAuth.setState({ pendingTotp: true, totpToken: "temp-token" });
    post.mockResolvedValue({
      data: {
        user: { id: "u1", email: "c@x.com", firstName: "A", lastName: "B", role: "CARRIER" },
        carrier: { id: "p1", companyName: "Acme" },
      },
    });

    const result = await useCarrierAuth.getState().verifyTotp("123456");

    expect(result).toBe("success");
    expect(post).toHaveBeenCalledWith("/carrier-auth/totp-verify", {
      totpToken: "temp-token",
      code: "123456",
    });
  });

  it("drops the token once a session exists", async () => {
    // It is a credential. Holding it after it has been spent is a spare key left
    // in the lock.
    useCarrierAuth.setState({ pendingTotp: true, totpToken: "temp-token" });
    post.mockResolvedValue({ data: { user: { id: "u1" }, carrier: null } });

    await useCarrierAuth.getState().verifyTotp("123456");

    const s = useCarrierAuth.getState();
    expect(s.totpToken).toBeNull();
    expect(s.pendingTotp).toBe(false);
  });

  it("does not post a null token when the five minutes ran out", async () => {
    // Posting null produces a generic 401 that reads as "wrong code", so the
    // carrier retypes a correct code and is refused again.
    useCarrierAuth.setState({ pendingTotp: true, totpToken: null });

    const result = await useCarrierAuth.getState().verifyTotp("123456");

    expect(result).toBe(false);
    expect(post).not.toHaveBeenCalled();
    expect(useCarrierAuth.getState().error).toMatch(/sign in again/i);
  });

  it("keeps the carrier on the code step when the code is simply wrong", async () => {
    // A mistyped digit must not throw them back to the password screen.
    useCarrierAuth.setState({ pendingTotp: true, totpToken: "temp-token" });
    post.mockRejectedValue({ response: { status: 401, data: { error: "Invalid authenticator code" } } });

    const result = await useCarrierAuth.getState().verifyTotp("000000");

    expect(result).toBe(false);
    expect(useCarrierAuth.getState().pendingTotp).toBe(true);
    expect(useCarrierAuth.getState().error).toBe("Invalid authenticator code");
  });
});

describe("logout", () => {
  it("clears the half-finished login states, not just the session", async () => {
    useCarrierAuth.setState({ pendingTotp: true, totpToken: "temp-token", pendingOtp: true });
    // logout navigates; jsdom has no navigation, so pin the assertion to state.
    Object.defineProperty(window, "location", { writable: true, value: { href: "" } });

    useCarrierAuth.getState().logout();

    const s = useCarrierAuth.getState();
    expect(s.totpToken).toBeNull();
    expect(s.pendingTotp).toBe(false);
    expect(s.pendingOtp).toBe(false);
  });
});
