"use client";

import { useState } from "react";
import { Copy, Check, MapPin, Phone, Mail } from "lucide-react";
import { money } from "@/lib/rateDisplay";

/**
 * carrier-portal-upgrade M5 "carrier utility": the small things a carrier on a
 * phone reaches for. Copy a load number or an address, open a stop in maps,
 * call or email the SRL rep, and see the rate per mile next to every rate.
 */

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]";

/** A 44px copy button with an accessible name, and a "Copied" confirmation that is announced. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation(); // never also select the card the button sits on
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard refused (an insecure origin or a denied permission): nothing to undo */
        }
      }}
      aria-label={copied ? `${label} copied` : `Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#5B6B7D] transition-colors duration-150 motion-reduce:transition-none hover:bg-[#F5EEE0] hover:text-[#0A2540] ${FOCUS}`}
    >
      {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      <span role="status" className="sr-only">{copied ? "Copied" : ""}</span>
    </button>
  );
}

/** Rate per mile, or null when either side is missing or zero. */
export function ratePerMile(amount: number | null | undefined, miles: number | null | undefined): number | null {
  if (!amount || !miles || miles <= 0) return null;
  return amount / miles;
}

/** The rate, with its per-mile figure beside it when the distance is known. */
export function RateWithRpm({ amount, miles, className = "" }: { amount: number | null | undefined; miles: number | null | undefined; className?: string }) {
  const rpm = ratePerMile(amount, miles);
  return (
    <span className={className}>
      {money(amount)}
      {rpm !== null && <span className="ml-1 text-[11px] font-medium text-[#5B6B7D]">(${rpm.toFixed(2)}/mi)</span>}
    </span>
  );
}

/** A stop that opens in the phone's maps app (or Google Maps on a desktop). */
export function MapsLink({ address, children }: { address: string; children: React.ReactNode }) {
  return (
    <a
      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={`inline-flex items-center gap-1 rounded underline-offset-2 hover:underline ${FOCUS}`}
      aria-label={`Open ${address} in maps`}
    >
      <MapPin size={12} className="shrink-0 text-[#854F0B]" aria-hidden="true" />
      {children}
    </a>
  );
}

type Rep = { firstName?: string | null; lastName?: string | null; company?: string | null; phone?: string | null; email?: string | null };

/** The SRL rep on a load: name, and tap-to-call and tap-to-email when the server sent them. */
export function RepContact({ rep }: { rep: Rep }) {
  const name = [rep.firstName, rep.lastName].filter(Boolean).join(" ") || rep.company || "Your SRL rep";
  const link = `inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 font-medium text-[#0A2540] hover:bg-[#F5EEE0] transition-colors duration-150 motion-reduce:transition-none ${FOCUS}`;
  return (
    <div className="flex flex-wrap items-center gap-x-1">
      <span className="text-[#5B6B7D]">Your SRL rep:</span>
      <span className="font-medium text-[#0A2540]">{name}</span>
      {rep.phone && (
        <a href={`tel:${rep.phone}`} className={link} aria-label={`Call ${name}`}>
          <Phone size={13} aria-hidden="true" /> {rep.phone}
        </a>
      )}
      {rep.email && (
        <a href={`mailto:${rep.email}`} className={link} aria-label={`Email ${name}`}>
          <Mail size={13} aria-hidden="true" /> Email
        </a>
      )}
      {!rep.phone && !rep.email && (
        <a href="tel:+12692206760" className={link}>
          <Phone size={13} aria-hidden="true" /> (269) 220-6760
        </a>
      )}
    </div>
  );
}
