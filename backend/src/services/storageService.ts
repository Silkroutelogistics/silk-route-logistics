import { cachedCapability, type CapabilityResult } from "../lib/capabilityProbe";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { env } from "../config/env";
import { log } from "../lib/logger";

const useS3 = !!(env.S3_BUCKET_NAME && env.AWS_ACCESS_KEY_ID);
const isProd = env.NODE_ENV === "production";

let s3: S3Client | null = null;
if (useS3) {
  s3 = new S3Client({
    region: env.AWS_REGION,
    // v3.8.avv — required for R2 and every other S3-compatible provider.
    //
    // Since @aws-sdk/client-s3 v3.729 the SDK computes and sends a checksum
    // header (x-amz-sdk-checksum-algorithm + x-amz-checksum-crc32) on EVERY
    // PutObject by default. R2 does not accept those and answers
    // `InvalidArgument / HTTP 400` — credentials fine, request refused.
    //
    // WHEN_REQUIRED restores the pre-3.729 behaviour: checksums only on
    // operations that genuinely need them. Safe against real AWS S3 too, since
    // it was the default there for years. Set unconditionally rather than only
    // when S3_ENDPOINT is present, so a future provider swap cannot reintroduce
    // it.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    // Unset endpoint = AWS S3. Set it (with AWS_REGION=auto) to point at any
    // S3-compatible provider such as Cloudflare R2 — config change, no code change.
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  log.info(
    `[Storage] Using S3 bucket: ${env.S3_BUCKET_NAME}${env.S3_ENDPOINT ? ` via ${env.S3_ENDPOINT}` : ""} (region ${env.AWS_REGION})`
  );
} else if (isProd) {
  // Loud on purpose. The old behaviour was a quiet log.info, so a mistyped or
  // rotated-away credential would silently downgrade production to the container's
  // ephemeral disk — every W-9, COI, POD and executed agreement destroyed on the
  // next deploy, with no alarm. uploadFile() also hard-refuses in production below.
  log.error(
    "[Storage] CRITICAL: object storage is NOT configured in production. " +
      "S3_BUCKET_NAME and AWS_ACCESS_KEY_ID must both be set. " +
      "Uploads will be REFUSED rather than written to ephemeral disk."
  );
} else {
  log.info("[Storage] Using local disk storage (development)");
}

/**
 * Resolve a local-fallback file URL to an absolute path inside UPLOAD_DIR.
 *
 * Replaces a previous `path.basename(fileUrl)` which (a) broke every nested key
 * — `carrier-docs/<id>/w9-1.pdf` was looked up in the upload root and 404'd —
 * and (b) discarded the directory component of an attacker-supplied URL.
 * Resolution is confined to UPLOAD_DIR so `../` cannot escape it.
 */
function localPathFromUrl(fileUrl: string): string {
  const key = fileUrl.startsWith("/uploads/") ? fileUrl.slice("/uploads/".length) : fileUrl;
  const root = path.resolve(env.UPLOAD_DIR);
  const resolved = path.resolve(root, key);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error("Invalid storage key: path escapes the upload directory");
  }
  return resolved;
}

/**
 * Upload a file buffer to storage.
 * Returns the stored file URL (s3:// prefix for S3, /uploads/ prefix for local).
 */
export async function uploadFile(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  if (useS3 && s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.S3_BUCKET_NAME!,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );
    return `s3://${env.S3_BUCKET_NAME}/${key}`;
  }

  // Local fallback — development only.
  // In production, refuse rather than write a legally-significant document to a
  // disk that is destroyed on the next deploy and (historically) served without auth.
  if (isProd) {
    throw new Error(
      "Object storage is not configured. Refusing to write to ephemeral local disk in production."
    );
  }

  const filePath = localPathFromUrl(`/uploads/${key}`);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, buffer);
  return `/uploads/${key}`;
}

/**
 * Upload a file to a specific path prefix (e.g., invoices/, rate-cons/).
 * Convenience wrapper that ensures the key is properly prefixed.
 */
export async function uploadFileToPath(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  return uploadFile(buffer, key, contentType);
}

/**
 * Get a download URL for a stored file.
 * For S3 files: returns a presigned URL.
 * For local files: returns the /uploads/ path as-is.
 *
 * A presigned URL is a bearer credential — anyone holding it can read the object,
 * with no further auth. The only caller (documentController.downloadDocument)
 * consumes it via an immediate 302, so it is live for milliseconds; the previous
 * 1-hour window meant a URL captured from browser history, a referrer header, a
 * proxy log or a shared screenshot stayed usable for an hour. 5 minutes is still
 * generous for a redirect while collapsing that window.
 */
export async function getDownloadUrl(fileUrl: string, expiresInSeconds = 300): Promise<string> {
  if (fileUrl.startsWith("s3://") && s3) {
    const key = fileUrl.replace(`s3://${env.S3_BUCKET_NAME}/`, "");
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME!,
      Key: key,
    });
    return getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  }

  // Local file — return path as-is (served by express.static)
  return fileUrl;
}

/**
 * Get a readable stream for a stored file (for piping to response).
 */
export async function getFileStream(fileUrl: string): Promise<Readable> {
  if (fileUrl.startsWith("s3://") && s3) {
    const key = fileUrl.replace(`s3://${env.S3_BUCKET_NAME}/`, "");
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: env.S3_BUCKET_NAME!,
        Key: key,
      })
    );
    return response.Body as Readable;
  }

  // Local file
  return fs.createReadStream(localPathFromUrl(fileUrl));
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(fileUrl: string): Promise<void> {
  if (fileUrl.startsWith("s3://") && s3) {
    const key = fileUrl.replace(`s3://${env.S3_BUCKET_NAME}/`, "");
    await s3.send(
      new DeleteObjectCommand({
        Bucket: env.S3_BUCKET_NAME!,
        Key: key,
      })
    );
    return;
  }

  // Local file
  try {
    await fsp.unlink(localPathFromUrl(fileUrl));
  } catch {
    // File may not exist (or key was invalid) — ignore
  }
}

/**
 * Validate file content magic bytes against claimed MIME type.
 * Works on Buffer (in-memory) instead of file path.
 */
const MAGIC_BYTES: Record<string, Buffer[]> = {
  "application/pdf": [Buffer.from([0x25, 0x50, 0x44, 0x46])],
  "image/jpeg": [Buffer.from([0xff, 0xd8, 0xff])],
  "image/png": [Buffer.from([0x89, 0x50, 0x4e, 0x47])],
  "application/msword": [Buffer.from([0xd0, 0xcf, 0x11, 0xe0])],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  ],
};

export function validateBufferSignature(buffer: Buffer, claimedMime: string): boolean {
  const signatures = MAGIC_BYTES[claimedMime];
  if (!signatures) return true;
  if (buffer.length < 8) return false;
  return signatures.some((sig) => buffer.subarray(0, sig.length).equals(sig));
}

/**
 * Check if a file URL is an S3 URL.
 */
export function isS3Url(fileUrl: string): boolean {
  return fileUrl.startsWith("s3://");
}

/**
 * Check if S3 storage is active.
 */
export function isS3Active(): boolean {
  return useS3;
}

/**
 * End-to-end storage self-test (ADMIN only, exposed at GET /api/admin/storage/selftest).
 *
 * `isS3Active()` only proves two env vars are non-empty. It does NOT prove the
 * credentials are valid, that the IAM policy grants PutObject/GetObject/DeleteObject,
 * or that AWS_REGION matches the bucket's actual region. Until the first real upload
 * lands, a misconfiguration is invisible — and the first upload is a carrier's W-9
 * during onboarding, which is the worst possible moment to discover it.
 *
 * This exercises the full round trip against the live bucket with a throwaway object:
 *   PutObject -> presign -> GET the presigned URL -> byte-compare -> DeleteObject
 *
 * Writes and removes a single ~40 byte object under the `_selftest/` prefix.
 */
export async function runStorageSelfTest(): Promise<{
  ok: boolean;
  mode: "s3" | "local";
  bucket: string | null;
  region: string | null;
  endpoint: string | null;
  steps: { name: string; ok: boolean; detail: string }[];
}> {
  const steps: { name: string; ok: boolean; detail: string }[] = [];
  const key = `_selftest/selftest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.txt`;
  const payload = Buffer.from(`srl-storage-selftest ${new Date().toISOString()}`);
  // Holder objects, not bare `let`: values are assigned inside async closures, and
  // TS control-flow analysis would otherwise narrow the bare bindings to `never`.
  const stored: { url: string | null } = { url: null };
  const presigned: { url: string | null } = { url: null };

  const record = async (name: string, fn: () => Promise<string>) => {
    try {
      steps.push({ name, ok: true, detail: await fn() });
      return true;
    } catch (e: any) {
      steps.push({ name, ok: false, detail: e?.name ? `${e.name}: ${e.message}` : String(e?.message ?? e) });
      return false;
    }
  };

  const wrote = await record("write (PutObject)", async () => {
    stored.url = await uploadFile(payload, key, "text/plain");
    return stored.url;
  });

  if (wrote && stored.url) {
    const storedUrl = stored.url;

    await record("presign (GetObject)", async () => {
      presigned.url = await getDownloadUrl(storedUrl);
      return presigned.url.startsWith("http") ? `${presigned.url.split("?")[0]} (+signature)` : presigned.url;
    });

    if (presigned.url && presigned.url.startsWith("http")) {
      const signedUrl = presigned.url;
      await record("read back via presigned URL", async () => {
        const resp = await fetch(signedUrl);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
        const got = Buffer.from(await resp.arrayBuffer());
        if (!got.equals(payload)) throw new Error("byte mismatch: content read back does not match content written");
        return `${got.length} bytes, content matches`;
      });
    }

    await record("delete (DeleteObject)", async () => {
      await deleteFile(storedUrl);
      return "removed";
    });
  }

  return {
    ok: steps.length > 0 && steps.every((s) => s.ok),
    mode: useS3 ? "s3" : "local",
    bucket: useS3 ? env.S3_BUCKET_NAME ?? null : null,
    region: useS3 ? env.AWS_REGION ?? null : null,
    endpoint: env.S3_ENDPOINT ?? null,
    steps,
  };
}

/**
 * v3.8.avo — what /api/health reports about object storage.
 *
 * Deliberately reads the SAME `useS3` const the upload path branches on, rather
 * than re-deriving the condition from env. A second copy of "is storage
 * configured" is a second answer, and the one health reports would be the one
 * nobody tested. If uploads work, this says configured; if uploads are being
 * refused, this says they are.
 *
 * Reports the provider so a misconfiguration is legible: `s3-compatible` means
 * S3_ENDPOINT is set (R2 or similar), and `local-disk` in production is the
 * state where every upload is refused.
 */
export function storageStatus(): CapabilityResult & { provider: string } {
  const provider = useS3 ? (env.S3_ENDPOINT ? "s3-compatible" : "s3") : "local-disk";
  // v3.8.awg — a ROUND TRIP, not a config read. `useS3` only says credentials
  // were present at boot; it cannot see a suspended account, a rotated key or a
  // deleted bucket, and this codebase has hit the first two.
  const r = cachedCapability("storage", useS3, async () => {
    const key = `_healthcheck/${Date.now()}-${Math.random().toString(36).slice(2)}.txt`;
    const url = await uploadFile(Buffer.from("srl health probe"), key, "text/plain");
    try {
      const stream = await getFileStream(url);
      await new Promise<void>((resolve, reject) => {
        let seen = 0;
        stream.on("data", (chunk: Buffer) => { seen += chunk.length; });
        stream.on("end", () => (seen > 0 ? resolve() : reject(new Error("object read back empty"))));
        stream.on("error", reject);
      });
    } finally {
      // Always clean up, including after a failed read — otherwise a broken read
      // path quietly fills the bucket with probe objects.
      await deleteFile(url).catch(() => {});
    }
    return { ok: true };
  });
  return { ...r, provider };
}
