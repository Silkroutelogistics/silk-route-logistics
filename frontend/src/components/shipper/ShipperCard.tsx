"use client";

export function ShipperCard({
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
      className={`bg-white rounded-lg border border-[#EFE6D3] shadow-[0_1px_3px_rgba(10,37,64,0.04)] transition-all duration-300 ${
        hover ? "hover:border-[#C5A572]/50 hover:shadow-[0_8px_30px_rgba(10,37,64,0.08)]" : ""
      } ${onClick ? "cursor-pointer" : ""} ${padding} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
