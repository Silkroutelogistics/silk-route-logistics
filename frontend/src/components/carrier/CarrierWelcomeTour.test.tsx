/**
 * CarrierWelcomeTour — v3.8.bei.
 *
 * What these pin: the six slides are walked in order, Finish and Skip both
 * record "seen" on first run and NEITHER does on replay, and a failed write
 * still closes the tour. The layout's trigger (WHEN it opens) is pinned in
 * app/carrier/dashboard/layout.test.tsx; this file is WHAT it does once open.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const post = vi.fn();
const invalidateQueries = vi.fn();
vi.mock("@/lib/api", () => ({ api: { post: (...a: unknown[]) => post(...a) } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries }) }));

import { CarrierWelcomeTour, TOUR_SLIDES, TOUR_COMPLETE_ENDPOINT } from "./CarrierWelcomeTour";

beforeEach(() => {
  vi.clearAllMocks();
  post.mockResolvedValue({ data: { ok: true } });
  invalidateQueries.mockResolvedValue(undefined);
});

describe("slides", () => {
  it("has six, each naming where its subject lives", () => {
    expect(TOUR_SLIDES).toHaveLength(6);
    for (const s of TOUR_SLIDES) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(40);
      expect(s.where.length).toBeGreaterThan(0);
    }
  });

  it("copy carries no exclamation points and no em-dashes (§18.9)", () => {
    for (const s of TOUR_SLIDES) {
      expect(s.body, s.title).not.toMatch(/!/);
      expect(s.body, s.title).not.toMatch(/—/);
      expect(s.title).not.toMatch(/—/);
    }
  });

  it("opens on slide 1 and walks forward and back", () => {
    render(<CarrierWelcomeTour mode="first-run" onClose={() => {}} />);
    expect(screen.getByTestId("tour-title").textContent).toBe(TOUR_SLIDES[0].title);
    expect(screen.getByTestId("tour-eyebrow").textContent).toContain("1 of 6");
    expect(screen.queryByTestId("tour-back")).toBeNull();

    fireEvent.click(screen.getByTestId("tour-next"));
    expect(screen.getByTestId("tour-title").textContent).toBe(TOUR_SLIDES[1].title);
    expect(screen.getAllByTestId("tour-dot").filter((d) => d.dataset.active === "true")).toHaveLength(1);

    fireEvent.click(screen.getByTestId("tour-back"));
    expect(screen.getByTestId("tour-title").textContent).toBe(TOUR_SLIDES[0].title);
  });

  it("the last slide's button reads Finish and Skip is gone", () => {
    render(<CarrierWelcomeTour mode="first-run" onClose={() => {}} />);
    for (let i = 0; i < TOUR_SLIDES.length - 1; i++) fireEvent.click(screen.getByTestId("tour-next"));
    expect(screen.getByTestId("tour-next").textContent).toBe("Finish");
    expect(screen.queryByTestId("tour-skip")).toBeNull();
  });
});

describe("first-run records that it was seen", () => {
  it("Finish posts the completion, refreshes the activation query, then closes", async () => {
    const onClose = vi.fn();
    render(<CarrierWelcomeTour mode="first-run" onClose={onClose} />);
    for (let i = 0; i < TOUR_SLIDES.length; i++) fireEvent.click(screen.getByTestId("tour-next"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(TOUR_COMPLETE_ENDPOINT);
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["carrier-activation"] });
  });

  it("Skip is 'seen' too: it posts, then closes", async () => {
    const onClose = vi.fn();
    render(<CarrierWelcomeTour mode="first-run" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("tour-skip"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledWith(TOUR_COMPLETE_ENDPOINT);
  });

  it("Escape is Skip", async () => {
    const onClose = vi.fn();
    render(<CarrierWelcomeTour mode="first-run" onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("a failed write still closes — a network hiccup must not trap a carrier", async () => {
    post.mockRejectedValueOnce(new Error("offline"));
    const onClose = vi.fn();
    render(<CarrierWelcomeTour mode="first-run" onClose={onClose} />);
    fireEvent.click(screen.getByTestId("tour-skip"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("does not post twice on a double-click", async () => {
    const onClose = vi.fn();
    render(<CarrierWelcomeTour mode="first-run" onClose={onClose} />);
    const skip = screen.getByTestId("tour-skip");
    fireEvent.click(skip);
    fireEvent.click(skip);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe("replay never restamps", () => {
  it("Done closes without posting", async () => {
    const onClose = vi.fn();
    render(<CarrierWelcomeTour mode="replay" onClose={onClose} />);
    expect(screen.queryByTestId("tour-skip")).toBeNull();
    for (let i = 0; i < TOUR_SLIDES.length; i++) fireEvent.click(screen.getByTestId("tour-next"));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(post).not.toHaveBeenCalled();
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
