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

// carrier-portal-upgrade M3 — the tour covers only unlocked features, and on a
// phone it is a bottom sheet with full-size controls.
describe("M3: what the tour points at, and how it sits on a phone", () => {
  it("every slide names a sidebar page, and none of those pages is locked", async () => {
    const { CARRIER_NAV } = await import("./CarrierSidebar");
    const { lockedFeatureForPath } = await import("@/lib/carrierPortalFeatures");
    for (const s of TOUR_SLIDES) {
      const labels = s.where.split(",").map((w) => w.trim());
      for (const label of labels) {
        const item = CARRIER_NAV.find((n) => n.label === label);
        expect(item, `slide "${s.title}" points at "${label}", which is not in the sidebar`).toBeTruthy();
        expect(lockedFeatureForPath(item!.href), `slide "${s.title}" sends a carrier to locked "${label}"`).toBeNull();
      }
    }
  });

  it("is a bottom sheet under 768px and a centred card above", () => {
    render(<CarrierWelcomeTour mode="first-run" onClose={vi.fn()} />);
    const root = screen.getByTestId("carrier-welcome-tour");
    expect(root.className).toMatch(/\bitems-end\b/);
    expect(root.className).toMatch(/\bmd:items-center\b/);
    expect((root.firstElementChild as HTMLElement).className).toMatch(/\brounded-t-xl\b/);
  });

  it("gives every control a 44px target", () => {
    render(<CarrierWelcomeTour mode="first-run" onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("tour-next"));
    for (const id of ["tour-next", "tour-back", "tour-skip"]) {
      expect(screen.getByTestId(id).className, id).toMatch(/min-h-\[44px\]/);
    }
    // The X icon carries aria-label "Skip tour"; the text button shares the name.
    expect(document.querySelector('button[aria-label="Skip tour"]')!.className).toMatch(/\bh-11\b/);
  });
});
