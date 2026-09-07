// The CRM tab rail, tested behaviourally.
//
// The defect this covers is not a crash. Before it, every tab in the New
// Customer state was a live button: clicking Contacts moved the gold active
// indicator and left the create form on screen, so the click registered and
// produced nothing. That reads as a broken page rather than a precondition,
// and no type or build gate can see it — the component compiled, rendered and
// handled the click perfectly.
//
// Per §19 Sub-pattern 16 that makes a text assertion the wrong instrument: a
// grep for `disabled` in the source proves the attribute is written, not that
// the tab refuses. So every case here clicks a real button and reads what the
// handler did.

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CrmIconTabs } from "./IconTabs";

const LOCK = "Save the customer first — this tab attaches records to it";

function setup(lockedReason?: string) {
  const onChange = vi.fn();
  render(<CrmIconTabs active="profile" onChange={onChange} lockedReason={lockedReason} />);
  return { onChange };
}

describe("CrmIconTabs — unlocked (an existing customer)", () => {
  it("every tab is clickable and reports its id", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Contacts" }));
    expect(onChange).toHaveBeenCalledWith("contacts");
  });

  it("no tab is disabled", () => {
    setup();
    for (const b of screen.getAllByRole("button")) expect(b).not.toBeDisabled();
  });
});

describe("CrmIconTabs — locked (the New Customer form)", () => {
  it("a locked tab does NOT call onChange when clicked", async () => {
    const { onChange } = setup(LOCK);
    // pointer-events are not suppressed by `disabled` in jsdom the way a real
    // browser suppresses them, so click through the guard explicitly: this
    // asserts the handler refuses, not merely that the browser would.
    await userEvent.click(screen.getByRole("button", { name: `Contacts — ${LOCK}` }), {
      pointerEventsCheck: 0,
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("the locked tab is genuinely disabled, not just styled grey", () => {
    setup(LOCK);
    expect(screen.getByRole("button", { name: `Contacts — ${LOCK}` })).toBeDisabled();
  });

  it("Profile stays live — it is the tab the create form lives on", async () => {
    const { onChange } = setup(LOCK);
    const profile = screen.getByRole("button", { name: "Profile" });
    expect(profile).not.toBeDisabled();
    await userEvent.click(profile);
    expect(onChange).toHaveBeenCalledWith("profile");
  });

  it("every tab except Profile is locked — not just the one this file spot-checks", () => {
    setup(LOCK);
    const disabled = screen.getAllByRole("button").filter((b) => (b as HTMLButtonElement).disabled);
    // 9 tabs in the rail, so 8 locked. A tripwire: were the rail to render
    // nothing, getAllByRole would throw rather than let this pass on zero.
    expect(screen.getAllByRole("button")).toHaveLength(9);
    expect(disabled).toHaveLength(8);
  });

  it("the tooltip says why, and what unlocks it", () => {
    setup(LOCK);
    const contacts = screen.getByRole("button", { name: `Contacts — ${LOCK}` });
    expect(contacts).toHaveAttribute("title", LOCK);
    // The reason has to name the remedy. A bare "unavailable" would satisfy a
    // presence check and tell an AE nothing.
    expect(LOCK).toMatch(/save the customer first/i);
  });
});
