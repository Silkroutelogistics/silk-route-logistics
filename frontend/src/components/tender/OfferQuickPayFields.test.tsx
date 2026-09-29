/**
 * Item 342 (v3.8.bor) — the Quick Pay fields both offer surfaces share.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { OfferQuickPayFields } from "./OfferQuickPayFields";
import { EMPTY_OFFER_QUICK_PAY } from "@/lib/offerQuickPay";

describe("OfferQuickPayFields", () => {
  it("standard terms by default, with no evidence asked for", () => {
    render(<OfferQuickPayFields value={EMPTY_OFFER_QUICK_PAY} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Standard terms" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByLabelText("Evidence")).toBeNull();
  });

  it("choosing a Quick Pay speed reports it", () => {
    const onChange = vi.fn();
    render(<OfferQuickPayFields value={EMPTY_OFFER_QUICK_PAY} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Quick Pay same-day" }));
    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_OFFER_QUICK_PAY, speed: "SAME_DAY" });
  });

  it("a paid speed asks where the carrier asked for it", () => {
    const onChange = vi.fn();
    render(<OfferQuickPayFields value={{ ...EMPTY_OFFER_QUICK_PAY, speed: "SEVEN_DAY" }} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Evidence"), { target: { value: "RE: load 121498" } });
    expect(onChange).toHaveBeenLastCalledWith({ speed: "SEVEN_DAY", evidenceType: "email_subject", evidenceRef: "RE: load 121498" });
  });
});
