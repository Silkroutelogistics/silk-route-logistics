import { Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../config/database";
import { AuthRequest } from "../middleware/auth";

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

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

export async function chat(req: AuthRequest, res: Response) {
  const { message, history } = req.body;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  if (!anthropic) {
    res.json({
      reply: "Marco Polo is currently being configured. Please add your ANTHROPIC_API_KEY to the environment to enable AI chat. In the meantime, feel free to explore the dashboard!",
    });
    return;
  }

  try {
    // Build user context if authenticated
    let userContext = "";
    if (req.user) {
      const userProfile = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { firstName: true, lastName: true },
      });
      const [loads, shipments, invoices] = await Promise.all([
        prisma.load.findMany({
          where: {
            OR: [{ posterId: req.user.id }, { carrierId: req.user.id }],
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            referenceNumber: true, status: true, originCity: true, originState: true,
            destCity: true, destState: true, rate: true, equipmentType: true,
            pickupDate: true, deliveryDate: true, carrierId: true,
          },
        }),
        prisma.shipment.findMany({
          where: {
            load: { OR: [{ posterId: req.user.id }, { carrierId: req.user.id }] },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            shipmentNumber: true, status: true, originCity: true, originState: true,
            destCity: true, destState: true, lastLocation: true, lastLocationAt: true, eta: true,
          },
        }),
        prisma.invoice.findMany({
          where: { userId: req.user.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            invoiceNumber: true, status: true, amount: true, dueDate: true, paidAt: true,
          },
        }),
      ]);

      userContext = `\n\nCurrent user: ${userProfile?.firstName || ""} ${userProfile?.lastName || ""} (${req.user.role}, ${req.user.email})

Recent loads (${loads.length}):
${loads.map((l) => `- ${l.referenceNumber}: ${l.status} | ${l.originCity},${l.originState} → ${l.destCity},${l.destState} | $${l.rate} | ${l.equipmentType} | Pickup: ${new Date(l.pickupDate).toLocaleDateString()}`).join("\n")}

Recent shipments (${shipments.length}):
${shipments.map((s) => `- ${s.shipmentNumber}: ${s.status} | ${s.originCity},${s.originState} → ${s.destCity},${s.destState}${s.lastLocation ? ` | Last: ${s.lastLocation}` : ""}${s.eta ? ` | ETA: ${new Date(s.eta).toLocaleDateString()}` : ""}`).join("\n")}

Recent invoices (${invoices.length}):
${invoices.map((i) => `- ${i.invoiceNumber}: ${i.status} | $${i.amount}${i.dueDate ? ` | Due: ${new Date(i.dueDate).toLocaleDateString()}` : ""}${i.paidAt ? ` | Paid: ${new Date(i.paidAt).toLocaleDateString()}` : ""}`).join("\n")}`;
    }

    // Build message history
    const messages: { role: "user" | "assistant"; content: string }[] = [];
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }
    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 500,
      system: SYSTEM_PROMPT + userContext,
      messages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "I couldn't generate a response. Please try again.";
    res.json({ reply });
  } catch (error: unknown) {
    console.error("[MarcoPolo] Chat error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Marco Polo encountered an error", detail: message });
  }
}

// Public chat endpoint (no auth required, no user context)
export async function publicChat(req: AuthRequest, res: Response) {
  const { message, history } = req.body;
  if (!message || typeof message !== "string") {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  if (!anthropic) {
    res.json({
      reply: "Marco Polo is currently being configured. Please check back soon! In the meantime, visit our dashboard to explore SRL's full capabilities.",
    });
    return;
  }

  try {
    const messages: { role: "user" | "assistant"; content: string }[] = [];
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        if (msg.role === "user" || msg.role === "assistant") {
          messages.push({ role: msg.role, content: msg.content });
        }
      }
    }
    messages.push({ role: "user", content: message });

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 500,
      system: SYSTEM_PROMPT + "\n\nThis is a public visitor on the SRL website. They are not logged in. Help them learn about SRL's services, pricing model, carrier onboarding, and freight solutions. Encourage them to sign up or log in for full features.",
      messages,
    });

    const reply = response.content[0].type === "text" ? response.content[0].text : "I couldn't generate a response. Please try again.";
    res.json({ reply });
  } catch (error: unknown) {
    console.error("[MarcoPolo] Public chat error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: "Marco Polo encountered an error", detail: message });
  }
}
