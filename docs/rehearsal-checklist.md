# Rehearsal checklist — actual venue

Record date, server model/OS, router model, software commit, browser versions, network interfaces and operator. Use a fresh rehearsal DB separate from event data.

- [ ] Node dependencies and Vite assets installed/built before Internet is removed.
- [ ] Static/DHCP-reserved server IP; four competitor PCs, admin and projector on wired Ethernet.
- [ ] Server firewall allows inbound TCP 3000; every device reaches `/health` and its correct route.
- [ ] Sleep, screensavers, notifications and updates disabled. One tab/device identity per PC.
- [ ] Projector is readable from the back of the room; Arabic shaping, RTL, Western digits and sound work. Walk the whole tournament once with `pnpm tour` to preview every scene, then repeat on the real projector at its native resolution.
- [ ] Slot machine, ladder and champion ceremony animate smoothly on the projector computer (no dropped frames); confetti and sound start together.
- [ ] Upload a team logo; check it on the lineup reveal, bracket and ladder. Print the code cards and confirm they are legible.
- [ ] Try the draw tool (swap by drag, random shuffle) and confirm the bracket and lineups update on the projector.
- [ ] Back button and right-click are blocked on competitor PCs (use a kiosk profile to block OS shortcuts).
- [ ] Enter any team's code on each physical PC; check readiness, wrong-code lockout and second-device rejection.
- [ ] Kick/reassign a device; refresh during a question; verify restored identity/progress and submitted lock.
- [ ] Confirm no team receives correct answers or other team responses; projector hides questions during team time except progress in Blitz.
- [ ] Review all actual question wording, options, zero-based model indexes and text grading references.
- [ ] Verify twelve 3/3/3/1 Blitz sets, twenty-four Gambler questions, fifteen final questions and mixed reserve coverage.
- [ ] Run all twelve Blitz rounds: winners populate correct Stage-2 groups. Verify exact speed tiers and joker penalty.
- [ ] Run all three Gambler groups, including negative balance, text grading, unanswered card and category exhaustion.
- [ ] Run final ladder, ground-floor penalty, simultaneous top finishes, fifteen-question fallback and champion ceremony.
- [ ] Force a top-score tie; grade reserve questions, repeat all-wrong and verify earliest correct winner without changing scores.
- [ ] Switch auto/assisted/manual; cancel auto delay; pause at countdown, during Blitz and during simultaneous questions.
- [ ] Leak-cancel in Blitz and Gambler/Climb; verify ledger reversal, used flags, replacement correctness and timer behavior.
- [ ] Apply −5 with a reason; undo it; verify append-only audit/ledger and export.
- [ ] Measure shared question receipt spread on the real four devices (target <5 ms); record raw server elapsed times and RTT. Loopback results are insufficient.
- [ ] Pull a competitor cable and reconnect. Replace its PC after an admin kick.
- [ ] Kill/restart server during active play. Verify paused recovery, current question, retained committed answers and remaining time.
- [ ] Test online backup download, automatic rotation, and a stopped-server restore from a copy.
- [ ] Run with router WAN physically unplugged. Verify no missing fonts, assets, sound, API or dependencies.
- [ ] Test Windows start.bat if the event server uses Windows; verify auto-restart and Ctrl+C behavior.
- [ ] Export final JSON/CSV/SQLite to a second disk. Have printed team codes and a paper fallback.
- [ ] Rehearse with real presenters, all 48 placeholders/teams and the full real question bank; resolve issues and freeze the commit.

Sign-off is an operator/venue decision after the real hardware rehearsal. Automated test results alone do not certify the event network.
