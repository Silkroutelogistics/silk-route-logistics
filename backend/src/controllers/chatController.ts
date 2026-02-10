import { Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";

// AI Provider: set AI_PROVIDER=gemini to use Gemini, defaults to claude
const AI_PROVIDER = (process.env.AI_PROVIDER || "claude").toLowerCase();

// Claude setup
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Gemini setup
const gemini = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

function isConfigured(): boolean {
  return !!anthropic || !!gemini;
}

// Errors worth falling back on: credit exhaustion, rate limits, auth failures, server errors
function shouldFallback(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status: number }).status;
    return [401, 402, 403, 429, 500, 502, 503, 529].includes(status);
  }
  return false;
}

const SYSTEM_PROMPT = `You are Marco Polo, the AI assistant for Silk Route Logistics (SRL) — a full-service freight brokerage and logistics platform.

Your personality:
- Professional, knowledgeable, and efficient
- Named after the legendary Silk Road explorer
- Expert in freight, trucking, logistics, and the SRL platform
- Concise but thorough — answer in 2-3 sentences when possible
- Use freight industry terminology naturally

What you can help with:
- Load tracking and status inquiries
- Shipment and invoice questions
- Platform navigation and feature explanations
- Freight industry best practices
- Rate guidance and market insights
- Carrier onboarding and compliance questions
- General logistics Q&A

SRL Platform features you know about:
- Load Board: Create, post, and manage freight loads
- Track & Trace: Real-time shipment tracking with ELD integration
- Tender System: Send and manage carrier tenders
- Invoice & Factoring: Auto-generated invoices, factoring support
- Carrier Scorecard: Performance metrics and tier system (Platinum/Gold/Silver/Bronze)
- Market Intelligence: Lane rates, capacity data, trends
- Compliance: FMCSA integration, document management
- EDI: Electronic Data Interchange (204/990/214/210)
- SOPs: Standard Operating Procedures library
- Messaging: In-platform communication

When user context is provided, use it to give specific answers about their loads, shipments, and invoices. Format currency with $ and commas. Format dates in readable format.

If you don't have enough context to answer something specific, suggest the user check the relevant dashboard page.

Keep responses under 150 words unless the user asks for detailed explanation.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

async function callClaude(messages: ChatMessage[], systemPrompt: string): Promise<string> {
  if (!anthropic) throw new Error("Claude not configured");
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 500,
    system: systemPrompt,
    messages,
  });
  return response.content[0].type === "text" ? response.content[0].text : "I couldn't generate a response.";
}

async function callGemini(messages: ChatMessage[], systemPrompt: string): Promise<string> {
  if (!gemini) throw new Error("Gemini not configured");
  const model = gemini.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
  });

  // Build Gemini conversation history
  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === "assistant" ? "model" as const : "user" as const,
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({ history });
  const lastMessage = messages[messages.length - 1].content;
  const result = await chat.sendMessage(lastMessage);
  return result.response.text();
}

interface AIResponse {
  text: string;
  provider: "claude" | "gemini";
}

async function callAI(messages: ChatMessage[], systemPrompt: string): Promise<AIResponse> {
  const primary = AI_PROVIDER === "gemini"
    ? { call: callGemini, name: "gemini" as const }
    : { call: callClaude, name: "claude" as const };

  const fallback = AI_PROVIDER === "gemini"
    ? anthropic ? { call: callClaude, name: "claude" as const } : null
    : gemini ? { call: callGemini, name: "gemini" as const } : null;

  // Try primary provider
  try {
    const text = await primary.call(messages, systemPrompt);
    return { text, provider: primary.name };
  } catch (primaryError) {
    // If no fallback available or error isn't fallback-worthy, rethrow
    if (!fallback || !shouldFallback(primaryError)) throw primaryError;

    console.warn(`[MarcoPolo] ${primary.name} failed (${(primaryError as { status?: number }).status || "unknown"}), falling back to ${fallback.name}`);

    try {
      const text = await fallback.call(messages, systemPrompt);
      return { text, provider: fallback.name };
    } catch (fallbackError) {
      // Both providers failed — throw the original error
      console.error(`[MarcoPolo] Fallback ${fallback.name} also failed:`, fallbackError);
      throw primaryError;
    }
  }
}

async function buildUserContext(userId: string, email: string, role: string): Promise<string> {
  const userProfile = await prisma.user.findUnique({
    where: { id: userId },
    select: { firstName: true, lastName: true },
  });
  const [loads, shipments, invoices] = await Promise.all([
    prisma.load.findMany({
      where: { OR: [{ posterId: userId }, { carrierId: userId }] },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        referenceNumber: true, status: true, originCity: true, originState: true,
        destCity: true, destState: true, rate: true, equipmentType: true,
        pickupDate: true, deliveryDate: true, carrierId: true,
      },
    }),
    prisma.shipment.findMany({
      where: { load: { OR: [{ posterId: userId }, { carrierId: userId }] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        shipmentNumber: true, status: true, originCity: true, originState: true,
        destCity: true, destState: true, lastLocation: true, lastLocationAt: true, eta: true,
      },
    }),
    prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { invoiceNumber: true, status: true, amount: true, dueDate: true, paidAt: true },
    }),
  ]);

  return `\n\nCurrent user: ${userProfile?.firstName || ""} ${userProfile?.lastName || ""} (${role}, ${email})

Recent loads (${loads.length}):
${loads.map((l) => `- ${l.referenceNumber}: ${l.status} | ${l.originCity},${l.originState} → ${l.destCity},${l.destState} | $${l.rate} | ${l.equipmentType} | Pickup: ${new Date(l.pickupDate).toLocaleDateString()}`).join("\n")}

Recent shipments (${shipments.length}):
${shipments.map((s) => `- ${s.shipmentNumber}: ${s.status} | ${s.originCity},${s.originState} → ${s.destCity},${s.destState}${s.lastLocation ? ` | Last: ${s.lastLocation}` : ""}${s.eta ? ` | ETA: ${new Date(s.eta).toLocaleDateString()}` : ""}`).join("\n")}

Recent invoices (${invoices.length}):
${invoices.map((i) => `- ${i.invoiceNumber}: ${i.status} | $${i.amount}${i.dueDate ? ` | Due: ${new Date(i.dueDate).toLocaleDateString()}` : ""}${i.paidAt ? ` | Paid: ${new Date(i.paidAt).toLocaleDateString()}` : ""}`).join("\n")}`;
}

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

export async function chat(req: AuthRequest, res: Response) {
  const { message, history } = req.body;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  if (!isConfigured()) {
    res.json({
      reply: "Marco Polo is currently being configured. Please add your AI API key to the environment to enable chat. In the meantime, feel free to explore the dashboard!",
    });
    return;
  }

  try {
    let userContext = "";
    if (req.user) {
      userContext = await buildUserContext(req.user.id, req.user.email, req.user.role);
    }

    const messages = buildMessages(message, history);
    const { text: reply, provider } = await callAI(messages, SYSTEM_PROMPT + userContext);
    res.json({ reply, provider });
  } catch (error: unknown) {
    console.error("[MarcoPolo] Chat error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Marco Polo encountered an error", detail: errMsg });
  }
}

export async function publicChat(req: AuthRequest, res: Response) {
  const { message, history } = req.body;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  if (!isConfigured()) {
    res.json({
      reply: "Marco Polo is currently being configured. Please check back soon! In the meantime, visit our dashboard to explore SRL's full capabilities.",
    });
    return;
  }

  try {
    const messages = buildMessages(message, history);
    const systemPrompt = SYSTEM_PROMPT + "\n\nThis is a public visitor on the SRL website. They are not logged in. Help them learn about SRL's services, pricing model, carrier onboarding, and freight solutions. Encourage them to sign up or log in for full features.";
    const { text: reply, provider } = await callAI(messages, systemPrompt);
    res.json({ reply, provider });
  } catch (error: unknown) {
    console.error("[MarcoPolo] Public chat error:", error);
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Marco Polo encountered an error", detail: errMsg });
  }
}
