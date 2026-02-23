import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

// ─── Key Rotation Support ─────────────────────────────────
// ENCRYPTION_KEY = current key (required)
// ENCRYPTION_KEY_PREVIOUS = old key for decryption during rotation (optional)
// Encrypted values are prefixed with key version: "v1:" or "v2:" etc.
const CURRENT_KEY_VERSION = process.env.ENCRYPTION_KEY_VERSION || "v1";

function deriveAesKey(rawKey: string): Buffer {
  return crypto.createHash("sha256").update(rawKey).digest();
}

function getCurrentKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY is required — cannot encrypt/decrypt without it");
  return deriveAesKey(key);
}

function getPreviousKey(): Buffer | null {
  const key = process.env.ENCRYPTION_KEY_PREVIOUS;
  if (!key) return null;
  return deriveAesKey(key);
}

function aesEncrypt(plaintext: string): string {
  const key = getCurrentKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag().toString("base64");
  // Include key version so we know which key to use for decryption
  return `${CURRENT_KEY_VERSION}:${iv.toString("base64")}:${authTag}:${encrypted}`;
}

function aesDecryptWithKey(encryptedStr: string, key: Buffer): string {
  const parts = encryptedStr.split(":");
  // New format: version:iv:authTag:ciphertext (4 parts)
  // Legacy format: iv:authTag:ciphertext (3 parts)
  let ivB64: string, authTagB64: string, ciphertext: string;
  if (parts.length === 4) {
    [, ivB64, authTagB64, ciphertext] = parts;
  } else if (parts.length === 3) {
    [ivB64, authTagB64, ciphertext] = parts;
  } else {
    return encryptedStr;
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function aesDecrypt(encryptedStr: string): string {
  // Try current key first
  try {
    return aesDecryptWithKey(encryptedStr, getCurrentKey());
  } catch {
    // Fall back to previous key (rotation support)
    const prevKey = getPreviousKey();
    if (prevKey) {
      try {
        return aesDecryptWithKey(encryptedStr, prevKey);
      } catch {
        // Both keys failed
      }
    }
    return encryptedStr;
  }
}

/**
 * Map of model → fields that should be AES-256-GCM encrypted at rest.
 * Only non-indexed, non-unique fields that store PII / financial data.
 */
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Customer: ["taxId"],
  CarrierProfile: ["insurancePolicyNumber"],
  // Note: User.totpSecret and totpBackupCodes are encrypted at the application layer
  // by totpService.ts using encrypt/decrypt from utils/encryption.ts (to avoid double encryption)
  Driver: ["licenseNumber"],
};

const ENC_PREFIX = "enc:";

function encryptValue(val: unknown): unknown {
  if (typeof val !== "string" || !val || val.startsWith(ENC_PREFIX)) return val;
  return ENC_PREFIX + aesEncrypt(val);
}

function decryptValue(val: unknown): unknown {
  if (typeof val !== "string" || !val.startsWith(ENC_PREFIX)) return val;
  try { return aesDecrypt(val.slice(ENC_PREFIX.length)); } catch { return val; }
}

function decryptRecord(model: string, record: any): any {
  if (!record || typeof record !== "object") return record;
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields) return record;
  for (const f of fields) {
    if (f in record) record[f] = decryptValue(record[f]);
  }
  return record;
}

function encryptDataFields(model: string, data: any): void {
  if (!data || typeof data !== "object") return;
  const fields = ENCRYPTED_FIELDS[model];
  if (!fields) return;
  for (const f of fields) {
    if (f in data) data[f] = encryptValue(data[f]);
  }
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    datasourceUrl: buildDatabaseUrl(),
  });

  // Use Prisma client extension for transparent field encryption
  return client.$extends({
    query: {
      $allOperations({ model, operation, args, query }: { model?: string; operation: string; args: any; query: (args: any) => Promise<any> }) {
        // Encrypt on write operations
        if (model && ENCRYPTED_FIELDS[model] && args.data) {
          encryptDataFields(model, args.data);
        }

        return query(args).then((result: any) => {
          // Decrypt on read
          if (model && ENCRYPTED_FIELDS[model]) {
            if (Array.isArray(result)) {
              result.forEach((r: any) => decryptRecord(model, r));
            } else {
              decryptRecord(model, result);
            }
          }
          return result;
        });
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma || createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

function buildDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url) return undefined;

  // Neon and most cloud Postgres providers require SSL.
  // Ensure sslmode=require is present in production.
  if (process.env.NODE_ENV === "production" && !url.includes("sslmode=")) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}sslmode=require`;
  }

  return url;
}
