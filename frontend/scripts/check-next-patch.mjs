/**
 * Build-time gate for patches/next+15.5.14.patch.
 *
 * WHY THIS EXISTS ALONGSIDE postinstall. patch-package runs from the
 * postinstall hook and fails the INSTALL if the patch no longer applies. But
 * an install that never ran the hook (a runner using --ignore-scripts, a
 * cached node_modules restored from before the patch existed) reports
 * nothing, and `next build` would then ship the unpatched router — a bundle
 * that looks identical to the fixed one until a carrier's fetch drops on a
 * phone and Safari renders the raw RSC payload as the page.
 *
 * So `next build` refuses to start unless the file the browser bundle is
 * actually built from — the ESM copy, per Next's own compiler aliases —
 * carries the patched fallback. Fail-fast, at the artifact the build reads
 * (§19 Sub-pattern 1 + 16): presence of the patch in package.json proves
 * nothing about node_modules.
 */
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const target = require.resolve(
  "next/dist/esm/client/components/router-reducer/fetch-server-response.js",
);
const src = readFileSync(target, "utf8");
const catchIdx = src.indexOf("Failed to fetch RSC payload for");
const endIdx = src.indexOf("createFetch", catchIdx);
const catchBlock = catchIdx > 0 && endIdx > catchIdx ? src.slice(catchIdx, endIdx) : "";

const unpatched = catchBlock.includes("flightData: url.toString()");
const patched = catchBlock.includes("doMpaNavigation(url.toString())");

if (!catchBlock || unpatched || !patched) {
  console.error(
    [
      "",
      "✗ next/dist/esm/.../fetch-server-response.js is NOT carrying patches/next+15.5.14.patch.",
      "",
      "  The static-export RSC fallback would hard-navigate to the .txt flight",
      "  payload on any fetch failure (raw RSC text rendered as the page on mobile).",
      "",
      "  Fix: run `npx patch-package` in frontend/ (postinstall does this on a",
      "  normal install). If Next was upgraded, re-apply the patch to the new",
      "  version or confirm upstream fixed it (canary falls back to originalUrl).",
      "",
      `  file: ${target}`,
      "",
    ].join("\n"),
  );
  process.exit(1);
}
console.log("✓ next patch present (static-export RSC fallback strips .txt)");
