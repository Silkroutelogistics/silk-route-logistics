/**
 * Ruling 4 (2026-09-21) — accounting is told when a carrier's invoice lands:
 * email to ACCOUNTING_EMAIL and an in-app row for every ACCOUNTING user. The
 * email carries the load ref, the carrier name, the CarrierPay amount and an
 * auth-gated settlement link -- no attachment, no bank or tax data.
 *
 * Prisma and the email transport are mocked; the assertions are about WHO
 * was sent WHAT. Adversarially verified at authoring: passing the invoice
 * bytes as an attachment turns the no-attachment case red; addressing the
 * email to the carrier turns the recipient case red; dropping the dedup
 * turns the once-per-document case red.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

const email = vi.hoisted(() => ({ sendEmail: vi.fn(async () => "msg-1") }));
vi.mock("../../../src/services/emailService", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, sendEmail: email.sendEmail };
});

import { notifyAccountingOfCarrierInvoice, settlementLinkFor } from "../../../src/services/carrierInvoiceNotifyService";
import { ACCOUNTING_EMAIL } from "../../../src/config/authority";

const mockPrisma = prisma as any;

function arm(opts: { pay?: { netAmount: number; status: string } | null; accountants?: string[]; carrierName?: string | null } = {}) {
  const { pay = { netAmount: 4100, status: "PREPARED" }, accountants = ["u-acct-1", "u-acct-2"], carrierName = "Peace Transport LLC" } = opts;
  mockPrisma.load.findUnique.mockResolvedValue({
    id: "load-1", referenceNumber: "R-1", loadNumber: "SRL-121492",
    originCity: "Lebanon", originState: "NH", destCity: "North Lake", destState: "TX",
    carrier: { firstName: "Stu", lastName: "Cook", company: null, carrierProfile: carrierName ? { companyName: carrierName } : null },
  });
  mockPrisma.carrierPay.findFirst.mockResolvedValue(pay);
  mockPrisma.user.findMany.mockResolvedValue(accountants.map((id) => ({ id })));
  mockPrisma.notification.findFirst.mockResolvedValue(null);
  mockPrisma.notification.create.mockResolvedValue({});
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("notifyAccountingOfCarrierInvoice", () => {
  it("emails ACCOUNTING_EMAIL -- not the carrier, not the AE -- with the load ref, carrier name, pay amount and the settlement link, and NO attachment", async () => {
    arm();
    const r = await notifyAccountingOfCarrierInvoice("load-1", "doc-9");
    expect(r).toEqual({ emailed: true, rows: 2 });
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
    const [to, subject, html, attachments] = email.sendEmail.mock.calls[0] as any[];
    expect(to).toBe(ACCOUNTING_EMAIL);
    expect(subject).toContain("SRL-121492");
    expect(html).toContain("SRL-121492");
    expect(html).toContain("Peace Transport LLC");
    expect(html).toContain("$4,100.00");
    expect(html).toContain(`https://silkroutelogistics.ai${settlementLinkFor("load-1", "doc-9")}`);
    expect(attachments).toBeUndefined();
  });

  it("carries no bank or tax data -- the body names nothing beyond the four facts", async () => {
    arm();
    await notifyAccountingOfCarrierInvoice("load-1", "doc-9");
    const html = (email.sendEmail.mock.calls[0] as any[])[2] as string;
    for (const banned of [/routing/i, /account number/i, /\bEIN\b/, /\bTIN\b/, /W-?9/i, /remit/i]) expect(html).not.toMatch(banned);
  });

  it("one in-app row per ACCOUNTING user, typed DOCUMENT_UPLOADED, linking the settlement by load and document", async () => {
    arm({ accountants: ["u-acct-1", "u-acct-2"] });
    await notifyAccountingOfCarrierInvoice("load-1", "doc-9");
    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
    const rows = mockPrisma.notification.create.mock.calls.map((c: any[]) => c[0].data);
    expect(rows.map((r: any) => r.userId).sort()).toEqual(["u-acct-1", "u-acct-2"]);
    for (const r of rows) {
      expect(r.type).toBe("DOCUMENT_UPLOADED");
      expect(r.actionUrl).toBe("/dashboard/settlements?load=load-1&invoice=doc-9");
      expect(r.message).toContain("Peace Transport LLC");
    }
    // The user query asks for ACCOUNTING and active only.
    expect(mockPrisma.user.findMany.mock.calls[0][0].where).toEqual({ role: "ACCOUNTING", isActive: true });
  });

  it("once per document: a user already told about THIS document gets no second row; a new document does", async () => {
    arm({ accountants: ["u-acct-1"] });
    mockPrisma.notification.findFirst.mockResolvedValueOnce({ id: "n-old" });
    const r = await notifyAccountingOfCarrierInvoice("load-1", "doc-9");
    expect(r.rows).toBe(0);
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(mockPrisma.notification.findFirst.mock.calls[0][0].where).toEqual({ userId: "u-acct-1", actionUrl: "/dashboard/settlements?load=load-1&invoice=doc-9" });
  });

  it("with no ACCOUNTING users the email still goes -- the inbox is the floor, the bell is extra", async () => {
    arm({ accountants: [] });
    const r = await notifyAccountingOfCarrierInvoice("load-1", "doc-9");
    expect(r).toEqual({ emailed: true, rows: 0 });
    expect(email.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("an invoice before the settlement exists says so instead of inventing a number", async () => {
    arm({ pay: null });
    await notifyAccountingOfCarrierInvoice("load-1", "doc-9");
    const html = (email.sendEmail.mock.calls[0] as any[])[2] as string;
    expect(html).toContain("settlement not yet prepared");
    expect(html).not.toMatch(/\$\d/);
  });

  it("falls back through company then the person's name when the profile has no company name", async () => {
    arm({ carrierName: null });
    await notifyAccountingOfCarrierInvoice("load-1", "doc-9");
    expect((email.sendEmail.mock.calls[0] as any[])[2]).toContain("Stu Cook");
  });

  it("never throws: a transport failure reports emailed=false and the rows still land; an unknown load is a skip", async () => {
    arm();
    email.sendEmail.mockRejectedValueOnce(new Error("resend down"));
    const r = await notifyAccountingOfCarrierInvoice("load-1", "doc-9");
    expect(r).toEqual({ emailed: false, rows: 2 });
    mockPrisma.load.findUnique.mockResolvedValue(null);
    expect(await notifyAccountingOfCarrierInvoice("nope", "doc-9")).toEqual({ emailed: false, rows: 0, skipped: "LOAD_NOT_FOUND" });
  });
});
