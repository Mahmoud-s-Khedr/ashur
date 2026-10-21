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

**The seed uses the real question bank:** all 112 questions from `أسئلة عاشور.xlsx`, arranged into 180 slots: 120 Blitz questions (12 sets of 3 easy / 3 medium / 3 hard / 1 joker), 24 Gambler questions, 15 Final Climb questions, and 21 tie-breaker/reserve questions. Multiple-choice distractors were added, and questions repeat across rounds to fill the tournament. Workbook wording and model answers are preserved apart from surrounding whitespace and numeric cell formatting; hard questions also fill joker slots. Review the added choices before the event. The 48 teams still have demo codes **111–158**; change those codes before the competition.

`pnpm seed` and server startup fill an empty question bank and preserve existing content. For an existing demo database, import [the generated question bank](packages/server/content/questions.json) through the admin question bank to replace unused IDs 1–180. Used questions and active sets remain protected. `pnpm questions:build` rebuilds that JSON from [the source content and authored distractors](packages/server/content/ashour-source.json). For an isolated demo rehearsal, set `QUESTION_BANK=demo` and choose a separate `DB_PATH`.

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
pnpm e2e          # real-bank + demo manual/auto tournaments, faults, backup restore, browser workflows
pnpm smoke        # Chromium admin/play/display checks
pnpm tour         # full bot tournament + state-checked screenshots (TOUR_LANG=en for English)
pnpm audit:launch # all checks, four full tours and tie tour; dated evidence under test-results/
```

### Run everything and generate all screenshot evidence

From the repository root, install dependencies and Chromium once, then run the aggregate audit:

```bash
pnpm install
pnpm exec playwright install chromium
pnpm audit:launch
```

Use Linux for the full audit: the E2E suite includes a Linux supervisor recovery scenario. Windows execution remains pending verification. Tests create their own servers, dynamically allocated ports, temporary databases and test-only admin PINs; no running development server or manual competition setup is required. The event database and bundled question content are preserved.

The audit runs these checks sequentially:

| Check           | Coverage                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| `typecheck`     | TypeScript validation                                                           |
| `test`          | Unit, scoring, engine, import and timer tests                                   |
| `build`         | Production web assets used by subsequent checks                                 |
| `sim`           | Real WebSocket clients, competition stages, reconnect, crash, load and exports  |
| `smoke`         | Arabic and English browser checks, including admin/team/projector screens       |
| `e2e`           | All eight scenarios, including three complete tournaments and browser workflows |
| Four full tours | Arabic RTL and English LTR, each in manual and automatic modes                  |
| Tie tour        | Readiness, two all-wrong tie questions, then earliest-correct-answer resolution |

The audit builds production assets automatically. When running `sim`, `smoke`, `e2e` or `tour` separately, run `pnpm build` first. Production assets never depend on Vite.

### Find screenshots and reports

By default, each audit creates a fresh dated directory and prints its location:

```text
test-results/launch-audit-<timestamp>/
  index.html          # Screenshot gallery grouped by stage and role; check/log links
  report.json         # Aggregate status, individual checks and run metadata
  *.log               # Output from each check
  working-tree.patch  # Tracked changes relative to HEAD
  harness/            # Test harness sources for this run
  smoke/              # Browser smoke artifacts, including screenshot checkpoints
  e2e/                # Scenario report, browser PNGs, exports and server logs
  tour-ar-manual/     # PNG captures, report.json and server.log
  tour-ar-auto/
  tour-en-manual/
  tour-en-auto/
  tour-tie/
```

Open the printed directory's **`index.html`** in a browser, then click a thumbnail for the full-size image. Keep the entire directory together when sharing the gallery because its image and report links are relative. Smoke and E2E screenshots are available in their respective subdirectories; the gallery embeds tour images.

Tours capture the admin console, a **390 × 844** competitor screen and a **1920 × 1080** projector. They cover rules, readiness, countdown, questions, pause, reconnect, results, stage progression and champion, plus Gambler wheel/cards/audience/reveal and Final Climb audience/reveal. Captures wait for the expected state, visible controls, settled entrance animations and authoritative scores. Each tour report records the capture's stage, round, role, phase, locale and snapshot version.

The [documented successful verification](docs/e2e-report.md) produced **102 captures per full tour + 45 tie captures = 453 tour screenshots**, plus browser test images. This is a recorded baseline; use the fresh run's reports to confirm its actual capture count and status. Backend-only tests have no UI image, and browser tests take screenshots at explicit checkpoints. Use the full audit for the broadest existing visual coverage.

`report.json` records the commit, dirty-tree status, runtime versions and question-bank hash. A completed audit passes only when every check passes; failed checks produce a nonzero exit status. A failed production build marks dependent browser/simulator/E2E/tour checks as skipped. Missing or failed E2E/tour reports also fail the audit. An interrupted run remains labelled `incomplete`; inspect its existing logs and report, since the gallery is written at the end. Failures retain available diagnostic artifacts, including browser screenshots and tour HTML/state/server logs.

### Run E2E separately

The full E2E suite checks every round's scores and qualifications in three complete 48-team tournaments: the unchanged bundled real bank in manual mode, demo manual mode, and demo automatic mode with the 15-question final fallback. It also covers imports, draw, permissions, emergency controls, tie corrections, backup restoration, authentication, seat limits, paused countdown, crash recovery, deadlines, protocol limits, Linux supervisor recovery and simultaneous final finishes.

The browser scenario exercises all three stages with four independent team browser identities, an admin and a projector, including reconnect, corrections, downloads and printing. Tours reuse four competitor identities, with one transferred to the narrow browser UI.

For a full E2E run with evidence retained in the workspace (Bash):

```bash
pnpm build
E2E_OUT="test-results/e2e-$(date +%Y%m%d-%H%M%S)" pnpm e2e
```

Without `E2E_OUT`, evidence goes to a printed temporary directory. Open the output directory's `report.json` for per-scenario results and inspect its PNGs, exports, downloaded CSV/JSON/SQLite files and logs.

To investigate one subset:

```bash
E2E_ONLY=browser E2E_OUT="test-results/browser-$(date +%Y%m%d-%H%M%S)" pnpm e2e
```

| `E2E_ONLY`    | Scenarios selected                                                                        |
| ------------- | ----------------------------------------------------------------------------------------- |
| `tournaments` | All three complete tournament scenarios                                                   |
| `operations`  | Imports, draw, permissions, emergency controls, tie corrections and backup restore        |
| `faults`      | Authentication, seat limits, countdown pause, active crash, deadlines and protocol limits |
| `supervisor`  | Linux supervisor restart and clean shutdown                                               |
| `arbitration` | Simultaneous final finishes and earliest correct server receipt                           |
| `browser`     | Admin tools, four teams, projector, reconnect, corrections, downloads and printing        |

Omit `E2E_ONLY` to run the entire suite. The aggregate audit clears this selector automatically.

### Generate individual screenshot tours

Build once, then choose the tour you need. These Bash examples use fresh output directories:

```bash
pnpm build

# Arabic, manual (the default)
TOUR_OUT="test-results/tour-ar-manual-$(date +%Y%m%d-%H%M%S)" pnpm tour

# English, manual
TOUR_LANG=en TOUR_OUT="test-results/tour-en-manual-$(date +%Y%m%d-%H%M%S)" pnpm tour

# Arabic, automatic
TOUR_AUTO=1 TOUR_OUT="test-results/tour-ar-auto-$(date +%Y%m%d-%H%M%S)" pnpm tour

# English, automatic
TOUR_LANG=en TOUR_AUTO=1 TOUR_OUT="test-results/tour-en-auto-$(date +%Y%m%d-%H%M%S)" pnpm tour

# Dedicated Arabic tie-breaker tour
TOUR_SCENARIO=tie TOUR_OUT="test-results/tour-tie-$(date +%Y%m%d-%H%M%S)" pnpm tour
```

Standalone tours write PNGs, `report.json` and `server.log` to `TOUR_OUT` (default: `tour-shots/`). The combined HTML gallery is generated by `pnpm audit:launch`. Each full tour must include the required captures and reach champion; `TOUR_ONLY` is rejected because partial tours cannot count as complete.

### Output and browser configuration

| Variable                | Purpose / default                                                                 |
| ----------------------- | --------------------------------------------------------------------------------- |
| `AUDIT_OUT`             | Aggregate evidence directory; defaults to a dated directory under `test-results/` |
| `AUDIT_BASELINE`        | Optional existing evidence directory to copy into the audit's `baseline/`         |
| `E2E_OUT`               | Standalone E2E evidence directory; defaults to a temporary directory              |
| `E2E_ONLY`              | Optional E2E subset from the table above                                          |
| `PLAYWRIGHT_OUTPUT_DIR` | Standalone smoke artifacts; defaults to `test-results/smoke`                      |
| `TOUR_OUT`              | Standalone tour evidence directory; defaults to `tour-shots/`                     |
| `TOUR_LANG`             | `en` for English; otherwise Arabic                                                |
| `TOUR_AUTO`             | `1` for automatic mode; otherwise manual                                          |
| `TOUR_SCENARIO`         | `tie` for the dedicated tie scenario; otherwise a full tournament                 |
| `TOUR_BANK`             | Standalone tour question bank; defaults to `demo`                                 |
| `CHROMIUM_PATH`         | Optional explicit Chromium executable path                                        |

The audit sets its own E2E/smoke/tour output paths and tour language, mode, scenario and demo bank. Use `AUDIT_OUT` to choose its root, and always choose a fresh directory for each run to avoid mixing old and new evidence:

```bash
AUDIT_OUT="test-results/full-$(date +%Y%m%d-%H%M%S)" pnpm audit:launch
```

Browser checks use `CHROMIUM_PATH` when set, then try `/usr/bin/chromium` and `/opt/pw-browsers/chromium`, then Playwright's installed browser. If a browser executable is missing, run `pnpm exec playwright install chromium`. On Linux hosts missing browser system libraries, use `pnpm exec playwright install --with-deps chromium` (system package installation may require administrator access). To use a specific installed browser:

```bash
CHROMIUM_PATH=/path/to/chromium pnpm audit:launch
```

If a standalone browser check cannot load production assets, rerun `pnpm build` before retrying. For any failed check, start with its log and `report.json`, then inspect retained failure screenshots and tour HTML/state. Rerun into a fresh output directory after fixing the cause. Generated evidence under `test-results/` is ignored by Git.

Printing checks verify generated content with the native print dialog stubbed; projector audio checks verify browser activation, not physical speakers. Actual venue networking, physical projector readability, audible sound, WAN-disconnected operation and Windows execution still require the [rehearsal checklist](docs/rehearsal-checklist.md).

The simulator's arrival-spread measurements use local loopback. They do **not** establish LAN timing. There is no physically achievable zero-latency guarantee: measure the actual router and computers during rehearsal. The target from the plan is under 5 ms spread.

## Repository layout

```text
packages/shared/src/  protocol envelope, question validation, constants, scoring, Arabic copy
packages/server/src/  SQLite repository/migration, transaction engine, WS/HTTP gateway, seed
packages/web/src/     React admin/, display/, play/ screens, shared ui/ parts (bracket, timer ring, confetti), lib/ (sound engine, i18n, hooks), reconnect/clock sync, import parser
 tools/              WS simulator, browser smoke test, screenshot tour, process supervisor
 docs/               operator instructions and verification status
```

Runtime data, backups, `.env`, and dependencies are ignored by Git. The bundled workbook content, generated choices and question bank are part of the source tree. Device credentials and runtime changes live in the local database.
