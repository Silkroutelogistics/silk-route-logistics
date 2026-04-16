import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../config/database";
import { log } from "../lib/logger";

// ─── Signature ──────────────────────────────────────────────
// Load the real Gmail signature from file (matches whaider@silkroutelogistics.ai exactly)
const SIGNATURE_PATH = join(__dirname, "../config/signatures/whaider.html");
let GMAIL_SIGNATURE: string;
try {
  GMAIL_SIGNATURE = readFileSync(SIGNATURE_PATH, "utf-8");
} catch {
  log.warn(`[EmailBuilder] Signature file not found at ${SIGNATURE_PATH}, using fallback`);
  GMAIL_SIGNATURE = `<!-- SIG_START --><p>Cheers,<br><strong>Wasi Haider</strong><br>Founder & CEO, Silk Route Logistics<br>MC# 01794414 | DOT# 4526880<br>(269) 220-6760<br>whaider@silkroutelogistics.ai</p><!-- SIG_END -->`;
}

export { GMAIL_SIGNATURE };

// ─── Types ──────────────────────────────────────────────────

export interface EmailBuildInput {
  customerId: string;
  contactFirstName?: string;
  touchNumber: number; // 1 = intro, 2-6 = follow-ups
  cluster?: string;    // industry cluster for template selection
  personalizedHook?: string;
  personalizedRelevance?: string;
  subjectOverride?: string;
  bodyOverride?: string;
}

export interface BuiltEmail {
  to: string;
  subject: string;
  bodyPlainText: string;
  bodyHtml: string;
  touchNumber: number;
  templateAngle: string;
}

// ─── Touch 1 Templates (by cluster) ────────────────────────

interface TemplateOutput {
  subject: string;
  body: string; // plain text with line breaks
  angle: string;
}

function touch1Template(firstName: string, hook: string, relevance: string, cluster: string): TemplateOutput {
  // Default hook/relevance if not researched
  const h = hook || "your company's growth in the supply chain space";
  const r = relevance || "your shipping operations involve freight coordination or carrier management";

  return {
    subject: "Quick Intro from a Michigan Brokerage",
    angle: "personalized-intro",
    body: `Morning ${firstName},

With ${h}, there is significant momentum in your space. If ${r}, I would appreciate the opportunity to connect.

Silk Route Logistics is a Michigan-based freight brokerage offering vetted carriers, fast payment, and real-time tracking. As a local provider, we are committed to delivering the high service quality that your customers expect.

I am happy to connect whenever it is convenient for you.`,
  };
}

function touch2Template(firstName: string, hook: string, cluster: string): TemplateOutput {
  const clusterAngles: Record<string, { subject: string; body: string }> = {
    "Food Manufacturing": {
      subject: `${firstName}, FSMA compliance starts at the dock`,
      body: `${firstName},

I noticed your operation handles temperature-sensitive freight. With FSMA enforcement tightening, the carrier you trust with your loads matters more than ever.

Every carrier in our network passes a 35-point compliance check before hauling their first load. For food-grade shipments, that includes reefer certification, temperature monitoring history, and clean inspection records.

If your current broker isn't vetting carriers at that level, it might be worth a conversation.`,
    },
    default: {
      subject: `A different angle, ${firstName}`,
      body: `${firstName},

I wanted to share something specific rather than a generic follow-up. ${hook || "Your industry is seeing significant shifts in freight patterns right now."}

We track real-time rate data across every major lane in your region. I ran a quick analysis and there may be savings opportunities on your high-volume corridors — especially if you're currently locked into annual contracts.

Happy to share the data in a 10-minute call. No commitment, just useful market intelligence.`,
    },
  };

  const tmpl = clusterAngles[cluster] || clusterAngles.default;
  return { ...tmpl, angle: "different-hook" };
}

function touch3Template(firstName: string, _cluster: string): TemplateOutput {
  return {
    subject: `Market snapshot for your lanes, ${firstName}`,
    angle: "value-add",
    body: `${firstName},

No ask today — just sharing something useful.

Dry van rates in the Midwest have softened 4-6% over the past 30 days, with capacity loosening on outbound Michigan and Ohio lanes. If you're shipping into the Southeast or West Coast, spot rates are running below contract benchmarks for the first time since Q3.

If you want a custom breakdown for your specific lanes, just reply with your top 3-5 origins and destinations. I will run the numbers and send them over — no strings attached.`,
  };
}

function touch4Template(firstName: string, cluster: string): TemplateOutput {
  const industryProof: Record<string, string> = {
    "Food Manufacturing": "food and beverage manufacturers running 20+ loads per month",
    "Packaging": "packaging companies managing JIT delivery schedules",
    "Recycling/Metals": "recycling and metals operations with heavy-haul requirements",
    "Chemicals/Coatings": "chemical shippers navigating hazmat compliance",
    default: "mid-market manufacturers running consistent freight programs",
  };

  const proof = industryProof[cluster] || industryProof.default;

  return {
    subject: `Why ${proof.split(" ")[0]} companies trust us, ${firstName}`,
    angle: "social-proof",
    body: `${firstName},

Before starting Silk Route Logistics, I spent years in operations at one of Canada's largest asset-based carriers. That background shapes everything about how we operate — from carrier vetting to claims handling to communication cadence.

We currently serve ${proof}, and our track record speaks for itself: 98% pickup rate, sub-2% claims ratio, and carriers who actually want to haul our freight because we pay in 3 days, not 30.

I would welcome the chance to show you what that looks like in practice.`,
  };
}

function touch5Template(firstName: string): TemplateOutput {
  return {
    subject: `Worth 15 minutes, ${firstName}?`,
    angle: "direct-ask",
    body: `${firstName},

I have been reaching out over the past few weeks and I understand that timing may not have been right. I want to be respectful of your time while making sure you know the offer stands.

Would a 15-minute call work sometime this week or next? I can walk you through our shipper portal, show you live tracking on an active load, and share rate benchmarks for your specific lanes.

If now is not the right time, just say so — no hard feelings at all. I would rather know than keep guessing.`,
  };
}

function touch6Template(firstName: string): TemplateOutput {
  return {
    subject: `Should I stop reaching out, ${firstName}?`,
    angle: "breakup",
    body: `${firstName},

This will be my last note for now. I have reached out a few times and I do not want to overstay my welcome in your inbox.

If freight brokerage is not a priority right now, I completely understand. But if anything changes — capacity crunch, rate spikes, carrier issues — my line is always open. Just reply to this email anytime, even months from now.

Wishing you and your team a strong rest of the quarter.`,
  };
}

// ─── Build Email ────────────────────────────────────────────

function getTemplate(
  touchNumber: number,
  firstName: string,
  hook: string,
  relevance: string,
  cluster: string,
): TemplateOutput {
  switch (touchNumber) {
    case 1: return touch1Template(firstName, hook, relevance, cluster);
    case 2: return touch2Template(firstName, hook, cluster);
    case 3: return touch3Template(firstName, cluster);
    case 4: return touch4Template(firstName, cluster);
    case 5: return touch5Template(firstName);
    case 6: return touch6Template(firstName);
    default: return touch1Template(firstName, hook, relevance, cluster);
  }
}

function plainTextToHtml(text: string): string {
  // Convert plain text paragraphs to HTML <p> tags
  return text
    .split("\n\n")
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p style="margin:0 0 16px 0;line-height:1.6">${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export async function buildEmail(input: EmailBuildInput): Promise<BuiltEmail> {
  // Fetch customer data
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
    select: {
      email: true,
      contactName: true,
      name: true,
      industryType: true,
      personalizedHook: true,
      personalizedRelevance: true,
      sequenceCluster: true,
    },
  });

  if (!customer) throw new Error(`Customer not found: ${input.customerId}`);
  if (!customer.email) throw new Error(`Customer has no email: ${input.customerId}`);

  const fullName = customer.contactName || customer.name;
  const firstName = input.contactFirstName || fullName.split(/\s+/)[0] || fullName;
  const hook = input.personalizedHook || customer.personalizedHook || "";
  const relevance = input.personalizedRelevance || customer.personalizedRelevance || "";
  const cluster = input.cluster || customer.sequenceCluster || customer.industryType || "General Manufacturing";

  const template = getTemplate(input.touchNumber, firstName, hook, relevance, cluster);

  const subject = input.subjectOverride || template.subject;
  const bodyText = input.bodyOverride || template.body;

  // Build HTML: plain-text paragraphs + Gmail signature (no brand chrome)
  const bodyHtml = `<div style="max-width:600px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">
${plainTextToHtml(bodyText)}
<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px">
${GMAIL_SIGNATURE}
</div>
</div>`;

  return {
    to: customer.email,
    subject,
    bodyPlainText: bodyText,
    bodyHtml,
    touchNumber: input.touchNumber,
    templateAngle: template.angle,
  };
}

/**
 * Build email without DB lookup — for preview/draft generation with provided data.
 */
export function buildEmailSync(params: {
  firstName: string;
  email: string;
  touchNumber: number;
  hook?: string;
  relevance?: string;
  cluster?: string;
  subjectOverride?: string;
  bodyOverride?: string;
}): BuiltEmail {
  const template = getTemplate(
    params.touchNumber,
    params.firstName,
    params.hook || "",
    params.relevance || "",
    params.cluster || "General Manufacturing",
  );

  const subject = params.subjectOverride || template.subject;
  const bodyText = params.bodyOverride || template.body;

  const bodyHtml = `<div style="max-width:600px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1a1a1a;line-height:1.6">
${plainTextToHtml(bodyText)}
<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px">
${GMAIL_SIGNATURE}
</div>
</div>`;

  return {
    to: params.email,
    subject,
    bodyPlainText: bodyText,
    bodyHtml,
    touchNumber: params.touchNumber,
    templateAngle: template.angle,
  };
}
