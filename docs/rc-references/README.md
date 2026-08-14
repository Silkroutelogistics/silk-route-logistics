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

Frequencies stated in `pdfService.ts` comments are over **these 4 documents**,
not over all 19. Where a comment says "0 of 18", that is the full artifact set
and is used only to show that something is absent everywhere, never to claim a
majority practice.

Wasi separately supplied 5 rate confirmations earlier in the same session; those
informed the v3.8.arl pass. This corpus was retrieved independently at his
instruction ("not just rely on the copy I shared research on your own").

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

- Detention clock-start definition and a cap
- TONU qualification criteria
- Lumper pre-authorization threshold
- Late / missed-appointment fee
- Reefer FSMA continuous-temperature covenant
- Factoring / notice-of-assignment handling
- Exclusive-use / no-co-load covenant
- No-re-brokering notice with a withholding remedy

**Open conflict needing a decision:** the rate confirmation states paperwork is
due within 48 hours; BCA §5 says 24. The rate confirmation also states the BCA
controls on conflict, so today the carrier is bound to 24 while reading 48. One
of the two documents has to move. Research across the corpus favours 48.

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
