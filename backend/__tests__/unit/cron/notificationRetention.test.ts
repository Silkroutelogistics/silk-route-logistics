// §13.3 Item 322 — notification retention deletes read rows by readAt.
// The read branch keyed on `read: true`, which nothing writes, so it never fired.
// The deleteMany double EVALUATES the WHERE against rows shaped like production:
// `read` false everywhere, `readAt` set on the rows a user opened.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { cleanupStaleNotifications } from "../../../src/cron/index";

const p = prisma as any;
const NOW = Date.parse("2026-09-26T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000);
const ROWS = [
  { id: "read-40d", read: false, readAt: daysAgo(40), createdAt: daysAgo(45) },
  { id: "read-10d", read: false, readAt: daysAgo(10), createdAt: daysAgo(12) },
  { id: "unread-100d", read: false, readAt: null, createdAt: daysAgo(100) },
  { id: "unread-50d", read: false, readAt: null, createdAt: daysAgo(50) },
];
const cmp = (value: any, cond: any) =>
  cond && typeof cond === "object" && !(cond instanceof Date)
    ? value != null && (!("lt" in cond) || value < cond.lt)
    : value === cond;

let store: typeof ROWS;
beforeEach(() => {
  store = ROWS.map((r) => ({ ...r }));
  p.notification.deleteMany = vi.fn(async ({ where }: any) => {
    const hit = store.filter((r: any) => Object.entries(where).every(([k, c]) => cmp(r[k], c)));
    store = store.filter((r) => !hit.includes(r));
    return { count: hit.length };
  });
});

describe("Item 322: notification retention", () => {
  it("deletes a notification read more than 30 days ago, though `read` is still false", async () => {
    const r = await cleanupStaleNotifications(NOW);
    expect(r.read).toBe(1);
    expect(store.map((x) => x.id)).not.toContain("read-40d");
  });

  it("keeps a notification read 10 days ago", async () => {
    await cleanupStaleNotifications(NOW);
    expect(store.map((x) => x.id)).toContain("read-10d");
  });

  it("the 90-day branch is unchanged: unread >90d goes, unread 50d stays", async () => {
    const r = await cleanupStaleNotifications(NOW);
    expect(r.unread).toBe(1);
    expect(store.map((x) => x.id).sort()).toEqual(["read-10d", "unread-50d"]);
    expect(p.notification.deleteMany.mock.calls[1][0].where).toEqual({ read: false, createdAt: { lt: daysAgo(90) } });
  });
});
