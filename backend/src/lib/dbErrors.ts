/**
 * Prisma error handling utilities.
 * Centralizes database error detection — replaces ad-hoc error.code checks.
 */

import { Prisma } from "@prisma/client";

/** Check if error is a unique constraint violation, optionally on a specific field */
export function isUniqueConstraintViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return false;
  }
  if (!field) return true;
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.some((t) => t === field || String(t).includes(field));
  }
  return false;
}

/** Check if error is a record not found error */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025";
}

/** Check if error is a foreign key constraint failure */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

/** Extract a user-friendly message from a Prisma error */
export function prismaErrorMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002": {
        const fields = Array.isArray(error.meta?.target) ? (error.meta.target as string[]).join(", ") : "field";
        return `A record with this ${fields} already exists`;
      }
      case "P2003": return "Referenced record does not exist";
      case "P2025": return "Record not found";
      default: return `Database error (${error.code})`;
    }
  }
  return "An unexpected database error occurred";
}
