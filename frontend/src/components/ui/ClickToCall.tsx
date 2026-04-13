"use client";

import { Phone, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface ClickToCallProps {
  phone: string;
  label?: string;
  size?: "sm" | "md";
  showSms?: boolean;
  className?: string;
}

/**
 * Click-to-call button that opens OpenPhone desktop app via deep link.
 * Falls back to tel: link if OpenPhone isn't installed.
 *
 * OpenPhone deep link format: openphone://dial?phoneNumber=+12692206760
 */
export function ClickToCall({ phone, label, size = "sm", showSms = false, className }: ClickToCallProps) {
  if (!phone) return null;

  const normalized = phone.startsWith("+") ? phone : `+1${phone.replace(/\D/g, "")}`;
  const display = label || phone;

  const handleCall = () => {
    // Try OpenPhone deep link first, fall back to tel:
    const openPhoneUrl = `openphone://dial?phoneNumber=${encodeURIComponent(normalized)}`;
    const telUrl = `tel:${normalized}`;

    // Try opening OpenPhone — if it fails, use tel:
    const w = window.open(openPhoneUrl, "_blank");
    if (!w) {
      window.location.href = telUrl;
    }
  };

  const handleSms = () => {
    const openPhoneUrl = `openphone://text?phoneNumber=${encodeURIComponent(normalized)}`;
    window.open(openPhoneUrl, "_blank");
  };

  const btnClass = size === "sm"
    ? "px-2 py-1 text-[11px] gap-1"
    : "px-3 py-1.5 text-xs gap-1.5";

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <button
        onClick={handleCall}
        className={cn(
          "inline-flex items-center font-medium rounded-md transition",
          "bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20",
          btnClass
        )}
        title={`Call ${display} via OpenPhone`}
      >
        <Phone className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
        {display}
      </button>
      {showSms && (
        <button
          onClick={handleSms}
          className={cn(
            "inline-flex items-center font-medium rounded-md transition",
            "bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20",
            btnClass
          )}
          title={`Text ${display} via OpenPhone`}
        >
          <MessageSquare className={size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5"} />
        </button>
      )}
    </span>
  );
}

/**
 * Simple phone link that opens OpenPhone on click.
 * Use inline within text.
 */
export function PhoneLink({ phone, className }: { phone: string; className?: string }) {
  if (!phone) return null;

  const normalized = phone.startsWith("+") ? phone : `+1${phone.replace(/\D/g, "")}`;

  return (
    <a
      href={`openphone://dial?phoneNumber=${encodeURIComponent(normalized)}`}
      onClick={(e) => {
        e.preventDefault();
        const w = window.open(`openphone://dial?phoneNumber=${encodeURIComponent(normalized)}`, "_blank");
        if (!w) window.location.href = `tel:${normalized}`;
      }}
      className={cn("text-green-400 hover:text-green-300 hover:underline cursor-pointer", className)}
      title={`Call ${phone} via OpenPhone`}
    >
      {phone}
    </a>
  );
}
