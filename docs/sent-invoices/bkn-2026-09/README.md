# BKN invoices delivered 2026-09-25 (Tipalti)

The four invoice packets SRL uploaded to Beekeeper's Naturals through Tipalti on 2026-09-25.
Ruled 2026-09-26: these files are the delivered copies.

| File | Invoice | Load | Amount | Pages | Bytes | SHA-256 |
|---|---|---|---|---|---|---|
| `121492I-Invoice-and-BOL.pdf` | 121492I | SRL-121492 | $250.00 | 2 | 319456 | `c7495a679528951007c1946a6fbd4b529a79e119229b62a0ff116f62758d0776` |
| `121494I-Invoice-BOL-POD.pdf` | 121494I | SRL-121494 | $2,550.00 | 3 | 1032322 | `3e12b2d342e67c8e2458ca7f6466062fea52f6453bcc19e72bc19a6ef80cdace` |
| `121495I-Invoice-POD.pdf` | 121495I | SRL-121495 | $700.00 | 2 | 1795360 | `d3b69992057dda1dd90b8d72a47e01572a8bcbc4808a4b1f8f460f4e596a007e` |
| `121496I-Invoice-and-BOL.pdf` | 121496I | SRL-121496 | $250.00 | 2 | 311263 | `8d59af11fb1579dafe7ca9e29150168510f665ae9c968c326a723740b2871d14` |

These hashes are the values RECONCILE step 3d records on each invoice as `deliveredFileHash`.

## Why the PDFs are not in git

The invoice page prints SRL's full bank account number under Remit to. `.gitignore` excludes
`docs/sent-invoices/**/*.pdf`, so this README is the committed record and the hash is what
identifies the exact bytes. Run `git check-ignore -v <file>` before adding anything else here.

Where the bytes are:

- `C:\Users\Wasi Haider\Downloads\` and `C:\Users\Wasi Haider\Downloads\SRL-Invoices\`. The two
  copies of each file were checked byte-identical on 2026-09-26.
- A copy beside this README in the `srl-wt-invoicing` worktree only. Removing that worktree
  deletes it.

## What each invoice says

Common to all four: issued Sep 25, 2026; due Oct 25, 2026; Net-30; customer no. BEEKEEP005;
billed to Beekeeper's Naturals USA Inc., Accounts Payable, 440 N Barranca Ave #9223, Covina,
CA 91723. The first page is printed from `backend/src/templates/invoice-v3/`; the BOL and POD
pages are merged behind it.

| Invoice | PO printed | Charges |
|---|---|---|
| 121492I | TO3665 | Truck ordered, not used (TONU) · $250.00 |
| 121494I | PO1861 | Line haul · $2,550.00; Fuel, included in line haul · $0.00 |
| 121495I | PO1861 | Line haul · $700.00; Fuel, included in line haul · $0.00 |
| 121496I | TO3667 | Truck ordered, not used (TONU) · $250.00 |
