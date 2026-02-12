import { Response } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { AuthRequest } from "../middleware/auth";
import { executeTool, TOOL_DEFINITIONS, ToolContext } from "../services/marcoPoloService";

// ── AI Provider Setup ──────────────────────────────────────────

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const gemini = env.GEMINI_API_KEY ? new GoogleGenerativeAI(env.GEMINI_API_KEY) : null;

function isConfigured(): boolean {
  return !!ANTHROPIC_API_KEY || !!gemini;
}

// ── System Prompts ─────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Marco Polo, the AI assistant for Silk Route Logistics (SRL) — a full-service freight brokerage and logistics platform based in Kalamazoo, Michigan.

Your personality:
- Professional, knowledgeable, and efficient
- Named after the legendary Silk Road explorer — you have a slight sense of adventure
- Expert in freight, trucking, logistics, and the SRL platform
- Reliable, direct, and warm
- You use the user's first name when available
- Sign off important messages with brief logistics-themed encouragement

Communication style:
- Concise but thorough — 2-4 sentences for simple questions, more for complex ones
- Format currency as $X,XXX with commas
- Format dates as "Feb 12, 2026" style
- Use bullet points for lists of 3+ items
- Bold key numbers and names using **text**
- When suggesting pages, give the actual page name (e.g., "Check the **Load Board** page")

What you can help with:
- Load tracking, status, and management
- Carrier information, compliance, SRCPP scores
- Shipper/customer info and credit status
- Financial summaries, AR/AP, fund balances
- Analytics and performance metrics
- Platform navigation and feature explanations
- Freight industry best practices and rate guidance

You have access to tools that query the SRL database. Use them to provide real, accurate data. NEVER make up load numbers, dollar amounts, or dates — if you can't find data, say so clearly.

When you retrieve data, present it in a helpful, conversational way with actionable suggestions. If the user might benefit from visiting a specific page, suggest it.`;

const ROLE_CONTEXT: Record<string, string> = {
  CARRIER: `\n\nThis user is a CARRIER. They can only see their own loads, payments, compliance status, and SRCPP score. Do NOT reveal shipper rates, other carriers' data, or internal financial information. Guide them to the Carrier Portal features.`,
  BROKER: `\n\nThis user is an AE (Account Executive/Broker). They manage loads, work with carriers and shippers, and need operational insights. They can see loads they posted, carrier/shipper data, and general analytics.`,
  AE: `\n\nThis user is an AE (Account Executive). They manage loads, work with carriers and shippers, and need operational insights. They can see loads they posted, carrier/shipper data, and general analytics.`,
  ADMIN: `\n\nThis user is an ADMIN with full system access. They can see all data including financials, fund balances, all analytics, and system-wide metrics.`,
  CEO: `\n\nThis user is the CEO with full system access. They want high-level summaries, key metrics, and strategic insights. They can see all data.`,
  ACCOUNTING: `\n\nThis user is in ACCOUNTING. They focus on AR/AP, fund management, invoices, and carrier payments. They have access to all financial data.`,
  DISPATCH: `\n\nThis user is in DISPATCH. They manage load assignments, carrier coordination, and check calls. They can see loads and carrier data but not detailed financials.`,
  OPERATIONS: `\n\nThis user is in OPERATIONS. They oversee load flow, carrier performance, and compliance. They can see loads, carriers, and compliance data.`,
};

const PUBLIC_SYSTEM_PROMPT = `You are Marco Polo, the AI assistant on the Silk Route Logistics website. You help public visitors learn about SRL's freight brokerage services.

What you can answer:
- SRL's services: full truckload (FTL), less-than-truckload (LTL), expedited, flatbed, reefer
- Coverage: All 48 contiguous US states, US-Mexico cross-border
- How to get a freight quote (encourage them to fill out the quote form)
- How carriers can register and join The Caravan (SRL's carrier loyalty program)
- SRCPP (Silk Route Carrier Performance Program) — tier system: Guest → Bronze → Silver → Gold → Platinum
- Quick Pay program for carriers (faster payment at a small fee)
- SRL's technology: real-time tracking, EDI integration, automated invoicing
- Contact information: Kalamazoo, MI headquarters

If asked for specific rates, loads, or account data: explain you can't access that without login. Encourage them to create an account or contact sales.

If someone provides their name/email wanting to learn more: acknowledge it warmly and suggest they use the quote form or contact form on the page.

Keep responses under 100 words. Be enthusiastic about SRL's services.`;

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
      console.log(`[MarcoPolo] Tool call: ${call.name}(${JSON.stringify(call.args)})`);
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
      model: "claude-sonnet-4-5-20250929",
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
      console.error("[MarcoPolo] Gemini failed, trying Anthropic:", err.message);
    }
  }

  // Fallback to Anthropic (no tool calling)
  if (ANTHROPIC_API_KEY) {
    try {
      const { reply, actions } = await callAnthropicSimple(messages, systemPrompt, toolCtx);
      return { reply, actions, provider: "anthropic" };
    } catch (err: any) {
      console.error("[MarcoPolo] Anthropic also failed:", err.message);
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
      console.error("[MarcoPolo] Failed to persist conversation:", e);
    }

    res.json({ reply, actions, provider });
  } catch (error: unknown) {
    console.error("[MarcoPolo] Chat error:", error);
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
        console.error("[MarcoPolo] Lead capture error:", e);
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
          model: "claude-sonnet-4-5-20250929",
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
    console.error("[MarcoPolo] Public chat error:", error);
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
    console.error("[MarcoPolo] History error:", error);
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
    console.error("[MarcoPolo] New conversation error:", error);
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
