# Launch verification — 2026-10-21

Fresh verification uses disposable Linux servers, dynamically allocated ports, generated admin credentials and isolated databases/backups. The bundled event question content and event database are preserved. No human competitors are needed.

All 11 aggregate checks passed in one fresh run against the final app and harness. Type checking, 66 unit tests, the production build, simulator, two browser smoke tests and all eight E2E scenarios passed. Four complete language/mode tours produced 102 captures each; the tie tour produced 45, for **453 tour screenshots**, with no recorded browser errors. Every expected capture exists, and all 924 links/image references in the generated index resolve.

Evidence: [HTML index](../test-results/launch-audit-2026-10-21T15-44-10-640Z/index.html) and [aggregate JSON](../test-results/launch-audit-2026-10-21T15-44-10-640Z/report.json). The run used Node 22.21.1, pnpm 10.30.0, Playwright 1.64.0 and Chromium 156.0.8078.4 on Linux x64, from base commit `25435b108097b9246ea1330ec4fd2b323ad4f285` with the recorded working-tree changes. The simulator returned 1,000/1,000 replies in 10.04 seconds; local question-arrival spread was 0.217–0.388 ms.

Earlier development runs at `launch-audit-2026-10-21T15-21-32-092Z` and `launch-audit-2026-10-21T15-23-36-506Z` are explicitly marked incomplete after being superseded by the final harness and projector repair.

## Coverage and evidence

| Area                 | Verification                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core checks          | Type checking, 66 unit/engine/scoring/import tests, production build, simulator and Arabic/English browser smoke tests.                                                                                                                                                                                                                                                                         |
| Complete competition | Three socket tournaments: unchanged bundled real bank in manual mode, deterministic demo in manual mode, and demo in automatic mode with the 15-question final fallback. Every run asserts all 16 matches, 12 qualifiers, three finalists and champion; 606/606/621 answers respectively.                                                                                                       |
| Scoring              | Expectations use shared Blitz, speed, wagering and climb functions with controlled answers. Blitz bonuses use monotonic finish receipts. Deterministic tests cover difficulty/joker points, speed boundaries, ladder floor, card limits, exact receipt ties and deadline rejection.                                                                                                             |
| Gambler              | All three groups, hidden questions before wagers, category selection, manual written grading, positive/negative scores, audience/reveal, unanswered wagers, rerolls and forced cards.                                                                                                                                                                                                           |
| Final Climb          | Up/down movement, floor zero, step-ten victory, simultaneous finishes by earliest correct receipt, and 15-question fallback.                                                                                                                                                                                                                                                                    |
| Tie-breakers         | Dedicated visual tour: readiness, two successive all-wrong questions, third-question earliest correct winner and unchanged competition scores. Exact receipt ties are deterministic scoring coverage. Operational E2E covers correcting tied leaders and undo.                                                                                                                                  |
| Admin                | Team/logo changes, generation/deletion, CSV/JSON imports and rollback, question editing/set building, bracket draw/swaps and duplicate rejection, settings/automation, pause/resume, leak replacement, corrections/undo, export/print and backup restoration.                                                                                                                                   |
| Recovery/security    | Refresh/reconnect, offline reserved seats, active server crash after a committed answer, automatic Linux supervisor restart, durable command deduplication, stale/late answers, authentication and PIN lockout, role restrictions, answer secrecy, request/protocol limits.                                                                                                                     |
| Visual evidence      | Four full tours: Arabic RTL and English LTR × manual and automatic. Admin, 390-pixel competitor and 1920×1080 projector screenshots cover rules, readiness, countdown, questions, pause, reconnect, results, stage progression and champion. Gambler adds wheel/cards/audience/reveal; final adds audience/reveal. Each capture records stage, round, role, phase, locale and snapshot version. |

The real-bank run obtains model answers only from the authenticated admin harness. Competitor question snapshots are checked for answer/explanation secrecy. An export comparison verifies that playing changed only question usage flags, preserving all authored content. This proves execution of the bundled bank, not the factual correctness or editorial quality of its questions and distractors.

The simulator also checks 20 sockets and 1,000 replies at 100 messages per second. Its loopback arrival spread is recorded in `sim.log`; it is not a venue LAN measurement.

## Findings and changes

The initial baseline recorded one failing test out of 66: a resume deadline assertion compared separate wall-clock reads and could fail by one millisecond. It now checks the deadline between the timestamps immediately before and after resume, while retaining the exact monotonic elapsed-time assertion. Baseline type checking, build, simulator, smoke tests, full E2E and the old English tour passed; raw logs and the old tour's 60 captures remain in `baseline/`.

The new tie tour exposed an incorrect competitor display: “11 of 10” and a Blitz-duration progress bar during a tie question. Tie questions now show the localized tie-breaker label, use the question-duration timer and omit Blitz completion pips. The tour asserts the label and checks that the timer bar uses the question duration. A temporary narrow-layout assertion also caught the question entrance animation before it had settled; captures now wait for animation completion, as the smoke suite already does. Pre-fix diagnostics are retained separately.

Full-size Arabic screenshot review also exposed a clipped score in the four-team Gambler projector strip. Its cards now constrain their name columns and place scores in a second row. Tours check the bounds of every strip card, name and score during audience/reveal phases. Pre-fix clipping evidence remains under `diagnostics/projector-clipping/`.

The visual harness now shares the complete tournament driver with the scoring checks. It waits for network snapshots, React rendering, visible controls and finite entrance animations; card captures wait for the reel to finish and actual wagering buttons to appear. All three roles reach the same UI boundary before any capture; animated score values must match the authoritative snapshot. Every full tour requires its expected captures and champion. Failure exits are unsuccessful and preserve browser screenshots/HTML, admin state and server logs. Partial `TOUR_ONLY` runs are rejected. The aggregate starts as `incomplete`, records each result as it finishes and marks failed/skipped checks explicitly.

Controlled runner probes also passed: a successful child process that omits its required report makes the audit fail, and a failed build labels all eight dependent checks skipped. Both probes exited with status 1 as expected and retained JSON reports and an HTML index; these intentionally failed child runs are isolated under `harness-probes/`.

Screenshots were reviewed through contact sheets and full-size examples across both locales, all stages, the tie scenario and each role. The final captures show the settled reel/category, authoritative scores, readable question/answer content, pause/reconnect states and champion. Competitor width checks and projector score-strip geometry checks passed. The review sheets and findings are retained in `visual-review/`; venue-distance readability remains pending.

## Reproduce

```bash
pnpm audit:launch
```

Install Chromium with `pnpm exec playwright install chromium` if needed, or set `CHROMIUM_PATH`. The command builds production assets before browser checks. Open the printed evidence directory's `index.html`; use `report.json` for machine-readable statuses, runtime versions, source hash and commit. A dirty-tree run includes a patch and harness sources. Reports, logs, tournament exports, downloaded CSV/JSON/SQLite, browser smoke images and tour captures stay in the dated directory, which is ignored by Git.

For a subset, build first and run `E2E_ONLY=tournaments|operations|faults|supervisor|arbitration|browser pnpm e2e` (choose one value). Tour examples: `TOUR_LANG=en pnpm tour`, `TOUR_AUTO=1 pnpm tour`, `TOUR_SCENARIO=tie pnpm tour`. Each run should use a fresh `TOUR_OUT`/`E2E_OUT` directory.

## Pending venue verification

Venue networking and LAN latency, physical projector readability, audible sound, WAN-disconnected operation and Windows execution remain pending. Browser checks verify sound activation and generated print content, not speakers or a physical printer. Low-effects screenshots do not certify animation performance on venue hardware. Use [the venue rehearsal checklist](rehearsal-checklist.md) for equipment testing and sign-off.
