# Verification and delivery status

- **M0 foundation:** pnpm workspace, strict TypeScript, Fastify/ws, SQLite WAL/FULL, seeded data, hashed device tokens, role-scoped snapshots, heartbeat/clock sync. Verified by unit/engine checks and real socket clients.
- **M1 Blitz:** check-in/readiness, countdown, self-paced questions, exact scoring, bonus boundaries, tie-breaker, bracket advancement and pause/recovery. Verified by engine and socket tests.
- **M2 admin tooling:** Arabic control UI, team/question CRUD/import, coverage, set builder, manual grading/adjustments, leak reversal, manual undo, audit and exports. Import validation and emergency ledger tests pass; browser editing/flow checks pass.
- **M3 Gambler:** card-before-question gating, crypto category selection, eight-question group, negative balances, grading, audience/reveal. Full group engine and real socket tests pass.
- **M4 Final:** ladder scoring, bounded positions, simultaneous-finish receipt arbitration, championship and 15-question path. Full final engine and socket tests pass.
- **M5 presentation:** gamified Arabic/English UI rebuilt around design tokens: animated intro and bracket, lineup reveal with live check-in, countdown and GO burst, Blitz race lanes with streaks/deltas/rank arrows, server-synced slot machine, wager cards, ladder with pawns, trophy ceremony, synthesized sound design, kiosk-style team device and a redesigned operator console (stepper, drag-and-drop draw, logos, QR setup page, settings form). Verified by an automated full-tournament screenshot tour (`pnpm tour`), Chromium smoke and a narrow-player overflow check.
- **M6 hardening:** persisted idempotency, late/double-answer rejection, disconnect and SIGKILL recovery, authenticated exports/SQLite backup, 20-socket load test at 100 messages/s with 1,000/1,000 pongs, Linux/Windows start scripts and runbook.
- **M7 venue rehearsal:** not executable in this cloud workspace. Use the actual router, devices and reviewed question bank with the supplied checklist.

Loopback simultaneous-question spread observed in the first socket run: **0.037–2.575 ms**. Repeat on the real LAN; no zero-latency guarantee is claimed. Browser smoke verifies same-origin runtime requests, not physical WAN removal. Linux execution is verified; the Windows launcher needs venue testing.

Implementation choices and remaining optional conveniences are listed in `assumptions.md`. Seeded content is illustrative and must be replaced.

Final local gate: 45 unit/engine/import/clock tests, `pnpm sim` (all stages, crash recovery, 20-socket load) and `pnpm smoke`, strict TypeScript and production build pass. Browser smoke also covers the absence of secure-context-only crypto.randomUUID so plain LAN HTTP identities work.
