import { prisma } from "../config/database";
import crypto from "crypto";

let rekognitionClient: any = null;
let CompareFacesCommand: any = null;
try {
  if (process.env.AWS_ACCESS_KEY_ID) {
    const sdk = require("@aws-sdk/client-rekognition");
    CompareFacesCommand = sdk.CompareFacesCommand;
    rekognitionClient = new sdk.RekognitionClient({
      region: process.env.AWS_REGION || "us-east-1",
    });
  }
} catch (err) {
  console.warn("[Biometric] AWS Rekognition SDK not available, using hash-based verification:", (err as Error).message);
}

const MATCH_THRESHOLD = 80;

/**
 * Compare two face images and return a similarity score.
 * Uses AWS Rekognition when available, otherwise falls back to a basic hash comparison
 * that flags the result for manual review.
 */
export async function compareFaces(
  photoIdUrl: string,
  selfieUrl: string
): Promise<{ score: number; matched: boolean }> {
  // AWS Rekognition path
  if (rekognitionClient && CompareFacesCommand) {
    const [sourceResp, targetResp] = await Promise.all([
      fetch(photoIdUrl),
      fetch(selfieUrl),
    ]);

    const sourceBytes = new Uint8Array(await sourceResp.arrayBuffer());
    const targetBytes = new Uint8Array(await targetResp.arrayBuffer());

    const command = new CompareFacesCommand({
      SourceImage: { Bytes: sourceBytes },
      TargetImage: { Bytes: targetBytes },
      SimilarityThreshold: MATCH_THRESHOLD,
    });

    const result = await rekognitionClient.send(command);
    const score =
      result.FaceMatches && result.FaceMatches.length > 0
        ? result.FaceMatches[0].Similarity ?? 0
        : 0;

    return { score, matched: score >= MATCH_THRESHOLD };
  }

  // Fallback: basic hash comparison (flags for manual review)
  const [sourceResp, targetResp] = await Promise.all([
    fetch(photoIdUrl),
    fetch(selfieUrl),
  ]);

  const sourceBuffer = Buffer.from(await sourceResp.arrayBuffer());
  const targetBuffer = Buffer.from(await targetResp.arrayBuffer());

  const sourceHash = crypto.createHash("sha256").update(sourceBuffer).digest("hex");
  const targetHash = crypto.createHash("sha256").update(targetBuffer).digest("hex");

  if (sourceHash === targetHash) {
    return { score: 100, matched: true };
  }

  // Different hashes — cannot determine match without AI, flag for manual review
  return { score: 0, matched: false };
}

/**
 * Run facial match verification for a carrier.
 * Reads the CarrierIdentityVerification record, compares the photo ID against the
 * live selfie, and persists the result.
 */
export async function verifyFacialMatch(carrierId: string) {
  const verification = await prisma.carrierIdentityVerification.findUnique({
    where: { carrierId },
  });

  if (!verification) {
    throw new Error(`No identity verification record found for carrier ${carrierId}`);
  }

  if (!verification.photoIdUrl) {
    throw new Error("Photo ID has not been uploaded");
  }

  if (!verification.selfieUrl) {
    throw new Error("Selfie has not been uploaded");
  }

  try {
    const { score, matched } = await compareFaces(
      verification.photoIdUrl,
      verification.selfieUrl
    );

    // When using the fallback hash comparison and images differ, mark as SKIPPED for manual review
    const usedFallback = !rekognitionClient;
    let status: "MATCHED" | "MISMATCH" | "SKIPPED";

    if (matched) {
      status = "MATCHED";
    } else if (usedFallback) {
      status = "SKIPPED";
    } else {
      status = "MISMATCH";
    }

    const updated = await prisma.carrierIdentityVerification.update({
      where: { carrierId },
      data: {
        facialMatchScore: score,
        facialMatchStatus: status,
        facialMatchVerifiedAt: new Date(),
      },
    });

    return updated;
  } catch (error) {
    await prisma.carrierIdentityVerification.update({
      where: { carrierId },
      data: {
        facialMatchStatus: "ERROR",
        facialMatchVerifiedAt: new Date(),
      },
    });

    throw error;
  }
}
