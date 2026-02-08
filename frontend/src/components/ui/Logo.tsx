"use client";

import Image from "next/image";
import { useState } from "react";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const [imgError, setImgError] = useState(false);
  const dims = size === "lg" ? { w: 48, h: 48 } : size === "md" ? { w: 36, h: 36 } : { w: 28, h: 28 };
  const textSize = size === "lg" ? "text-2xl" : size === "md" ? "text-xl" : "text-lg";

  if (imgError) {
    return <span className={`${textSize} font-bold text-gold`}>SRL</span>;
  }

  return (
    <Image
      src="/logo.png"
      alt="Silk Route Logistics"
      width={dims.w}
      height={dims.h}
      className="object-contain"
      onError={() => setImgError(true)}
      unoptimized
    />
  );
}
