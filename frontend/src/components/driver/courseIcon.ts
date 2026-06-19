// v3.8.anp — SRL Driver Academy: course → icon map. Gives each course + lesson
// slide a recognizable visual anchor (Lens 1.6 semantic legibility: one-step
// inference — thermometer=reefer, scale=weigh station, etc.). Falls back to
// BookOpen for any unmapped course.

import {
  BookOpen, Clock, FileText, Scale, Map, Snowflake, Wrench, ClipboardCheck,
  ShieldCheck, Siren, CloudRain, Search, Package, Eye, HardHat, TrainTrack,
  Route, Boxes, Truck, AlertTriangle, BadgeCheck, type LucideIcon,
} from "lucide-react";

const BY_SLUG: Record<string, LucideIcon> = {
  "eld-hos": Clock,
  ifta: FileText,
  irp: FileText,
  "driver-qualification": BadgeCheck,
  "hazmat-awareness": AlertTriangle,
  "hazard-communication": AlertTriangle,
  "pre-post-trip-inspection": ClipboardCheck,
  "cargo-securement": Boxes,
  "reefer-cold-chain": Snowflake,
  "accident-procedures": Siren,
  "adverse-weather-defensive": CloudRain,
  "roadside-inspections-csa": Search,
  "weigh-stations-size-weight": Scale,
  "tracking-check-calls": Map,
  "backing-docking-coupling": Truck,
  "distracted-fatigued-driving": Eye,
  "railroad-crossings-emergencies": TrainTrack,
  "trip-planning-routing": Route,
  "cargo-theft-security": Package,
  "human-trafficking-awareness": ShieldCheck,
  "workplace-dock-safety": HardHat,
  "coercion-professional-conduct": ShieldCheck,
  detention: Clock,
  "detention-documentation": Clock,
  fraud: ShieldCheck,
  "fraud-awareness": ShieldCheck,
};

export function courseIcon(slug?: string | null, category?: string | null): LucideIcon {
  if (slug && BY_SLUG[slug]) return BY_SLUG[slug];
  const hay = `${slug ?? ""} ${category ?? ""}`.toLowerCase();
  if (/reefer|cold|temp/.test(hay)) return Snowflake;
  if (/weigh|size|weight|scale/.test(hay)) return Scale;
  if (/inspect|pre-?trip|dvir/.test(hay)) return ClipboardCheck;
  if (/securement|cargo|load/.test(hay)) return Boxes;
  if (/hazmat|hazard/.test(hay)) return AlertTriangle;
  if (/weather/.test(hay)) return CloudRain;
  if (/fraud|theft|security|traffick/.test(hay)) return ShieldCheck;
  if (/accident|emergency|crossing/.test(hay)) return Siren;
  if (/hours|log|hos|eld/.test(hay)) return Clock;
  if (/route|trip|plan/.test(hay)) return Route;
  if (/wrench|maint/.test(hay)) return Wrench;
  return BookOpen;
}
