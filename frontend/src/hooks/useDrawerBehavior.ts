"use client";

import { useEffect, useCallback, useRef } from "react";

/**
 * The six behaviours every drawer in the portal owes the person using it.
 *
 * v3.8.awa — extracted from SlideDrawer, which already had all six, so that the
 * two drawers that never had them can get them without being forced through
 * SlideDrawer's layout.
 *
 * Before this, five of seven detail drawers honoured the contract and two did
 * not — and the two were the busiest AE surfaces, the carrier pool and the load
 * board, which are inline rather than extracted components. The load board had
 * no keyboard route out at all on desktop: no ESC, no backdrop, only a
 * `lg:hidden` back button. Measured live, not inferred
 * (docs/audits/drawer-conformance-audit.md).
 *
 * Extraction onto SlideDrawer was tried first and rejected: SlideDrawer renders
 * its own header and wraps children in a padded column, and both of those
 * drawers need a horizontal layout with an icon rail beside scrolling content.
 * Forcing the layout to fit the behaviour is the wrong way round. A hook gives
 * one implementation of the contract and leaves the markup alone.
 *
 * Covers ESC, browser-back, and body scroll lock — the three that are behaviour.
 * Returns props for the other three, which are markup: role, aria-modal, and the
 * backdrop's click handler. Spreading them is what makes the contract hard to
 * half-apply, which is how it drifted in the first place.
 */
export function useDrawerBehavior({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wasOpenRef = useRef(false);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  // Browser back closes the drawer rather than leaving the page. A drawer reads
  // as a place you navigated to, so Back is what people reach for — and without
  // this it silently exits the whole surface instead.
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      window.history.pushState({ drawer: true }, "");
      const handlePopState = () => onClose();
      window.addEventListener("popstate", handlePopState);
      wasOpenRef.current = true;
      return () => {
        window.removeEventListener("popstate", handlePopState);
        wasOpenRef.current = false;
      };
    }
    if (!open && wasOpenRef.current) wasOpenRef.current = false;
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, handleKeyDown]);

  return {
    /** Spread onto the panel element. */
    dialogProps: {
      role: "dialog" as const,
      "aria-modal": true,
    },
    /** Spread onto the backdrop element. */
    backdropProps: {
      onClick: onClose,
      "aria-hidden": true,
    },
  };
}
