# Officer signatures

Scanned pen signatures of SRL officers, drawn on the broker SIGNATURE line of
executed agreements (Broker-Carrier Agreement, Caravan Quick Pay Agreement).

- One file per officer, named by the slug of the name exactly as it is stored
  on the countersign row: "Wasi Haider" -> `wasi-haider.png`.
- PNG with a transparent background, trimmed close to the ink, ink dark
  (black or navy). The renderer fits it into a box about 170 x 22 pt.
- Looked up by the name on the countersign row, so an agreement countersigned
  by one officer never re-renders with another officer's signature.
- With no file for that name, the renderer sets the name in the signature face
  (Alex Brush) instead, captioned "Countersigned electronically".

See `officerSignatureImage` in `src/services/agreementPdfService.ts`.
