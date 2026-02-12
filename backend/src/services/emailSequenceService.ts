import { prisma } from "../config/database";

/**
 * C.5 — Email Auto-Sequences
 * Sequence engine for prospect outreach: Day 0 Introduction, Day 3 Follow-up #1, Day 7 #2, Day 14 #3
 */

const DEFAULT_SCHEDULE = [
  {
    day: 0,
    subject: "Introducing Silk Route Logistics — Your Freight Partner",
    template: "introduction",
  },
  {
    day: 3,
    subject: "Following Up — How Can SRL Help Your Shipping Needs?",
    template: "followup_1",
  },
  {
    day: 7,
    subject: "Still Looking for a Reliable Freight Partner?",
    template: "followup_2",
  },
  {
    day: 14,
    subject: "Last Check-In — Let's Connect When You're Ready",
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
  // Get prospect info from Customer table
  const prospect = await prisma.customer.findUnique({
    where: { id: prospectId },
    select: { id: true, name: true, email: true, contactName: true, status: true },
  });
  if (!prospect) throw new Error("Prospect not found");
  if (!prospect.email) throw new Error("Prospect has no email address");

  // Check if sequence already exists
  const existing = await prisma.emailSequence.findFirst({
    where: { prospectId, status: "ACTIVE" },
  });
  if (existing) throw new Error("Active sequence already exists for this prospect");

  const schedule = customSchedule || DEFAULT_SCHEDULE;
  const now = new Date();
  const firstSendAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 min from now for Day 0

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
      metadata: { opens: 0, clicks: 0, emailIds: [] } as any,
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
 * Get active sequences.
 */
export async function getActiveSequences() {
  return prisma.emailSequence.findMany({
    where: { status: "ACTIVE" },
    orderBy: { nextSendAt: "asc" },
  });
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
      // No more steps — mark completed
      await prisma.emailSequence.update({
        where: { id: seq.id },
        data: { status: "COMPLETED", nextSendAt: null },
      });
      continue;
    }

    // Send email
    try {
      const html = buildSequenceEmail(step.template, seq.prospectName, seq.currentStep);
      const { sendSequenceEmail } = await import("./emailService");
      await sendSequenceEmail(seq.prospectEmail, step.subject, html, seq.id);

      console.log(`[Sequence] Sent step ${seq.currentStep + 1}/${seq.totalSteps} to ${seq.prospectEmail}: ${step.subject}`);
    } catch (err) {
      console.error(`[Sequence] Failed to send email to ${seq.prospectEmail}:`, err);
    }

    // Advance to next step
    const nextStep = seq.currentStep + 1;
    if (nextStep >= seq.totalSteps) {
      await prisma.emailSequence.update({
        where: { id: seq.id },
        data: { currentStep: nextStep, status: "COMPLETED", nextSendAt: null },
      });
    } else {
      const nextDay = schedule[nextStep].day;
      const currentDay = step.day;
      const daysUntilNext = nextDay - currentDay;
      const nextSendAt = new Date(now.getTime() + daysUntilNext * 24 * 60 * 60 * 1000);

      await prisma.emailSequence.update({
        where: { id: seq.id },
        data: { currentStep: nextStep, nextSendAt },
      });
    }
  }
}

/**
 * Handle Resend webhook events (delivered, opened, clicked, replied)
 */
export async function handleResendWebhook(event: {
  type: string;
  data: { email_id?: string; to?: string; from?: string; subject?: string; headers?: any };
}) {
  const eventType = event.type; // email.delivered, email.opened, email.clicked, email.bounced

  if (eventType === "email.opened" || eventType === "email.clicked") {
    // Track opens/clicks
    const to = event.data.to;
    if (to) {
      const sequence = await prisma.emailSequence.findFirst({
        where: { prospectEmail: Array.isArray(to) ? to[0] : to, status: "ACTIVE" },
      });
      if (sequence) {
        const meta = (sequence.metadata as any) || {};
        if (eventType === "email.opened") meta.opens = (meta.opens || 0) + 1;
        if (eventType === "email.clicked") meta.clicks = (meta.clicks || 0) + 1;
        await prisma.emailSequence.update({
          where: { id: sequence.id },
          data: { metadata: meta },
        });
      }
    }
  }

  // On reply: stop sequence and notify AE
  if (eventType === "email.replied" || eventType === "email.bounced") {
    const to = event.data.from; // The reply "from" is the prospect
    if (to) {
      const sequence = await prisma.emailSequence.findFirst({
        where: { prospectEmail: to, status: "ACTIVE" },
      });
      if (sequence) {
        await prisma.emailSequence.update({
          where: { id: sequence.id },
          data: { status: "STOPPED", stopReason: "REPLIED", nextSendAt: null },
        });

        // Notify AE who started the sequence
        if (sequence.startedById) {
          await prisma.notification.create({
            data: {
              userId: sequence.startedById,
              type: "GENERAL",
              title: `Prospect Replied: ${sequence.prospectName}`,
              message: `${sequence.prospectEmail} replied to your outreach sequence. Follow up!`,
              actionUrl: `/ae/crm.html`,
            },
          });
        }

        console.log(`[Sequence] Stopped — prospect ${to} replied`);
      }
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

function buildSequenceEmail(template: string, name: string, step: number): string {
  const firstName = name.split(" ")[0] || name;
  const brandHeader = `<div style="background:#0f172a;padding:24px;text-align:center;border-bottom:3px solid #d4a574"><h1 style="color:#d4a574;margin:0;font-family:Georgia,serif">Silk Route Logistics</h1></div>`;
  const brandFooter = `<div style="background:#1e293b;padding:16px;text-align:center;color:#94a3b8;font-size:12px"><p style="margin:0">Silk Route Logistics &bull; silkroutelogistics.ai</p></div>`;

  const bodies: Record<string, string> = {
    introduction: `
      <p>Hi ${firstName},</p>
      <p>I'm reaching out from <strong>Silk Route Logistics</strong>. We specialize in reliable, technology-driven freight brokerage across the US — with real-time tracking, competitive rates, and dedicated account management.</p>
      <p>I'd love to learn more about your shipping needs and see if we can be a great freight partner for your business.</p>
      <p>Would you be open to a quick 10-minute call this week?</p>
      <p>Best regards,<br><strong>Silk Route Logistics Team</strong></p>
    `,
    followup_1: `
      <p>Hi ${firstName},</p>
      <p>Just following up on my earlier note. I wanted to make sure it didn't get buried in your inbox.</p>
      <p>At SRL, we handle everything from dry van to flatbed to reefer — with an average pickup rate of 98% and real-time load tracking for every shipment.</p>
      <p>Happy to share more details or set up a quick intro call at your convenience.</p>
      <p>Best,<br><strong>Silk Route Logistics Team</strong></p>
    `,
    followup_2: `
      <p>Hi ${firstName},</p>
      <p>I know timing is everything. If you're currently happy with your freight partners, great! But if you ever need backup capacity, competitive spot rates, or someone who picks up the phone on the first ring — we're here.</p>
      <p>Our clients consistently see 15-20% savings on their freight spend. I'd be happy to run a lane analysis for you at no cost.</p>
      <p>Let me know if that sounds helpful.</p>
      <p>Cheers,<br><strong>Silk Route Logistics Team</strong></p>
    `,
    followup_3: `
      <p>Hi ${firstName},</p>
      <p>This is my last follow-up for now — I don't want to clutter your inbox. But I wanted to leave the door open.</p>
      <p>If you ever need help with a lane, a last-minute load, or just want to compare rates — feel free to reach out anytime. We're always happy to help.</p>
      <p>Wishing you continued success!</p>
      <p>Best regards,<br><strong>Silk Route Logistics Team</strong></p>
    `,
  };

  const body = bodies[template] || bodies.introduction;
  return `${brandHeader}<div style="padding:32px;font-family:-apple-system,sans-serif;color:#334155;line-height:1.6">${body}</div>${brandFooter}`;
}
