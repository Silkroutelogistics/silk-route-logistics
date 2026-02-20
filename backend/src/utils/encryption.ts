import crypto from "crypto";
import { prisma } from "../config/database";

const getKey = (): string => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  return key;
};

/**
 * Derive a 32-byte AES-256 key from the ENCRYPTION_KEY env var
 */
function deriveAesKey(): Buffer {
  const raw = getKey();
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Synchronous AES-256-GCM encrypt (for application-level encryption)
 * Returns base64 string: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = deriveAesKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag().toString("base64");
  return `${iv.toString("base64")}:${authTag}:${encrypted}`;
}

/**
 * Synchronous AES-256-GCM decrypt
 * Expects base64 string: iv:authTag:ciphertext
 */
export function decrypt(encryptedStr: string): string {
  const parts = encryptedStr.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted format");
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
 * Encrypt a plaintext value using PostgreSQL pgp_sym_encrypt.
 * Requires the pgcrypto extension to be enabled in the database.
 */
export async function encryptField(plaintext: string): Promise<string> {
  const key = getKey();
  const result = await prisma.$queryRaw<[{ encrypted: string }]>`
    SELECT pgp_sym_encrypt(${plaintext}, ${key}) AS encrypted
  `;
  return result[0].encrypted;
}

/**
 * Decrypt an encrypted value using PostgreSQL pgp_sym_decrypt.
 * Requires the pgcrypto extension to be enabled in the database.
 */
export async function decryptField(encrypted: string): Promise<string> {
  const key = getKey();
  const result = await prisma.$queryRaw<[{ decrypted: string }]>`
    SELECT pgp_sym_decrypt(${encrypted}::bytea, ${key}) AS decrypted
  `;
  return result[0].decrypted;
}

/**
 * One-way hash a value using PostgreSQL crypt() with gen_salt('bf').
 * Suitable for fields like SSN where you only need to verify, not retrieve.
 * Requires the pgcrypto extension to be enabled in the database.
 */
export async function hashField(value: string): Promise<string> {
  const result = await prisma.$queryRaw<[{ hashed: string }]>`
    SELECT crypt(${value}, gen_salt('bf')) AS hashed
  `;
  return result[0].hashed;
}

/**
 * Verify a plaintext value against a crypt() hash.
 * Returns true if the value matches the hash.
 */
export async function verifyHashedField(value: string, hash: string): Promise<boolean> {
  const result = await prisma.$queryRaw<[{ match: boolean }]>`
    SELECT crypt(${value}, ${hash}) = ${hash} AS match
  `;
  return result[0].match;
}
