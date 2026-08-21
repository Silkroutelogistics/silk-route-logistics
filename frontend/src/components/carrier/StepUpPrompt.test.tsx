// The step-up prompt (Arc 11 B2), tested behaviourally.
//
// This file is also the runner's own proof. Per §19 Sub-pattern 16, a new guard
// is worth nothing until it has been watched to fail against the real artifact,
// and a brand-new test runner is the largest possible version of that risk: a
// misconfigured jsdom or a broken path alias produces a suite that reports
// "0 tests, passed" and looks exactly like a healthy one.
//
// So the first assertion written here was deliberately wrong — it asserted the
// prompt renders when `open` is false — and it was run and watched to fail on
// the real component before being corrected. The corrected form is below, and
// the inverse case is kept as a permanent test because "renders nothing when
// closed" is a real property worth holding.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StepUpPrompt } from "./StepUpPrompt";

function setup(overrides: Partial<React.ComponentProps<typeof StepUpPrompt>> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  const props = {
    open: true,
    title: "Confirm this Quick Pay change",
    description: "This changes when and how you are paid.",
    verifying: false,
    error: null,
    onSubmit,
    onCancel,
    ...overrides,
  };
  render(<StepUpPrompt {...props} />);
  return { onSubmit, onCancel };
}

describe("the prompt", () => {
  it("renders nothing when closed", () => {
    // The inverse of the deliberately-wrong first assertion described above.
    setup({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("names the change it is confirming", () => {
    // Not decoration. "Enter your code" with no subject reads as a session
    // timeout, and a carrier who thinks they are re-authenticating will type a
    // code without registering what they are authorising — which defeats the
    // entire point of asking.
    setup();
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Confirm this Quick Pay change");
    expect(screen.getByText(/changes when and how you are paid/i)).toBeInTheDocument();
  });

  it("will not submit a code that is too short to be one", async () => {
    const { onSubmit } = setup();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("000000"), "123");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits a full code", async () => {
    const { onSubmit } = setup();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onSubmit).toHaveBeenCalledWith("123456");
  });

  it("accepts a backup code, which is alphanumeric and eight long", async () => {
    // verifyTotpCode takes either. A prompt that stripped letters would lock out
    // exactly the carrier who lost their phone — the person backup codes exist
    // for.
    const { onSubmit } = setup();
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("000000"), "A1B2C3D4");
    await user.click(screen.getByRole("button", { name: /confirm/i }));

    expect(onSubmit).toHaveBeenCalledWith("A1B2C3D4");
  });

  it("says a backup code works here", async () => {
    setup();
    expect(screen.getByText(/backup code/i)).toBeInTheDocument();
  });

  it("lets the carrier back out", async () => {
    const { onCancel } = setup();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalled();
  });

  it("shows the reason a code was rejected", () => {
    setup({ error: "That code did not match." });
    expect(screen.getByText("That code did not match.")).toBeInTheDocument();
  });

  it("blocks a second submit while the first is in flight", async () => {
    const { onSubmit } = setup({ verifying: true });
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("000000"), "123456");
    await user.click(screen.getByRole("button", { name: "" }));

    // A step-up code is single-use at the authenticator's granularity; letting
    // an impatient double-click spend it twice burns the window.
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
