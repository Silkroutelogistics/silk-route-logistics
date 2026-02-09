"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LoadingSpinnerProps {
  message?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: "w-5 h-5",
  md: "w-8 h-8",
  lg: "w-12 h-12",
};

export function LoadingSpinner({ message = "Loading...", className, size = "md" }: LoadingSpinnerProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-16", className)}>
      <Loader2 className={cn("animate-spin text-gold", sizes[size])} />
      {message && <p className="mt-3 text-sm text-white/50">{message}</p>}
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
