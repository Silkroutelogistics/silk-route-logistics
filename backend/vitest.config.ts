import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    include: ["__tests__/**/*.test.ts"],
    globals: true,
    // Every document generator formats dates with toLocaleDateString, so a date
    // at midnight UTC renders one day earlier on a negative-offset machine. That
    // made the settlement render pin pass locally (America/New_York) and fail on
    // the CI runner (UTC) -- the same document, two different printed dates.
    //
    // Pinning the suite to UTC makes local and CI agree by construction rather
    // than by nobody having written a boundary-crossing fixture yet. Production
    // renders on Render, which is UTC, so this is also the environment the
    // pinned output actually describes.
    env: { TZ: "UTC" },
  },
});
