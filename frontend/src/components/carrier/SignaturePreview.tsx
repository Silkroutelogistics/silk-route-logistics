"use client";

import { signatureFont } from "@/lib/signatureFont";

/**
 * What the carrier's typed name will look like on the SIGNATURE line of the
 * executed agreement: the name in the signature face over the line, and
 * "Electronically signed" under it, as the PDF draws it. Nothing renders until
 * a name has been typed.
 */
export function SignaturePreview({ name }: { name: string }) {
  const typed = name.trim();
  if (!typed) return null;
  return (
    <div className="mb-3" aria-live="polite">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">Your signature</p>
      <div className="rounded-lg border border-[#EFE6D3] bg-[#FFFFFF] px-4 pt-2 pb-1.5">
        <span
          data-testid="signature-preview-name"
          className={`${signatureFont.className} block truncate text-[34px] leading-tight text-[#0A2540]`}
        >
          {typed}
        </span>
        <div className="border-t border-[#0A2540]/30 pt-1 text-right text-[11px] italic text-gray-500">
          Electronically signed
        </div>
      </div>
      <p className="text-[11px] text-gray-500 mt-1">
        This is how your signature appears on the signature line of the executed agreement.
      </p>
    </div>
  );
}
