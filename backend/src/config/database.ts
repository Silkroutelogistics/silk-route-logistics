import { PrismaClient, Prisma } from "@prisma/client";
import { encrypt, decrypt } from "../utils/encryption";

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
  return ENC_PREFIX + encrypt(val);
}

function decryptValue(val: unknown): unknown {
  if (typeof val !== "string" || !val.startsWith(ENC_PREFIX)) return val;
  try { return decrypt(val.slice(ENC_PREFIX.length)); } catch { return val; }
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
