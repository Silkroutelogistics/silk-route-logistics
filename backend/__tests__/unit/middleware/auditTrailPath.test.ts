/**
 * C2 (2026-09-25) — the auto-audit row names the entity, not the id.
 *
 * THE DEFECT. `auditMiddleware` is mounted app-level but writes its row from
 * `res.on("finish")`, and by then Express has rewritten `req.url` to the
 * innermost mount-relative path. So `parseEntityFromPath(req.path)` was handed
 * `/<id>/status` instead of `/api/loads/<id>/status`, and wrote the load id into
 * entityType (uppercased) and the action word into entityId.
 *
 * WHY THIS TEST HAS TO GO OVER HTTP THROUGH A MOUNTED ROUTER. Calling
 * parseEntityFromPath directly proves only that a pure function parses a string
 * — it cannot see the rewrite, because the rewrite is Express's, not the
 * parser's. The subject here is a middleware's interaction with mounting, so the
 * test mounts (§19 Sub-pattern 16: a guard whose subject is a boundary must
 * exercise the boundary). The mount shape mirrors server.ts exactly:
 * `app.use(auditMiddleware)` then `app.use("/api", routes)`, with the routers
 * nested one level deeper the way routes/index.ts nests them.
 *
 * ADVERSARIALLY VERIFIED at authoring, by restoring the original `req.path`
 * reads in both places: the four shape cases go red naming the id as entityType,
 * while the skip-list and non-2xx cases stay green — which is the point, since
 * those two read the path BEFORE routing and were never affected.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { prisma } from "../../../src/config/database";
import { auditMiddleware } from "../../../src/middleware/auditTrail";

const mockPrisma = prisma as any;

/** Rows the middleware tried to write, in order. */
function rows(): Array<{ entityType: string; entityId: string; action: string; changedFields: any }> {
  return (mockPrisma.auditTrail.create.mock.calls as any[]).map((c) => c[0].data);
}

/**
 * An app shaped like server.ts: the audit middleware app-level, then the API
 * routers mounted under /api and nested one level deeper — which is what makes
 * req.path mount-relative by the time `finish` fires.
 */
function makeApp() {
  const app = express();
  app.use(express.json());
  // Stand-in for `authenticate`. The middleware only writes when req.user?.id is
  // set, so without this every case would pass by writing nothing at all.
  app.use((req: any, _res, next) => {
    req.user = { id: "u-test", email: "t@srl.invalid", role: "ADMIN" };
    next();
  });
  app.use(auditMiddleware as any);

  const loads = express.Router();
  loads.patch("/:id/status", (_req, res) => { res.status(200).json({ ok: true }); });
  loads.patch("/:id", (_req, res) => { res.status(200).json({ ok: true }); });
  loads.post("/", (_req, res) => { res.status(201).json({ ok: true }); });
  loads.patch("/:id/boom", (_req, res) => { res.status(422).json({ error: "no" }); });

  const customers = express.Router();
  customers.patch("/:id", (_req, res) => { res.status(200).json({ ok: true }); });

  const auth = express.Router();
  auth.post("/login", (_req, res) => { res.status(200).json({ ok: true }); });

  const api = express.Router();
  api.use("/loads", loads);
  api.use("/customers", customers);
  api.use("/auth", auth);
  app.use("/api", api);
  return app;
}

const LOAD_ID = "cmuct8gnk001vma2db2hbgrsj";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("auditMiddleware names the entity, not the id", () => {
  it("a two-segment action route records the resource and the id", async () => {
    // The production shape that produced 63 `entityId = 'status'` rows.
    await request(makeApp()).patch(`/api/loads/${LOAD_ID}/status`).send({ status: "DELIVERED" });
    const [row] = rows();
    expect(row).toBeDefined();
    expect(row.entityType).toBe("LOADS");
    expect(row.entityId).toBe(LOAD_ID);
    // The id must not have become the type, which is the whole defect.
    expect(row.entityType).not.toBe(LOAD_ID.toUpperCase());
    expect(row.entityId).not.toBe("status");
  });

  it("a bare /:id route records the id rather than 'unknown'", async () => {
    // The DOMINANT production shape: 3,355 rows with entityId = 'unknown',
    // because the mount-relative path had a single segment and parts[1] was ''.
    await request(makeApp()).patch(`/api/customers/${LOAD_ID}`).send({ name: "x" });
    const [row] = rows();
    expect(row.entityType).toBe("CUSTOMERS");
    expect(row.entityId).toBe(LOAD_ID);
    expect(row.entityId).not.toBe("unknown");
  });

  it("a collection POST records the resource, with no id to record", async () => {
    await request(makeApp()).post("/api/loads").send({ x: 1 });
    const [row] = rows();
    expect(row.entityType).toBe("LOADS");
    // Genuinely absent rather than mis-parsed: a create has no id in the path.
    expect(row.entityId).toBe("unknown");
    expect(row.action).toBe("CREATE");
  });

  it("the recorded path is the absolute one a reader can navigate to", async () => {
    await request(makeApp()).patch(`/api/loads/${LOAD_ID}/status`).send({ status: "X" });
    const [row] = rows();
    expect(row.changedFields.path).toBe(`/api/loads/${LOAD_ID}/status`);
    // Not the mount-relative fragment, which names no API surface.
    expect(row.changedFields.path).not.toBe(`/${LOAD_ID}/status`);
  });

  it("a query string is not recorded as part of the entity", async () => {
    await request(makeApp()).patch(`/api/loads/${LOAD_ID}/status?force=1`).send({});
    const [row] = rows();
    expect(row.entityId).toBe(LOAD_ID);
    expect(row.changedFields.path).toBe(`/api/loads/${LOAD_ID}/status`);
  });
});

describe("auditMiddleware still refuses what it always refused", () => {
  it("skips /api/auth", async () => {
    // Reads the path BEFORE routing, so this was never affected by the defect —
    // asserted so the fix cannot quietly widen what gets audited.
    await request(makeApp()).post("/api/auth/login").send({ email: "a@b.c" });
    expect(rows()).toHaveLength(0);
  });

  it("writes nothing for a non-2xx response", async () => {
    await request(makeApp()).patch(`/api/loads/${LOAD_ID}/boom`).send({});
    expect(rows()).toHaveLength(0);
  });

  it("writes nothing for a read", async () => {
    const app = makeApp();
    (app as any).get("/api/loads/:id", (_req: any, res: any) => res.status(200).json({}));
    await request(app).get(`/api/loads/${LOAD_ID}`);
    expect(rows()).toHaveLength(0);
  });

  it("writes nothing when there is no authenticated user", async () => {
    const app = express();
    app.use(express.json());
    app.use(auditMiddleware as any); // no req.user
    const api = express.Router();
    const loads = express.Router();
    loads.patch("/:id/status", (_req, res) => { res.status(200).json({ ok: true }); });
    api.use("/loads", loads);
    app.use("/api", api);
    await request(app).patch(`/api/loads/${LOAD_ID}/status`).send({});
    expect(rows()).toHaveLength(0);
  });
});

describe("vacuity tripwire", () => {
  it("the harness genuinely reaches the middleware and writes rows", async () => {
    // Without this, every assertion above could be passing on zero rows — the
    // shape that let 90% of a table go mis-written under green tests.
    await request(makeApp()).patch(`/api/loads/${LOAD_ID}/status`).send({});
    expect(mockPrisma.auditTrail.create).toHaveBeenCalledTimes(1);
  });

  it("the mount really does rewrite req.path, so the test is testing something", async () => {
    // Proves the precondition the defect depended on. If Express ever stopped
    // rewriting, these cases would pass for a reason unrelated to the fix and
    // this assertion is what would say so.
    let seenInFinish: string | null = null;
    const app = express();
    app.use(express.json());
    app.use((req: any, _res, next) => { req.user = { id: "u", role: "ADMIN" }; next(); });
    app.use((req: any, res: any, next: any) => {
      res.on("finish", () => { seenInFinish = req.path; });
      next();
    });
    const api = express.Router();
    const loads = express.Router();
    loads.patch("/:id/status", (_req, res) => { res.status(200).json({ ok: true }); });
    api.use("/loads", loads);
    app.use("/api", api);
    await request(app).patch(`/api/loads/${LOAD_ID}/status`).send({});
    expect(seenInFinish).toBe(`/${LOAD_ID}/status`);
    expect(seenInFinish).not.toBe(`/api/loads/${LOAD_ID}/status`);
  });
});
