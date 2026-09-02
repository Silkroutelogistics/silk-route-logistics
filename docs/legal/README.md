# Legal document sources

## What is authoritative

`bca-content-F10.md` is the **authoring source** for the Broker-Carrier
Agreement body. It is human-readable, diffable, and versioned by filename.

**It is not loaded at runtime.** The running system reads
`backend/src/data/agreements.ts`, where the body lives as a compiled
`LegalAgreement` constant. That separation is deliberate and load-bearing:

- `agreementContentHash` is computed over the assembled constant, and that hash
  is what a carrier's signature is verified against. A hash that depended on
  file I/O and markdown parsing would be a hash that could move without the
  words moving.
- A `.md` under `backend/src/` is not emitted by `tsc`, so loading one at
  runtime would need a new `cp -r` step in the Render buildCommand — the class
  of failure recorded at CLAUDE.md §13.3 Item 99, where a missing copy step
  shipped silent runtime fallbacks for six days.

## Keeping the two in step

The markdown is the source; the TypeScript constant is generated from it. Edit
the markdown, regenerate, commit both together. A parity test fails if the
committed constant stops matching a fresh parse of the markdown, so the two
cannot drift without CI saying so.

Text and layout are separate concerns throughout: the words live here and in
`agreements.ts`; the page — cover, interior master, execution block — lives in
`backend/src/lib/srl-chrome.ts` and
`backend/src/services/agreementPdfService.ts`.

## Versioning

`BCA_VERSION` in `agreements.ts` bumps when **the words change**, not when
their source moves. A bump returns `409 AGREEMENT_VERSION_STALE` to any open
tab holding the previous body, which is intended: it stops a carrier signing
text nobody can reproduce.

Only one body per agreement exists in the running code at a time. Before
replacing one, confirm how many executed agreements reference the outgoing
version — their stored `contentHash` becomes un-recomputable once the text it
covered is gone from the code, and archiving the outgoing body is cheap before
a swap and impossible after.

## The other files here

Everything else in this directory is historical: earlier drafts, comparison and
consolidation notes from the August 2026 review, and rendered PDFs of prior
editions. They are kept for provenance. **None of them is read by any code.**
