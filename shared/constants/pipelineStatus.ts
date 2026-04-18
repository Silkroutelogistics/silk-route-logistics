// Single source of truth for Lead Hunter pipeline stages.
// Consumed by frontend (via @shared/* alias) and backend (via rootDir="../" + include).
// Keep stage keys, DB status strings, and display labels aligned here.

export type PipelineStage =
  | "LEAD"
  | "CONTACTED"
  | "QUALIFIED"
  | "PROPOSAL"
  | "WON"
  | "NOT_INTERESTED";

export const STATUS_LABELS: Record<PipelineStage, string> = {
  LEAD: "Lead",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  WON: "Won",
  NOT_INTERESTED: "Not Interested",
};

export const STAGE_TO_STATUS: Record<PipelineStage, string> = {
  LEAD: "Prospect",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  WON: "Active",
  NOT_INTERESTED: "Not Interested",
};

export const STATUS_TO_STAGE: Record<string, PipelineStage> = {
  Prospect: "LEAD",
  Contacted: "CONTACTED",
  Qualified: "QUALIFIED",
  Proposal: "PROPOSAL",
  Active: "WON",
  "Not Interested": "NOT_INTERESTED",
};

export const VALID_PIPELINE_STATUSES = [
  "Prospect",
  "Contacted",
  "Qualified",
  "Proposal",
  "Active",
  "Not Interested",
] as const;

export type PipelineStatus = (typeof VALID_PIPELINE_STATUSES)[number];

export function resolveStage(status: string): PipelineStage {
  return STATUS_TO_STAGE[status] || "LEAD";
}

export const NOT_INTERESTED_STATUS: PipelineStatus = "Not Interested";
