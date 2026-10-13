# Ashour — live quiz competition on a local network

Arabic-first, RTL competition software for **48 teams → 12 qualifiers → 3 finalists → 1 champion**. One Node server serves the admin dashboard, four interchangeable team devices, and a projector. All live interaction uses raw WebSockets. SQLite is the authoritative store. No Internet connection is needed during the event.

## Install and run

Use Node.js **22 or 24 LTS** and pnpm 10+. Install and build once while Internet access is available:

```bash
git clone https://github.com/Mahmoud-s-Khedr/ashur.git
cd ashur
pnpm install
cp .env.example .env
# Edit .env and choose a private ADMIN_PIN (at least 6 characters).
pnpm seed
pnpm build
pnpm start
```

Windows: `copy .env.example .env`, edit it in a text editor, then run the same pnpm commands. After installation, use `start.bat` or `./start.sh` for automatic process restart. The process always restarts a recovered active timer **paused**; the operator resumes it.

On the server computer: `http://localhost:3000/admin`. On other computers replace `localhost` with the server's LAN IP, for example:

- Admin: `http://192.168.10.2:3000/admin`
- Competitor devices: `http://192.168.10.2:3000/play`
- Projector: `http://192.168.10.2:3000/display`

The server listens on `0.0.0.0` by default and prints detected interface URLs. Set `HOST` to a specific LAN IP if needed. Allow inbound TCP port 3000 on the server firewall. Use wired Ethernet and reserve the server's IP on your router. This is a closed-LAN application; do not expose the port on the Internet.

**The seed is a demo bank:** 48 teams with codes **111–158**, 180 Arabic placeholder questions, and the required question distributions. Replace the questions and team codes before a real competition. Seeding never overwrites an existing database. To start a separate rehearsal, choose a different `DB_PATH`.

## The experience

- **Projector (`/display`)**: animated intro and funnel, full 48-team bracket with qualifiers lighting up, rules cards, a lineup reveal with live check-in pop and ready seals, 3-2-1 countdown with a GO! burst, a Blitz race with animated rank swaps, streaks, score deltas and speed-bonus flashes, a casino-style slot machine that lands exactly on the server's category, wager cards, audience question view with colour-coded options, a climbing ladder with a trophy, and a champion ceremony with light beams, confetti and fanfare. Every sound is synthesized locally. Controls fade out after a few idle seconds.
- **Team device (`/play`)**: big keypad check-in with a welcome animation, a breathing Ready orb, a draining timer bar, question pips, difficulty/joker badges, Kahoot-style coloured answer buttons (keys 1–4 or A–D also work), flip-in wager cards, finish time and bonus summary, kiosk behaviour (no context menu or Back), full state restore on refresh.
- **Admin console (`/admin`)**: a phase stepper with one state-aware primary button (Ctrl+Enter), live team cards with answer trails, grading queue with 1/2 hotkeys, lineup picker, emergency tools (pause, leak replacement, objection penalty, undo, reset), drag-and-drop bracket draw, team logos and printable code cards, a question bank with per-set coverage and auto-fill, a settings form, a setup page with QR codes, checklist and live device table, audit log and exports.
- **Languages**: Arabic (default, RTL) and English (`?lang=en` or the console's language button).

## Implemented

- Server clock, monotonic receipt times, first-answer locking, per-device command deduplication, heartbeat and automatic reconnect.
- Code check-in on any of four devices, persistent device tokens, readiness, lineup selection, controlled countdown, auto/assisted/manual modes, kick and reset.
- Blitz: 10 independent sequential questions, 120 seconds, joker and exact speed-bonus tiers.
- Gambler: random category, card choice before question, 30 seconds, positive/negative balances, audience phase and manual text grading.
- Final Climb: 10-step ladder, +1/−2 with a floor at zero, up to 15 questions, server receipt-time arbitration for simultaneous finishes.
- Reserve tie-breakers, automatic bracket advancement and champion ceremony.
- Question and team CRUD, CSV/JSON imports, coverage counts, set builder, used-question protection and printable codes.
- Append-only score ledger, reasoned manual adjustments, reversal of leaked questions, undo of manual adjustments and audit/export.
- SQLite WAL/FULL durability, atomic command transactions, paused crash recovery, rotating online backups and authenticated download.
- Arabic (RTL) and English interfaces, bundled Tajawal fonts, CSS/canvas animations and locally synthesized sounds.
- Atomic bracket draw, team logos, forced card assignment, tie-breaker question picker, device status heartbeat and a screen error guard that self-recovers.

Read [the operator runbook](docs/runbook.md), [import formats](docs/import-format.md), [assumptions and implementation choices](docs/assumptions.md), [protocol](docs/protocol.md), and [the rehearsal checklist](docs/rehearsal-checklist.md).

## Development and verification

```bash
pnpm dev          # API :3000 + Vite :5173; ADMIN_PIN still required
pnpm typecheck
pnpm test         # scoring, engine, full 48-team tournament, import and timer tests
pnpm build
pnpm sim          # real WS clients; all stages, reconnect, crash, load and exports
pnpm e2e          # full manual/auto tournaments, faults, backup restore, admin + four team browsers
pnpm smoke        # Chromium admin/play/display checks
pnpm tour         # plays a whole tournament with bots and saves screenshots to ./tour-shots (TOUR_LANG=en for English)
```

Browser checks use `/usr/bin/chromium` if installed. Otherwise run `pnpm exec playwright install chromium`, or set `CHROMIUM_PATH` to your browser executable. Browser tests and the simulator use separate temporary databases and test-only PINs. Build before `sim` or `smoke`. Production assets never depend on Vite.

Build before `e2e` too. It creates disposable servers/databases, asserts every round's scores and qualifications in two full 48-team tournaments, then exercises operational failures, simultaneous final finishes, the Linux supervisor and all three stages through four independent team browsers, an admin and a projector. It writes a JSON report, exports and screenshots to a printed temporary directory; set `E2E_OUT=test-results/e2e` to retain evidence in the workspace. To investigate a subset, use `E2E_ONLY=tournaments`, `operations`, `faults`, `supervisor`, `arbitration` or `browser`. Printing checks verify generated content with the native print dialog stubbed; projector audio checks verify browser activation, not physical speakers. Actual venue networking and hardware still require the rehearsal checklist.

The simulator's arrival-spread measurements use local loopback. They do **not** establish LAN timing. There is no physically achievable zero-latency guarantee: measure the actual router and computers during rehearsal. The target from the plan is under 5 ms spread.

## Repository layout

```text
packages/shared/src/  protocol envelope, question validation, constants, scoring, Arabic copy
packages/server/src/  SQLite repository/migration, transaction engine, WS/HTTP gateway, seed
packages/web/src/     React admin/, display/, play/ screens, shared ui/ parts (bracket, timer ring, confetti), lib/ (sound engine, i18n, hooks), reconnect/clock sync, import parser
 tools/              WS simulator, browser smoke test, screenshot tour, process supervisor
 docs/               operator instructions and verification status
```

Runtime data, backups, `.env`, and dependencies are ignored by Git. A public repository contains source and demo content; actual event questions and device credentials live in the local database.
