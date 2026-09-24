# One bare number per load — Phase A scoping (read-only)

**Status:** audit only. No code written, CLAUDE.md not edited. Produced
2026-09-23 against `origin/main` @ `0f9451dd`.

**The rule, DECIDED 2026-09-23 by Wasi, amending ratified §21.2.** One bare
number per load — no `SRL-` prefix, no core suffix — carried on the load, the
BOL, the rate confirmation, the invoice and the settlement. Only supplemental
documents for missed accessorials carry a letter (`5001A`, `5001B`, `5001C`),
assigned by accessorial type. Legacy `SRL-1214xx` numbers stay exactly as issued.

---

## 1. Where a document number is generated, formatted, parsed, searched, rendered

**The good news first: the scheme is already centralised.** Every allocation and
every render routes through [`lib/documentNumber.ts`](../../backend/src/lib/documentNumber.ts).
Nothing outside it builds a core document number.

| Stage | Site | Notes |
|---|---|---|
| **Generate** | `generateLoadNumber` | `CREATE SEQUENCE IF NOT EXISTS load_number_seq` + `nextval`, returns `` `SRL-${n}` `` — the one place the prefix is applied |
| | `nextDocumentNumber`, `withDocumentNumber` | allocation with P2002 retry |
| **Format** | `formatDocumentNumber(stem, kind, revision)` | applies `DOCUMENT_SUFFIX` |
| **Parse** | `parseDocumentRevision` | reads the numeric re-issue revision back off a number |
| **Resolve** | `resolveLoadStem`, `documentNumberFor` | `loadNumber` → `referenceNumber` precedence |
| **Allocate (callers)** | `loadController:354,366` · `shipperPortalController:878,883` · `withTenderController:112,136` · `emailToLoadService:475` · `rateConfirmationController:66,92` · `accountingController:435,474,1101,1136` · `invoiceService:588` | all via the lib |
| **Render (PDF)** | `pdfService:349` (BOL) · `:1579` (RC) · `:2939` (invoice) · `:3158` (settlement) | first three via `documentNumberFor`; **the settlement does not** — see §3 |
| **Render (portals)** | AE `accounting/invoices:330` (`srlDocNumber \|\| invoiceNumber`) · `accounting/aging:189` (`invoiceNumber`) · carrier payments/my-loads/tenders · shipper shipments | |
| **Search** | `accountingController:267-271,904` · `loadController:440` · `shipperPortalController:277-278` · `trackTraceBoard:132-133` | all `contains` (substring), case-insensitive |
| **Filenames** | `pdfController:35,64,93,133,290,319` · `rateConfirmationController:196` | a **separate** convention — see §2 |

**Prisma columns and their constraints** — each `@unique` **within its own
table**, and there is no cross-table constraint, which is what makes one shared
number legal at all:

`Load.referenceNumber @unique` · `Load.loadNumber @unique` ·
`Load.srlBolNumber @unique` · `RateConfirmation.rateConNumber @unique` ·
`Invoice.srlDocNumber @unique` · `Invoice.invoiceNumber @unique` ·
`CarrierPay.srlDocNumber @unique` · `Settlement.settlementNumber @unique`

---

## 2. Hardcoded prefixes and suffixes outside `documentNumber.ts`

**Core document numbers: none.** 104 `SRL-` matches across `backend/src` and
`frontend/src`, and every one is a test fixture, a comment, a brand filename for
a non-load document (agreements, training certificates, SOPs), or the
`SRL-NewsAggregator` User-Agent. No production path builds a core number itself.

**But the `TYPE-` prefix §21.2 forbids is alive in DOWNLOAD FILENAMES**, which is
where a customer actually meets the string when they save the file:

| Site | Produces today | Under the rule |
|---|---|---|
| `pdfController:35` | `RC-SRL-121495.pdf` | `5001-rate-confirmation.pdf` |
| `pdfController:64` | `RC-Enhanced-SRL-121495.pdf` | as above |
| `pdfController:93` | `LoadConfirmation-SRL-121495.pdf` | |
| `pdfController:290` | `BOL-SRL-121495.pdf` | `5001-bill-of-lading.pdf` |
| `pdfController:133` | `INV-1003.pdf` | **the internal sequence** — see §3 |
| `pdfController:319` | `STL-1001.pdf` | **a fourth sequence** — see §3 |
| `rateConfirmationController:196` | `SRL-121495R-signature-certificate.pdf` | |

Sorting a download folder by name is the same use case the suffix scheme was
built for, and these break it exactly as a prefix scheme does.

---

## 3. The other sequences — there are THREE, not one

The brief asked about `INV-####`. The audit found two more.

### 3a. `Invoice.invoiceNumber` — `INV-<n>`

Owned by [`lib/invoiceNumber.ts`](../../backend/src/lib/invoiceNumber.ts)
(`nextSequentialInvoiceNumber`), which scans `startsWith: "INV-"`, takes the max
of the purely-numeric tails and returns `INV-<max+1>`, paired with
`createInvoiceWithRetry` for P2002. A **second, legacy** generator exists at
`accountingController:417-426` producing the date form `INV-YYYYMMDD-NNNN`; the
canonical generator deliberately ignores those when computing the max so the two
do not pollute each other.

**Both numbers print on the same invoice.** `pdfService:2939` computes the
customer-facing `docId` from the SRL stem and puts it in the header's filing
slot, then `:2958` prints `"INVOICE #": invoice.invoiceNumber` in the meta strip,
and `:3086` passes `invoice.invoiceNumber` to `drawPaymentReference`. So the
customer sees `SRL-121495I` at the top and `INV-1003` in the body **and in the
wire-payment memo**.

**What keys on it externally — the reason this cannot simply be deleted:**

- **The wire payment reference memo** (`drawPaymentReference`). A customer
  remitting against this invoice quotes `INV-1003`, and their AP system files
  the payment under it. Anything already remitted is keyed to it permanently.
- **AR dunning emails** — `arCollectionsService:97,101,103,114,118,120` put
  `invoiceNumber` in both the subject and the body table. So the reminder chasing
  an invoice names a different number than the invoice's own header.
- **The aging CSV export** — `accountingController:3427` ships `invoiceNumber` as
  its first column.
- **`/accounting/aging`** renders `invoiceNumber`; **`/accounting/invoices`**
  already prefers `srlDocNumber`, with a comment saying it is "the one they quote
  when they call".

**Proposed retirement (OPEN DECISION 3).** Not a deletion. Keep the column, stop
issuing new values, and flip every customer-facing surface to the one number in
one commit: PDF meta strip, the wire memo, the AR emails, the aging page and the
CSV header. The column becomes what `Load.rate` became — a retired mirror,
read-only, with a guard that fails if anything writes a new one. Legacy rows keep
their `INV-####` and the search `contains` still finds them. **Production makes
this cheap: three invoices exist in total** (`INV-1001` and `INV-1002`, both
legacy with no `srlDocNumber`; `INV-1003` = `SRL-121495I`).

### 3b. `Settlement.settlementNumber` — `STL-<n>`

`settlementController:15-16`, `` `STL-${lastNum + 1}` ``, parsed back by
`replace("STL-", "")`. The settlement PDF uses it as **both** the header `docId`
(`pdfService:3158`) and the meta strip `"SETTLEMENT #"` (`:3200`) — unlike the
invoice, it never touches the SRL stem.

**This one may be structurally exempt, and that is OPEN DECISION 2.** A
`Settlement` groups several `CarrierPay` rows, potentially across different
loads, so it cannot take *a* load's number. Note the rule says "settlement", and
there are two different things with that name:

- `CarrierPay.srlDocNumber` — **per load**, already `SRL-121495P`, takes the bare
  number cleanly.
- `Settlement.settlementNumber` — **a batch**, no single load stem exists.

### 3c. `Shipment.shipmentNumber` — `SHP-YYYY-NNN`

Observed in production (`SHP-2026-010`). Internal; does not appear on any
customer document. Listed for completeness; no change proposed.

---

## 4. Uniqueness once one number spans tables

Sharing `5001` across tables is legal today — the constraints are per-table. The
collisions are all **within one table, on one load**.

| Case | Collides on | Proposed mechanism |
|---|---|---|
| **RC revision after void** — a counter or rate change voids the live RC and issues another | `RateConfirmation.rateConNumber @unique` | **Partial unique index**: `CREATE UNIQUE INDEX ... ON rate_confirmations (rate_con_number) WHERE status <> 'VOID'`. Only one *live* RC may hold `5001`; voided rows keep the number as evidence (§13.3 Item 250 — executed paper is never renumbered) and drop out of the constraint. Needs a raw migration; Prisma has no native partial-unique. |
| **Corrected invoice** after a void | `Invoice.srlDocNumber @unique` | Same partial-unique shape, `WHERE status <> 'VOID'`. |
| **Two supplementals of the same accessorial type on one load** | the letter is assigned *by type*, so two LUMPER supplementals both want `5001A` | Two options, **OPEN DECISION 4**: (a) **one supplemental per type per load** — enforce `@@unique([loadId, type])` and a second lumper charge amends the first; or (b) **sequence within the letter** — `5001A`, then `5001A2`, reusing the existing `parseDocumentRevision` machinery. (a) is cleaner to read on paper; (b) never refuses a legitimate second charge. |

**A fourth case the brief did not name.** `Load.referenceNumber`,
`Load.loadNumber` and `Load.srlBolNumber` are three separate `@unique` columns on
**the same row**, and under the rule all three hold `5001`. That is legal —
uniqueness is per-column — but it means the load carries its own number three
times. Worth deciding whether `srlBolNumber` survives at all once the BOL number
*is* the load number.

---

## 5. Accessorial types → letters (OPEN DECISION 1 — not chosen)

`AccessorialType` has **12 members**. A table is proposed for Wasi to choose,
amend or reject; no assignment is made here.

| Type | Proposed | Type | Proposed |
|---|---|---|---|
| `DETENTION_PU` | A | `DRIVER_ASSIST` | G |
| `DETENTION_DEL` | B | `REEFER_FUEL` | H |
| `LUMPER` | C | `HAZMAT` | J |
| `TONU` | D | `INSIDE_DELIVERY` | K |
| `LAYOVER` | E | `LIFTGATE` | L |
| `DEADHEAD` | F | `PALLET_EXCHANGE` | M |

Ordered as the enum is declared, `I` and `N`–`Z` skipped so far. Two properties
worth stating before choosing:

- **`I` is skipped deliberately** — it reads as a `1` in a hand-written or faxed
  reference, on a document a lumper receipt gets stapled to.
- **Reusing `B`, `R`, `I`, `P`, `S` is safe.** Those letters are freed by the
  core suffixes going away, and a new `5001B` cannot collide with a legacy
  `SRL-121495B`: the legacy namespace is prefixed, the new one is not.
- 12 types fit comfortably in single letters. A 27th type would not, which is a
  reason to prefer the type→letter map being data rather than a hardcoded
  `Record`.

---

## 6. Sequence start — confirmed against production

Read-only, 2026-09-23:

- `load_number_seq`: **`last_value = 5001`, `is_called = false`** → the next
  number issued is **5001**.
- **Nothing in the 5001 series has been issued.** Loads in any 5xxx form (bare or
  `SRL-5`): **0**. Documents in the series: BOL 0, RC 0, invoice 0, carrier pay 0.
- 29 loads exist, all `SRL-1214xx` (highest `SRL-121497`) plus one legacy
  `L9180992591`. Lowest stem at or above 5001 is 121480 → **116,479 loads of
  headroom** before the bare series could reach the legacy one.

**The `START WITH 5001` edit is committed nowhere.** It exists only as an
uncommitted modification in the main checkout. Phase B must commit it in
`documentNumber.ts` — production is already at 5001 by `ALTER`, but a fresh
environment (CI, a new container) still starts at 121472 until it lands.

---

## 7. Draft §21.2 amendment for Phase B (not yet applied)

> ### §21.2 — Document numbering: one bare number per load
>
> **Amended 2026-09-23 by Wasi, superseding the suffix-on-a-stem scheme ratified
> 2026-08-16.**
>
> **One bare number, no prefix and no suffix**, carried by the load and by every
> core document issued against it:
>
> | Document | Number |
> |---|---|
> | Load | `5001` |
> | Bill of lading | `5001` |
> | Rate confirmation | `5001` |
> | Invoice | `5001` |
> | Carrier settlement | `5001` |
>
> The number is the point of reference: a carrier, a shipper or an AE quoting
> `5001` names the load and every document on it without having to say which.
>
> **Only a supplemental document for a missed accessorial takes a letter**, and
> the letter is assigned **by accessorial type** — `5001A`, `5001B`, `5001C` —
> so the type is legible from the reference alone.
>
> **The `SRL-` prefix is retired.** It was kept so a carrier hauling for several
> brokers could tell whose paperwork they held; the letterhead, the MC number and
> the footer already do that on every page, and the prefix cost more in
> transcription than it bought in attribution.
>
> **Legacy numbers are never rewritten.** Loads issued before the amendment keep
> their `SRL-1214xx` stems and their `B`/`R`/`I`/`P`/`S` suffixes. Search accepts
> both forms. A number already printed on a signed bill of lading is not a
> formatting decision.
>
> **Sequence start: 5001**, from `load_number_seq`.

---

## Open decisions

1. **The accessorial type→letter table** (§5). 12 types, a table proposed, none
   chosen. Also: should the map be data or a hardcoded `Record`?
2. **Does "settlement" mean `CarrierPay` or `Settlement`?** (§3b). The per-load
   `CarrierPay` takes the bare number cleanly; the batch `Settlement` spans loads
   and structurally cannot. Is `STL-####` exempt, or does the batch get a
   different treatment?
3. **`INV-####` retirement shape** (§3a). Stop issuing and retire the column to a
   read-only mirror, or keep printing it alongside? The wire-payment memo and AR
   dunning emails are the external keys; three invoices exist in total, so the
   cost of switching now is near zero and rises with every invoice sent.
4. **Two supplementals of the same accessorial type** (§4): one-per-type-per-load
   enforced, or a sequence within the letter (`5001A2`)?
5. **Does `Load.srlBolNumber` survive?** (§4). Under the rule it holds the same
   value as `referenceNumber` and `loadNumber` on the same row.
6. **Bare-number search degradation** (§1). Searching `contains` for `5001`
   matches `15001` and `50012` once the series grows, and `5` matches everything.
   `SRL-121495` was self-delimiting; `5001` is not. Exact-match-first with
   substring fallback, or a minimum query length?
