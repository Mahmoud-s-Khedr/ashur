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
- Arabic responsive interfaces, bundled Tajawal fonts, CSS animations and locally synthesized display sounds.

Read [the operator runbook](docs/runbook.md), [import formats](docs/import-format.md), [assumptions and implementation choices](docs/assumptions.md), [protocol](docs/protocol.md), and [the rehearsal checklist](docs/rehearsal-checklist.md).

## Development and verification

```bash
pnpm dev          # API :3000 + Vite :5173; ADMIN_PIN still required
pnpm typecheck
pnpm test         # scoring, engine, full 48-team tournament, import and timer tests
pnpm build
pnpm sim          # real WS clients; all stages, reconnect, crash, load and exports
pnpm smoke        # Chromium admin/play/display checks
```

Browser checks use `/usr/bin/chromium` if installed. Otherwise run `pnpm exec playwright install chromium`, or set `CHROMIUM_PATH` to your browser executable. Browser tests and the simulator use separate temporary databases and test-only PINs. Build before `sim` or `smoke`. Production assets never depend on Vite.

The simulator's arrival-spread measurements use local loopback. They do **not** establish LAN timing. There is no physically achievable zero-latency guarantee: measure the actual router and computers during rehearsal. The target from the plan is under 5 ms spread.

## Repository layout

```text
packages/shared/src/  protocol envelope, question validation, constants, scoring, Arabic copy
packages/server/src/  SQLite repository/migration, transaction engine, WS/HTTP gateway, seed
packages/web/src/     React admin, projector and player UI, reconnect/clock sync, import parser
 tools/              WS simulator, browser smoke test, process supervisor
 docs/               operator instructions and verification status
```

Runtime data, backups, `.env`, and dependencies are ignored by Git. A public repository contains source and demo content; actual event questions and device credentials live in the local database.
