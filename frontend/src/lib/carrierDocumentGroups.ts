/**
 * One source for how the AE carrier Documents panel groups rows and counts them.
 *
 * v3.8.bcb. The panel's header counted `carrierDocs.length` while its rows
 * came from a category map with an exact-match filter and NO fallback, so a
 * document whose docType was not in the map was counted and never rendered.
 * Production 2026-09-17, CJ MASTER FREIGHT: "DOCUMENTS (7)" over six rows; the
 * seventh was the Workers' Comp certificate, docType WORKERS_COMP, which the
 * map did not name. INFO_REQUEST_RESPONSE, POD, RECEIPT_*, TEMP_LOG and
 * SIGNED_BOL_* were invisible the same way.
 *
 * Every document lands in exactly one group. A docType the map does not name
 * goes to the OTHER group beside the literal "OTHER" rows, and carries its raw
 * docType so the AE can see what it is rather than a blank. `total` is the
 * sum of the groups, so the header and the rows cannot disagree.
 */
export interface CarrierDocLike {
  id: string;
  docType: string | null;
}

export interface DocCategory {
  key: string;
  label: string;
}

/** Known categories, in render order. OTHER is last and is also the catch-all. */
export const DOC_CATEGORIES: DocCategory[] = [
  { key: "W9", label: "W-9" },
  { key: "COI", label: "Certificate of Insurance" },
  { key: "AUTHORITY", label: "Operating Authority (MC)" },
  { key: "WORKERS_COMP", label: "Workers' Comp" },
  { key: "BOC3", label: "BOC-3 Filing" },
  { key: "CDL", label: "CDL" },
  { key: "MEDICAL_CARD", label: "Medical Card" },
  { key: "MVR", label: "Motor Vehicle Report" },
  { key: "REGISTRATION", label: "Equipment Registration" },
  { key: "INSPECTION", label: "Inspection Report" },
  { key: "OTHER", label: "Other" },
];

export const OTHER_KEY = "OTHER";

export interface DocGroup<T extends CarrierDocLike> extends DocCategory {
  docs: T[];
}

export interface GroupedCarrierDocs<T extends CarrierDocLike> {
  groups: DocGroup<T>[];
  /** Sum of every group's rows — the number the header must show. */
  total: number;
}

const KNOWN = new Set(DOC_CATEGORIES.map((c) => c.key));

/** True when a row sits in the OTHER group because its type is not one the map names. */
export function isUncategorizedDocType(docType: string | null | undefined): boolean {
  return !docType || !KNOWN.has(docType);
}

export function groupCarrierDocuments<T extends CarrierDocLike>(docs: T[]): GroupedCarrierDocs<T> {
  const buckets = new Map<string, T[]>(DOC_CATEGORIES.map((c) => [c.key, [] as T[]]));
  for (const d of docs) {
    const key = d.docType && KNOWN.has(d.docType) ? d.docType : OTHER_KEY;
    buckets.get(key)!.push(d);
  }
  const groups = DOC_CATEGORIES
    .map((c) => ({ ...c, docs: buckets.get(c.key)! }))
    .filter((g) => g.docs.length > 0);
  return { groups, total: groups.reduce((n, g) => n + g.docs.length, 0) };
}
