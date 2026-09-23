# Appendix A — patterns and roadmap preserved from the pre-consolidation CLAUDE.md

Moved out of `CLAUDE.md` on 2026-09-23.

**A.1 (load and carrier state machines) moved here too, and that is not an oversight:**
it restates the load status pipeline, which stays resident in §2, so keeping A.1 in the
core meant carrying the same 18 states twice. The §2 copy is canonical.

**A.2–A.5 are explicitly "documented, not yet implemented"** — lane-based development,
event-based state transitions, knowledge-graph awareness, and a list of future patterns
from other projects. Roadmap, not rules, and none of it has a consumer today.

---

Preserved from the pre-consolidation CLAUDE.md. These are patterns and roadmap items that didn't fit cleanly into §1–§18 but remain valid tracking material. Time-bound metrics have been stripped (e.g. "currently 21 refs", "Plan for Q2", "Install when doing daily SRL sessions").

### A.1 State Machines for Load & Carrier Lifecycle (claw-code pattern)

- Every entity with a lifecycle (Load, Carrier, Invoice, Sequence) has defined states and valid transitions.
- **Load:** `DRAFT → POSTED → TENDERED → BOOKED → DISPATCHED → AT_PICKUP → LOADED → IN_TRANSIT → AT_DELIVERY → DELIVERED → COMPLETED`
- **Carrier:** `PROSPECT → CONTACTED → INTERESTED → REGISTERED → PENDING → APPROVED` (or `REJECTED`)
- **Invoice:** `DRAFT → SUBMITTED → SENT → UNDER_REVIEW → APPROVED → FUNDED → PAID`
- **Sequence:** `ACTIVE → PAUSED → COMPLETED → STOPPED`
- Invalid transitions should be rejected (e.g., can't go from POSTED directly to DELIVERED).
- State changes should be observable — log every transition with timestamp and actor.

### A.2 Lane-Based Development (claw-codes pattern)

- For features touching multiple systems (e.g., carrier vetting has FMCSA, OFAC, identity, docs, scoring), split into independent lanes.
- Each lane has its own scope, can be built/tested/merged independently.
- Track lane status in commit messages: `[Lane 3/5] OFAC screening integration`.
- Lanes reduce merge conflicts and enable parallel work across sessions.
- Document active lanes in the relevant wiki page's "Open Threads" section.

### A.3 Event-Based State Transitions (claw-code roadmap pattern)

- State changes on Load, Carrier, Invoice, Sequence should emit structured events, not just update a DB field.
- Log every transition: `{ entity, id, from, to, actor, timestamp, metadata }` in `SystemLog`.
- Enables: audit trail, webhook triggers, external monitoring, undo capability.
- Example: `Load SRL-121483: POSTED → BOOKED by userId=xyz at 2026-04-08T10:30:00Z`.

### A.4 Knowledge Graph Awareness (Graphify pattern)

- The wiki tracks "god nodes" — concepts referenced by 10+ pages.
- Surprising connections between topics should be documented in `outputs/` when discovered.
- Every factual claim carries `EXTRACTED` / `INFERRED` / `AMBIGUOUS` confidence tags (already implemented in KB v2).

### A.5 Future Patterns (documented, not yet implemented)

- **Hook system (claude-brain):** PreToolUse / PostToolUse interceptors for permission gates and compliance checks.
- **Cost tracker modularization (src-repo):** split token counting, cost calculation, and analytics into separate modules.
- **Feature flags:** currently using env vars. Consider build-time elimination when/if migrating to Bun.
- **Centralized command registry (Hermes):** single registry auto-generates CLI help, Slack menus, API docs. Plan when multi-platform.
- **Print-mode automation (Hermes):** one-shot CLI mode for CI/testing without trust dialogs.
- **MemPalace conversation persistence:** local AI memory system (ChromaDB) that stores every session verbatim and makes it searchable. Auto-save hooks fire every 15 messages. Command: `pip install mempalace && mempalace init`.
