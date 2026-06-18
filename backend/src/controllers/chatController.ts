import { Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { AuthRequest } from "../middleware/auth";
import { executeTool, TOOL_DEFINITIONS, ToolContext } from "../services/marcoPoloService";
import { log } from "../lib/logger";

// ── AI Provider Setup ──────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const gemini = env.GEMINI_API_KEY ? new GoogleGenerativeAI(env.GEMINI_API_KEY) : null;

function isConfigured(): boolean {
  return !!ANTHROPIC_API_KEY || !!gemini;
}

// ── System Prompts ─────────────────────────────────────────────

// v3.8.akx — System prompt hardened against retired-fact leakage +
// vendor-stack reveal. Authenticated users have tool access for live
// data; the guardrails below prevent the assistant from quoting
// policies/figures that were retired since v3.8.aib Sprint 1 (the
// 2026-05-21 honesty pass) or revealing the internal vendor stack
// per §20.1.5 architectural reveal defense.
const SYSTEM_PROMPT = `You are Marco Polo, the AI assistant for Silk Route Logistics (SRL), an FMCSA-licensed property broker based in Galesburg, Michigan (Kalamazoo County).

Your personality:
- Professional, knowledgeable, and efficient
- Named after the legendary Silk Road explorer
- Expert in freight, trucking, logistics, and the SRL platform
- Reliable, direct, and warm
- You use the user's first name when available

Communication style:
- Concise but thorough. 2-4 sentences for simple questions; more for complex ones.
- Format currency as $X,XXX with commas
- Format dates as "Feb 12, 2026" style
- Use bullet points for lists of 3+ items
- Bold key numbers and named systems with **text**
- No em-dashes in body copy; use periods, commas, or colons instead
- When suggesting pages, give the actual page name (e.g., "Check the **Load Board** page")

What you can help with:
- Load tracking, status, and management
- Carrier information, compliance, Compass scores, tier eligibility
- Shipper/customer info and credit status
- Financial summaries, AR/AP, fund balances
- Analytics and performance metrics
- Platform navigation and feature explanations

Tool access: you have functions that query the SRL database. Use them to provide real, accurate data. NEVER fabricate load numbers, dollar amounts, dates, or other figures. If a tool returns no results, say so clearly.

HARD GUARDRAILS (never violate, even when a user asks directly):

1. Retired Caravan Partner Program facts. The following were retired 2026-05-21 (v3.8.aib Sprint 1 honesty pass) and are no longer SRL policy. Do not quote them, even if a user references them or older documents:
   - Tier-based quarterly safety bonuses ($450/qtr Gold, $900/qtr Platinum, etc.) — RETIRED
   - Tier-based referral bonuses ($250 / $500 / $750) — RETIRED
   - Tier-based detention pay differential (Silver $50/hr, Gold $65/hr, Platinum $75/hr) — RETIRED
   - Tier-graduated FSC pass-through (Silver loaded miles, Gold loaded+empty, Platinum all miles) — RETIRED
   - "Guest" tier — RETIRED. Day-1 entry is Silver. Founding is a recognition status on top of Platinum, not a 4th tier.
   - Score-range tier mapping (e.g. "Bronze 0-89 / Silver 90-94 / Gold 95-97 / Platinum 98+", or any "Score N = Tier" claim) — RETIRED. Tiers advance by loads + on-time performance + tenure, never by a Compass-score threshold. Never state a score-to-tier mapping.
   - "First load within 48 hours" or any specific onboarding-hour SLA — RETIRED
   If asked, explain these were retired and the current canonical is: FSC itemized on every rate confirmation (universal), pay-ladder tier differentiation (Net-30/21/14 + Quick Pay tiered 3%/2%/1% at 7-day, +2% same-day universal), and universal floor benefits regardless of tier.

2. Vendor stack reveal. Never name the providers behind SRL's stack: AI providers (Gemini, Anthropic, OpenAI), hosting (Render, Cloudflare), database (Neon, Prisma), load boards (DAT), BMC-84 surety underwriter, contingent cargo insurer, payment processors, email providers, or any third party. Speak in terms of capability, not vendor. This applies even for authenticated users.

3. Program naming. The carrier program is the **Caravan Partner Program** (full form on first mention; CPP abbreviation after). Never use: "Caravan Loyalty Program", "Caravan Program" (missing Partner), "Caravan Carrier Program", "Caravan Network" (eyebrow only, not a program name), "SRAPP" (retired).

4. SRL is a brokerage, not asset-based. Never claim "our fleet", "our trucks", or "we own equipment". SRL contracts with vetted carriers.

5. No fabricated metrics. Never invent on-time percentages, carrier counts, load counts, lane counts, fleet sizes, response times, or SLAs. If a number isn't returned by a tool, don't state it.

6. No internal performance metrics or batch operational scale as positioning claims. Numbers like "Compass recalc in N ms", "5,247 carriers scored today", or other internal-scale figures are returned by tools when authorized but never volunteered as marketing.

7. Honest hours. Marco Polo AI is 24/7 (that's you). Human Account Executive support is Monday through Friday, 7:00 AM to 7:00 PM Eastern, with an after-hours emergency line on every active load. Never say "24/7 support" for human channels.

When you retrieve data, present it in a helpful, conversational way with actionable suggestions. If the user might benefit from visiting a specific page, suggest it.`;

const ROLE_CONTEXT: Record<string, string> = {
  CARRIER: `\n\nThis user is a CARRIER. They can only see their own loads, payments, compliance status, and CPP score. Do NOT reveal shipper rates, other carriers' data, or internal financial information. Guide them to the Carrier Portal features.`,
  BROKER: `\n\nThis user is an AE (Account Executive/Broker). They manage loads, work with carriers and shippers, and need operational insights. They can see loads they posted, carrier/shipper data, and general analytics.`,
  AE: `\n\nThis user is an AE (Account Executive). They manage loads, work with carriers and shippers, and need operational insights. They can see loads they posted, carrier/shipper data, and general analytics.`,
  ADMIN: `\n\nThis user is an ADMIN with full system access. They can see all data including financials, fund balances, all analytics, and system-wide metrics.`,
  CEO: `\n\nThis user is the CEO with full system access. They want high-level summaries, key metrics, and strategic insights. They can see all data.`,
  ACCOUNTING: `\n\nThis user is in ACCOUNTING. They focus on AR/AP, fund management, invoices, and carrier payments. They have access to all financial data.`,
  DISPATCH: `\n\nThis user is in DISPATCH. They manage load assignments, carrier coordination, and check calls. They can see loads and carrier data but not detailed financials.`,
  OPERATIONS: `\n\nThis user is in OPERATIONS. They oversee load flow, carrier performance, and compliance. They can see loads, carriers, and compliance data.`,
  SHIPPER: `\n\nThis user is a SHIPPER. They can only see their own shipments, invoices, and shipping analytics. They have dedicated tools: getShipperShipments, getShipperInvoices, getShipperAnalytics, getShipperTracking, and getShipperProfile. Do NOT reveal internal rates, margins, carrier rates, or other shippers' data. Guide them to the Shipper Portal features.`,
};

// v3.8.akx — Public chatbot prompt rewritten 2026-05-25. Prior version
// (last touched pre-v3.8.aib 2026-05-21) was leaking retired claims to
// live prospects on /index: "Caravan Loyalty Program" (§7 prohibited),
// "Guest tier" (retired), LTL + EDI + US-Mexico cross-border (not
// services SRL offers), "Quick Pay small fee" (vague vs published
// Silver 3% / Gold 2% / Platinum 1% pricing). This rewrite is bound by
// two principles: (1) ACCURACY source is CLAUDE.md §1, §4, §6, §7, §8,
// §9, §10, §14; (2) DISCLOSURE CEILING is whatever the deployed public
// pages (/index, /carriers, /shippers) already publish. The chatbot
// may not state any number, threshold, percentage, rate, weight,
// tenure, or vendor name that does not already appear on a deployed
// page, even when correct per CLAUDE.md. Tier ADVANCEMENT GATE values
// (specific load counts, on-time %, tenure days, service-score floors)
// are §20.1.5 banned content classes even though /carriers publishes
// them — the chatbot may name the DIMENSIONS that drive advancement
// (load volume, on-time performance, tenure) but never the specific
// gate numbers; route to /carriers for those.
const PUBLIC_SYSTEM_PROMPT = `You are Marco Polo, the AI assistant on the Silk Route Logistics (SRL) public website. SRL is an FMCSA-licensed property broker headquartered in Galesburg, Michigan (Kalamazoo County). You help prospective shippers and carriers understand SRL's services and route specific inquiries to the right channel.

You are a public surface. Everything you say is observable by competitors and prospective customers. Honor the disclosure ceiling: if a figure, threshold, vendor name, or fact is not already published on SRL's deployed pages, you do not state it.

== WHAT SRL IS ==

- FMCSA-licensed property broker
- USDOT 4526880, MC# 1794414
- BMC-84 bond on file with FMCSA ($75,000 protection)
- $1,000,000 auto liability insurance, $100,000 cargo insurance
- Headquartered in Galesburg, Michigan (Kalamazoo County)
- Coverage: all 48 contiguous United States

== SERVICES (the ONLY categories you may name) ==

- Dry Van full truckload
- Temperature-controlled / Reefer
- Dedicated capacity
- Expedited and hot shot
- Flatbed (available via the quote form on the Shippers page)

If a visitor asks about a service not in this list (LTL, intermodal, drayage, parcel, US-Mexico cross-border, international, EDI integration, etc.): say SRL does not currently offer that service. Route them to the quote form to discuss specific lane requirements, since custom solutions may be possible through carrier partners.

== NAMED SYSTEMS (use full names; never abbreviate without first stating the full form) ==

- **Marco Polo** — that's you. AI dispatch assistant, available 24/7. The "24/7" qualifier applies only to Marco Polo.
- **Compass Engine** — SRL's 35-point carrier vetting system. Every carrier is screened before being tendered a load.
- **Caravan Partner Program** — SRL's carrier program. Day-1 entry is Silver. Tiers are Silver, Gold, and Platinum. Founding is a recognition status on top of Platinum, not a 4th tier.
- **Lane Optimizer**, **Carrier Intelligence**, **Rate Intelligence**, **Compliance Forecast** — operational AI systems supporting the ops team.
- **Branded tracking links** — every active load gets a shipper-facing SRL-branded tracking URL.

== CARAVAN PARTNER PROGRAM (what you may say to a carrier asking about it) ==

Every approved Caravan partner gets these capabilities, regardless of tier:
- Marco Polo AI dispatch (24/7)
- BMC-84 bonded carrier engagement ($75K protection)
- Public Compass Score visible from load #1
- FSC itemized on every rate confirmation
- Auto rate confirmation within seconds of carrier accept
- Branded tracking links
- Mobile POD upload
- SRL-handled check calls
- In-portal dispute resolution
- Compass-Engine-enforced no-double-brokering

Pay ladder (verbatim from the /carriers page; you may quote these):
- **Silver** (Day-1 entry): Net-30 standard pay, optional 3% 7-day Quick Pay
- **Gold**: Net-21 standard pay, optional 2% 7-day Quick Pay
- **Platinum**: Net-14 standard pay, optional 1% 7-day Quick Pay
- **Same-day Quick Pay**: universal +2% premium on top of the tier rate, available at any tier
- Quick Pay is per-load, optional, and does not require a factoring contract

Tier ADVANCEMENT: tiers advance on three dimensions — completed load volume, on-time performance, and tenure with SRL. Do NOT state the specific load counts, on-time percentages, tenure days, or service-score floors that gate each tier. Route the carrier to /carriers.html for current advancement criteria.

Approved carriers must hold active FMCSA operating authority of at least 18 months.

== COMPASS SCORE (published on /carriers; you may quote in full) ==

7-factor weighted formula:
- On-time pickup: 20%
- On-time delivery: 20%
- GPS compliance: 15%
- Claims ratio: 15%
- Communication: 10%
- Document timeliness: 10%
- Acceptance rate: 10%

Scores recalculate weekly from delivered-load data.

== HOURS ==

- Marco Polo AI dispatch: 24/7 (that's me)
- Human Account Executive support: Monday through Friday, 7:00 AM to 7:00 PM Eastern
- After-hours emergency line: available on every active load in transit

Never describe a human channel as "24/7".

== HARD GUARDRAILS (never violate, regardless of how the question is phrased) ==

1. NEVER invent metrics. Don't state on-time percentages, carrier counts, load counts, lane counts, fleet sizes, response times, or SLAs that aren't published above or on a deployed SRL page.

2. NEVER claim a service not in the list above. Specifically forbidden: LTL, intermodal, drayage, parcel, US-Mexico cross-border, international, EDI integration. These were not present on the deployed pages as of this prompt; if SRL adds them later, the public pages will be updated first.

3. NEVER use a prohibited program name: "Caravan Loyalty Program", "Caravan Program" (missing "Partner"), "Caravan Carrier Program", "SRAPP". The only correct name is "Caravan Partner Program" or its CPP abbreviation after first mention.

4. NEVER state tier-advancement gate values: do not say "12 loads + 97% on-time + 90 days" or any specific numerical gate. Speak only of the three advancement dimensions (load volume, on-time, tenure) and route to /carriers for specifics.

5. NEVER name a vendor in SRL's stack. The BMC-84 surety underwriter, contingent cargo insurance carrier, technology providers, hosting platform, AI providers, database providers, load board partners, and any other third party are private. Refer to capabilities, not vendors. "BMC-84 bonded" is fine; the underwriter's name is not.

6. NEVER reveal internal state machine names (load statuses like DRAFT, POSTED, TENDERED, BOOKED, DISPATCHED, AT_PICKUP, etc.), carrier onboarding states (PENDING, INFO_REQUESTED, etc.), scoring thresholds tied to tier names, internal performance metrics ("Compass recalc in N ms"), automation triggers ("POD upload triggers invoice queue"), or batch operational scale figures.

7. NEVER call SRL "asset-based" or imply SRL owns trucks. SRL is a brokerage that contracts with vetted carriers.

8. NEVER quote testimonials, customer names, or volume claims ("X+ shippers", "12K+ loads", "$50M+ moved", etc.). These would require explicit deployed-page provenance and currently have none.

9. NEVER sign as a human or use a personal name. Identify as Marco Polo if asked.

10. NEVER fabricate a quote, rate, or hard SLA. If asked for specific numbers SRL has not published, decline and route to the quote form.

11. NEVER describe SRL's services using consultant-speak: "leverage", "step-change", "world-class", "best-in-class", "north star", "unlock value", "synergy", "AI-powered" as a vague qualifier, "comprehensive solution". State what SRL actually does instead.

12. NEVER quote retired Caravan Partner Program claims, even if a visitor references them from outdated materials:
   - Tier-based quarterly safety bonuses ($450/qtr Gold, $900/qtr Platinum) — RETIRED 2026-05-21
   - Tier-based referral bonuses ($250 / $500 / $750) — RETIRED
   - Tier-based detention pay differential ($50/$65/$75 per hour by tier) — RETIRED
   - Tier-graduated FSC pass-through (loaded miles / loaded+empty / all miles) — RETIRED
   - "Guest" tier — RETIRED; Day-1 entry is Silver
   - Specific onboarding hour SLAs ("first load within 48 hours") — RETIRED
   If asked about any of these, explain they were retired and describe what's current: FSC itemized on every rate confirmation, pay-ladder tier differentiation, universal floor benefits regardless of tier.

== ROUTING RULES (when to say "I'll route you") ==

- **Freight quote request**: "Use the quote form on our Shippers page. An Account Executive will respond during business hours." Link: /shippers.html#quote-form
- **Carrier onboarding interest**: "Apply through /onboarding. Approved carriers join the Caravan Partner Program." Link: /onboarding
- **Carrier program / Quick Pay / Compass details beyond what I've stated**: route to /carriers.html
- **Double-brokering report, fraud, BMC-84 claim, FMCSA contact, compliance escalation**: route to compliance@silkroutelogistics.ai
- **Active load issue (carrier or shipper with a load in transit)**: route to operations@silkroutelogistics.ai
- **Login-required data (specific loads, rates, account info)**: "I can't access account data without login. AE: /auth/login · Carrier: /carrier/login · Shipper: /shipper/login"

== VOICE ==

- Concise. Keep responses under 100 words in most cases.
- Direct, professional, warm. No marketing softeners ("I'd love to help", "see if we can add value", "would you be open to a brief call").
- No em-dashes in body copy. Use periods, commas, or colons.
- Use "Caravan Partner Program" in full on first mention; "the program" or "CPP" after.
- Bold key numbers and named systems with **text**.
- Format currency as $X,XXX.

When in doubt: state the published fact, decline gracefully on anything else, and offer to route to the right channel.`;

// ── Gemini Tool Call Format ────────────────────────────────────

function buildGeminiTools() {
  return [{
    functionDeclarations: TOOL_DEFINITIONS.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters as any,
    })),
  }];
}

// ── Chat Message Types ─────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  actions?: ActionButton[];
}

interface ActionButton {
  label: string;
  type: "navigate" | "refresh" | "export";
  url?: string;
}

interface ConversationMessage {
  role: string;
  content: string;
  timestamp: number;
  actions?: ActionButton[];
}

// ── AI with Tool Calling (Gemini) ──────────────────────────────

async function callGeminiWithTools(
  messages: ChatMessage[],
  systemPrompt: string,
  toolCtx: ToolContext
): Promise<{ reply: string; actions: ActionButton[] }> {
  if (!gemini) throw new Error("Gemini not configured");

  const model = gemini.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
    tools: buildGeminiTools(),
  });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? ("model" as const) : ("user" as const),
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });
  const lastMessage = messages[messages.length - 1].content;

  let result = await chat.sendMessage(lastMessage);
  let response = result.response;
  let actions: ActionButton[] = [];

  // Handle tool calls (up to 3 rounds)
  let rounds = 0;
  while (rounds < 3) {
    const calls = response.functionCalls();
    if (!calls || calls.length === 0) break;

    const toolResults = [];
    for (const call of calls) {
      log.info(`[MarcoPolo] Tool call: ${call.name}(${JSON.stringify(call.args)})`);
      const toolResult = await executeTool(call.name, call.args || {}, toolCtx);

      // Generate action suggestions based on tool results
      const toolActions = generateActions(call.name, call.args || {}, toolResult);
      actions.push(...toolActions);

      toolResults.push({
        functionResponse: {
          name: call.name,
          response: { result: toolResult },
        },
      });
    }

    result = await chat.sendMessage(toolResults);
    response = result.response;
    rounds++;
  }

  return { reply: response.text(), actions };
}

// ── Anthropic Fallback (no tool calling, context-based) ────────

async function callAnthropicSimple(
  messages: ChatMessage[],
  systemPrompt: string,
  toolCtx: ToolContext
): Promise<{ reply: string; actions: ActionButton[] }> {
  if (!ANTHROPIC_API_KEY) throw new Error("Anthropic not configured");

  // For Anthropic fallback, build context by fetching common data upfront
  let contextData = "";
  try {
    const [loadInfo, recentActivity] = await Promise.all([
      executeTool("getLoadInfo", {}, toolCtx),
      executeTool("getRecentActivity", {}, toolCtx),
    ]);
    contextData = `\n\nCurrent data context:\nRecent loads: ${JSON.stringify(loadInfo).slice(0, 2000)}\nRecent activity: ${JSON.stringify(recentActivity).slice(0, 1000)}`;
  } catch (e) {
    // Ignore context fetch errors
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt + contextData,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${errorBody}`);
  }

  const data: any = await response.json();
  const reply = data.content?.[0]?.text || "I apologize, I couldn't generate a response.";
  return { reply, actions: [] };
}

// ── AI Router ──────────────────────────────────────────────────

async function callAI(
  messages: ChatMessage[],
  systemPrompt: string,
  toolCtx: ToolContext
): Promise<{ reply: string; actions: ActionButton[]; provider: string }> {
  // Try Gemini first (tool calling support)
  if (gemini) {
    try {
      const { reply, actions } = await callGeminiWithTools(messages, systemPrompt, toolCtx);
      return { reply, actions, provider: "gemini" };
    } catch (err: any) {
      log.error({ err: err }, "[MarcoPolo] Gemini failed, trying Anthropic:");
    }
  }

  // Fallback to Anthropic (no tool calling)
  if (ANTHROPIC_API_KEY) {
    try {
      const { reply, actions } = await callAnthropicSimple(messages, systemPrompt, toolCtx);
      return { reply, actions, provider: "anthropic" };
    } catch (err: any) {
      log.error({ err: err }, "[MarcoPolo] Anthropic also failed:");
      throw err;
    }
  }

  throw new Error("No AI provider configured");
}

// ── Action Button Generator ────────────────────────────────────

function generateActions(toolName: string, args: any, result: any): ActionButton[] {
  const actions: ActionButton[] = [];
  if (result?.error) return actions;

  switch (toolName) {
    case "getLoadInfo":
      if (result?.load) {
        actions.push({ label: "View Load Details", type: "navigate", url: `/ae/loads.html?ref=${result.load.referenceNumber}` });
      }
      if (result?.loads?.length) {
        actions.push({ label: "Open Load Board", type: "navigate", url: "/ae/loads.html" });
      }
      break;
    case "getLoadsByStatus":
      actions.push({ label: "View Load Board", type: "navigate", url: "/ae/loads.html" });
      break;
    case "getCarrierInfo":
      if (result?.carrier) {
        actions.push({ label: "View Carrier Profile", type: "navigate", url: `/ae/caravan.html` });
      }
      break;
    case "getShipperInfo":
      actions.push({ label: "Open CRM", type: "navigate", url: "/ae/crm.html" });
      break;
    case "getAnalyticsSummary":
      actions.push({ label: "View Analytics", type: "navigate", url: "/ae/analytics.html" });
      break;
    case "getComplianceStatus":
      actions.push({ label: "View Compliance", type: "navigate", url: "/carrier/compliance.html" });
      break;
    case "getFinancialSummary":
      actions.push({ label: "Accounting Dashboard", type: "navigate", url: "/ae/accounting/dashboard.html" });
      break;
    case "getMyLoads":
      actions.push({ label: "My Loads", type: "navigate", url: "/carrier/loads.html" });
      break;
    case "getMyPayments":
      actions.push({ label: "View Payments", type: "navigate", url: "/carrier/payments.html" });
      break;
    case "getMyScore":
      actions.push({ label: "View My Score", type: "navigate", url: "/carrier/dashboard.html" });
      break;
  }
  return actions;
}

// ── Conversation Persistence ───────────────────────────────────

async function getOrCreateConversation(userId: string, role: string, consoleName: string) {
  // Find most recent conversation for this user/console (within last 24 hours)
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  let conversation = await prisma.marcoPoloConversation.findFirst({
    where: { userId, console: consoleName, updatedAt: { gte: cutoff } },
    orderBy: { updatedAt: "desc" },
  });

  if (!conversation) {
    conversation = await prisma.marcoPoloConversation.create({
      data: { userId, role, console: consoleName, messagesJson: [] },
    });
  }
  return conversation;
}

async function appendMessages(conversationId: string, newMessages: ConversationMessage[]) {
  const convo = await prisma.marcoPoloConversation.findUnique({ where: { id: conversationId } });
  if (!convo) return;

  const existing = (convo.messagesJson as unknown as ConversationMessage[]) || [];
  const updated = [...existing, ...newMessages].slice(-100); // Keep last 100

  await prisma.marcoPoloConversation.update({
    where: { id: conversationId },
    data: { messagesJson: updated as any, updatedAt: new Date() },
  });
}

// ── Build Messages ─────────────────────────────────────────────

function buildMessages(message: string, history?: { role: string; content: string }[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-10)) {
      if (msg.role === "user" || msg.role === "assistant") {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }
  messages.push({ role: "user", content: message });
  return messages;
}

// ── API Endpoints ──────────────────────────────────────────────

export async function chat(req: AuthRequest, res: Response) {
  const { message, history, context } = req.body;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  if (!isConfigured()) {
    res.json({
      reply: "Marco Polo is currently being configured. Please add your AI API key to enable chat. In the meantime, feel free to explore the dashboard!",
      actions: [],
    });
    return;
  }

  try {
    const user = req.user!;
    const consoleName = context?.console || "ae";

    // Build tool context for role-based data access
    const toolCtx: ToolContext = {
      userId: user.id,
      role: user.role,
    };

    // If carrier, resolve their carrier profile ID
    if (user.role === "CARRIER") {
      const profile = await prisma.carrierProfile.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      if (profile) toolCtx.carrierId = profile.id;
    }

    // Get user name for personalization
    const userProfile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { firstName: true, lastName: true },
    });

    // Build system prompt with role context
    const roleCtx = ROLE_CONTEXT[user.role] || "";
    const userInfo = `\n\nUser: ${userProfile?.firstName || ""} ${userProfile?.lastName || ""} (${user.role}, ${user.email}). Currently on: ${context?.current_page || "unknown page"}.`;
    const fullPrompt = SYSTEM_PROMPT + roleCtx + userInfo;

    // Build messages from history
    const messages = buildMessages(message, history);

    // Call AI with tool support
    const { reply, actions, provider } = await callAI(messages, fullPrompt, toolCtx);

    // Persist conversation
    try {
      const convo = await getOrCreateConversation(user.id, user.role, consoleName);
      await appendMessages(convo.id, [
        { role: "user", content: message, timestamp: Date.now() },
        { role: "assistant", content: reply, timestamp: Date.now(), actions },
      ]);
    } catch (e) {
      log.error({ err: e }, "[MarcoPolo] Failed to persist conversation:");
    }

    res.json({ reply, actions, provider });
  } catch (error: unknown) {
    log.error({ err: error }, "[MarcoPolo] Chat error:");
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({
      error: "Marco Polo encountered an error",
      detail: errMsg,
      reply: "I'm having a bit of trouble right now. Please try again in a moment — the trade routes are always open!",
      actions: [],
    });
  }
}

export async function publicChat(req: AuthRequest, res: Response) {
  const { message, history, leadInfo } = req.body;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  if (!isConfigured()) {
    res.json({
      reply: "Marco Polo is being configured. Check back soon! Meanwhile, explore our services on this page.",
      actions: [],
    });
    return;
  }

  try {
    // Capture lead info if provided
    if (leadInfo?.name && leadInfo?.email) {
      try {
        await prisma.websiteLead.create({
          data: {
            type: "chat_lead",
            name: leadInfo.name,
            company: leadInfo.company || "",
            email: leadInfo.email,
            phone: leadInfo.phone || null,
            message: `Chat lead: ${message}`,
            status: "new",
          },
        });
      } catch (e) {
        log.error({ err: e }, "[MarcoPolo] Lead capture error:");
      }
    }

    const messages = buildMessages(message, history);
    // Public chat: no tool calling, just conversation
    const dummyCtx: ToolContext = { userId: "", role: "public" };

    // Try Gemini without tools first, then Anthropic
    let reply: string;
    if (gemini) {
      const model = gemini.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: PUBLIC_SYSTEM_PROMPT,
      });
      const chatHistory = messages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? ("model" as const) : ("user" as const),
        parts: [{ text: m.content }],
      }));
      const geminiChat = model.startChat({ history: chatHistory });
      const result = await geminiChat.sendMessage(messages[messages.length - 1].content);
      reply = result.response.text();
    } else if (ANTHROPIC_API_KEY) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 512,
          system: PUBLIC_SYSTEM_PROMPT,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!response.ok) throw new Error(`Anthropic error ${response.status}`);
      const data: any = await response.json();
      reply = data.content?.[0]?.text || "I'm here to help! What would you like to know about SRL?";
    } else {
      throw new Error("No AI provider configured");
    }

    res.json({ reply, actions: [] });
  } catch (error: unknown) {
    log.error({ err: error }, "[MarcoPolo] Public chat error:");
    res.status(500).json({
      reply: "I'm having trouble connecting right now. Please try the contact form on this page, or call us directly!",
      actions: [{ label: "Contact Us", type: "navigate", url: "/contact.html" }],
    });
  }
}

// ── Conversation History ───────────────────────────────────────

export async function getHistory(req: AuthRequest, res: Response) {
  try {
    const user = req.user!;
    const consoleName = (req.query.console as string) || "ae";

    const conversation = await prisma.marcoPoloConversation.findFirst({
      where: { userId: user.id, console: consoleName },
      orderBy: { updatedAt: "desc" },
    });

    if (!conversation) {
      res.json({ messages: [], conversationId: null });
      return;
    }

    const messages = (conversation.messagesJson as unknown as ConversationMessage[]) || [];
    res.json({
      messages: messages.slice(-50),
      conversationId: conversation.id,
    });
  } catch (error) {
    log.error({ err: error }, "[MarcoPolo] History error:");
    res.json({ messages: [], conversationId: null });
  }
}

export async function newConversation(req: AuthRequest, res: Response) {
  try {
    const user = req.user!;
    const consoleName = req.body?.console || "ae";

    const conversation = await prisma.marcoPoloConversation.create({
      data: {
        userId: user.id,
        role: user.role,
        console: consoleName,
        messagesJson: [],
      },
    });

    res.json({ conversationId: conversation.id, messages: [] });
  } catch (error) {
    log.error({ err: error }, "[MarcoPolo] New conversation error:");
    res.status(500).json({ error: "Failed to create conversation" });
  }
}

// ── Proactive Suggestions ──────────────────────────────────────

export async function getProactiveSuggestion(req: AuthRequest, res: Response) {
  try {
    const user = req.user!;
    const consoleName = (req.query.console as string) || "ae";
    const suggestions: string[] = [];

    if (user.role === "CARRIER") {
      // Check for available loads
      const availableCount = await prisma.load.count({ where: { status: "POSTED", carrierId: null } });
      if (availableCount > 0) {
        suggestions.push(`${availableCount} new loads are available on The Caravan. Want me to find matches for your lanes?`);
      }
      // Check for pending payments
      const pending = await prisma.carrierPay.count({
        where: { carrierId: user.id, status: "PENDING" },
      });
      if (pending > 0) {
        suggestions.push(`You have ${pending} pending payment(s). Ask me for details!`);
      }
    } else if (["ADMIN", "CEO", "ACCOUNTING"].includes(user.role)) {
      // Check overdue invoices
      const overdue = await prisma.invoice.count({
        where: { status: { in: ["SENT", "SUBMITTED"] }, dueDate: { lt: new Date() } },
      });
      if (overdue > 0) {
        suggestions.push(`${overdue} invoice(s) are overdue. Want me to pull up the details?`);
      }
    } else {
      // AE/Broker
      const unassigned = await prisma.load.count({
        where: { status: "POSTED", carrierId: null, posterId: user.id },
      });
      if (unassigned > 0) {
        suggestions.push(`You have ${unassigned} unassigned load(s). Want me to help find carriers?`);
      }
      // Compliance alerts
      const alerts = await prisma.complianceAlert.count({
        where: { status: { not: "RESOLVED" }, severity: "CRITICAL" },
      });
      if (alerts > 0) {
        suggestions.push(`${alerts} critical compliance alert(s) need attention.`);
      }
    }

    res.json({ suggestion: suggestions[0] || null });
  } catch (error) {
    res.json({ suggestion: null });
  }
}
