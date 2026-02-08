const sizeClass = { sm: "h-7", md: "h-10", lg: "h-12" } as const;

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  return (
    <img src="/logo.png" alt="Silk Route Logistics" className={sizeClass[size]} />
  );
}
