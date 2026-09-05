// Frontend test runner (Arc 12 Phase 1).
//
// WHY IT EXISTS. Two guards shipped in Arc 11 — the layout precedence rule and
// the login pendingTotp branch — are STATIC: they read source files as text and
// assert a line is present. Both say so in their own files, because a guard that
// cannot observe behaviour is worth less than one that can and it is dishonest
// to let a passing suite imply otherwise.
//
// The ato guard is the one that matters. The bug it covers was a LOCKOUT: an
// enrolled carrier looping between login and dashboard forever. A text search
// for "data.pendingTotp" proves the string is in the file. It does not prove the
// branch is reached, that the store lands in the right state, or that the page
// routes anywhere sensible — which is precisely the seam the bug lived in.
//
// jsdom, not a browser. These are component and store tests: deterministic, no
// network, no download step. That is what makes them safe to gate a deploy on,
// in a way the Playwright E2E job deliberately is not (see the deploy job's
// needs list and v3.8.asv).

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // @ts-expect-error — @vitejs/plugin-react resolves a different copy of vite's
  // types than vitest bundles, so the Plugin[] it returns does not structurally
  // match this PluginOption. A version skew in the toolchain, not a real type
  // error: the plugin works, as the 26 passing tests show.
  //
  // ts-expect-error rather than a cast, deliberately. It fails the build if the
  // skew is ever resolved, so this comment cannot outlive the problem it
  // describes — where a cast would silently paper over a real error later.
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    // Only our own tests. Without this, vitest walks node_modules and the
    // static export in out/.
    include: ["src/**/*.test.{ts,tsx}"],
    exclude: ["node_modules", "out", ".next"],
  },
  // tsconfig sets jsx: "preserve" because Next.js owns the transform in the app
  // build. esbuild follows tsconfig, so under vitest that left JSX untransformed
  // and every render threw "React is not defined". Caught by the deliberate-
  // failure step rather than by a green suite, which is the entire argument for
  // doing that step on a new runner.
  esbuild: { jsx: "automatic" },
  resolve: {
    // Mirrors the "@/*" path alias in tsconfig. Without it every import in a
    // component under test fails to resolve and the suite reports a module
    // error rather than a behavioural result.
    //
    // "@shared" mirrors tsconfig's "@shared/*" → "../shared/*", and it is here
    // for a reason worth stating: next build and tsc BOTH honour tsconfig paths,
    // so a component importing @shared/… compiles and ships perfectly while this
    // suite alone fails to resolve the module. The break would land in the job
    // that gates the deploy, attributed to whichever test happened to render
    // that component. §19 Sub-pattern 11 — the local gate and the CI gate have
    // to be looking at the same thing.
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@shared": path.resolve(__dirname, "../shared"),
    },
  },
});
