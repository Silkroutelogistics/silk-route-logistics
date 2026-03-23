import { prisma } from "../config/database";

// ─── Types ───────────────────────────────────────────────────

interface OfacMatch {
  name: string;
  score: number;
  type: string;
  sdnId: string;
  programs: string[];
  remarks: string;
}

interface ScreenResult {
  status: "CLEAR" | "POTENTIAL_MATCH" | "ERROR";
  matches: OfacMatch[];
}

// ─── Low-level OFAC API call ─────────────────────────────────

export async function screenName(
  name: string,
  type: "Entity" | "Individual"
): Promise<ScreenResult> {
  const url = new URL(
    "https://sanctionssearch.ofac.treas.gov/OpenAPI/v2/Search"
  );
  url.searchParams.set("name", name);
  url.searchParams.set("type", type);
  url.searchParams.set("minScore", "85");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(url.toString(), { signal: controller.signal });

    if (!res.ok) {
      console.error(`OFAC API returned ${res.status} for name="${name}"`);
      return { status: "ERROR", matches: [] };
    }

    const data = (await res.json()) as Record<string, any>;

    // If no matches returned, carrier is clear
    const sdnList: any[] = data?.matches ?? data?.sdnList ?? [];
    if (!sdnList.length) {
      return { status: "CLEAR", matches: [] };
    }

    const matches: OfacMatch[] = sdnList.map((entry: any) => ({
      name: entry.name ?? entry.sdnName ?? "",
      score: entry.score ?? 0,
      type: entry.type ?? entry.sdnType ?? "",
      sdnId: entry.sdnId ?? entry.uid ?? "",
      programs: entry.programs ?? [],
      remarks: entry.remarks ?? "",
    }));

    // Score >= 90 is a potential match
    const hasPotentialMatch = matches.some((m) => m.score >= 90);

    return {
      status: hasPotentialMatch ? "POTENTIAL_MATCH" : "CLEAR",
      matches: hasPotentialMatch ? matches.filter((m) => m.score >= 90) : [],
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error(`OFAC API timeout for name="${name}"`);
    } else {
      console.error(`OFAC API error for name="${name}":`, err.message);
    }
    return { status: "ERROR", matches: [] };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Screen a single carrier ─────────────────────────────────

export async function screenCarrier(carrierId: string) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: { id: true, companyName: true, contactName: true },
  });

  if (!carrier) {
    throw new Error(`CarrierProfile not found: ${carrierId}`);
  }

  const results: ScreenResult[] = [];

  // Screen company name as Entity
  if (carrier.companyName) {
    results.push(await screenName(carrier.companyName, "Entity"));
  }

  // Screen contact name as Individual
  if (carrier.contactName) {
    results.push(await screenName(carrier.contactName, "Individual"));
  }

  // Determine overall status
  const hasError = results.some((r) => r.status === "ERROR");
  const hasMatch = results.some((r) => r.status === "POTENTIAL_MATCH");
  const allMatches = results.flatMap((r) => r.matches);

  let ofacStatus: "CLEAR" | "POTENTIAL_MATCH" | "ERROR";
  if (hasError && !hasMatch) {
    ofacStatus = "ERROR";
  } else if (hasMatch) {
    ofacStatus = "POTENTIAL_MATCH";
  } else {
    ofacStatus = "CLEAR";
  }

  // Update carrier profile
  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: {
      ofacStatus,
      ofacScreenedAt: new Date(),
      ofacMatchDetails:
        allMatches.length > 0
          ? (JSON.parse(JSON.stringify(allMatches)) as any)
          : undefined,
    },
  });

  // Notify admins if match found
  if (ofacStatus === "POTENTIAL_MATCH") {
    await notifyAdmins(carrier, allMatches);
  }

  return { carrierId, ofacStatus, matches: allMatches };
}

// ─── Weekly rescan of all approved carriers ──────────────────

export async function weeklyOfacRescan() {
  const carriers = await prisma.carrierProfile.findMany({
    where: { status: "APPROVED" },
    select: { id: true, companyName: true, contactName: true },
  });

  console.log(`[OFAC Rescan] Screening ${carriers.length} approved carriers`);

  let matchCount = 0;
  let errorCount = 0;

  for (const carrier of carriers) {
    try {
      const result = await screenCarrier(carrier.id);

      if (result.ofacStatus === "POTENTIAL_MATCH") {
        matchCount++;

        // Determine highest match score
        const topScore = result.matches.length > 0
          ? Math.max(...result.matches.map((m) => m.score))
          : 0;

        // Create compliance alert
        await prisma.complianceAlert.create({
          data: {
            type: "OFAC_MATCH",
            entityType: "CARRIER",
            entityId: carrier.id,
            entityName: carrier.companyName ?? carrier.contactName ?? "Unknown",
            severity: "CRITICAL",
            status: "ACTIVE",
            expiryDate: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000 // 30-day review window
            ),
          },
        });

        // AUTO-SUSPEND: score ≥90 warrants immediate suspension pending review
        if (topScore >= 90) {
          await prisma.carrierProfile.update({
            where: { id: carrier.id },
            data: {
              onboardingStatus: "SUSPENDED",
              suspensionReason: `Auto-suspended: OFAC/SDN match detected (score: ${topScore}). Immediate review required.`,
              suspendedAt: new Date(),
            },
          });

          // Notify the carrier's user account
          const profile = await prisma.carrierProfile.findUnique({
            where: { id: carrier.id },
            select: { userId: true },
          });
          if (profile?.userId) {
            await prisma.notification.create({
              data: {
                userId: profile.userId,
                type: "COMPLIANCE",
                title: "Account Suspended — Compliance Review",
                message: "Your carrier account has been suspended pending compliance review. Please contact support for more information.",
                actionUrl: "/carrier/dashboard",
              },
            });
          }

          console.log(`[OFAC Rescan] AUTO-SUSPENDED carrier ${carrier.id} — OFAC match score ${topScore}`);
        }
      }

      if (result.ofacStatus === "ERROR") {
        errorCount++;
      }
    } catch (err: any) {
      console.error(
        `[OFAC Rescan] Failed for carrier ${carrier.id}:`,
        err.message
      );
      errorCount++;
    }
  }

  console.log(
    `[OFAC Rescan] Complete — ${carriers.length} screened, ${matchCount} matches, ${errorCount} errors`
  );

  return {
    total: carriers.length,
    matches: matchCount,
    errors: errorCount,
  };
}

// ─── Helpers ─────────────────────────────────────────────────

async function notifyAdmins(
  carrier: { id: string; companyName: string | null; contactName: string | null },
  matches: OfacMatch[]
) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  const carrierLabel = carrier.companyName ?? carrier.contactName ?? "Unknown";
  const topScore = Math.max(...matches.map((m) => m.score));

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      type: "OFAC_MATCH",
      title: "OFAC SDN Match Detected",
      message: `Carrier "${carrierLabel}" has a potential OFAC match (score: ${topScore}). Immediate review required.`,
      link: `/carriers/${carrier.id}`,
    })),
  });
}
