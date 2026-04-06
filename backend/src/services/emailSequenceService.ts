import { prisma } from "../config/database";

/**
 * C.5 — Email Auto-Sequences
 * Sequence engine for prospect outreach: Day 0 Introduction, Day 3 Follow-up #1, Day 7 #2, Day 14 #3
 *
 * Emails come from whaider@silkroutelogistics.ai (CEO personal email) so replies
 * land in the Gmail inbox which gmailService monitors.
 */

const CEO_EMAIL = "whaider@silkroutelogistics.ai";
const CEO_NAME = "Wasih Haider";

const DEFAULT_SCHEDULE = [
  {
    day: 0,
    subject: "Quick intro — Silk Route Logistics",
    template: "introduction",
  },
  {
    day: 3,
    subject: "Following up — freight capacity for your team",
    template: "followup_1",
  },
  {
    day: 7,
    subject: "Free lane analysis — no strings attached",
    template: "followup_2",
  },
  {
    day: 14,
    subject: "Last note from me",
    template: "followup_3",
  },
];

/**
 * Start an email sequence for a prospect.
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

  console.log(`[Sequence] Started for ${prospect.email} (${schedule.length} steps)`);
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
  console.log(`[Sequence] Stopped ${sequenceId}: ${reason}`);
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

  console.log(`[Sequence] Auto-stopped for ${prospectEmail} — reason: ${reason}`);
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
 */
export function getEngagementLevel(score: number): string {
  if (score >= 60) return "HOT";
  if (score >= 30) return "WARM";
  if (score >= 10) return "COOL";
  return "COLD";
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

      console.log(`[Sequence] Sent step ${seq.currentStep + 1}/${seq.totalSteps} to ${seq.prospectEmail}: ${step.subject}`);
    } catch (err) {
      console.error(`[Sequence] Failed to send email to ${seq.prospectEmail}:`, err);
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

  console.log(`[Sequence] Completed for ${seq.prospectEmail} — engagement: ${level} (${meta.engagementScore})`);
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
        console.log(`[Sequence] ${eventType} for ${email} — score: ${meta.engagementScore}`);
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

/**
 * Build personal-style email for prospect outreach.
 * No brand headers/footers — looks like a real email from Wasih.
 */
function buildSequenceEmail(template: string, name: string, step: number): string {
  const firstName = name.split(" ")[0] || name;

  const bodies: Record<string, string> = {
    introduction: `
      <p>Hi ${firstName},</p>
      <p>I'm Wasih, founder of Silk Route Logistics here in Kalamazoo, Michigan. I came across your company and thought there might be a fit.</p>
      <p>We're a freight brokerage that runs on technology — real-time tracking on every load, 98% pickup rate, and I personally manage every account. No call centers, no runaround.</p>
      <p>Would you have 10 minutes this week for a quick call? I'd love to hear about your shipping lanes and see if we can help.</p>
      <p>Best,<br>Wasih Haider<br><span style="color:#64748b;font-size:13px">Silk Route Logistics | silkroutelogistics.ai<br>Kalamazoo, MI</span></p>
    `,
    followup_1: `
      <p>Hi ${firstName},</p>
      <p>Just bumping this up in case my last email got buried. I know inboxes can be brutal.</p>
      <p>Quick background: we handle dry van, flatbed, reefer, and specialized — coast to coast. What makes us different is the tech and the personal touch. You'll always have my direct line, and every load gets GPS tracking from pickup to delivery.</p>
      <p>Happy to jump on a 10-minute call whenever works for you. No pressure at all.</p>
      <p>Wasih</p>
    `,
    followup_2: `
      <p>Hi ${firstName},</p>
      <p>I realize timing is everything — if you're all set with your current carriers, I totally get it. But in case you ever need backup capacity or want to compare rates on a tricky lane, I'm here.</p>
      <p>I'm happy to run a free lane analysis for you — just send me your top 3-5 lanes and I'll come back with competitive pricing. No obligation, no follow-up calls from a sales team. Just me.</p>
      <p>Let me know if that's useful.</p>
      <p>Wasih</p>
    `,
    followup_3: `
      <p>Hi ${firstName},</p>
      <p>Last note from me — I promise I won't keep filling your inbox.</p>
      <p>If you ever need a reliable freight partner, a last-minute truck, or just want a second opinion on rates — my door is always open. Feel free to reply to this email anytime, even months from now.</p>
      <p>Wishing you and your team a great rest of the quarter.</p>
      <p>Wasih Haider<br><span style="color:#64748b;font-size:13px">Silk Route Logistics<br>whaider@silkroutelogistics.ai</span></p>
    `,
  };

  const body = bodies[template] || bodies.introduction;

  // Personal email style — no branded header/footer, just clean text
  return `<div style="max-width:600px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;line-height:1.6;font-size:15px">${body}</div>`;
}
