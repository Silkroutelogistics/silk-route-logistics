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
      className={`bg-white rounded-md border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ${padding} ${
        hover ? "cursor-pointer transition-all hover:border-[#C9A84C]/30 hover:shadow-[0_8px_30px_rgba(0,0,0,0.06)]" : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}
