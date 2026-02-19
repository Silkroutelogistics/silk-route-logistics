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
      className={`bg-white rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-all duration-300 ${
        hover ? "hover:border-[#C9A84C]/30 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]" : ""
      } ${onClick ? "cursor-pointer" : ""} ${padding} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
