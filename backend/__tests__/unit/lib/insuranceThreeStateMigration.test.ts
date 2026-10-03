// coi-verify-email-fix C2: the migration that makes the three endorsements nullable,
// turns every stored false into null, and moves the JetEx agent-email hold from code
// to a column. It writes production data on deploy, so its text is pinned here. Its
// behaviour against Postgres was proven on a throwaway container (handoff).
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const DIR = path.join(__dirname, "../../../prisma/migrations/20261003120000_insurance_record_three_state");
const raw = fs.readFileSync(path.join(DIR, "migration.sql"), "utf8");
// Code only: a comment must not satisfy an assertion about the SQL.
const sql = raw.split(/\r?\n/).map((l) => l.replace(/--.*$/, "")).join("\n");
const ENDORSEMENTS = ["additionalInsuredSRL", "waiverOfSubrogation", "thirtyDayCancellationNotice"];
const JETEX = "cmublocyz00flh02dhyvwqwky";

describe("the three-state insurance migration", () => {
  it("drops the default and NOT NULL on each endorsement", () => {
    for (const c of ENDORSEMENTS) {
      expect(sql).toContain(`ALTER COLUMN "${c}" DROP DEFAULT`);
      expect(sql).toContain(`ALTER COLUMN "${c}" DROP NOT NULL`);
    }
  });

  it("turns only false into null; a true is never touched", () => {
    for (const c of ENDORSEMENTS) {
      expect(sql).toContain(`SET "${c}" = NULL WHERE "${c}" = false;`);
    }
    expect(sql).not.toMatch(/=\s*true/i);
    expect(sql).not.toMatch(/SET\s+"(additionalInsuredSRL|waiverOfSubrogation|thirtyDayCancellationNotice)"\s*=\s*(false|true)/i);
  });

  it("names exactly one carrier, JetEx, and only sets its agent-email hold", () => {
    const ids = [...sql.matchAll(/'(c[a-z0-9]{24})'/g)].map((m) => m[1]);
    expect(ids).toEqual([JETEX]);
    expect(sql).toMatch(new RegExp(`SET "agentEmailHoldUntil" = TIMESTAMP '9999-12-31 00:00:00' WHERE "id" = '${JETEX}';`));
  });

  it("touches carrier_profiles and nothing else, and deletes nothing", () => {
    const tables = [...sql.matchAll(/\b(?:ALTER TABLE|UPDATE)\s+"(\w+)"/g)].map((m) => m[1]);
    expect(new Set(tables)).toEqual(new Set(["carrier_profiles"]));
    expect(sql).not.toMatch(/\b(DELETE|DROP\s+COLUMN|DROP\s+TABLE|TRUNCATE)\b/i);
  });

  it("is stored with LF line endings", () => {
    expect(raw.includes("\r")).toBe(false);
  });
});
