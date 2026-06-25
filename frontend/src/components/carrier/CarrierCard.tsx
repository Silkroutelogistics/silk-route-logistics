"use client";

export function CarrierCard({
  children,
  className = "",
  padding = "p-6",
  hover = false,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: string;
  hover?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-[#EFE6D3] shadow-[0_1px_3px_rgba(10,37,64,0.04)] ${padding} ${
        hover ? "cursor-pointer transition-all hover:border-[#C5A572]/50 hover:shadow-[0_8px_30px_rgba(10,37,64,0.08)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
