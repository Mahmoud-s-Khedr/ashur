# End-to-end verification — 2026-10-13

The tested local scenarios passed on Linux with Node 22.21.1 and Chromium. Tests ran against isolated servers and demonstration content, using separate temporary databases and generated test PINs. Event data and credentials were not used.

## Results

| Verification                    | Result and evidence                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript and production build | Passed                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Unit/engine/import/clock checks | All 62 tests passed                                                                                                                                                                                                                                                                                                                                                                                                    |
| Existing socket simulator       | All stages, reconnect, crash recovery, permissions, exports, logos and backup passed; 20 sockets returned all 1,000 replies at 100 messages/second                                                                                                                                                                                                                                                                     |
| Existing browser smoke          | Both Arabic and English checks passed, including narrow player layout                                                                                                                                                                                                                                                                                                                                                  |
| Full manual tournament          | All 16 rounds passed with exact scores, 606 answers, 12 qualifiers, 3 finalists and one champion                                                                                                                                                                                                                                                                                                                       |
| Full automatic tournament       | All 16 rounds passed with exact scores and 621 answers; exercised automatic transitions and the 15-question final fallback                                                                                                                                                                                                                                                                                             |
| Operational scenarios           | Import rollback; numeric-question creation/deletion; set building; bracket swaps/duplicate rejection; role restrictions; cancellation of automatic start; assisted start; command deduplication; paused leak replacement; stale-answer rejection; penalties/undo; used-question protection; device kick/reassignment; reserve repetition; tie corrections; unanswered wagering; CSV export and check-in lockout passed |
| Backup restoration              | Downloaded a live SQLite backup, stopped the server, booted from the downloaded file, and verified exact equality of exported state, questions, teams, answers, ledger and audit before resuming                                                                                                                                                                                                                       |
| Authentication and faults       | Forged token, role change, duplicate identity, fifth occupied seat, reserved offline assignment, paused countdown, invalid answer, late submission, request-size limit, malformed JSON, missing command ID, per-socket rate limit and PIN lockout checks passed                                                                                                                                                        |
| Active crash after submission   | Killed the server after a committed answer; recovered paused with the answer, ledger, progress and command deduplication intact                                                                                                                                                                                                                                                                                        |
| Linux supervisor                | Killed the supervised child; verified automatic restart, paused recovery, explicit resume and clean shutdown                                                                                                                                                                                                                                                                                                           |
| Simultaneous final finishes     | Three teams reached the top on the same question; no victory before reveal, all positions equalled ten, and the earliest correct server receipt won                                                                                                                                                                                                                                                                    |
| Browser operations              | Admin, projector and four independent team browser identities exercised all three stages; 40 Blitz answers, 32 Gambler answers and 30 final answers passed                                                                                                                                                                                                                                                             |
| Visual tours                    | English full tournament, automatic-mode full tour and tie scenario completed, producing 155 screenshots                                                                                                                                                                                                                                                                                                                |

## Browser coverage

The browser suite used real clicks, keyboard input, forms, file uploads and WebSocket connections. It checked invalid/valid admin login; settings; team naming and PNG logo upload; code-card generation; unique random team generation and deletion; CSV import; invalid JSON batch rollback; question import/editing; set auto-fill; random bracket draw; QR codes; setup-checklist persistence; device listings; four-team check-in/readiness; Ctrl+Enter; fullscreen and sound activation; pause; leaked-question replacement; score adjustment/undo; keyboard and button answers; refresh and socket reconnect; eight wagering questions; manual grading by keyboard and buttons; negative balances; ten ladder questions; champion display; audit filtering; four downloads and printable result content. Runtime requests stayed local and no browser JavaScript errors were recorded in the passing run.

The browser scenario arranges Stage-2 and final lineups through authenticated admin commands to isolate those UI flows. Qualification through the entire 48-team bracket is independently asserted by both full socket tournaments.

## Evidence and rerunning

Latest aggregate results: `test-results/e2e-summary.json`. Detailed scenario reports, exports, screenshots and the downloaded SQLite backup are under `test-results/e2e*`. Tour screenshots are copied to `test-results/e2e-tours`. These runtime artifacts are ignored by Git.

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm sim
pnpm smoke
E2E_OUT=test-results/e2e pnpm e2e
```

Individual scenarios can be selected with `E2E_ONLY=tournaments`, `operations`, `faults`, `supervisor`, `arbitration` or `browser`. The default E2E run includes them all. The recorded aggregate combines the full run with passing reruns of updated harness scenarios; raw intermediate reports are retained.

Initial browser-harness attempts needed corrections for accessible labels containing arrows/option text, permanently animated ready buttons, idle projector controls and the audit console's documented 100-event window. The existing smoke test now waits for animation completion rather than sleeping a fixed number of milliseconds. The corrected checks passed; these adjustments did not change production gameplay.

## Limits

- These runs do not certify a physical router, cables, venue projector, speakers, printer, kiosk OS restrictions or Windows launcher.
- Printing checks intercept the native print dialog and verify the generated cards/result document. Audio checks verify browser activation, not audible output.
- No external runtime requests were observed; physically unplugging the WAN remains a venue rehearsal check.
- The load simulator measured a 0.271–6.689 ms question-arrival spread on loopback while concurrent Chromium tours were running. This is not LAN timing evidence or a guarantee of the under-5 ms venue target.
- Exact receipt ties and speed-bonus boundaries are covered by deterministic engine/scoring tests. Actual simultaneous socket finishes are additionally covered by the E2E arbitration scenario.
- The demonstration bank does not establish the correctness, difficulty or completeness of the real event's questions.

Use [the venue rehearsal checklist](rehearsal-checklist.md) for those remaining checks.
