import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import {
  isUniqueConstraintViolation,
  isRecordNotFound,
  isForeignKeyViolation,
  prismaErrorMessage,
} from "../../../src/lib/dbErrors";

describe("dbErrors", () => {
  const makeP2002 = (fields: string[]) =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "5.0.0",
      meta: { target: fields },
    });

  const makeP2025 = () =>
    new Prisma.PrismaClientKnownRequestError("Record not found", {
      code: "P2025",
      clientVersion: "5.0.0",
    });

  const makeP2003 = () =>
    new Prisma.PrismaClientKnownRequestError("Foreign key constraint failed", {
      code: "P2003",
      clientVersion: "5.0.0",
    });

  describe("isUniqueConstraintViolation", () => {
    it("returns true for P2002 errors", () => {
      expect(isUniqueConstraintViolation(makeP2002(["email"]))).toBe(true);
    });

    it("returns true when field matches", () => {
      expect(isUniqueConstraintViolation(makeP2002(["email"]), "email")).toBe(true);
    });

    it("returns false when field does not match", () => {
      expect(isUniqueConstraintViolation(makeP2002(["email"]), "phone")).toBe(false);
    });

    it("returns false for non-Prisma errors", () => {
      expect(isUniqueConstraintViolation(new Error("random"))).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(isUniqueConstraintViolation(null)).toBe(false);
      expect(isUniqueConstraintViolation(undefined)).toBe(false);
    });
  });

  describe("isRecordNotFound", () => {
    it("returns true for P2025 errors", () => {
      expect(isRecordNotFound(makeP2025())).toBe(true);
    });

    it("returns false for other Prisma errors", () => {
      expect(isRecordNotFound(makeP2002(["email"]))).toBe(false);
    });
  });

  describe("isForeignKeyViolation", () => {
    it("returns true for P2003 errors", () => {
      expect(isForeignKeyViolation(makeP2003())).toBe(true);
    });
  });

  describe("prismaErrorMessage", () => {
    it("returns field name for unique violations", () => {
      expect(prismaErrorMessage(makeP2002(["email"]))).toContain("email");
    });

    it("returns 'Record not found' for P2025", () => {
      expect(prismaErrorMessage(makeP2025())).toBe("Record not found");
    });

    it("returns generic message for unknown errors", () => {
      expect(prismaErrorMessage(new Error("random"))).toBe("An unexpected database error occurred");
    });
  });
});
