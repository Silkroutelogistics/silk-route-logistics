# SRL Invoice — final template

Files
- SRL-Invoice.html — the invoice. All customer/load data lives in the JSON block at the top of <body>.
- assets/srl-compass.png — logo (keep next to the HTML).

Make an invoice
1. Copy SRL-Invoice.html → e.g. INV-20418.html (same folder, so the logo resolves).
2. In VS Code (invoice_number = your load number, e.g. SRL-50002), edit only the JSON in <script id="invoice-data">: numbers, dates, parties, charges.
   - amounts are plain numbers (5940.00, not "$5,940.00"); balance due is calculated.
   - add/remove rows in "charges" freely; keep 1–5 rows so it stays one page.
3. Open in Chrome → Print → Save as PDF, Paper: Letter, Margins: Default, Background graphics: ON.

Fixed on every invoice (edit in the HTML if they change): letterhead, Remit to + bank details,
payment security notice, terms.

Fonts load from Google Fonts (DM Sans, Playfair Display); needs internet when printing.
