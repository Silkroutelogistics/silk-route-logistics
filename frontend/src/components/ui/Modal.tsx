"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}

export function Modal({ title, onClose, children, maxWidth = "max-w-lg" }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Trap focus inside modal and handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    // Focus the dialog on open
    dialogRef.current?.focus();
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" role="presentation">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className={`bg-navy rounded-xl border border-white/10 w-full ${maxWidth} max-h-[90vh] overflow-y-auto outline-none`}
      >
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 id="modal-title" className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="p-1 hover:bg-white/10 rounded transition">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
