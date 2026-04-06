import { env } from "../config/env";
import { prisma } from "../config/database";

/**
 * Gmail Reply Tracking Service
 *
 * Watches the CEO's Gmail inbox (whaider@silkroutelogistics.ai) for replies
 * from prospects and auto-logs them in the Lead Hunter pipeline.
 *
 * On reply detection:
 *   1. Auto-stops any active email sequence for that prospect
 *   2. Detects reply intent (interested, unsubscribe, objection, neutral)
 *   3. Creates notifications with intent context
 *   4. Logs to SystemLog for audit trail
 *
 * Uses raw Google REST APIs (no googleapis SDK dependency).
 */

/** Returns Google OAuth URL for the user to authorize Gmail read access. */
export function getAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI!,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/gmail.readonly",
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/** Exchange authorization code for access + refresh tokens. */
export async function exchangeCode(
  code: string
): Promise<{ access_token: string; refresh_token: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${errBody}`);
  }
  return res.json() as Promise<{ access_token: string; refresh_token: string }>;
}

/** Refresh the access token using the stored refresh token. */
export async function refreshAccessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${errBody}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ─── Reply Intent Detection ─────────────────────────────────

type ReplyIntent = "INTERESTED" | "UNSUBSCRIBE" | "OBJECTION" | "OUT_OF_OFFICE" | "NEUTRAL";

const INTENT_PATTERNS: { intent: ReplyIntent; patterns: RegExp[] }[] = [
  {
    intent: "INTERESTED",
    patterns: [
      /\b(interested|let'?s? (talk|chat|connect|meet|schedule)|sounds? good|tell me more|send (me|us) (more|info|details|a quote)|i'?d (love|like) to|set up a (call|meeting)|what (are your|rates)|free lane analysis|yes|absolutely|count me in|looking forward)\b/i,
    ],
  },
  {
    intent: "UNSUBSCRIBE",
    patterns: [
      /\b(unsubscribe|remove me|stop (emailing|sending|contacting)|opt[- ]?out|do not (contact|email)|take me off|no (thanks|thank you)|not interested|leave me alone)\b/i,
    ],
  },
  {
    intent: "OBJECTION",
    patterns: [
      /\b(already have|not (right now|at this time|looking)|maybe later|too (expensive|busy)|no (budget|need)|we'?re? (set|covered|good)|under contract|happy with (our |current )?carrier)\b/i,
    ],
  },
  {
    intent: "OUT_OF_OFFICE",
    patterns: [
      /\b(out of (office|town)|on (vacation|leave|holiday)|auto[- ]?reply|away from|will (return|be back)|limited access|ooo)\b/i,
    ],
  },
];

function detectReplyIntent(subject: string, snippet: string): { intent: ReplyIntent; confidence: string } {
  const text = `${subject} ${snippet}`.toLowerCase();

  for (const { intent, patterns } of INTENT_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return { intent, confidence: "HIGH" };
      }
    }
  }

  return { intent: "NEUTRAL", confidence: "LOW" };
}

function getIntentAction(intent: ReplyIntent): string {
  switch (intent) {
    case "INTERESTED": return "HOT LEAD — call them today!";
    case "UNSUBSCRIBE": return "Remove from outreach list.";
    case "OBJECTION": return "Soft objection — follow up in 60 days.";
    case "OUT_OF_OFFICE": return "OOO — retry when they're back.";
    case "NEUTRAL": return "Review the reply and respond personally.";
  }
}

// ─── Gmail API Types ─────────────────────────────────────────

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailListResponse {
  messages?: GmailMessage[];
  resultSizeEstimate?: number;
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessageDetail {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: {
    headers?: GmailHeader[];
  };
}

/**
 * Main cron handler: check Gmail for prospect replies and auto-log them.
 *
 * - Fetches messages from the last 2 hours
 * - Matches sender email to Customer records in the database
 * - Auto-stops active email sequences for the prospect
 * - Detects reply intent (interested, unsubscribe, objection, etc.)
 * - Logs as SystemLog (INTEGRATION) and creates notifications with context
 * - Deduplicates by Gmail message ID stored in SystemLog.message
 */
export async function checkForReplies(): Promise<{
  checked: number;
  matched: number;
  logged: number;
}> {
  if (!env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    console.log("[Gmail] No refresh token configured — skipping reply check");
    return { checked: 0, matched: 0, logged: 0 };
  }

  const accessToken = await refreshAccessToken();

  // Get messages from last 2 hours
  const after = Math.floor((Date.now() - 2 * 60 * 60 * 1000) / 1000);
  const query = encodeURIComponent(`is:inbox after:${after}`);

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=20`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!listRes.ok) {
    console.error(`[Gmail] List messages failed (${listRes.status})`);
    return { checked: 0, matched: 0, logged: 0 };
  }
  const listData = (await listRes.json()) as GmailListResponse;

  if (!listData.messages?.length) {
    return { checked: 0, matched: 0, logged: 0 };
  }

  let checked = 0;
  let matched = 0;
  let logged = 0;

  for (const msg of listData.messages) {
    checked++;

    // Get message metadata + snippet for intent detection
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!msgRes.ok) continue;
    const msgData = (await msgRes.json()) as GmailMessageDetail;

    // Extract sender email
    const fromHeader =
      msgData.payload?.headers?.find((h) => h.name === "From")?.value || "";
    const subjectHeader =
      msgData.payload?.headers?.find((h) => h.name === "Subject")?.value || "";
    const emailMatch = fromHeader.match(/<([^>]+)>/);
    const senderEmail = emailMatch ? emailMatch[1] : fromHeader.trim();
    const snippet = msgData.snippet || "";

    // Skip own emails
    if (!senderEmail || senderEmail.includes("silkroutelogistics.ai")) continue;

    // Match sender to a customer/prospect in DB
    const customer = await prisma.customer.findFirst({
      where: { email: { equals: senderEmail, mode: "insensitive" } },
    });

    if (!customer) continue;
    matched++;

    // Check if we already logged this message (avoid duplicates)
    const alreadyLogged = await prisma.systemLog.findFirst({
      where: {
        source: "GmailReplyTracker",
        message: { contains: msg.id },
      },
    });
    if (alreadyLogged) continue;

    // Detect reply intent
    const { intent, confidence } = detectReplyIntent(subjectHeader, snippet);
    const action = getIntentAction(intent);

    // Auto-stop active email sequence for this prospect
    let sequenceStopped = false;
    try {
      const { stopSequenceByProspectEmail } = await import("./emailSequenceService");
      const stopped = await stopSequenceByProspectEmail(senderEmail, "REPLIED");
      sequenceStopped = !!stopped;
    } catch (err) {
      console.error(`[Gmail] Failed to stop sequence for ${senderEmail}:`, err);
    }

    // Log the reply as a SystemLog entry
    await prisma.systemLog.create({
      data: {
        logType: "INTEGRATION",
        severity: intent === "INTERESTED" ? "INFO" : intent === "UNSUBSCRIBE" ? "WARNING" : "INFO",
        source: "GmailReplyTracker",
        message: `Reply from ${customer.name} (${senderEmail}) — Gmail ID: ${msg.id}`,
        details: {
          customerId: customer.id,
          senderEmail,
          subject: subjectHeader,
          snippet,
          gmailId: msg.id,
          intent,
          intentConfidence: confidence,
          action,
          sequenceStopped,
        },
      },
    });

    // Log as Communication record for Lead Hunter conversation trail
    const ceoUser = await prisma.user.findFirst({
      where: { role: { in: ["ADMIN", "CEO"] }, isActive: true },
      select: { id: true },
    });
    if (ceoUser) {
      await prisma.communication.create({
        data: {
          type: "EMAIL_INBOUND",
          direction: "INBOUND",
          entityType: "SHIPPER",
          entityId: customer.id,
          from: senderEmail,
          to: "whaider@silkroutelogistics.ai",
          subject: subjectHeader,
          body: snippet,
          userId: ceoUser.id,
          metadata: { gmailId: msg.id, intent, intentConfidence: confidence, action, source: "GmailReplyTracker" },
        },
      });
    }

    // Create notification for admins/CEO with intent context
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "CEO"] }, isActive: true },
      select: { id: true },
    });

    const intentEmoji = intent === "INTERESTED" ? "[HOT]" : intent === "UNSUBSCRIBE" ? "[UNSUB]" : intent === "OBJECTION" ? "[OBJ]" : intent === "OUT_OF_OFFICE" ? "[OOO]" : "";
    const seqNote = sequenceStopped ? " Sequence auto-stopped." : "";

    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "GENERAL",
          title: `${intentEmoji} Reply from ${customer.name}`.trim(),
          message: `${customer.contactName || customer.name} replied: "${subjectHeader}".${seqNote} ${action}`,
          actionUrl: "/dashboard/lead-hunter",
        },
      });
    }

    logged++;
  }

  if (logged > 0) {
    console.log(
      `[Gmail] Checked ${checked} messages, matched ${matched} prospects, logged ${logged} replies`
    );
  }

  return { checked, matched, logged };
}
