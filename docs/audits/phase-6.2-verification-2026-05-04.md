# Phase 6.2 post-ship verification

**Date:** 2026-05-04
**Trigger:** Verification pass after the Lead Hunter / CRM separation sprint shipped end-to-end (commits `7c74bb1`, `2fb5279`, `0b53cf6`, `df3545f`, `525bfcf`, all on `main`).
**Scope:** read-only. Two checks per directive: Phase 5 missing-checks UI voice/drift audit, Phase 3 test-coverage gap audit. No new tests added.
**Skill consulted:** `/.claude/skills/srl-brand-design/references/voice.md` (loaded fresh per §18.3). AE Console is "Internal tools" surface type per voice.md line 50 — operational/technical, abbreviations OK, jargon expected, no consumer polish.

---

## Check A — Phase 5 missing-checks UI rendering

### Source files (commit `df3545f`)

- [`frontend/src/app/dashboard/crm/OnboardingActionBar.tsx`](../../frontend/src/app/dashboard/crm/OnboardingActionBar.tsx) — Approve / Suspend / Reject button group + missing-checks render block (lines 107–127)
- [`frontend/src/app/dashboard/crm/CustomerDrawer.tsx`](../../frontend/src/app/dashboard/crm/CustomerDrawer.tsx) — wires `OnboardingActionBar` into the drawer header (existing customers only) plus brand-palette status badge

### Render structure

Per `OnboardingActionBar.tsx:107-127`:

```jsx
<AlertTriangle /> "Required checks not satisfied"
<ul>
  {missing.map((m) =>
    <XCircle /> <bold>{m.label}</bold> — <span>{m.reason}</span>
  )}
</ul>
```

Backed by the backend's `evaluateApprovalChecks` helper at [`customerController.ts:16-51`](../../backend/src/controllers/customerController.ts#L16-L51), which returns `{ field, label, reason }` objects per failed check.

### Literal strings rendered to AE per missing check

| Underlying field(s) | UI item label (bold) | UI item reason (after em-dash separator) |
|---|---|---|
| `taxId` (null/empty) | **TIN / Tax ID** | Tax ID required on file before onboarding approval |
| `creditStatus` (not APPROVED or CONDITIONAL) **OR** `creditCheckDate` (null) | **Credit check** | Credit must be APPROVED or CONDITIONAL with a check date on file |
| `contractUrl` (null/empty) | **Signed contract** | Customer contract URL must be on file |

### Voice.md calibration verdict

Applying the three calibration questions (voice.md lines 36-40):

| Question | Verdict |
|---|---|
| Q1: Would a 15-yr dispatcher nod or roll their eyes? | **Nod.** "TIN", "Credit check", "APPROVED or CONDITIONAL" are all operational/regulatory jargon an AE running a shipper onboarding workflow would parse without translation. |
| Q2: Could a competitor say this verbatim? | **No.** The reasons cite the system's specific gating logic (enum values from `CreditStatus`, fields from the SRL Customer schema). |
| Q3: Is there a number, lane, regulatory citation, or named tool? | **Yes.** "TIN" is a regulatory term; "APPROVED or CONDITIONAL" cites concrete enum states; "contract URL on file" is operational. |

Cross-checked against voice.md "Don't" list (lines 23-30):
- ❌ marketing softeners ("best-in-class," "world-class") — not present
- ❌ padding adjectives ("comprehensive solution") — not present
- ❌ exclamation points — not present
- ❌ emojis — not present (lucide icons render as inline SVG, not emoji per voice.md line 28 distinction)
- ❌ fabricated metrics — not present (no quantified claims at all)
- ❌ begging CTAs ("Click here to learn more!") — buttons are imperative + bounded ("Approve", "Suspend", "Reject")

### Drift checklist (per directive)

- ❌ raw field names visible to AE — **NOT present**. The backend's `field: "taxId"` value is used only as a React `key` prop (`<li key={m.field}>`). The user-visible bold-text content is `m.label` ("TIN / Tax ID"), never `m.field` ("taxId").
- ❌ unstyled JSON dump — **NOT present**. The 422 payload is destructured and rendered as a styled checklist with icons, brand-palette colors (`#9B2C2C` danger family per CLAUDE.md §2.1), and structured semantics.
- ❌ generic "field required" message — **NOT present**. Each reason is operationally specific ("required on file before onboarding approval", "APPROVED or CONDITIONAL with a check date on file", "Customer contract URL must be on file").

### Verdict on Check A

**PASS on copy/voice.** Three drift signals (raw field names, JSON dump, generic message) all absent. AE Console internal-tools posture honored.

**Named architectural divergence** (not labeled drift, but worth surfacing per the directive's "four missing checks" wording): the implementation collapses `creditStatus` + `creditCheckDate` into a single user-facing "Credit check" item with a conjunctive reason, rendering **three** maximum checklist items, not **four**. The directive listed four underlying fields. This is a sensible AE-workflow design (one actionable item per workflow step — running a credit check fixes both fields together) but it does diverge from the literal directive count. Recommend this be either:
1. accepted as an intentional rendering choice and the directive interpretation updated, OR
2. flipped to render `creditStatus` and `creditCheckDate` as two separate items if the AE workflow benefits from seeing them split.

No code action recommended without explicit decision — the current behavior is internally consistent (the test at `customerController.test.ts:197-214` correctly asserts three field names per the implementation, not four).

---

## Check B — Phase 3 test suite coverage matrix

### Test run

```
$ npx vitest run __tests__/unit/controllers/customerController.test.ts
✓ 15 tests passed (1.38s)
```

All 15 tests in `backend/__tests__/unit/controllers/customerController.test.ts` pass clean. 6 tests cover `getCustomers ?context` filter (Phase 2); 9 tests cover `approveCustomer` required-checks gate (Phase 3).

### Coverage matrix — three critical states from directive

| State | Test name + lines | Assertions present | Gap? |
|---|---|---|---|
| **State 1**: all four checks satisfied → 200 with `onboardingStatus=APPROVED`, `approvedAt` set, `approvedById` from `req.user.id`, audit log row written | `it("happy path: fully-qualified PENDING customer flips to APPROVED", ...)` lines 116-143 | ✅ status=200 (`expect(res.status).toHaveBeenCalledWith(200)`)<br>✅ `onboardingStatus: "APPROVED"` in update payload<br>✅ `approvedAt: expect.any(Date)` in update payload<br>✅ `approvedById: "u-1"` in update payload (from `req.user.id`)<br>✅ `mockLogActivity` called with `eventType: "onboarding_approved"`, `actorType: "USER"`, `actorId: "u-1"` | **None.** Complete coverage of all five required signals from the directive. |
| **State 2**: zero checks satisfied → 422 with all field names in missing-checks payload | `it("returns 422 with all three missing when nothing is filled", ...)` lines 197-214 | ✅ status=422<br>✅ `payload.missing.map(m => m.field).sort()` equals `["contractUrl", "creditCheck", "taxId"]` | **Architectural divergence, not a test gap.** Test correctly asserts the three field names the implementation actually returns. The directive said "all four field names"; implementation collapses `creditStatus` + `creditCheckDate` into one `creditCheck` entry per Check A finding. Test reflects implementation; tracking this here so the count discrepancy is documented in one place. |
| **State 3**: `creditStatus=CONDITIONAL` with the other three checks satisfied → 200 | `it("CONDITIONAL credit status with check date is acceptable", ...)` lines 255-267 | ✅ status=200 (`expect(res.status).toHaveBeenCalledWith(200)`)<br>✅ `mockPrisma.customer.update` called (state flip occurred) | **Minor coverage gap.** Test does not explicitly assert `mockLogActivity` was called for the CONDITIONAL path. Functionally the audit log IS written because the code path post-`evaluateApprovalChecks` is identical to the happy path (same `prisma.update` + `logCustomerActivity` call), but the assertion is not in the test. Acceptable as a minimal-scope verification of the CONDITIONAL acceptance rule itself; would benefit from a single-line addition asserting `mockLogActivity.toHaveBeenCalled()` if a future test pass tightens audit-log invariant coverage. |

### Other tests in the suite (context for completeness, not directive-required)

`getCustomers ?context` (Phase 2):
- `context=crm filters to onboardingStatus = APPROVED` (line 56)
- `context=prospects filters to onboardingStatus != APPROVED` (line 64)
- `omitted context preserves legacy behavior` (line 72)
- `rejects invalid context value via validator` (line 80)
- `context filter coexists with search + status + city filters` (line 85)
- `context filter applies to both findMany and count` (line 101)

`approveCustomer` (Phase 3) — additional unit-level coverage beyond the three critical states:
- `returns 422 with missing-checks array when TIN is absent` (line 145)
- `returns 422 when credit not APPROVED/CONDITIONAL` (line 164)
- `returns 422 when contract URL is absent` (line 181)
- `idempotent: already-APPROVED returns current state without re-writing` (line 216) — asserts `payload.alreadyApproved=true`, `update` not called, `logActivity` not called
- `returns 404 when customer not found or soft-deleted` (line 234)
- `findFirst query excludes soft-deleted customers` (line 244) — asserts `where: { id, deletedAt: null }`

### Verdict on Check B

**PASS with one minor gap.** All three directive-critical states have coverage. State 1 is fully covered. State 2's "all four field names" expectation is structurally three by implementation (same divergence as Check A) — the test is correct against the implementation. State 3 lacks an explicit audit-log assertion but the code path guarantees the log is written.

No critical state is missing from coverage.

---

## Overall sprint verdict

**PASS.** Both checks pass with two named items worth surfacing for explicit decision but no blocking drift:

1. **3-vs-4 collapse** (creditStatus + creditCheckDate → single "Credit check" UI item). Surfaces in Check A (rendering) and Check B State 2 (test assertion). Internally consistent (UI ↔ helper ↔ test all agree on three). Diverges from the directive's "four missing checks" wording. **Recommend explicit accept-as-design or flip-to-four decision** before any future change to `evaluateApprovalChecks`.

2. **CONDITIONAL audit-log assertion** missing in State 3 test (line 255). Functionally fine — the code path is shared with the happy path which does assert it. **Recommend adding one line** (`expect(mockLogActivity).toHaveBeenCalled()`) the next time this test is touched, but not blocking.

The Phase 6.2 sprint as shipped is production-ready against the directive. No regressions, no missing critical-state coverage, no copy/voice violations.

---

## Cross-references

- [`docs/audits/lead-hunter-crm-separation-2026-05-04.md`](lead-hunter-crm-separation-2026-05-04.md) — original Pattern A/B/C audit (commit `39de1ad`) that scoped this sprint
- CLAUDE.md §13.3 Item 6 — closed by commit `525bfcf` (Phase 6 of this sprint)
- CLAUDE.md §18 — Lead Hunter Standing Rules; §18.3 (read voice.md fresh) was honored for Check A; §18.5 (version verification) was correctly applied during the sprint (v3.8.m suggestion → v3.8.ee actual per sequence-continuous)
- `backend/__tests__/unit/controllers/customerController.test.ts` — 15 tests, all passing
- Phase 6.2 sprint commits: `7c74bb1` (Phase 2), `2fb5279` (Phase 3), `0b53cf6` (Phase 4), `df3545f` (Phase 5), `525bfcf` (Phase 6 docs)
