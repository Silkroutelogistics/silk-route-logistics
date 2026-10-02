// Shared setup for frontend component + store tests (Arc 12 Phase 1).

import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// findBy* and waitFor give up after 1s by default. Under a loaded machine (the
// full suite beside a backend run and a Next build) a query-backed render can
// take longer, and two carrier tests failed with nothing wrong (FINISH-2: the
// drivers roster, then the dashboard's active load). 5s for the whole class
// rather than one test at a time; a real miss still fails, just later.
configure({ asyncUtilTimeout: 5000 });

// Unmount between tests. Without this a component from one test is still in the
// document during the next, and a query that should find nothing finds the
// previous render — a false pass, which is the failure mode §19 Sub-pattern 16
// exists to catch.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// jsdom does not implement these and React/Next components reach for them.
// Stubbed rather than left to throw, so a missing browser API surfaces as the
// test it belongs to rather than an unrelated crash.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

if (!window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}
