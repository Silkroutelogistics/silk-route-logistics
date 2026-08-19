// Arc 2 Item 4 — FMCSA Socrata AuthHist parsing and row selection.
//
// These pure helpers are where this silently goes wrong. Each rule below was
// derived from a live probe of dataset 9mw4-x3tu on 2026-08-18, not from
// documentation, and each one has a failure mode that looks like "the dataset
// has no data" rather than like a bug.

import { describe, it, expect } from "vitest";
import {
  normalizeDocket,
  padDot,
  parseServedDate,
  pickGrantRow,
} from "../../../src/services/authorityHistoryService";

describe("normalizeDocket", () => {
  it("accepts the shapes the DB actually stores", () => {
    expect(normalizeDocket("MC-1794414")).toBe("MC1794414");
    expect(normalizeDocket("1794414")).toBe("MC1794414");
    expect(normalizeDocket("mc 1794414")).toBe("MC1794414");
    expect(normalizeDocket("MC1794414")).toBe("MC1794414");
  });

  it("returns null when there is nothing to key on", () => {
    expect(normalizeDocket(null)).toBeNull();
    expect(normalizeDocket("")).toBeNull();
    expect(normalizeDocket("MC-")).toBeNull();
  });
});

describe("padDot", () => {
  it("zero-pads to 8, which is the whole reason lookups by DOT work", () => {
    // Live probe: dot_number=4526880 returns [], dot_number=04526880 returns
    // the row. Unpadded, a backfill reports "no record found" for every carrier
    // and reads as an empty dataset rather than a bug.
    expect(padDot("4526880")).toBe("04526880");
    expect(padDot("1911857")).toBe("01911857");
  });

  it("leaves an already-padded value alone", () => {
    expect(padDot("04526880")).toBe("04526880");
  });

  it("strips punctuation before padding", () => {
    expect(padDot("USDOT 4526880")).toBe("04526880");
  });

  it("returns null when there is nothing to key on", () => {
    expect(padDot(null)).toBeNull();
    expect(padDot("n/a")).toBeNull();
  });
});

describe("parseServedDate", () => {
  it("reads the dataset's MM/DD/YYYY text format", () => {
    expect(parseServedDate("02/25/2026")?.toISOString().slice(0, 10)).toBe("2026-02-25");
    expect(parseServedDate("12/27/1982")?.toISOString().slice(0, 10)).toBe("1982-12-27");
  });

  it("parses as UTC so a local timezone cannot shift the day", () => {
    const d = parseServedDate("08/31/2010")!;
    expect(d.getUTCFullYear()).toBe(2010);
    expect(d.getUTCMonth()).toBe(7);
    expect(d.getUTCDate()).toBe(31);
  });

  it("rejects anything that is not that shape", () => {
    expect(parseServedDate(null)).toBeNull();
    expect(parseServedDate("")).toBeNull();
    expect(parseServedDate("2026-02-25")).toBeNull(); // ISO is not what this dataset emits
    expect(parseServedDate("2/25/2026")).toBeNull(); // unpadded
  });

  it("rejects a date that would silently roll over into the next month", () => {
    // new Date(Date.UTC(2026, 1, 31)) is March 3rd, not an error. Without the
    // round-trip guard a junk row would resolve to a real but wrong date.
    expect(parseServedDate("02/31/2026")).toBeNull();
    expect(parseServedDate("13/01/2026")).toBeNull();
  });
});

describe("pickGrantRow", () => {
  // Shape taken from the live INTEGRITY EXPRESS record (DOT 01911857): a broker
  // grant, a later motor-carrier grant, and revocation/reinstatement events.
  const integrityExpress = [
    { docket_number: "MC596655", mod_col_1: "PROPERTY BROKER", original_action_desc: "GRANTED", orig_served_date: "03/23/2007" },
    { docket_number: "MC596655", mod_col_1: "CONTRACT", original_action_desc: "INVOLUNTARY REVOCATION", orig_served_date: "09/27/2022", disp_action_desc: "DISCONTINUED REVOCATION" },
    { docket_number: "MC596655", mod_col_1: "CONTRACT", original_action_desc: "INVOLUNTARY REVOCATION", orig_served_date: "08/03/2020", disp_action_desc: "DISCONTINUED REVOCATION" },
    { docket_number: "MC596655", mod_col_1: "MOTOR PROPERTY CONTRACT CARRIER", original_action_desc: "GRANTED", orig_served_date: "08/31/2010" },
  ];

  it("prefers motor-carrier authority over a broker docket on the same entity", () => {
    // The gate asks how long this party has been HAULING. Taking the 2007
    // broker grant would answer a different question and read three years older.
    const win = pickGrantRow(integrityExpress);
    expect(win?.mod_col_1).toBe("MOTOR PROPERTY CONTRACT CARRIER");
    expect(win?.orig_served_date).toBe("08/31/2010");
  });

  it("ignores revocation and reinstatement rows entirely", () => {
    const win = pickGrantRow(integrityExpress);
    expect(win?.original_action_desc).toBe("GRANTED");
  });

  it("takes the earliest grant when several motor authorities exist", () => {
    const rows = [
      { mod_col_1: "MOTOR PROPERTY COMMON CARRIER", original_action_desc: "GRANTED", orig_served_date: "05/13/1995" },
      { mod_col_1: "MOTOR PROPERTY CONTRACT CARRIER", original_action_desc: "GRANTED", orig_served_date: "10/30/1979" },
    ];
    expect(pickGrantRow(rows)?.orig_served_date).toBe("10/30/1979");
  });

  it("does not sort MM/DD/YYYY as text", () => {
    // Lexically "01/02/2020" < "12/31/1999", so a naive string sort picks the
    // wrong row and reports a carrier as decades younger than they are.
    const rows = [
      { mod_col_1: "MOTOR PROPERTY COMMON CARRIER", original_action_desc: "GRANTED", orig_served_date: "01/02/2020" },
      { mod_col_1: "MOTOR PROPERTY COMMON CARRIER", original_action_desc: "GRANTED", orig_served_date: "12/31/1999" },
    ];
    expect(pickGrantRow(rows)?.orig_served_date).toBe("12/31/1999");
  });

  it("falls back to a broker grant when the entity holds no motor authority", () => {
    // SRL's own record: PROPERTY BROKER only. Falling back means a broker-only
    // entity resolves rather than reporting nothing at all.
    const srl = [
      { docket_number: "MC1794414", mod_col_1: "PROPERTY BROKER", original_action_desc: "GRANTED", orig_served_date: "02/25/2026" },
    ];
    expect(pickGrantRow(srl)?.orig_served_date).toBe("02/25/2026");
  });

  it("returns null when nothing was ever granted", () => {
    expect(pickGrantRow([])).toBeNull();
    expect(
      pickGrantRow([{ mod_col_1: "PROPERTY FREIGHT FORWARDER", original_action_desc: "DISMISSED", orig_served_date: "01/01/2020" }]),
    ).toBeNull();
  });

  it("ignores a grant row whose date is unparseable rather than crashing", () => {
    const rows = [
      { mod_col_1: "MOTOR PROPERTY COMMON CARRIER", original_action_desc: "GRANTED", orig_served_date: "not-a-date" },
      { mod_col_1: "MOTOR PROPERTY COMMON CARRIER", original_action_desc: "GRANTED", orig_served_date: "06/01/2011" },
    ];
    expect(pickGrantRow(rows)?.orig_served_date).toBe("06/01/2011");
  });
});
