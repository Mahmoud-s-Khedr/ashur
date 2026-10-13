# Operator runbook

## Before opening the room

1. Install dependencies, build the app, create `.env` with a private `ADMIN_PIN`, and start the server as described in the README.
2. Reserve the server's router IP. Connect admin, projector and four competitor computers by Ethernet. Disable sleep, screensavers and automatic updates on these computers.
3. Open `/admin` and enter the PIN. Open `/play` on each competitor computer and `/display` on the projector. Use one browser tab per device. Click **تفعيل الصوت** on the projector once. Optional: click **ملء الشاشة**, or use browser kiosk/fullscreen mode.
4. Import real questions and team names/codes. The question bank must contain 120 Stage-1 MCQs, 24 Stage-2 questions, 15 Stage-3 questions and 21 reserve/tie-breaker questions. Every Blitz set needs exactly 3 easy, 3 medium, 3 hard and 1 joker. Review the models and accepted answers.
5. Print codes from **الفرق والأكواد**. Codes are visible only in the admin interface and on the owning team's device. Keep the printouts away from the audience.
6. Download a full SQLite backup from **التصدير والنسخ**. Record the `DB_PATH`, `BACKUP_DIR` and server IP.
7. Disconnect the router's WAN and rehearse. Package installation/building needs Internet once; gameplay does not.

## Common controls

The header shows the authoritative phase and automation mode. The main green button performs the next action. All mutations pass through the server; rejected operations leave the game unchanged and show a red error banner.

- **تلقائي**: after all teams are ready, schedule a visible 3-second delay, then the 3-second countdown. After all cards are picked, schedule question start. After grading, schedule reveal and next question. Click **إلغاء الانتقال التلقائي** before a scheduled action fires. Switch to manual to hold a moment indefinitely.
- **بمساعدة المسؤول** / **يدوي**: the operator confirms transitions. Timer expiry and completion still close answer collection automatically; readiness never starts a round by itself.
- **إيقاف مؤقت** freezes collection and time. The team screens conceal their question while paused. **استئناف** preserves elapsed active time and recomputes the deadline.
- **بدء إجباري** bypasses readiness, not lineup validity. Use only after checking the actual seated teams.
- **اختيار الجولة** switches only from idle or results, and cannot reopen a completed round. Assign/override uncompleted lineups while idle, rules or handshake are open. Stage 1 begins with sequential groups of four; adjust the lineup if you want a draw.
- Team devices retain assignments through browser refresh and reconnect. An offline assignment remains reserved until the admin releases it. **تحرير الجهاز** releases a team so a replacement device can check in. **تصفير الأجهزة** is available only outside active play.

## Blitz: جري الوحوش

1. Select the round, review/assign its four teams. Click **عرض القواعد** then **إعلان الفرق وفتح الجاهزية**.
2. The seated teams enter their numeric codes on any competitor PC. Each clicks **مستعد**. Verify device status and RTT in the four cards.
3. Start, or let auto mode start after readiness. The actual answer period begins after the countdown. All teams receive the same ten MCQs, independently moving forward after submission.
4. The server scores each first answer and marks every displayed question used. No verdict is shown to competitors. Only fully completed sets qualify for speed bonus: under 90 s +15, 90–<100 s +10, 100–110 s +5, above 110 s 0.
5. When all teams finish or time expires, the server determines the top score. A unique winner is published and advances in the bracket. A tied top score goes to **مراجعة النتائج**; use the tie-breaker procedure below.
6. **الجولة التالية** clears device bindings and prepares the next round. Give the next seated teams their codes.

## Gambler: حظك نحس

Stage-1 winners populate groups A/B/C from rounds 1–4 / 5–8 / 9–12. Settings can change this mapping. Select the group and follow rules/handshake/start.

1. **اختيار التصنيف** chooses randomly on the server from categories with unused Stage-2 questions. The display animation is cosmetic.
2. Each team selects 5/10/15 before the question is sent. **بدء السؤال والمؤقت** requires all cards; auto mode schedules it when all are selected.
3. The 30-second answer period starts. MCQs are auto-graded; text/numeric submissions enter the grading queue. Press correct/wrong buttons, or 1/2 for the first pending answer when not typing in a form.
4. After timeout or all submissions, show the question to the audience. Team screens hide it. Grade every pending answer. **إظهار الإجابة** commits each card's positive/negative score and displays the model. Unanswered cards are wrong by default.
5. **السؤال التالي** returns to the wheel. Repeat eight questions. The highest score advances; tied leaders use a tie-breaker. Negative balances are valid.

## Final Climb: سلم عاشور

The three Stage-2 winners automatically populate the final. Follow rules/handshake/start.

1. All three active team devices receive each question with one shared serialized WebSocket question event. The 30-second period uses a server deadline.
2. Grade text/numeric answers. After collection, the audience sees the question; reveal applies +1 for correct and −2 for wrong, floored at zero.
3. Reveal crowns a team reaching the top. If several reach the top on the same question, earliest monotonic receipt wins. An exact receipt tie uses another reserve question. If nobody reaches ten, the highest position after fifteen questions wins; tied leaders use the reserve flow.
4. The server freezes final results and marks the champion. The projector shows the celebration. The operator may hold reveal for the audience; no next question is sent before revealing.

## Tie-breakers

From tied results, click **كسر التعادل**. Only tied teams can ready/answer. Other teams wait. When all tied teams are ready, click **إطلاق سؤال كسر التعادل** (or use auto mode). The server chooses an unused reserve/tie-breaker question. Inspect raw submission elapsed milliseconds and RTT in the admin queue. Grade text/numeric answers and reveal. Earliest correct receipt wins; no correct answer or an exact receipt tie repeats readiness with a new reserve question. Tie-breakers affect ranking, never the score ledger.

## Emergency correction

- **Audience leak**: hold the flow in manual mode first. During a current question/audience/reveal, enter the leaked question ID (especially in self-paced Blitz) and optionally a reserve replacement ID. Click the leak action and confirm. The replacement must be unused reserve content; Blitz requires MCQ. The server prefers hard/joker replacements. Approve a suitably harder question using operator judgment.
- Leak correction writes reversals, retains original ledger rows, voids affected answers and consumes the original question. In Blitz, subsequent answers and speed bonuses are also reversed, and the affected teams rewind to that position while keeping the master round clock. This ensures a common set/order after a leak. Later questions may be replayed within this same correction; they cannot be reused in another round. Gambler/Climb preserve the card/position and start a fresh question timer.
- If the Blitz master timer is already exhausted, replacement cannot grant extra time; make the leak decision promptly. Completed rounds are locked to avoid silently changing downstream qualification.
- **Manual penalty**: choose team, delta (e.g. −5), mandatory reason, then apply. It is available before completion in Blitz/Gambler. Ladder manual edits are deliberately disabled to preserve its bounds. **تراجع عن آخر تعديل** reverses the most recent unreversed manual adjustment; it does not undo arbitrary game commands.
- A card/category reroll is possible before question start. It clears card selections so teams can decide again.

## Recover from failures

**One competitor refreshes or loses connection**: the browser reconnects every 1.5 seconds and supplies the stored token. Its current question/progress comes from a snapshot. Scores remain server-side. If its computer must be replaced, pause, kick its assignment in admin, check in with its code on the new computer, and resume.

**Admin closes a tab**: reopen `/admin`. PIN stays in session storage until the tab/browser session ends; a fresh session asks again. The game stays on the server. Never open two tabs with the same device identity. The error banner includes an identity-reset option; release the previous team assignment before changing a competitor's identity.

**Server process crashes**: the supervisor restarts it. SQLite WAL recovers committed writes; commands broadcast only after commit. A live question/countdown returns paused with the most recent stored remaining time (checkpointed every 250 ms). Devices reconnect. Check the phase/question, then resume. Do not start a new tournament database.

**Need to restore a backup**: stop the supervisor and server completely. Keep a copy of the failed database/WAL/SHM. Copy a chosen `backups/ashour-<timestamp>.sqlite` over the configured `DB_PATH`. Remove the old `DB_PATH-wal` and `DB_PATH-shm` only after all server processes are stopped. Start the same app and PIN configuration. Check the snapshot before resuming. Restoring an earlier backup necessarily discards later committed answers.

**Cannot connect from another PC**: check Ethernet, server IP, firewall inbound TCP 3000 and `/health`. `localhost` on a competitor refers to that competitor, not the server. A healthy `/health` plus broken WS suggests browser/network proxy or firewall rules; use direct LAN URLs.

**Wrong codes/PIN**: after five failures the device (codes) or source IP (PIN) is locked for ten seconds. Wait and enter the actual code. A team already bound to another device must be kicked by admin first.

## Close the event

Download JSON, CSV and a SQLite backup from **التصدير والنسخ**. Print the results if needed. Copy backups to a second physical disk after the event. Stop the supervisor with Ctrl+C. The public repository never receives your live database, real question bank, PIN or device tokens.
