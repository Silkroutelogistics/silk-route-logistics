// carrier-portal-upgrade F2 (M4/M5) — the training matrix on a phone.
//
// Owner check 1: the sticky Driver column stays under ~40% of a 380px screen,
// and the course cells scroll under it (the layout half is measured in the
// 380px E2E; this file holds the classes that produce it). Certificate
// downloads are named, 44px buttons.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, put: vi.fn(), post: vi.fn() } }));
vi.mock("@/lib/download", () => ({ downloadFromApi: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

import TrainingPage from "./page";

export const TRAINING_FIXTURE = {
  courses: [
    { id: "c1", slug: "hos-basics", title: "Hours of Service", category: "Safety" },
    { id: "c2", slug: "eld", title: "ELD", category: "Compliance" },
  ],
  drivers: [
    { id: "d1", firstName: "Luis", lastName: "Ortega", activated: true, passedCount: 1,
      progress: { c1: { status: "PASSED", bestScorePct: 92, completedAt: "2026-09-01", expiresAt: null } } },
  ],
  summary: { driverCount: 1, courseCount: 2, passedCells: 1, totalCells: 2, pctTrained: 50 },
};

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><TrainingPage /></QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe("Training", () => {
  it("shows a skeleton while loading", () => {
    get.mockReturnValue(new Promise(() => {}));
    mount();
    expect(screen.getByRole("status", { name: "Loading training progress" })).toBeTruthy();
  });

  it("caps the sticky Driver column on a phone and lets the matrix scroll in its own box", async () => {
    get.mockResolvedValue({ data: TRAINING_FIXTURE });
    mount();
    const th = await screen.findByTestId("sticky-driver");
    expect(th.className).toMatch(/\bsticky\b/);
    expect(th.className).toMatch(/w-\[36vw\]/);
    expect(th.className).toMatch(/max-w-\[150px\]/);
    expect(screen.getByTestId("training-matrix").className).toMatch(/\boverflow-x-auto\b/);
  });

  it("names each certificate download and makes it a 44px target", async () => {
    get.mockResolvedValue({ data: TRAINING_FIXTURE });
    mount();
    const b = await screen.findByRole("button", { name: "Download Luis Ortega's Hours of Service certificate" });
    expect(b.className).toMatch(/min-h-\[44px\]/);
  });
});
