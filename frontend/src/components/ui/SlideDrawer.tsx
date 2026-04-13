"use client";

import { useEffect, useCallback, useRef } from "react";
import { X } from "lucide-react";

interface SlideDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Width class — default "max-w-2xl" */
  width?: string;
  /** Show from right (default) or left */
  side?: "right" | "left";
}

/**
 * Slide-out drawer with:
 * - Click-outside-to-close (backdrop click)
 * - ESC key to close
 * - Browser Back button to close (pushes history state)
 * - Smooth slide animation
 * - Scroll lock on body when open
 */
export function SlideDrawer({ open, onClose, title, children, width = "max-w-2xl", side = "right" }: SlideDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  // ESC key handler
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  // Browser back button support
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      // Push a fake history entry when drawer opens
      window.history.pushState({ drawer: true }, "");
      const handlePopState = () => onClose();
      window.addEventListener("popstate", handlePopState);
      wasOpenRef.current = true;
      return () => {
        window.removeEventListener("popstate", handlePopState);
        wasOpenRef.current = false;
      };
    }
    if (!open && wasOpenRef.current) {
      wasOpenRef.current = false;
    }
  }, [open, onClose]);

  // ESC key + body scroll lock
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

  if (!open) return null;

  const slideClass = side === "right"
    ? "right-0 animate-slide-in-right"
    : "left-0 animate-slide-in-left";

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop — click to close */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Drawer panel */}
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drawer-title"
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
