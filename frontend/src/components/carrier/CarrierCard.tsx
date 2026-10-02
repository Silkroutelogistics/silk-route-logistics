"use client";

/**
 * A white card on the cream canvas.
 *
 * carrier-portal-upgrade G28/M5 — a card with onClick was a <div> a keyboard
 * could not reach, and it was the main way to choose a load on Available Loads
 * and My Loads. A clickable card is now focusable, answers Enter and Space,
 * shows a focus ring, lifts and gains a gold border on hover, and says when it
 * is the selected one (`selected` sets aria-pressed and a solid gold border).
 */
export function CarrierCard({
  children,
  className = "",
  padding = "p-6",
  hover = false,
  onClick,
  selected,
  label,
}: {
  children: React.ReactNode;
  className?: string;
  padding?: string;
  hover?: boolean;
  onClick?: () => void;
  /** Only meaningful with onClick: whether this card is the chosen one. */
  selected?: boolean;
  /** Only meaningful with onClick: what choosing this card does, for screen readers. */
  label?: string;
}) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      {...(interactive && {
        role: "button",
        tabIndex: 0,
        "aria-pressed": selected ?? undefined,
        "aria-label": label,
        onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
          if (e.target !== e.currentTarget) return; // a button inside the card handles its own keys
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick!();
          }
        },
      })}
      className={`bg-white rounded-lg border ${selected ? "border-[#BA7517] ring-1 ring-[#BA7517]" : "border-[#EFE6D3]"} shadow-[0_1px_3px_rgba(10,37,64,0.04)] ${padding} ${
        hover || interactive
          ? "cursor-pointer transition-[border-color,box-shadow,transform] duration-150 motion-reduce:transition-none motion-reduce:hover:translate-y-0 hover:-translate-y-px hover:border-[#C5A572] hover:shadow-[0_8px_30px_rgba(10,37,64,0.08)] active:translate-y-0"
          : ""
      } ${interactive ? "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517] focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBF7F0]" : ""} ${className}`}
    >
      {children}
    </div>
  );
}
