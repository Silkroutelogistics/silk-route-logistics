import { env } from "../config/env";
import { prisma } from "../config/database";

/**
 * Gmail Reply Tracking Service
 *
 * Watches the CEO's Gmail inbox (whaider@silkroutelogistics.ai) for replies
 * from prospects and auto-logs them in the Lead Hunter pipeline.
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
  payload?: {
    headers?: GmailHeader[];
  };
}

/**
 * Main cron handler: check Gmail for prospect replies and auto-log them.
 *
 * - Fetches messages from the last 2 hours
 * - Matches sender email to Customer records in the database
 * - Logs as SystemLog (INTEGRATION) and creates admin notifications
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
  const listData: GmailListResponse = await listRes.json();

  if (!listData.messages?.length) {
    return { checked: 0, matched: 0, logged: 0 };
  }

  let checked = 0;
  let matched = 0;
  let logged = 0;

  for (const msg of listData.messages) {
    checked++;

    // Get message metadata (From, Subject headers only)
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

    // Log the reply as a SystemLog entry
    await prisma.systemLog.create({
      data: {
        logType: "INTEGRATION",
        severity: "INFO",
        source: "GmailReplyTracker",
        message: `Reply received from ${customer.name} (${senderEmail}) — Gmail ID: ${msg.id}`,
        details: {
          customerId: customer.id,
          senderEmail,
          subject: subjectHeader,
          gmailId: msg.id,
        },
      },
    });

    // Create notification for admins / CEO
    const admins = await prisma.user.findMany({
      where: { role: { in: ["ADMIN", "CEO"] }, isActive: true },
      select: { id: true },
    });
    for (const admin of admins) {
      await prisma.notification.create({
        data: {
          userId: admin.id,
          type: "GENERAL",
          title: `Reply from ${customer.name}`,
          message: `${customer.contactName || customer.name} replied to your email. Subject: "${subjectHeader}"`,
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
