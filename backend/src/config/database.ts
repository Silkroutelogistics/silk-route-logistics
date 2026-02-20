import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

// Inline AES-256-GCM encrypt/decrypt to avoid circular dependency with encryption.ts
function deriveAesKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return Buffer.alloc(32); // no-op if key not set
  return crypto.createHash("sha256").update(key).digest();
}

function aesEncrypt(plaintext: string): string {
  if (!process.env.ENCRYPTION_KEY) return plaintext;
  const key = deriveAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag().toString("base64");
  return `${iv.toString("base64")}:${authTag}:${encrypted}`;
}

function aesDecrypt(encryptedStr: string): string {
  if (!process.env.ENCRYPTION_KEY) return encryptedStr;
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) return encryptedStr;
  const [ivB64, authTagB64, ciphertext] = parts;
  const key = deriveAesKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Map of model → fields that should be AES-256-GCM encrypted at rest.
 * Only non-indexed, non-unique fields that store PII / financial data.
 */
const ENCRYPTED_FIELDS: Record<string, string[]> = {
  Customer: ["taxId"],
  CarrierProfile: ["insurancePolicyNumber"],
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
