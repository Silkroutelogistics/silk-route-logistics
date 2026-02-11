import { prisma } from "../config/database";

const getKey = (): string => {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  return key;
};

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
