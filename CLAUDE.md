# SRL Project Rules — The Karpathy Parameters

These rules override all defaults. Follow them exactly.

## 1. Never Deploy Blind
- Every backend change that produces output (PDF, email, API response) MUST be tested locally with a script BEFORE committing.
- Run `npx tsc --noEmit` from backend/ before every commit.
- Run `npx next build` from frontend/ before every commit that touches frontend code.
- Generate test output and verify it works before pushing.

## 2. One Change, One Purpose, One Test
- Each commit does ONE thing. Not three. Not five.
- Write what changed in one sentence. If you need a paragraph, the commit is too big.
- Test the specific thing you changed before moving on.

## 3. Version Bump on Every Deploy
- Version format: `MAJOR.MINOR.letter` (e.g., v3.2.j)
- Bump the letter on EVERY deploy (a → b → c → ... → z, then bump minor).
- Update `frontend/src/components/ui/VersionFooter.tsx` with every commit that deploys.
- Never skip a letter.

## 4. Root Cause Before Code
- When something breaks, ask "why" 3 times before writing a fix.
- Read the error. Reproduce it locally. Understand the mechanism. Then fix once.
- No blind retrying. No "let me try this and see if it works" commits.

## 5. Delete Before You Add
- Before building anything new, check for dead code related to what you're touching.
- Remove unused imports, dead functions, orphaned localStorage code.
- 19 unused Prisma models exist — document or remove them, don't add more.

## 6. Origin/Destination = Physical Location
- BOL, Rate Confirmation, and all shipping documents use `load.originAddress/City/State/Zip` for shipper and `load.destAddress/City/State/Zip` for consignee.
- Customer (billing entity) address is NEVER used on shipping documents unless origin fields are empty.
- `shipperFacility` and `consigneeFacility` are the company names at pickup/delivery — not the billing customer.

## 7. Sender Identity for Emails
- All prospect/lead outreach: from `Wasih Haider <whaider@silkroutelogistics.ai>` with personal plain-text style.
- Reply-to: `whaider@silkroutelogistics.ai` (so replies land in Gmail for tracking).
- Use the shared `EMAIL_SIGNATURE` from `emailSequenceService.ts` on all outreach emails.
- System/transactional emails (OTP, password reset, notifications): from `noreply@silkroutelogistics.ai`.

## 8. PDFKit Coordinate System
- PDFKit uses TOP-DOWN Y coordinates. Y=0 is the TOP of the page, Y=792 is the bottom (letter size).
- Start content at y=12 and increment downward.
- Set `margins: { top: 34, bottom: 0, left: 34, right: 34 }` to prevent auto-pagination.
- Only use explicit `doc.addPage()` for intentional page breaks.
- NEVER use bottom-up Y math (that's ReportLab/Python, not PDFKit/Node).

## 9. Database Over localStorage
- Pipeline stages, activity logs, address books, and any data that should persist across sessions MUST be stored in the database.
- localStorage is acceptable ONLY for: UI preferences (theme, sidebar state, view mode).
- When migrating localStorage to DB, keep localStorage as instant-UI cache but always read/write to API.

## 10. State Machines for Load & Carrier Lifecycle (claw-code pattern)
- Every entity with a lifecycle (Load, Carrier, Invoice, Sequence) has defined states and valid transitions.
- Load: `DRAFT → POSTED → TENDERED → BOOKED → DISPATCHED → AT_PICKUP → LOADED → IN_TRANSIT → AT_DELIVERY → DELIVERED → COMPLETED`
- Carrier: `PROSPECT → CONTACTED → INTERESTED → REGISTERED → PENDING → APPROVED` (or `REJECTED`)
- Invoice: `DRAFT → SUBMITTED → SENT → UNDER_REVIEW → APPROVED → FUNDED → PAID`
- Sequence: `ACTIVE → PAUSED → COMPLETED → STOPPED`
- Invalid transitions should be rejected (e.g., can't go from POSTED directly to DELIVERED).
- State changes should be observable — log every transition with timestamp and actor.

## 11. Lane-Based Development (claw-codes pattern)
- For features touching multiple systems (e.g., carrier vetting has FMCSA, OFAC, identity, docs, scoring), split into independent lanes.
- Each lane has its own scope, can be built/tested/merged independently.
- Track lane status in commit messages: `[Lane 3/5] OFAC screening integration`
- Lanes reduce merge conflicts and enable parallel work across sessions.
- Document active lanes in the relevant wiki page's "Open Threads" section.

## 12. Future Patterns (documented, not yet implemented)
- **Hook system (claude-brain):** PreToolUse/PostToolUse interceptors for permission gates and compliance checks. Plan for Q2.
- **Cost tracker modularization (src-repo):** Split token counting, cost calculation, and analytics into separate modules. Plan for Q2.
- **Feature flags:** Currently using env vars. Consider build-time elimination when/if migrating to Bun.

## 13. Company Information (Single Source of Truth)
- Company: Silk Route Logistics Inc.
- Location: Kalamazoo, Michigan
- MC#: 01794414
- DOT#: 4526880
- Phone: (269) 220-6760
- Email: whaider@silkroutelogistics.ai
- Website: silkroutelogistics.ai
- Tagline: "Where Trust Travels."
- Do NOT use Galesburg, info@, operations@, or any other outdated values.
