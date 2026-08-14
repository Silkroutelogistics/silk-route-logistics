# Rate Confirmation — reference corpus and cross-comparison

Created v3.8.arm (2026-08-14). Companion to `docs/bol-references/`.

Exists because of a mistake worth not repeating: in v3.8.arf a claim shipped in
code comments that SRL's BOL had been cross-referenced against Echo, Flock, and
Varstar. It had not — no such documents were in the repo. v3.8.arg withdrew the
claim. **Do not assert conformance to a reference document that is not recorded
here.**

---

## What was actually retrieved (v3.8.arm)

19 artifacts were pulled while searching for rate confirmations. **Only 4 are
genuine rate confirmations.** The rest are broker-carrier agreements, load
tenders, blog posts about rate confirmations, or carrier-packet forms. The
distinction matters: a BCA is a contract and carries covenants; a rate
confirmation is a per-load operating document. Counting them together would
have inflated every frequency below.

| # | Source | Provenance | Type |
|---|---|---|---|
| 1 | Scotlynn USA Division | Court exhibit via CourtListener | Rate confirmation |
| 2 | TQL (Total Quality Logistics) | Court exhibit via CourtListener, 2006 | Rate confirmation |
| 3 | TQL | Modern published specimen | Rate confirmation |
| 4 | Leonard's Express | Live TMS output | Rate confirmation |

---

## THE CORPUS ON DISK (this is what an audit may actually cite)

Seven live broker rate confirmations, all supplied by Wasi and transcribed here.
**Nothing outside this list may be cited as a reference document.**

| File | Broker | Pages | Equipment | Dated |
|---|---|---|---|---|
| `allen-lund-8426497.md` | Allen Lund Company | 4 | Dry van, food grade | 2026 |
| `schneider-4010206867.md` | Schneider National | 5 | Van, power only | 2026 |
| `scotlynn-1495595.md` | Scotlynn USA | 2 | **Reefer** | 2026 |
| `greatwide-G3730946.md` | Greatwide Dallas Mavis | **1** | — | 2023, **signed** |
| `molo-2000957370.md` | MoLo Solutions (ArcBest) | 4 + BOL | Dry van | 2023 |
| `steam-2030381.md` | Steam Logistics | 2 | Dry van | **2025 — newest** |
| `transervice-TIS20078.md` | Transervice Integrated Solutions | 2 | Dry van | 2022 |

Plus `_CURRENT_SRL_RC_RENDERED.txt` — SRL's own output, text-extracted with Y
coordinates, for a reefer case and a dry van case.

Page counts run 1 to 5. **Length is a choice, not a requirement**: Greatwide
carries rate, full terms, billing instructions and an executed signature block on
a single page, and Steam — the most recent document here — needs two.

### The forks the corpus does NOT settle

Real brokers disagree, so these are SRL policy choices rather than norms:

- **Precedence.** SRL and MoLo make the master agreement control. **Transervice
  makes the rate confirmation prevail** over its Carrier Brokerage Contract.
  Mirror images, both defensible.
- **Acceptance.** SRL and Schneider use acceptance by conduct. **MoLo uses
  acceptance by silence** — terms bind unless the carrier objects within 24 hours
  of receipt or before work begins, whichever is earlier.
- **Paperwork deadline.** MoLo 24h for accessorials · Scotlynn end of delivery
  day · Leonard's 24h for detention eligibility · TIS 30 days · Schneider 90 days
  · Greatwide 180 days · Allen Lund none. There is no standard.
- **Pay-when-paid.** Greatwide states it three ways, including on detention and
  TONU. Nobody else in the corpus does. SRL does not, deliberately.
- **Reefer temperature authority.** SRL asserts the setpoint on the rate
  confirmation and tells the driver not to sign a conflicting BOL. **TIS inverts
  it** — the BOL governs, and a conflict triggers written shipper confirmation.

Frequencies stated in `pdfService.ts` comments are over **these 4 documents**,
not over all 19. Where a comment says "0 of 18", that is the full artifact set
and is used only to show that something is absent everywhere, never to claim a
majority practice.

Wasi separately supplied 5 rate confirmations earlier in the same session; those
informed the v3.8.arl pass. This corpus was retrieved independently at his
instruction ("not just rely on the copy I shared research on your own").

---

## Second retrieval pass (2026-08-14)

Run because the first pass returned only 4 genuine documents out of 19 pulled.

**Honest denominator: 28 artefacts were downloaded and read this pass. 14 were
genuine rate confirmations. 9 are transcribed here** — the other 5 were
same-broker duplicates of a document already transcribed (2 more C.H. Robinson,
1 more Echo, 2 more Arrive), kept on disk but not written up.

The 14 rejects break down as: 8 federal court complaints that *mention* a rate
confirmation without attaching one, 4 scanned exhibits with no text layer
(3 Scotlynn, 1 Landstar) that cannot be transcribed without OCR, 1 TQL carrier
*setup packet* (payment-terms election and ACH authorisation — a contract-file
document, not a per-load one), and 1 Hebrew-language youth-programme proposal
misfiled in a carrier's document archive.

Not counted above: roughly 140 URL probes that 404'd while enumerating
directories. Those are misses, not artefacts, and inflating the denominator
with them would be dishonest in the other direction.

| Broker | Ref | File | Pages | Provenance |
|---|---|---|---|---|
| C.H. Robinson | 400126857 | `chrobinson-400126857.md` | 3 | claims-recovery host |
| J.B. Hunt | 7H33283 | `jbhunt-7h33283.md` | 3 | claims-recovery host |
| GlobalTranz | 24779211 | `globaltranz-24779211.md` | 1 | claims-recovery host |
| NTG (Nolan) | 4374644 | `ntg-4374644.md` | 2 | claims-recovery host |
| MoLo Solutions | 760821 | `molo-760821.md` | 3 | claims-recovery host |
| RND Logistics | 5024 | `rnd-logistics-5024.md` | 1 | claims-recovery host |
| Echo Global | 34405981 | `echo-34405981.md` | 2 | carrier's open doc archive |
| Arrive Logistics | 535700 | `arrive-535700.md` | 2 | carrier's open doc archive |
| TQL | 33614902 | `tql-33614902.md` | 5 | insurance submission attachment |

Combined with the 7 Wasi-supplied documents in the table above, the corpus on
disk is now **16 genuine rate confirmations across 15 distinct brokers**
(MoLo appears twice — `molo-2000957370.md` supplied, `molo-760821.md` retrieved;
they are different loads two years apart and both are live, not duplicates).

**Any frequency stated in `pdfService.ts` comments must now name its denominator
explicitly.** The "4 documents" and "0 of 18" denominators recorded above belong
to the v3.8.arm pass and are superseded for anything re-derived after this one.
Re-deriving a frequency over 16 documents and leaving a comment that says 4 is
the same class of error this file was created to prevent.

### What worked, for the next pass

- **The CourtListener web UI 403s WebFetch, but the REST API answers curl.**
  `api/rest/v4/search/?type=r&q=...` returns `filepath_local` + `is_available`.
  Only `is_available: true` documents are fetchable, and in practice that is
  almost always the *complaint*, not the exhibit. Exhibit attachments are the
  thing you want and are usually paywalled. **CourtListener produced 0 of the 9.**
- **Claims-recovery and insurance-submission hosts produced 7 of the 9.** Carriers
  file their rate confirmations as claim support, and those directories are often
  world-readable. This is by far the highest-yield vein.
- **Carriers' own open document archives produced 2 of the 9**, and one such
  archive held years of loads from many different brokers.
- WebFetch cannot parse PDFs, but it saves the binary to
  `tool-results/`; `pdf-parse` (already a repo dependency) extracts the text.
  Roughly a third of court exhibits are scanned images with no text layer and
  cannot be transcribed without OCR.

---

## Gaps this corpus exposed, and what shipped

| Gap | Frequency in real RCs | SRL before | Shipped in arm |
|---|---|---|---|
| Temperature setpoint + run mode | 4 of 4 | absent | `TEMPERATURE CONTROL` block, conditional |
| Driver / truck / trailer capture | driver 4/4, unit 3/4 | absent | `DOCK & DISPATCH` fill-in line |
| Seal handling | 4 of 4 | absent | seal line in `DOCK & DISPATCH` |
| Check-call clock time | 2 of 4 | absent | 8:00 AM ET daily line |
| Dock check-in identity | 0 of 18 | absent | anti-fraud line (see below) |

The dock-identity line appears in none of the retrieved documents, yet every
fraud source in the corpus names check-in identity as the highest-signal tell.
It is **not** a restatement of the BCA's re-brokering covenant: that covenant
binds SRL's carrier. This line tells an honest driver what to do when somebody
*else* attempts identity theft on the load.

### A defect this found in SRL's own data flow

`fd.tempRequirements` is only populated when an AE types it by hand. Order
Builder captures `temperatureControlled`, `tempMin`, and `tempMax` as **required**
fields on reefer loads and never wrote to that field. Result: a reefer load built
through the normal path produced a rate confirmation with no temperature on it at
all. arm resolves the setpoint from the load record with the free-text field as
an override, so the common path now prints a temperature.

---

## What was deliberately NOT shipped

Per the document architecture confirmed by counsel (Dirk Beckwith, Foster Swift),
substantive covenants live in the Broker-Carrier Agreement and the rate
confirmation stays a clean operational form that incorporates the BCA by
reference. Everything below appears in the reference corpus but changes **when
SRL pays money** or **what SRL is contractually bound to**, so it is Wasi's and
Dirk's call, not an engineering one:

- ~~Detention clock-start definition and a cap~~ — the **cap shipped** in v3.8.arn
  ($200/stop). The **clock-start definition has not** and is still open: the
  document says "2 hrs free" without saying free from what.
- TONU qualification criteria
- Lumper pre-authorization threshold
- Late / missed-appointment fee
- Reefer FSMA continuous-temperature covenant
- Factoring / notice-of-assignment handling
- Exclusive-use / no-co-load covenant
- No-re-brokering notice with a withholding remedy

**RESOLVED (v3.8.arn, 2026-08-14) — do not reopen.** The rate confirmation used
to say 48 hours while BCA §5 said 24, and the rate confirmation's own precedence
clause made the BCA control — so a carrier was bound to 24 while reading 48.
Wasi ratified **24**, and the rate confirmation moved. The BCA did not change.

Corpus support for 24 (an earlier draft of this file said the corpus favoured 48,
which was wrong — Schneider's 90 days is an outlier, not the centre): Scotlynn
requires paperwork **"EMAILED BY END OF DAY ON DELIVERY DATE"**, which is
stricter than 24; Leonard's Express gates *detention eligibility* on BOLs
submitted **"within 24 hours, or the next full business day for weekend
deliveries"**; Allen Lund states no deadline at all.

24 also aligns the document with Compass Score, which grades document timeliness
at `POD_GRACE_MS = 24h` ([docTimeliness.ts](../../backend/src/lib/docTimeliness.ts)).
Before this change a carrier who met the printed 48-hour deadline was silently
marked down on the score SRL publishes about them.

---

## Layout budget (measured, not estimated)

Verified by `backend/scripts/verify-rc-matrix.ts` across 9 fixtures using
pdfjs-dist coordinate extraction. Text extraction alone cannot see a collision —
that is how a line rendering *through* the footer scored as clean before the
threshold was corrected in arm.

- Footer rule sits at y ≈ 755. Body content must clear it by ~6pt.
- Page 1 after arm: 18pt clearance (was 85pt of dead space before the dock block
  moved down from page 2).
- Page 2 worst case (long special instructions + per-load custom terms + reefer,
  all at once): 14pt clearance.
- Page 2 uses `lineGap: 0.5` and 10pt inter-block gaps. The compression is
  unconditional: a terms page tolerates bottom whitespace in the common case far
  better than it tolerates a collision in the maximal one.

Run before shipping any rate-confirmation layout change:

```
cd backend
npx tsx scripts/verify-rc-matrix.ts   # 9 fixtures, must print ALL CASES PASS
npx tsx scripts/audit-rc-spacing.ts   # per-line coordinates, scan for collisions
```
