# SRL Rate Confirmation — final template

Files
- SRL-Rate-Confirmation.html — the rate confirmation (2 pages). All load data lives in the JSON block at the top of <body>.
- assets/srl-compass.png — logo (keep next to the HTML).

Make a rate confirmation
1. Copy SRL-Rate-Confirmation.html → e.g. RC-SRL-50002.html (same folder, so the logo resolves).
2. In VS Code, edit only the JSON in <script id="rc-data">:
   - load_number, revision, issued, srl_dispatcher, carrier, shipment, charges, payment.
   - "stops": list every stop in order. "type" must be "Pickup" or "Delivery". 2 to 4 stops fit on page 1; the layout tightens itself at 3 and 4.
   - charge amounts are plain numbers (5216.40), or text such as "Included". Total carrier pay is calculated.
   - leave "driver" empty to print "Assigned at dispatch".
3. Open in Chrome → Print → Save as PDF
   - Destination: Save as PDF
   - Paper size: Letter
   - Margins: None
   - Scale: Default (100)
   - Options: Background graphics ON, Headers and footers OFF

Fixed on every rate confirmation (edit in the HTML if they change): letterhead, SRL contacts, page 2 terms and conditions, Agreement to be bound.

Fonts load from Google Fonts (DM Sans, Playfair Display); needs internet when printing.
