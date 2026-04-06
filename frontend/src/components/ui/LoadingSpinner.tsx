"use client";

import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { img: "w-8 h-8", text: "text-xs" },
  md: { img: "w-12 h-12", text: "text-sm" },
  lg: { img: "w-16 h-16", text: "text-sm" },
};

export function LoadingSpinner({ message = "Loading...", className, size = "md" }: LoadingSpinnerProps) {
  const s = sizes[size];
  return (
    <div className={cn("flex flex-col items-center justify-center py-16", className)}>
      <img src="/logo-penguin.gif" alt="Loading" className={cn(s.img, "rounded-xl")} />
      {message && <p className={cn("mt-3 text-white/50", s.text)}>{message}</p>}
    </div>
  );
}

export function PageLoader({ message }: { message?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <LoadingSpinner message={message} size="lg" />
    </div>
  );
}
