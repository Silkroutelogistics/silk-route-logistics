# Legal document sources

## What is authoritative

`bca-content-R3.md` is the **authoring source** for the Broker-Carrier
Agreement body (Revision 3, reference `SRL-BCA-2026-R3`). It is
human-readable, diffable, and versioned by filename.

**It is not loaded at runtime.** The running system reads
`backend/src/data/brokerCarrierAgreement.generated.ts`, compiled from the
markdown and re-exported by `backend/src/data/agreements.ts`. That separation is
deliberate and load-bearing:

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
the markdown, run `npx tsx scripts/generate-agreement-content.ts` from
`backend/`, and commit both together. A parity test fails if the committed
constant stops matching a fresh parse of the markdown, so the two cannot drift
without CI saying so.

Text and layout are separate concerns throughout: the words live here and in
`agreements.ts`; the page — cover, interior master, execution block — lives in
`backend/src/lib/srl-chrome.ts` and
`backend/src/services/agreementPdfService.ts`.

## The carrier's name

The opening paragraph carries `{{CARRIER}}` where the carrier's legal name
goes. `fillCarrierParty` in `shared/constants/agreementParty.ts` replaces it —
in the hashed canonical text, in the executed PDF and in every portal pane — so
the three cannot disagree. With no name on file it prints as a blank line.

## Versioning

`BCA_VERSION` bumps when **the words change**, not when their source moves. A
bump returns `409 AGREEMENT_VERSION_STALE` to any open tab holding the previous
body, which is intended: it stops a carrier signing text nobody can reproduce.

Only one CURRENT body per agreement exists in the running code. Before
replacing one, confirm how many executed agreements reference the outgoing
version and freeze the outgoing body into `backend/src/data/archive/` — their
stored `contentHash` is un-recomputable once the text it covered is gone from
the code, and archiving is cheap before a swap and impossible after.

## The other files here

`bca-content-F11.md` is the Foundation Edition (`2026-09-03-F11`) that Revision
3 replaced. Four carriers executed it; its body is frozen in
`backend/src/data/archive/brokerCarrierAgreement.2026-09-03-F11.ts`, and a test
holds that archive equal to a fresh parse of this file.

Everything else in this directory is historical: earlier drafts, comparison and
consolidation notes from the August 2026 review, and rendered PDFs of prior
editions. They are kept for provenance. **None of them is read by any code.**
