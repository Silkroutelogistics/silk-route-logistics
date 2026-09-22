"use client";

/**
 * Carrier welcome tour — v3.8.bei.
 *
 * Six slides, shown ONCE: the first time an approved, activated, enrolled
 * carrier reaches the portal proper. The layout decides when (it already
 * computes that state for the chrome); this component decides what, and
 * records that it was seen.
 *
 * TWO MODES, one difference. "first-run" stamps CarrierProfile.
 * portalTourCompletedAt on Finish or Skip — either is "seen", and a carrier
 * who skips is not asked again. "replay" (from Settings) stamps nothing:
 * the column answers "when did this carrier first see it", and a replay
 * must not restate that.
 *
 * The copy names only what exists on the portal today and only figures that
 * are already published (§4, §8, §21.1). It is a map, not a pitch: no
 * exclamation points, no superlatives, verbs and numbers.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Compass, Send, Truck, ShieldCheck, DollarSign, GraduationCap,
  ChevronLeft, ChevronRight, X, type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";

export interface TourSlide {
  eyebrow: string;
  title: string;
  body: string;
  icon: LucideIcon;
  /** Where the slide's subject lives, shown as a plain path so the carrier can find it again. */
  where: string;
}

export const TOUR_SLIDES: readonly TourSlide[] = [
  {
    eyebrow: "Approved",
    title: "Welcome to the Caravan Partner Program",
    body: "You are approved and start at Silver. Your Compass Score is visible from your first load. This tour takes about a minute and shows where everything lives. You can replay it from Settings at any time.",
    icon: Compass,
    where: "Dashboard",
  },
  {
    eyebrow: "Offers",
    title: "Tenders",
    body: "Offers from SRL land here. Accept, counter, or decline each one before it expires. When you accept, the rate confirmation comes to your email with a link to sign. A load is yours once that signature is in.",
    icon: Send,
    where: "Tenders",
  },
  {
    eyebrow: "On the road",
    title: "My Loads",
    body: "Advance each load as it moves: at pickup, loaded, in transit, at delivery. Add the driver's name and phone so SRL can verify them before pickup. Upload the proof of delivery within 24 hours of delivering.",
    icon: Truck,
    where: "My Loads",
  },
  {
    eyebrow: "Paperwork",
    title: "Documents and Compliance",
    body: "Keep your certificate of insurance, W-9 and authority letter current. When a policy renews, upload the new certificate here. Your Compass Score reads on-time pickup and delivery, document timeliness, communication and acceptance rate.",
    icon: ShieldCheck,
    where: "Documents, Compliance",
  },
  {
    eyebrow: "Getting paid",
    title: "Payments and Quick Pay",
    body: "Standard pay at Silver is Net-30 with no fee. Quick Pay is a limited pilot: request it from your activation page, SRL approves or declines, and the fee for each load is printed on its rate confirmation before you sign.",
    icon: DollarSign,
    where: "Payments",
  },
  {
    eyebrow: "Your team",
    title: "Drivers and Training",
    body: "Add your drivers to the roster and invite them to SRL Driver Academy. Courses cover ELD and hours of service, cargo securement, roadside inspections and more. Certificates download from the Training page.",
    icon: GraduationCap,
    where: "Drivers, Training",
  },
];

export const TOUR_COMPLETE_ENDPOINT = "/carrier-auth/portal-tour/complete";

interface Props {
  mode: "first-run" | "replay";
  onClose: () => void;
}

export function CarrierWelcomeTour({ mode, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [closing, setClosing] = useState(false);
  const queryClient = useQueryClient();
  const nextRef = useRef<HTMLButtonElement>(null);
  const slide = TOUR_SLIDES[index];
  const last = index === TOUR_SLIDES.length - 1;
  const Icon = slide.icon;

  // Finish and Skip are the same act as far as the record is concerned: the
  // carrier has seen the tour. The stamp is written first, then the query the
  // layout routes on is refreshed, so the tour cannot reopen on the next render
  // of the same session. A failed write still closes the tour: a network
  // hiccup must not trap a carrier behind a welcome screen, and the worst case
  // is that they see it once more.
  const finish = useCallback(async () => {
    if (closing) return;
    setClosing(true);
    if (mode === "first-run") {
      try {
        await api.post(TOUR_COMPLETE_ENDPOINT);
        await queryClient.invalidateQueries({ queryKey: ["carrier-activation"] });
      } catch {
        /* see above */
      }
    }
    onClose();
  }, [closing, mode, onClose, queryClient]);

  const next = useCallback(() => {
    if (last) void finish();
    else setIndex((i) => Math.min(i + 1, TOUR_SLIDES.length - 1));
  }, [last, finish]);
  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    nextRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void finish();
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [finish, next, back]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A2540]/60 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="carrier-tour-title"
      data-testid="carrier-welcome-tour"
    >
      <div className="w-full max-w-xl bg-white rounded-xl shadow-[0_24px_48px_rgba(10,37,64,0.18)] border border-[#EFE6D3] overflow-hidden">
        {/* top rule + close */}
        <div className="h-1 bg-[#C5A572]" />
        <div className="flex items-start justify-between px-6 pt-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#BA7517]" data-testid="tour-eyebrow">
            {slide.eyebrow} · {index + 1} of {TOUR_SLIDES.length}
          </p>
          <button
            type="button"
            onClick={() => void finish()}
            aria-label={mode === "first-run" ? "Skip tour" : "Close"}
            className="p-1 -mr-1 text-[#6B7685] hover:text-[#0A2540] rounded transition"
          >
            <X size={16} />
          </button>
        </div>

        {/* slide */}
        <div className="px-6 pt-4 pb-5">
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-14 h-14 rounded-lg bg-[#F5EEE0] border border-[#EFE6D3] flex items-center justify-center">
              <Icon size={26} className="text-[#0A2540]" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 id="carrier-tour-title" className="font-serif font-bold text-xl text-[#0A2540] leading-tight" data-testid="tour-title">
                {slide.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#3A4A5F]" data-testid="tour-body">{slide.body}</p>
              <p className="mt-3 text-xs text-[#6B7685]">
                Where: <span className="font-medium text-[#0A2540]">{slide.where}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="h-px bg-[#EFE6D3]" />

        {/* progress + controls */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#FBF7F0]">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {TOUR_SLIDES.map((_, i) => (
              <span
                key={i}
                data-testid="tour-dot"
                data-active={i === index ? "true" : "false"}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-[#BA7517]" : "w-1.5 bg-[#C5A572]/60"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {mode === "first-run" && !last && (
              <button
                type="button"
                onClick={() => void finish()}
                className="text-xs text-[#6B7685] hover:text-[#0A2540] px-2 py-1.5"
                data-testid="tour-skip"
              >
                Skip tour
              </button>
            )}
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0A2540] border border-[#EFE6D3] bg-white rounded px-3 py-1.5 hover:bg-[#F5EEE0]"
                data-testid="tour-back"
              >
                <ChevronLeft size={14} aria-hidden="true" /> Back
              </button>
            )}
            <button
              ref={nextRef}
              type="button"
              onClick={next}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#FBF7F0] bg-[#BA7517] hover:brightness-95 rounded px-3.5 py-1.5"
              data-testid="tour-next"
            >
              {last ? (mode === "first-run" ? "Finish" : "Done") : "Next"}
              {!last && <ChevronRight size={14} aria-hidden="true" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
