const sizeClass = { sm: "h-7", md: "h-10", lg: "h-12" } as const;

/**
 * Which master to render, chosen by the SURFACE the mark sits on.
 *
 *   "fullcolour"  navy + gold — cream, white and every other light surface.
 *   "white"       the silhouette — navy, near-black and dark console chrome.
 *   "auto"        the surface is light in one theme and dark in the other, so
 *                 the mark follows `data-mode`. Both files are in the DOM and
 *                 CSS shows exactly one (globals.css, ".srl-logo-on-*").
 *
 * "auto" exists because four surfaces genuinely have no single right answer.
 * The AE sidebar is warm stone #EBE8E2 in light mode and #080C18 in dark; the
 * accounting sidebar is #EBE8E2 / #0A1120 (an `[data-mode="light"] aside`
 * !important rule that shell never escaped); AuthGuard is #F5F3EF / #0F1117.
 * Pinning "white" would put a white mark on warm stone in the DEFAULT theme;
 * pinning "fullcolour" would put navy on near-black in the other.
 *
 * Why two <img> rather than one swapped in JS: the static export carries no
 * `data-mode` attribute on first paint, so a JS swap would flash the wrong
 * mark. CSS resolves before paint and bare `:root` is the light palette. Only
 * one is ever rendered — `display:none` keeps the other out of the a11y tree,
 * so the repeated alt text is never announced twice.
 *
 * The mark is a bare silhouette by design (v3.8.bgc): /logo.png was an opaque
 * 200x200 raster whose 92px mark sat in a white chip, and several surfaces
 * rounded that chip's corners to make it look deliberate. An SVG on a
 * transparent ground needs no chip, and the rounding went with it.
 */
type LogoVariant = "fullcolour" | "white" | "auto";

const SRC = {
  fullcolour: "/brand/srl-logo-fullcolour.svg",
  white: "/brand/srl-logo-white.svg",
} as const;

export function Logo({
  size = "md",
  variant = "fullcolour",
}: {
  size?: "sm" | "md" | "lg";
  variant?: LogoVariant;
}) {
  const cls = sizeClass[size];

  if (variant === "auto") {
    return (
      <>
        <img src={SRC.fullcolour} alt="Silk Route Logistics" className={`${cls} srl-logo-on-light`} />
        <img src={SRC.white} alt="Silk Route Logistics" className={`${cls} srl-logo-on-dark`} />
      </>
    );
  }

  return <img src={SRC[variant]} alt="Silk Route Logistics" className={cls} />;
}
