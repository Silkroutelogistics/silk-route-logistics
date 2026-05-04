import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { CEO_NAME, CEO_EMAIL } from "../email/builder";

/**
 * C.5 — Email Auto-Sequences
 * Sequence engine for prospect outreach: Day 0 Introduction, Day 3 Follow-up #1, Day 7 #2, Day 14 #3
 *
 * Emails come from CEO_EMAIL (personal email) so replies land in the Gmail
 * inbox which gmailService monitors. CEO_NAME and CEO_EMAIL are imported from
 * email/builder — single source of truth, no local re-declaration.
 */

const DEFAULT_SCHEDULE = [
  { day: 0, subject: "Quick intro — Silk Route Logistics", template: "introduction" },
  { day: 3, subject: "Following up — freight capacity for your team", template: "followup_1" },
  { day: 7, subject: "Free lane analysis — no strings attached", template: "followup_2" },
  { day: 14, subject: "Last note from me", template: "followup_3" },
];

const CARRIER_SCHEDULE = [
  { day: 0, subject: "Get paid in 3 days, not 30 — Silk Route Logistics", template: "carrier_intro" },
  { day: 3, subject: "No more factoring traps — save $3,600+/year", template: "carrier_quickpay" },
  { day: 7, subject: "Free compliance dashboard for your fleet", template: "carrier_compliance" },
  { day: 14, subject: "Last note — your lanes, your terms", template: "carrier_final" },
];

/**
 * Start an email sequence for a shipper prospect (Customer).
 */
export async function startSequence(
  prospectId: string,
  startedById: string,
  customSchedule?: any[],
) {
  const prospect = await prisma.customer.findUnique({
    where: { id: prospectId },
    select: { id: true, name: true, email: true, contactName: true, status: true },
  });
  if (!prospect) throw new Error("Prospect not found");
  if (!prospect.email) throw new Error("Prospect has no email address");

  const existing = await prisma.emailSequence.findFirst({
    where: { prospectId, status: "ACTIVE" },
  });
  if (existing) throw new Error("Active sequence already exists for this prospect");

  const schedule = customSchedule || DEFAULT_SCHEDULE;
  const now = new Date();
  const firstSendAt = new Date(now.getTime() + 5 * 60 * 1000);

  const sequence = await prisma.emailSequence.create({
    data: {
      prospectId,
      prospectEmail: prospect.email,
      prospectName: prospect.contactName || prospect.name,
      templateName: "prospect_outreach",
      currentStep: 0,
      totalSteps: schedule.length,
      nextSendAt: firstSendAt,
      status: "ACTIVE",
      schedule: schedule as any,
      startedById,
      metadata: { opens: 0, clicks: 0, emailIds: [], engagementScore: 0 } as any,
    },
  });

  log.info(`[Sequence] Started for ${prospect.email} (${schedule.length} steps)`);
  return sequence;
}

/**
 * Start a carrier recruitment email sequence.
 * Uses CarrierProfile instead of Customer. Same engine, carrier templates.
 */
export async function startCarrierSequence(
  carrierId: string,
  carrierEmail: string,
  carrierName: string,
  startedById: string,
): Promise<any> {
  if (!carrierEmail) throw new Error("Carrier has no email address");

  const existing = await prisma.emailSequence.findFirst({
    where: { prospectId: carrierId, status: "ACTIVE" },
  });
  if (existing) throw new Error("Active sequence already exists for this carrier");

  const schedule = CARRIER_SCHEDULE;
  const now = new Date();
  const firstSendAt = new Date(now.getTime() + 5 * 60 * 1000);

  const sequence = await prisma.emailSequence.create({
    data: {
      prospectId: carrierId,
      prospectEmail: carrierEmail,
      prospectName: carrierName,
      templateName: "carrier_recruitment",
      currentStep: 0,
      totalSteps: schedule.length,
      nextSendAt: firstSendAt,
      status: "ACTIVE",
      schedule: schedule as any,
      startedById,
      metadata: { opens: 0, clicks: 0, emailIds: [], engagementScore: 0, type: "carrier" } as any,
    },
  });

  log.info(`[Sequence] Carrier recruitment started for ${carrierEmail} (${schedule.length} steps)`);
  return sequence;
}

/**
 * Stop a sequence.
 */
export async function stopSequence(sequenceId: string, reason: string) {
  const sequence = await prisma.emailSequence.update({
    where: { id: sequenceId },
    data: { status: "STOPPED", stopReason: reason, nextSendAt: null },
  });
  log.info(`[Sequence] Stopped ${sequenceId}: ${reason}`);
  return sequence;
}

/**
 * Stop active sequence by prospect email (called by gmailService on reply detection).
 * Returns the stopped sequence or null if no active sequence found.
 */
export async function stopSequenceByProspectEmail(
  prospectEmail: string,
  reason: string = "REPLIED",
): Promise<any | null> {
  const sequence = await prisma.emailSequence.findFirst({
    where: {
      prospectEmail: { equals: prospectEmail, mode: "insensitive" },
      status: "ACTIVE",
    },
  });
  if (!sequence) return null;

  await prisma.emailSequence.update({
    where: { id: sequence.id },
    data: { status: "STOPPED", stopReason: reason, nextSendAt: null },
  });

  // Notify AE who started the sequence
  if (sequence.startedById) {
    await prisma.notification.create({
      data: {
        userId: sequence.startedById,
        type: "GENERAL",
        title: `Prospect Replied: ${sequence.prospectName}`,
        message: `${sequence.prospectEmail} replied to your outreach (step ${sequence.currentStep}/${sequence.totalSteps}). Sequence auto-stopped. Follow up!`,
        actionUrl: "/dashboard/lead-hunter",
      },
    });
  }

  log.info(`[Sequence] Auto-stopped for ${prospectEmail} — reason: ${reason}`);
  return sequence;
}

/**
 * Get active sequences.
 */
export async function getActiveSequences() {
  return prisma.emailSequence.findMany({
    where: { status: "ACTIVE" },
    orderBy: { nextSendAt: "asc" },
  });
}

/**
 * Calculate engagement score for a prospect based on email interactions.
 * Score 0-100:
 *   - Each open: +5 (max 25)
 *   - Each click: +15 (max 30)
 *   - Replied: +40
 *   - Steps completed without bounce: +5 per step
 */
export function calculateEngagementScore(metadata: any, currentStep: number, replied: boolean): number {
  let score = 0;
  const opens = metadata?.opens || 0;
  const clicks = metadata?.clicks || 0;

  score += Math.min(opens * 5, 25);   // Opens: up to 25
  score += Math.min(clicks * 15, 30); // Clicks: up to 30
  if (replied) score += 40;           // Reply: 40
  score += Math.min(currentStep * 5, 20); // Steps without bounce: up to 20 (step 4 = 20)

  return Math.min(score, 100);
}

/**
 * Get engagement level label from score.
 * Updated v3.6.c: factors in tracking signals from Communication metadata.
 *
 * HOT: Replied with positive intent OR opened 3+ times AND clicked 1+ link
 * WARM: Opened 1-2 times, no reply, no click OR replied neutral
 * COLD: Never opened after 48h OR replied negative/DNC
 */
export function getEngagementLevel(score: number): string {
  if (score >= 60) return "HOT";
  if (score >= 30) return "WARM";
  if (score >= 10) return "COOL";
  return "COLD";
}

/**
 * Classify intent from Communication metadata (v3.6.c tracking).
 * Used by the Replies tab and Queue to show Hot/Warm/Cold badges.
 */
export function classifyIntent(params: {
  hasReplied: boolean;
  replyIntent?: string;
  openCount: number;
  clickCount: number;
  hoursSinceSent: number;
}): "HOT" | "WARM" | "COLD" {
  const { hasReplied, replyIntent, openCount, clickCount, hoursSinceSent } = params;

  // Positive reply = always hot
  if (hasReplied && replyIntent === "INTERESTED") return "HOT";

  // Opened 3+ times and clicked = hot (engaged but hasn't replied)
  if (openCount >= 3 && clickCount >= 1 && !hasReplied) return "HOT";

  // Neutral reply or some engagement = warm
  if (hasReplied && replyIntent === "NEUTRAL") return "WARM";
  if (openCount >= 1 && !hasReplied) return "WARM";

  // Negative reply or DNC = cold
  if (hasReplied && (replyIntent === "OBJECTION" || replyIntent === "UNSUBSCRIBE")) return "COLD";

  // Never opened after 48h = cold
  if (hoursSinceSent > 48 && openCount === 0) return "COLD";

  // Default: warm (too early to tell)
  return "WARM";
}

/**
 * Cron job: hourly — send due emails, advance step or complete.
 */
export async function processDueSequences() {
  const now = new Date();

  const due = await prisma.emailSequence.findMany({
    where: {
      status: "ACTIVE",
      nextSendAt: { lte: now },
    },
    take: 50,
  });

  for (const seq of due) {
    const schedule = seq.schedule as any[];
    const step = schedule[seq.currentStep];
    if (!step) {
      await handleSequenceCompleted(seq);
      continue;
    }

    // Send email from CEO's personal address
    try {
      const html = buildSequenceEmail(step.template, seq.prospectName, seq.currentStep);
      const { sendSequenceEmail } = await import("./emailService");
      await sendSequenceEmail(seq.prospectEmail, step.subject, html, seq.id, {
        fromName: CEO_NAME,
        replyTo: CEO_EMAIL,
      });

      // Log outbound email as Communication for Lead Hunter conversation trail
      const ceoUser = await prisma.user.findFirst({
        where: { role: { in: ["ADMIN", "CEO"] }, isActive: true },
        select: { id: true },
      });
      if (ceoUser) {
        await prisma.communication.create({
          data: {
            type: "EMAIL_OUTBOUND",
            direction: "OUTBOUND",
            entityType: "SHIPPER",
            entityId: seq.prospectId,
            from: CEO_EMAIL,
            to: seq.prospectEmail,
            subject: step.subject,
            body: `[Auto-sequence step ${seq.currentStep + 1}/${seq.totalSteps}]`,
            userId: ceoUser.id,
            metadata: { sequenceId: seq.id, step: seq.currentStep, template: step.template, source: "EmailSequence" },
          },
        });
      }

      log.info(`[Sequence] Sent step ${seq.currentStep + 1}/${seq.totalSteps} to ${seq.prospectEmail}: ${step.subject}`);
    } catch (err) {
      log.error({ err: err }, `[Sequence] Failed to send email to ${seq.prospectEmail}:`);
    }

    // Update engagement score
    const meta = (seq.metadata as any) || {};
    meta.engagementScore = calculateEngagementScore(meta, seq.currentStep + 1, false);

    // Advance to next step
    const nextStep = seq.currentStep + 1;
    if (nextStep >= seq.totalSteps) {
      await handleSequenceCompleted(seq);
    } else {
      const nextDay = schedule[nextStep].day;
      const currentDay = step.day;
      const daysUntilNext = nextDay - currentDay;
      const nextSendAt = new Date(now.getTime() + daysUntilNext * 24 * 60 * 60 * 1000);

      await prisma.emailSequence.update({
        where: { id: seq.id },
        data: { currentStep: nextStep, nextSendAt, metadata: meta },
      });
    }
  }
}

/**
 * Handle sequence completion — create follow-up reminder if no reply.
 */
async function handleSequenceCompleted(seq: any) {
  const meta = (seq.metadata as any) || {};
  meta.engagementScore = calculateEngagementScore(meta, seq.totalSteps, false);
  const level = getEngagementLevel(meta.engagementScore);

  await prisma.emailSequence.update({
    where: { id: seq.id },
    data: {
      currentStep: seq.totalSteps,
      status: "COMPLETED",
      nextSendAt: null,
      metadata: meta,
    },
  });

  // Create follow-up reminder for AE
  const admins = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "CEO"] }, isActive: true },
    select: { id: true },
  });

  for (const admin of admins) {
    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: "GENERAL",
        title: `Sequence completed: ${seq.prospectName}`,
        message: `4-email sequence to ${seq.prospectEmail} finished with no reply. Engagement: ${level} (${meta.engagementScore}/100). ${level === "HOT" || level === "WARM" ? "Consider a phone call follow-up." : "Re-engage in 30 days or archive."}`,
        actionUrl: "/dashboard/lead-hunter",
      },
    });
  }

  log.info(`[Sequence] Completed for ${seq.prospectEmail} — engagement: ${level} (${meta.engagementScore})`);
}

/**
 * Handle Resend webhook events (delivered, opened, clicked, replied, bounced)
 */
export async function handleResendWebhook(event: {
  type: string;
  data: { email_id?: string; to?: string | string[]; from?: string; subject?: string; headers?: any };
}) {
  const eventType = event.type;

  if (eventType === "email.opened" || eventType === "email.clicked") {
    const to = event.data.to;
    const email = Array.isArray(to) ? to[0] : to;
    if (email) {
      const sequence = await prisma.emailSequence.findFirst({
        where: { prospectEmail: { equals: email, mode: "insensitive" }, status: "ACTIVE" },
      });
      if (sequence) {
        const meta = (sequence.metadata as any) || {};
        if (eventType === "email.opened") meta.opens = (meta.opens || 0) + 1;
        if (eventType === "email.clicked") meta.clicks = (meta.clicks || 0) + 1;
        meta.engagementScore = calculateEngagementScore(meta, sequence.currentStep, false);
        await prisma.emailSequence.update({
          where: { id: sequence.id },
          data: { metadata: meta },
        });
        log.info(`[Sequence] ${eventType} for ${email} — score: ${meta.engagementScore}`);
      }
    }
  }

  // On bounce: stop sequence
  if (eventType === "email.bounced") {
    const to = event.data.to;
    const email = Array.isArray(to) ? to[0] : to;
    if (email) {
      await stopSequenceByProspectEmail(email, "BOUNCED");
    }
  }

  // On reply via Resend: stop sequence (backup to Gmail detection)
  if (eventType === "email.replied") {
    const from = event.data.from;
    if (from) {
      await stopSequenceByProspectEmail(from, "REPLIED");
    }
  }
}

/**
 * Check if prospect moved past Contacted stage — stop sequence.
 */
export async function checkProspectStageChange(prospectId: string, newStatus: string) {
  const pastContactedStatuses = ["ACTIVE", "DECLINED", "SUSPENDED"];
  if (pastContactedStatuses.includes(newStatus)) {
    const sequence = await prisma.emailSequence.findFirst({
      where: { prospectId, status: "ACTIVE" },
    });
    if (sequence) {
      await stopSequence(sequence.id, "STAGE_CHANGE");
    }
  }
}

/** Email signature — loaded from backend/src/config/signatures/whaider.html via builder. */
import { GMAIL_SIGNATURE } from "../email/builder";
const EMAIL_SIGNATURE = GMAIL_SIGNATURE;

/**
 * Build personal-style email for prospect outreach.
 * No brand headers/footers — looks like a real email from Wasi.
 * Includes the standard email signature on all templates.
 */
function buildSequenceEmail(template: string, name: string, step: number): string {
  const firstName = name.split(" ")[0] || name;

  const bodies: Record<string, string> = {
    introduction: `
      <p>Hi ${firstName},</p>
      <p>I'm Wasi, founder of Silk Route Logistics here in Galesburg, Michigan. I came across your company and thought there might be a fit.</p>
      <p>We're a freight brokerage that runs on technology — real-time tracking on every load, 98% pickup rate, and I personally manage every account. No call centers, no runaround.</p>
      <p>Would you have 10 minutes this week for a quick call? I'd love to hear about your shipping lanes and see if we can help.</p>
      <p>Best,</p>
    `,
    followup_1: `
      <p>Hi ${firstName},</p>
      <p>Just bumping this up in case my last email got buried. I know inboxes can be brutal.</p>
      <p>Quick background: we handle dry van, flatbed, reefer, and specialized — coast to coast. What makes us different is the tech and the personal touch. You'll always have my direct line, and every load gets GPS tracking from pickup to delivery.</p>
      <p>Happy to jump on a 10-minute call whenever works for you. No pressure at all.</p>
      <p>Best,</p>
    `,
    followup_2: `
      <p>Hi ${firstName},</p>
      <p>I realize timing is everything — if you're all set with your current carriers, I totally get it. But in case you ever need backup capacity or want to compare rates on a tricky lane, I'm here.</p>
      <p>I'm happy to run a free lane analysis for you — just send me your top 3-5 lanes and I'll come back with competitive pricing. No obligation, no follow-up calls from a sales team. Just me.</p>
      <p>Let me know if that's useful.</p>
      <p>Best,</p>
    `,
    followup_3: `
      <p>Hi ${firstName},</p>
      <p>Last note from me — I promise I won't keep filling your inbox.</p>
      <p>If you ever need a reliable freight partner, a last-minute truck, or just want a second opinion on rates — my door is always open. Feel free to reply to this email anytime, even months from now.</p>
      <p>Wishing you and your team a great rest of the quarter.</p>
    `,

    // ── Carrier Recruitment Templates ──
    carrier_intro: `
      <p>Hi ${firstName},</p>
      <p>I'm Wasi, founder of Silk Route Logistics in Galesburg, Michigan. I came across your authority and wanted to reach out.</p>
      <p>We're a freight brokerage that pays carriers in <strong>3 days, not 30</strong>. No factoring company needed. Our QuickPay program has zero contracts, zero hidden fees, and zero reserve holdback — just a flat 1.5-3% fee that saves our carriers <strong>$3,600+ per year</strong> compared to traditional factoring.</p>
      <p>If you're running lanes in the Midwest or cross-country, I'd love to get you set up on our load board. We have consistent freight and I personally work with every carrier in our network.</p>
      <p>Would you have 5 minutes for a quick call, or just reply to this email? I'll get you onboarded same day.</p>
      <p>Best,</p>
    `,
    carrier_quickpay: `
      <p>Hi ${firstName},</p>
      <p>Quick follow-up on my last email. I know most carriers are stuck choosing between waiting 30-45 days for broker payment or paying 4-5% to a factoring company. That math is brutal — a 30-day payment delay costs the average owner-operator <strong>$13,000-$48,000 per year</strong> in real costs (bridge financing, missed fuel discounts, deferred maintenance).</p>
      <p>At SRL, our QuickPay works differently:</p>
      <ul style="line-height:2">
        <li><strong>1.5-3% flat fee</strong> — no ACH fees, no processing fees, no monthly minimums</li>
        <li><strong>No contracts</strong> — use it on any load, skip it on others, cancel anytime</li>
        <li><strong>No reserve holdback</strong> — you get the full amount minus the fee, same week</li>
        <li><strong>No credit check on you</strong> — we vet the shippers, not the carriers</li>
      </ul>
      <p>Plus, our top carriers earn their way to PLATINUM tier — <strong>1.5% QuickPay with Net-3 payment</strong>. The more loads you run with us, the better your terms get.</p>
      <p>Interested? Just reply and I'll send you a registration link.</p>
      <p>Wasi</p>
    `,
    carrier_compliance: `
      <p>Hi ${firstName},</p>
      <p>One more thing I wanted to mention — every carrier in our network gets a free compliance dashboard. No charge, no catch.</p>
      <p>What you get:</p>
      <ul style="line-height:2">
        <li><strong>FMCSA authority monitoring</strong> — we alert you if anything changes on your DOT record</li>
        <li><strong>CSA score tracking</strong> — see your BASIC scores and get notified of inspection results</li>
        <li><strong>Insurance expiry alerts</strong> — never let your COI lapse by accident</li>
        <li><strong>Safety scorecard</strong> — track your on-time rate, claim ratio, and performance tier</li>
      </ul>
      <p>We also have a strict <strong>no double-brokering policy</strong>. Your load stays on your truck. Period. That's our commitment — we think it's the minimum a carrier should expect from a broker.</p>
      <p>If any of this sounds useful, reply and I'll get you set up.</p>
      <p>Wasi</p>
    `,
    carrier_final: `
      <p>Hi ${firstName},</p>
      <p>Last note from me — I respect your inbox and won't keep sending.</p>
      <p>If you ever need consistent freight on your lanes, faster payment than your current broker, or just want to see what loads we have available — reply to this email anytime. Even months from now.</p>
      <p>We're a small operation that treats carriers like partners, not interchangeable trucks. Our best carriers earn PLATINUM status: 1.5% QuickPay, Net-3 payment, priority load access, and a dedicated point of contact (me).</p>
      <p>Wishing you safe miles and good rates.</p>
    `,
  };

  const body = bodies[template] || bodies.introduction;

  // Personal email style + consistent signature
  return `<div style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.6;font-size:15px">${body}${EMAIL_SIGNATURE}</div>`;
}

/** Export signature for use in mass emails */
export { EMAIL_SIGNATURE };
