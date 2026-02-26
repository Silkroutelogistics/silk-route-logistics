import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { env } from "../config/env";

const useS3 = !!(env.S3_BUCKET_NAME && env.AWS_ACCESS_KEY_ID);

let s3: S3Client | null = null;
if (useS3) {
  s3 = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    },
  });
  console.log(`[Storage] Using S3 bucket: ${env.S3_BUCKET_NAME}`);
} else {
  console.log("[Storage] Using local disk storage (S3 not configured)");
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

  // Local fallback
  const filePath = path.resolve(env.UPLOAD_DIR, key);
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
 * For S3 files: returns a presigned URL (valid 1 hour).
 * For local files: returns the /uploads/ path as-is.
 */
export async function getDownloadUrl(fileUrl: string): Promise<string> {
  if (fileUrl.startsWith("s3://") && s3) {
    const key = fileUrl.replace(`s3://${env.S3_BUCKET_NAME}/`, "");
    const command = new GetObjectCommand({
      Bucket: env.S3_BUCKET_NAME!,
      Key: key,
    });
    return getSignedUrl(s3, command, { expiresIn: 3600 });
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
  const filePath = path.resolve(env.UPLOAD_DIR, path.basename(fileUrl));
  return fs.createReadStream(filePath);
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
  const filePath = path.resolve(env.UPLOAD_DIR, path.basename(fileUrl));
  try {
    await fsp.unlink(filePath);
  } catch {
    // File may not exist — ignore
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
