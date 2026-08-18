/**
 * SRL Self-Authority Monitor — v3.8.asd
 *
 * Every other compliance job in this codebase watches CARRIERS. Nothing
 * watched SRL. Surfaced by the 2026-08-17 compliance architecture audit
 * (docs/audit-reports/compliance-architecture-eld-vin.md, Part 1.2) as the
 * only genuinely existential gap in the compliance surface: a suspended
 * authority stops the company, and SRL would learn from the public record
 * rather than from its surety.
 *
 * Three things this catches that nothing else did:
 *
 *  1. BOND LAPSE. Effective 2026-01-16, FMCSA suspends broker authority when
 *     available financial security falls below $75,000 and is not replenished
 *     within 7 calendar days. The surety gives FMCSA only 30 days' notice
 *     before cancellation. `bipdInsuranceOnFile` flipping false on SRL's own
 *     record is the earliest public signal that the BMC-84 is in trouble.
 *
 *  2. AUTHORITY STATUS CHANGE. Anything other than ACTIVE/AUTHORIZED on our
 *     own record is a stop-work event.
 *
 *  3. FMCSA RECORD COMPROMISE. If our registered address or phone changes and
 *     WE did not change it, someone else did. This is the same attack the
 *     audit named as SRL's sharpest residual exposure — a fraudster editing a
 *     carrier's FMCSA contact record so that callback verification lands on
 *     them. Watching our own record is how we find out it happened to us.
 *
 * Storage: no new Prisma model. The previous snapshot is read back from the
 * most recent SystemLog row with source="srl-self-authority", mirroring the
 * run-summary pattern established for fmcsaComplianceScan in v3.8.ahy.
 * logType is CRON_JOB for the same reason documented there — LogType is a
 * closed Prisma enum and one row type does not justify a migration.
 *
 * Read-path note: this is a MONITOR, not a gate. It never mutates SRL state
 * and never blocks anything. It emails compliance@ and writes a log row.
 */

import { prisma } from "../config/database";
import { verifyCarrierWithFMCSA } from "./fmcsaService";
import { sendEmail, wrap } from "./emailService";
import { log } from "../lib/logger";
import {
  DOT_NUMBER,
  MC_LABEL,
  DOT_LABEL,
  ENTITY_NAME,
  BOND_TYPE,
  BOND_AMOUNT,
  COMPLIANCE_EMAIL,
  PRINCIPAL_ADDRESS_ONE_LINE,
} from "../config/authority";

export const SELF_AUTHORITY_LOG_SOURCE = "srl-self-authority";

/**
 * Snapshot of SRL's own FMCSA record. Every field here is diffed run-over-run;
 * adding a field to this shape automatically adds it to change detection.
 */
interface SelfAuthoritySnapshot {
  verified: boolean;
  legalName: string | null;
  mcNumber: string | null;
  operatingStatus: string | null;
  entityType: string | null;
  /** BIPD/financial-security on file. For a broker this tracks the BMC-84. */
  insuranceOnFile: boolean;
  outOfServiceDate: string | null;
  mcs150Outdated: boolean | null;
  phyStreet: string | null;
  phyCity: string | null;
  phyState: string | null;
  phyZipcode: string | null;
  phone: string | null;
}

/** Human-readable labels for the diff email. Key order drives display order. */
const FIELD_LABELS: Record<keyof SelfAuthoritySnapshot, string> = {
  verified: "FMCSA record resolves",
  legalName: "Legal name",
  mcNumber: "MC number",
  operatingStatus: "Operating status",
  entityType: "Entity type",
  insuranceOnFile: `Financial security on file (${BOND_TYPE})`,
  outOfServiceDate: "Out-of-service date",
  mcs150Outdated: "MCS-150 outdated",
  phyStreet: "Registered street",
  phyCity: "Registered city",
  phyState: "Registered state",
  phyZipcode: "Registered ZIP",
  phone: "Registered phone",
};

interface SelfAuthorityFinding {
  severity: "CRITICAL" | "WARNING";
  message: string;
}

export interface SelfAuthorityResult {
  checked: boolean;
  changed: boolean;
  findings: SelfAuthorityFinding[];
  snapshot: SelfAuthoritySnapshot | null;
  changes: Array<{ field: string; label: string; from: unknown; to: unknown }>;
  error?: string;
}

function toSnapshot(r: Awaited<ReturnType<typeof verifyCarrierWithFMCSA>>): SelfAuthoritySnapshot {
  return {
    verified: r.verified,
    legalName: r.legalName,
    mcNumber: r.mcNumber,
    operatingStatus: r.operatingStatus,
    entityType: r.entityType,
    insuranceOnFile: r.insuranceOnFile,
    outOfServiceDate: r.outOfServiceDate,
    mcs150Outdated: r.mcs150Outdated,
    phyStreet: r.phyStreet,
    phyCity: r.phyCity,
    phyState: r.phyState,
    phyZipcode: r.phyZipcode,
    phone: r.phone,
  };
}

/**
 * Conditions that alert on EVERY run while true, not only on the run where
 * they change. A bond that has been missing for a week is not less urgent on
 * day seven than it was on day one.
 */
export function evaluateCriticalState(
  s: SelfAuthoritySnapshot,
  lookupErrors: string[],
): SelfAuthorityFinding[] {
  const findings: SelfAuthorityFinding[] = [];

  // An unreachable FMCSA is not the same event as a deactivated USDOT number.
  // verifyCarrierWithFMCSA fails safe — it returns verified:false with the
  // reason in errors[] rather than throwing — so treating every unverified
  // result as CRITICAL would email compliance@ on each transient QCMobile
  // outage and train the inbox to ignore this alert. Only an unverified result
  // with a CLEAN lookup is evidence about the registration itself.
  if (!s.verified) {
    findings.push(
      lookupErrors.length > 0
        ? {
            severity: "WARNING",
            message: `FMCSA lookup for ${DOT_LABEL} did not complete: ${lookupErrors.join("; ")}. No conclusion can be drawn about the registration from this run. If this repeats for several days, check SAFER by hand.`,
          }
        : {
            severity: "CRITICAL",
            message: `FMCSA returned no record for ${DOT_LABEL} and reported no error. This is consistent with the USDOT number having been deactivated. Verify at SAFER immediately.`,
          },
    );
  }

  // Negative patterns are tested FIRST and win outright. FMCSA returns the
  // literal string "NOT AUTHORIZED" for a revoked broker, and that string
  // contains "AUTHORIZED" — so a naive substring test for the happy word reads
  // a revoked authority as healthy. Caught by
  // selfAuthorityMonitorService.test.ts before this ever ran.
  //
  // Anything that is neither clearly negative nor clearly positive also falls
  // through to CRITICAL: on our own authority, an unrecognized status is a
  // thing to look at, not a thing to assume is fine.
  const status = (s.operatingStatus || "").toUpperCase().trim();
  const NEGATIVE_STATUS = [
    "NOT AUTHORIZED",
    "REVOKED",
    "SUSPENDED",
    "INACTIVE",
    "OUT OF SERVICE",
    "OUT-OF-SERVICE",
  ];
  const looksNegative = NEGATIVE_STATUS.some((p) => status.includes(p));
  const looksPositive = !looksNegative && (status.includes("AUTHORIZED") || status.includes("ACTIVE"));

  if (s.verified && status && !looksPositive) {
    findings.push({
      severity: "CRITICAL",
      message: `Operating status reads "${s.operatingStatus}". SRL cannot lawfully broker while its authority is not active (49 USC 14916 — brokerage by an unregistered person carries penalties up to $10,000 per violation and reaches officers and directors personally).`,
    });
  }

  if (s.verified && !s.insuranceOnFile) {
    findings.push({
      severity: "CRITICAL",
      message: `No financial security on file. The ${BOND_TYPE} (${BOND_AMOUNT}) may have been cancelled or drawn down. Since 2026-01-16 FMCSA suspends broker authority when available security stays below ${BOND_AMOUNT} for 7 calendar days. Contact the surety today.`,
    });
  }

  if (s.outOfServiceDate) {
    findings.push({
      severity: "CRITICAL",
      message: `An out-of-service date is present on SRL's record: ${s.outOfServiceDate}.`,
    });
  }

  if (s.mcs150Outdated === true) {
    findings.push({
      severity: "WARNING",
      message: `MCS-150 is flagged outdated. Failure to update deactivates the USDOT number. DOT ${DOT_NUMBER} ends in 80 — even next-to-last digit, so the biennial update falls in even years.`,
    });
  }

  return findings;
}

/** Fields whose change is a possible FMCSA-record-compromise signal. */
const CONTACT_FIELDS: Array<keyof SelfAuthoritySnapshot> = [
  "phyStreet",
  "phyCity",
  "phyState",
  "phyZipcode",
  "phone",
  "legalName",
];

async function loadPreviousSnapshot(): Promise<SelfAuthoritySnapshot | null> {
  const prior = await prisma.systemLog.findFirst({
    where: { source: SELF_AUTHORITY_LOG_SOURCE },
    orderBy: { createdAt: "desc" },
    select: { details: true },
  });
  // details is Prisma.JsonValue (a union including primitives), so the cast
  // goes through `unknown` rather than asserting directly onto the shape.
  const details = (prior?.details ?? null) as unknown as { snapshot?: SelfAuthoritySnapshot } | null;
  return details?.snapshot ?? null;
}

function buildEmailHtml(
  snapshot: SelfAuthoritySnapshot,
  findings: SelfAuthorityFinding[],
  changes: SelfAuthorityResult["changes"],
): string {
  const critical = findings.filter((f) => f.severity === "CRITICAL");
  const accent = critical.length > 0 ? "#9B2C2C" : "#B07A1A";
  const heading = critical.length > 0 ? "Action required on SRL's own authority" : "SRL authority record changed";

  const findingRows = findings
    .map(
      (f) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #E2EAF2;font-weight:700;color:${
          f.severity === "CRITICAL" ? "#9B2C2C" : "#B07A1A"
        };white-space:nowrap;vertical-align:top">${f.severity}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #E2EAF2;color:#3A4A5F">${f.message}</td>
      </tr>`,
    )
    .join("");

  const changeRows = changes
    .map(
      (c) => `
      <tr>
        <td style="padding:8px 14px;border-bottom:1px solid #E2EAF2;color:#0A2540;font-weight:600">${c.label}</td>
        <td style="padding:8px 14px;border-bottom:1px solid #E2EAF2;color:#6B7685">${String(c.from ?? "—")}</td>
        <td style="padding:8px 14px;border-bottom:1px solid #E2EAF2;color:#0A2540;font-weight:600">${String(c.to ?? "—")}</td>
      </tr>`,
    )
    .join("");

  const contactChanged = changes.some((c) => CONTACT_FIELDS.includes(c.field as keyof SelfAuthoritySnapshot));

  return wrap(`
    <h2 style="margin:0 0 6px;color:${accent};font-size:20px">${heading}</h2>
    <p style="margin:0 0 18px;color:#3A4A5F">
      Daily check of ${ENTITY_NAME} against the FMCSA public record.
      ${MC_LABEL} &middot; ${DOT_LABEL}
    </p>

    ${
      findings.length > 0
        ? `<table style="width:100%;border-collapse:collapse;margin:0 0 20px;border:1px solid #E2EAF2">
             <tbody>${findingRows}</tbody>
           </table>`
        : ""
    }

    ${
      changes.length > 0
        ? `<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#BA7517">
             What changed since the last check
           </p>
           <table style="width:100%;border-collapse:collapse;margin:0 0 18px;border:1px solid #E2EAF2">
             <thead>
               <tr style="background:#F5EEE0">
                 <th align="left" style="padding:8px 14px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#BA7517">Field</th>
                 <th align="left" style="padding:8px 14px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#BA7517">Was</th>
                 <th align="left" style="padding:8px 14px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#BA7517">Now</th>
               </tr>
             </thead>
             <tbody>${changeRows}</tbody>
           </table>`
        : ""
    }

    ${
      contactChanged
        ? `<div style="background:#F6E3E3;border-left:4px solid #9B2C2C;border-radius:8px;padding:14px 18px;margin:0 0 18px">
             <p style="margin:0;color:#9B2C2C">
               <strong>Registered contact details changed.</strong> If SRL did not file this change,
               treat the FMCSA record as compromised: verify at
               <a href="https://safer.fmcsa.dot.gov/" style="color:#9B2C2C">SAFER</a>,
               and confirm nobody has altered the address of record from
               ${PRINCIPAL_ADDRESS_ONE_LINE}.
             </p>
           </div>`
        : ""
    }

    <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#BA7517">
      Record as of this check
    </p>
    <table style="width:100%;border-collapse:collapse;border:1px solid #E2EAF2">
      <tbody>
        <tr><td style="padding:7px 14px;color:#6B7685">Legal name</td><td style="padding:7px 14px;color:#0A2540">${snapshot.legalName ?? "—"}</td></tr>
        <tr><td style="padding:7px 14px;color:#6B7685">Operating status</td><td style="padding:7px 14px;color:#0A2540">${snapshot.operatingStatus ?? "—"}</td></tr>
        <tr><td style="padding:7px 14px;color:#6B7685">Entity type</td><td style="padding:7px 14px;color:#0A2540">${snapshot.entityType ?? "—"}</td></tr>
        <tr><td style="padding:7px 14px;color:#6B7685">Financial security on file</td><td style="padding:7px 14px;color:#0A2540">${snapshot.insuranceOnFile ? "Yes" : "No"}</td></tr>
        <tr><td style="padding:7px 14px;color:#6B7685">Registered address</td><td style="padding:7px 14px;color:#0A2540">${[snapshot.phyStreet, snapshot.phyCity, snapshot.phyState, snapshot.phyZipcode].filter(Boolean).join(", ") || "—"}</td></tr>
        <tr><td style="padding:7px 14px;color:#6B7685">Registered phone</td><td style="padding:7px 14px;color:#0A2540">${snapshot.phone ?? "—"}</td></tr>
      </tbody>
    </table>

    <p style="margin:18px 0 0;color:#6B7685;font-size:13px">
      Source: FMCSA QCMobile, ${DOT_LABEL}. This check runs daily and only emails on a change or an
      unresolved critical condition &mdash; a quiet inbox means the record is unchanged and clean.
    </p>
  `);
}

/**
 * Daily check of SRL's own FMCSA record.
 * Never throws — the caller is a cron tick and a failure here must not affect
 * the carrier scan that runs alongside it.
 */
export async function checkSelfAuthority(): Promise<SelfAuthorityResult> {
  const empty: SelfAuthorityResult = {
    checked: false,
    changed: false,
    findings: [],
    snapshot: null,
    changes: [],
  };

  let snapshot: SelfAuthoritySnapshot;
  let lookupErrors: string[] = [];
  try {
    const result = await verifyCarrierWithFMCSA(DOT_NUMBER);
    snapshot = toSnapshot(result);
    lookupErrors = result.errors ?? [];
  } catch (err) {
    log.error({ err }, "[SelfAuthority] FMCSA lookup failed for SRL's own DOT");
    return { ...empty, error: err instanceof Error ? err.message : String(err) };
  }

  const previous = await loadPreviousSnapshot().catch((err) => {
    log.warn({ err }, "[SelfAuthority] Could not read previous snapshot; treating as first run");
    return null;
  });

  // Diff. First run has no previous snapshot, so nothing is reported as
  // "changed" — the baseline is simply recorded.
  const changes: SelfAuthorityResult["changes"] = [];
  if (previous) {
    (Object.keys(FIELD_LABELS) as Array<keyof SelfAuthoritySnapshot>).forEach((field) => {
      const from = previous[field];
      const to = snapshot[field];
      if (from !== to) {
        changes.push({ field, label: FIELD_LABELS[field], from, to });
      }
    });
  }

  const findings = evaluateCriticalState(snapshot, lookupErrors);
  const changed = changes.length > 0;
  const critical = findings.some((f) => f.severity === "CRITICAL");

  // Notify on a CHANGE, or on any CRITICAL condition — but NOT on a standing
  // WARNING that hasn't changed. A carrier's MCS-150 sitting outdated for three
  // months would otherwise email compliance@ ninety times, which is how an alert
  // channel gets muted and stops working for the emergency it exists to carry.
  // Standing warnings still ride along in the body when the mail does fire, and
  // land in the SystemLog row every run regardless. A CRITICAL repeats daily by
  // design — a lapsed bond is not less urgent on day seven than on day one.
  const shouldNotify = changed || critical;

  if (shouldNotify) {
    try {
      const subject = critical
        ? `ACTION REQUIRED — SRL authority (${DOT_LABEL})`
        : `SRL authority record changed (${DOT_LABEL})`;
      await sendEmail(COMPLIANCE_EMAIL, subject, buildEmailHtml(snapshot, findings, changes), undefined, {
        replyTo: COMPLIANCE_EMAIL,
      });
    } catch (err) {
      // Non-fatal: the SystemLog row below is the durable record.
      log.error({ err }, "[SelfAuthority] Failed to send compliance notification");
    }
  }

  const severity = critical ? "CRITICAL" : findings.length > 0 || changed ? "WARNING" : "INFO";

  await prisma.systemLog
    .create({
      data: {
        logType: "CRON_JOB",
        severity,
        source: SELF_AUTHORITY_LOG_SOURCE,
        message: shouldNotify
          ? `SRL self-authority check: ${findings.length} finding(s), ${changes.length} field change(s)`
          : "SRL self-authority check: no change, no findings",
        details: {
          checkedAt: new Date().toISOString(),
          dotNumber: DOT_NUMBER,
          snapshot,
          changes,
          findings,
        } as any,
      },
    })
    .catch((err) => log.error({ err }, "[SelfAuthority] Failed to write self-authority log row"));

  return { checked: true, changed, findings, snapshot, changes };
}
