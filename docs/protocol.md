# WebSocket and HTTP protocol

Endpoint: `/ws`. Envelope:

```ts
{ v: 1, type: string, cmdId?: string, payload: object }
```

Send `hello` first:

```json
{
  "v": 1,
  "type": "hello",
  "payload": {
    "role": "team",
    "deviceId": "a-unique-device-identifier",
    "deviceToken": "optional-previous-token"
  }
}
```

Roles: `admin`, `team`, `display`. Admin hello also includes `pin`. The server returns `hello.ok {deviceToken}`; persist the token privately on the device. Every other mutating command needs a unique `cmdId`. A successful `command.ack {cmdId,accepted:true}` precedes a role-scoped `state.snapshot`. Repeating a successful command ID from the same device/role returns its stored outcome without reapplying the mutation. Rejected commands send `error {cmdId?,message}`. Schema/role/phase/deadline errors roll back memory and database changes.

Clients reconnect and request a fresh snapshot rather than replaying game events. Team snapshots never carry question correctness, other answers, other team codes or grading verdicts. Display snapshots reveal model answers only in reveal/results; Stage-1 questions are not published to the audience. Admin sees the entire bank, answers and audit tail. Team progress automatically advances on the server after a valid Blitz submission.

Clock synchronization: `time.ping {c0}` returns `time.pong {c0,s1}`. The client takes eight midpoint-offset samples, renders using the median offset, and repeats every ten seconds. Browser WebSocket control pong is automatic; server heartbeat is every two seconds and closes stale peers after a missing response. Admin device cards show control-frame RTT.

Commands implemented:

| Role  | Commands                                                                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Team  | `team.checkin {code}`, `team.checkout`, `team.ready`, `answer.submit {roundQuestionId,answer}`, `card.select {value}`                                                                                                                       |
| Admin | `round.select {key}`, `round.assignTeams {teamIds}`, `round.showRules`, `lineup.announce`, `round.openHandshake`, `round.start`, `round.forceStart`, `round.pause`, `round.resume`, `round.next`                                            |
| Admin | `automation.set {mode}`, `auto.cancel`, `wheel.spin`, `question.start`, `question.reroll`, `question.next`, `question.reveal`, `question.cancelLeak {questionId?,replacementId?}`                                                           |
| Admin | `grade.set {answerId,verdict}`, `score.adjust {teamId,delta,reason}`, `undo.last`, `tiebreak.open`, `tiebreak.launch {questionId?}`                                                                                                         |
| Admin | `checkin.kick {teamId}`, `devices.reset`, `bracket.override {key,teamIds}`, `bracket.bulk {assignments:[{key,teamIds}]}` (atomic draw), `cards.forceFill`, `display.scene {scene}`, `settings.update {settings}`                            |
| Admin | `teams.save {teams}` (each team may carry `logo`: a PNG/JPEG/WebP data URL ≤ 400 KB, or `null` to remove), `teams.delete {id}`, `questions.save {questions}`, `questions.delete {id}`, `questions.resetUsed`, `set.build {seq,questionIds}` |

Text/numeric `answer` is a string; MCQ `answer` is a zero-based index. `roundQuestionId` refers to the question's stable ID. A cancelled question's replacement receives a different ID. A previously used question cannot appear in a different round. One non-void submission is accepted per team/question in that round.

Shared `question.show {roundQuestionId,body,type,options,endsAt}` is emitted once to eligible teams for each simultaneous Stage-2/3/tie question. It never carries correctness. Snapshots remain sufficient for recovery; the built-in UI renders snapshots. `endsAt` is server wall time; elapsed answer scoring uses a monotonic clock.

HTTP:

- `GET /health`: public health/phase/version status.
- `POST /api/command`: admin command envelope; suitable for 2 MB imports beyond WebSocket's 64 KB incoming limit.
- `GET /api/export`: complete JSON data/answers/ledger/audit.
- `GET /api/results.csv`: UTF-8 BOM results.
- `GET /api/backup`: online SQLite backup download.
- `GET /api/network`: the server's LAN IPv4 addresses and port (used by the QR codes).
- `GET /logo/:teamId?v=<n>`: public team logo bytes with immutable caching (the version comes from the snapshot's `logoV`).

All `/api/*` requests require `Authorization: Bearer <admin device token>`. Static pages and locally bundled assets are served by the same port. Each socket is limited to 100 incoming messages per second; five failed code attempts lock that device for ten seconds, and five bad PIN attempts lock the source IP for ten seconds.

## Snapshot fields added for presentation

Every snapshot carries `spinAt` (server wall-clock ms of the last category spin, used to time the reel animation) and `categories` (all Stage-2 categories, for the reel strip). Lineup entries (display/admin) add `checkedIn`, `online`, `answered` (this question), `bonus` (speed bonus points) and, in the reveal phase of Stage 2/3 only, `verdict`. Team snapshots add `ownFinishMs` and `ownBonus` after a Blitz finish (never any correctness information). Admin snapshots add `devices` (every connected device with RTT) and `set` (the active round's question IDs). Team logos are referenced by `logoV` and fetched from `/logo/:id`, never embedded.
