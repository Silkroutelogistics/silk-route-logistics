# BOL reference documents

Drop the reference bills of lading here (PDF is ideal — it preserves the layout;
a clear photo/scan works too).

Suggested naming so the comparison is unambiguous:

    echo-bol.pdf
    dirk-bol.pdf
    <broker>-bol.pdf        e.g. flock-bol.pdf, rxo-bol.pdf

## Why they are here

The SRL BOL was reduced from two pages to one in v3.8.ara. The operational
reasoning (a dock document should not depend on a loose second sheet) stands on
its own — but the original code comment ALSO claimed conformance with Echo /
Flock / Varstar practice, which had not actually been verified against their
documents. That claim was withdrawn in v3.8.arg. These references are what will
settle it.

## What to compare once they land

1. **Page count** — is the competitor BOL genuinely one page, or page 1 plus a
   separate terms sheet? If the latter, the v3.8.ara decision should be revisited.
2. **Field inventory** — anything they carry that SRL omits: PRO #, seal #,
   trailer #, freight-charge terms (prepaid/collect/third-party), COD, declared
   value, NMFC placement, hazmat block.
3. **Signature blocks** — three columns or two; what each party attests; whether
   "pieces tendered / pieces received" is standard.
4. **Legal density** — full T&C on page 1, a short incorporation-by-reference
   line (SRL's current approach), or a "terms on reverse" pointer.
5. **Layout order** — parties -> shipment details -> charges -> signatures.

## Current SRL implementation

`backend/src/services/pdfService.ts` -> `generateBOLFromLoad`.
Layout is measured, not guessed: the tallest signature column ends at y=746.97,
the footer rule sits at 770, and the terms strip is sized to end at 765.5.
Any field added to page 1 has to fit that budget — re-measure before adding.
