"use client";

import { useRef } from "react";
import { useDrawerBehavior } from "@/hooks/useDrawerBehavior";
import { X } from "lucide-react";

interface SlideDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Width class — defaults to the shared --drawer-detail token. */
  width?: string;
  /** Show from right (default) or left */
  side?: "right" | "left";
}

/**
 * Slide-out drawer — light panel on dark page (Cerry-style).
 * - Click-outside-to-close (subtle overlay, NO blur)
 * - ESC key to close
 * - Browser Back button to close
 * - Smooth slide animation
 * - Scroll lock on body when open
 */
export function SlideDrawer({ open, onClose, title, children, width = "max-w-[var(--drawer-detail)]", side = "right" }: SlideDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // v3.8.awa — ESC, browser-back and scroll lock moved verbatim into
  // useDrawerBehavior so the carrier pool and load board can have the same six
  // behaviours without being forced through this component's layout. Nothing
  // about SlideDrawer's behaviour changed; this is where the hook came from.
  const { dialogProps, backdropProps } = useDrawerBehavior({ open, onClose });

  if (!open) return null;

  const slideClass = side === "right"
    ? "right-0 animate-slide-in-right"
    : "left-0 animate-slide-in-left";

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop — subtle dark overlay, NO blur */}
      <div className="absolute inset-0 bg-black/20" {...backdropProps} />

      {/* Drawer panel — clean white, matches Cerry */}
      <div
        ref={drawerRef}
        {...dialogProps}
        aria-labelledby="drawer-title"
        // v3.8.avz — lets a page that stacks a secondary drawer over a primary
        // MEASURE the secondary instead of hardcoding its width. Only SlideDrawer
        // panels carry it, so the query is unambiguous even when the primary is
        // itself a dialog. See the load board's stacked-offset effect.
        data-drawer-panel
        className={`absolute top-0 bottom-0 ${slideClass} w-full ${width} bg-white shadow-2xl flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h2 id="drawer-title" className="text-lg font-semibold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {children}
        </div>
      </div>
    </div>
  );
}
