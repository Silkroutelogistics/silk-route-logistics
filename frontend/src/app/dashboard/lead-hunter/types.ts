export {
  STATUS_LABELS,
  STAGE_TO_STATUS,
  STATUS_TO_STAGE,
  VALID_PIPELINE_STATUSES,
  NOT_INTERESTED_STATUS,
  resolveStage,
} from "@shared/constants/pipelineStatus";
export type { PipelineStage, PipelineStatus } from "@shared/constants/pipelineStatus";

import type { PipelineStage } from "@shared/constants/pipelineStatus";

export interface Customer {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  status: string;
  notes: string | null;
  creditLimit: number | null;
  paymentTerms: string | null;
  annualRevenue: number | null;
  industryType: string | null;
  onboardingStatus: string | null;
}

export interface ActivityEvent {
  id: string;
  kind: "call" | "email" | "note" | "stage_change" | "import";
  timestamp: string;
  customerId: string | null;
  customerName: string | null;
  actor: string;
  summary: string;
  detail: string | null;
}

// Spec-aligned badge palette (gray/gold/blue/purple/green/red) — light-panel variant
// used inside the drawer.
export const STAGE_BADGE: Record<PipelineStage, { bg: string; text: string; label: string }> = {
  LEAD:           { bg: "bg-gray-100",   text: "text-gray-700",   label: "Lead" },
  CONTACTED:      { bg: "bg-[#FAEEDA]",  text: "text-[#854F0B]",  label: "Contacted" },
  QUALIFIED:      { bg: "bg-blue-100",   text: "text-blue-700",   label: "Qualified" },
  PROPOSAL:       { bg: "bg-purple-100", text: "text-purple-700", label: "Proposal" },
  WON:            { bg: "bg-green-100",  text: "text-green-700",  label: "Won" },
  NOT_INTERESTED: { bg: "bg-red-100",    text: "text-red-700",    label: "Not Interested" },
};

// Dark-panel variant used by the main Lead Hunter page (navy background).
export const STAGE_BADGE_DARK: Record<PipelineStage, { bg: string; text: string; label: string }> = {
  LEAD:           { bg: "bg-slate-500/20",  text: "text-slate-300",  label: "Lead" },
  CONTACTED:      { bg: "bg-gold/20",       text: "text-gold",       label: "Contacted" },
  QUALIFIED:      { bg: "bg-blue-500/20",   text: "text-blue-400",   label: "Qualified" },
  PROPOSAL:       { bg: "bg-purple-500/20", text: "text-purple-400", label: "Proposal" },
  WON:            { bg: "bg-green-500/20",  text: "text-green-400",  label: "Won" },
  NOT_INTERESTED: { bg: "bg-red-500/20",    text: "text-red-400",    label: "Not Interested" },
};
