import { randomInt, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  DEFAULTS,
  questionSchema,
  blitzScore,
  speedBonus,
  gamblerScore,
  climbPosition,
  fastestCorrect,
  type Match,
  type Question,
  type Team,
  type Answer,
  type Role,
} from '@ashour/shared';
import type { DB } from './db';
export type Actor = { role: Role | 'system'; deviceId: string; teamId?: number; rttMs?: number };
const object = z.record(z.unknown());
const schema: Record<string, z.ZodTypeAny> = {
  'round.select': z.object({ key: z.string() }),
  'round.assignTeams': z.object({ teamIds: z.array(z.number().int()).min(3).max(4) }),
  'answer.submit': z.object({
    roundQuestionId: z.number().int(),
    answer: z.union([z.number().int().nonnegative(), z.string().max(2000)]),
  }),
  'card.select': z.object({ value: z.number().int() }),
  'grade.set': z.object({ answerId: z.string(), verdict: z.enum(['correct', 'wrong']) }),
  'score.adjust': z.object({
    teamId: z.number().int(),
    delta: z.number().int().min(-1000).max(1000),
    reason: z.string().trim().min(1).max(500),
  }),
  'automation.set': z.object({ mode: z.enum(['auto', 'assisted', 'manual']) }),
  'settings.update': z.object({ settings: object }),
  'display.scene': z.object({ scene: z.enum(['auto', 'intro', 'bracket', 'leaderboard']) }),
  'team.checkin': z.object({ code: z.string().regex(/^\d{3,4}$/) }),
  'checkin.kick': z.object({ teamId: z.number().int() }),
  'questions.save': z.object({ questions: z.array(questionSchema).min(1).max(1000) }),
  'questions.delete': z.object({ id: z.number().int() }),
  'teams.save': z.object({
    teams: z
      .array(
        z.object({
          id: z.number().int().positive().optional(),
          code: z.string().regex(/^\d{3,4}$/),
          name: z.string().trim().min(1).max(100),
          color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
          logo: z
            .union([
              z.string().regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/),
              z.null(),
            ])
            .refine((v) => v === null || v.length <= 400_000, 'Logo too large')
            .optional(),
        }),
      )
      .min(1)
      .max(200),
  }),
  'bracket.bulk': z.object({
    assignments: z
      .array(z.object({ key: z.string(), teamIds: z.array(z.number().int()).min(3).max(4) }))
      .min(1)
      .max(20),
  }),
  'teams.delete': z.object({ id: z.number().int() }),
  'question.cancelLeak': z.object({
    questionId: z.number().int().optional(),
    replacementId: z.number().int().optional(),
  }),
  'tiebreak.launch': z.object({ questionId: z.number().int().optional() }),
  'bracket.override': z.object({
    key: z.string(),
    teamIds: z.array(z.number().int()).min(3).max(4),
  }),
  'set.build': z.object({
    seq: z.number().int().min(1).max(12),
    questionIds: z.array(z.number().int()).length(10),
  }),
};
const teamCommands = new Set([
  'team.checkin',
  'team.checkout',
  'team.ready',
  'answer.submit',
  'card.select',
]);
const emptyCommands = new Set([
  'lineup.announce',
  'round.showRules',
  'round.openHandshake',
  'round.start',
  'round.forceStart',
  'round.pause',
  'round.resume',
  'round.next',
  'question.next',
  'question.start',
  'question.reveal',
  'wheel.spin',
  'question.reroll',
  'auto.cancel',
  'tiebreak.open',
  'devices.reset',
  'undo.last',
  'questions.resetUsed',
  'cards.forceFill',
]);
export class Engine {
  state: Match;
  private origin = performance.now();
  private originElapsed = 0;
  constructor(
    public db: DB,
    private clock = () => performance.now(),
  ) {
    const saved = db.prepare('SELECT json FROM match_state WHERE id=1').get() as
      { json: string } | undefined;
    const rounds = [];
    for (let i = 1; i <= DEFAULTS.stage1Rounds; i++)
      rounds.push({
        key: `1-${i}`,
        stage: 1,
        seq: i,
        teamIds: [4 * i - 3, 4 * i - 2, 4 * i - 1, 4 * i],
      });
    for (let i = 1; i <= DEFAULTS.stage2Rounds; i++)
      rounds.push({ key: `2-${i}`, stage: 2, seq: i, teamIds: [] });
    rounds.push({ key: '3-1', stage: 3, seq: 1, teamIds: [] });
    this.state = saved
      ? JSON.parse(saved.json)
      : {
          version: 0,
          roundKey: '1-1',
          phase: 'IDLE',
          scene: 'auto',
          ready: [],
          set: [],
          index: 0,
          progress: {},
          cards: {},
          cardUses: {},
          category: '',
          answers: [],
          startedAt: 0,
          endsAt: 0,
          remainingMs: 0,
          elapsedMs: 0,
          allottedMs: 0,
          paused: false,
          autoAt: 0,
          autoAction: '',
          spinAt: 0,
          tieIds: [],
          finishMs: {},
          settings: structuredClone(DEFAULTS),
          rounds,
        };
    this.state.spinAt ??= 0;
    this.state.settings.liveScores ??= true;
    this.state.allottedMs ??= this.state.elapsedMs + this.state.remainingMs;
    this.origin = this.clock();
    this.originElapsed = this.state.elapsedMs;
    if (['RUNNING', 'COUNTDOWN', 'TIE_RUNNING'].includes(this.state.phase) && !this.state.paused) {
      this.state.paused = true;
      this.state.endsAt = 0;
      this.state.autoAt = 0;
      this.state.autoAction = '';
      this.persist();
    }
  }
  get round() {
    return this.state.rounds.find((r) => r.key === this.state.roundKey)!;
  }
  teams() {
    return this.db
      .prepare(
        'SELECT id,code,name,color,status,COALESCE(logo_v,0) AS logoV FROM teams ORDER BY id',
      )
      .all() as Team[];
  }
  /** Parsed question bank, reused between mutations (every dispatch drops it). */
  private bank: Question[] | null = null;
  questions() {
    this.bank ??= (
      this.db.prepare('SELECT * FROM questions WHERE is_deleted=0 ORDER BY id').all() as {
        json: string;
        is_used: number;
      }[]
    ).map((r) => ({ ...JSON.parse(r.json), used: !!r.is_used })) as Question[];
    // Callers may reorder or tweak the array; hand out copies of the list, not the cache.
    return this.bank.map((q) => ({ ...q }));
  }
  question(id: number) {
    return this.questions().find((q) => q.id === id);
  }
  scores() {
    const rows = this.db
      .prepare(
        'SELECT team_id,COALESCE(SUM(delta),0) AS score FROM score_events WHERE round_key=? GROUP BY team_id',
      )
      .all(this.state.roundKey) as { team_id: number; score: number }[];
    return Object.fromEntries(
      this.round.teamIds.map((id) => [
        id,
        (rows.find((r) => r.team_id === id)?.score ?? 0) +
          (this.round.stage === 2 ? this.state.settings.gamblerInitial : 0),
      ]),
    );
  }
  private saveLogo(teamId: number, dataUrl: string | null) {
    if (dataUrl === null)
      this.db
        .prepare('UPDATE teams SET logo=NULL,logo_mime=NULL,logo_v=COALESCE(logo_v,0)+1 WHERE id=?')
        .run(teamId);
    else {
      const m = /^data:(image\/[a-z]+);base64,(.*)$/.exec(dataUrl)!;
      this.db
        .prepare('UPDATE teams SET logo=?,logo_mime=?,logo_v=COALESCE(logo_v,0)+1 WHERE id=?')
        .run(Buffer.from(m[2], 'base64'), m[1], teamId);
    }
  }
  logo(teamId: number) {
    return this.db.prepare('SELECT logo,logo_mime FROM teams WHERE id=?').get(teamId) as
      { logo: Buffer | null; logo_mime: string | null } | undefined;
  }
  private persist() {
    this.db
      .prepare(
        'INSERT INTO match_state VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json,version=excluded.version',
      )
      .run(JSON.stringify(this.state), this.state.version);
  }
  private require(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }
  private phase(...phases: string[]) {
    this.require(
      phases.includes(this.state.phase) && !this.state.paused,
      `Illegal transition from ${this.state.phase}${this.state.paused ? ' (paused)' : ''}`,
    );
  }
  private score(
    teamId: number,
    delta: number,
    kind: string,
    questionId?: number,
    reason?: string,
    reverses?: number,
  ) {
    this.db
      .prepare(
        'INSERT INTO score_events(round_key,team_id,question_id,kind,delta,reason,reverses_id,created_at) VALUES(?,?,?,?,?,?,?,?)',
      )
      .run(
        this.state.roundKey,
        teamId,
        questionId ?? null,
        kind,
        delta,
        reason ?? null,
        reverses ?? null,
        new Date().toISOString(),
      );
  }
  private use(id: number) {
    this.db.prepare('UPDATE questions SET is_used=1 WHERE id=?').run(id);
  }
  private schedule(action: string) {
    if (this.state.settings.automation === 'auto') {
      this.state.autoAction = action;
      this.state.autoAt = Date.now() + this.state.settings.autoDelayMs;
    }
  }
  private setTimer(ms: number) {
    this.state.startedAt = Date.now();
    this.state.endsAt = this.state.startedAt + ms;
    this.state.remainingMs = ms;
    this.state.allottedMs = ms;
    this.state.elapsedMs = 0;
    this.origin = this.clock();
    this.originElapsed = 0;
  }
  elapsed() {
    return this.state.paused
      ? this.state.elapsedMs
      : this.originElapsed + this.clock() - this.origin;
  }
  private saveAnswer(a: Answer) {
    this.db
      .prepare(
        'INSERT INTO answers(id,round_key,question_id,team_id,json) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json',
      )
      .run(a.id, this.state.roundKey, a.questionId, a.teamId, JSON.stringify(a));
  }
  private reset(key: string) {
    const settings = this.state.settings,
      rounds = this.state.rounds,
      version = this.state.version,
      scene = this.state.scene;
    this.state = {
      version,
      roundKey: key,
      phase: 'IDLE',
      scene,
      ready: [],
      set: [],
      index: 0,
      progress: {},
      cards: {},
      cardUses: {},
      category: '',
      answers: [],
      startedAt: 0,
      endsAt: 0,
      remainingMs: 0,
      elapsedMs: 0,
      allottedMs: 0,
      paused: false,
      autoAt: 0,
      autoAction: '',
      spinAt: 0,
      tieIds: [],
      finishMs: {},
      settings,
      rounds,
    };
  }
  private buildSet() {
    const s = this.state,
      q = this.questions();
    if (this.round.stage === 1) {
      s.set = q
        .filter((q) => q.stage === 1 && q.setNo === this.round.seq && q.pool === 'main' && !q.used)
        .sort((a, b) => a.id - b.id)
        .map((q) => q.id);
      this.require(s.set.length === s.settings.blitzCount, 'Blitz set needs ten unused questions');
      const set = s.set.map((id) => this.question(id)!);
      this.require(
        set.filter((q) => q.difficulty === 'easy').length === 3 &&
          set.filter((q) => q.difficulty === 'medium').length === 3 &&
          set.filter((q) => q.difficulty === 'hard').length === 3 &&
          set.filter((q) => q.difficulty === 'joker').length === 1,
        'Blitz distribution must be 3/3/3/1',
      );
      const joker = set.find((q) => q.difficulty === 'joker')!;
      const ordered = set.filter((q) => q !== joker);
      ordered.splice(s.settings.jokerPosition - 1, 0, joker);
      s.set = ordered.map((q) => q.id);
    } else if (this.round.stage === 3) {
      s.set = q
        .filter((q) => q.stage === 3 && q.pool === 'main' && !q.used)
        .slice(0, s.settings.climbCount)
        .map((q) => q.id);
      this.require(s.set.length === s.settings.climbCount, 'Final needs fifteen unused questions');
    }
  }
  private begin() {
    const s = this.state;
    this.require(
      this.round.teamIds.length === (this.round.stage === 3 ? 3 : 4),
      'Incomplete lineup',
    );
    this.buildSet();
    s.phase = 'COUNTDOWN';
    s.autoAt = 0;
    s.autoAction = '';
    this.setTimer(s.settings.countdownMs);
  }
  private startRunning() {
    const s = this.state;
    if (this.round.stage === 1) {
      s.phase = 'RUNNING';
      this.setTimer(s.settings.blitzMs);
      this.use(s.set[0]);
    } else if (this.round.stage === 2) {
      s.phase = 'WHEEL';
      s.endsAt = 0;
      this.schedule('wheel.spin');
    } else this.startQuestion();
  }
  private startQuestion() {
    const s = this.state;
    const q = this.question(s.set[s.index]);
    this.require(q, 'No question available');
    s.phase = 'RUNNING';
    this.use(q.id);
    this.setTimer(s.settings.questionMs);
  }
  private finishBlitz() {
    const s = this.state;
    if (s.settings.blitzUnansweredPenalty)
      for (const id of this.round.teamIds)
        this.score(
          id,
          (s.set.length - (s.progress[id] ?? 0)) * s.settings.blitzUnansweredPenalty,
          'unanswered',
        );
    s.phase = 'REVIEW';
    s.endsAt = 0;
    s.remainingMs = 0;
    this.resolveRanking();
  }
  private closeQuestion() {
    const s = this.state;
    s.phase = s.tieQuestion ? 'TIE_REVIEW' : 'AUDIENCE';
    s.endsAt = 0;
    s.remainingMs = 0;
    const ids = s.tieQuestion ? s.tieIds : this.round.teamIds;
    const qId = s.tieQuestion ?? s.set[s.index];
    for (const teamId of ids)
      if (
        !s.answers.some((a) => a.teamId === teamId && a.questionId === qId && a.verdict !== 'void')
      ) {
        const a: Answer = {
          id: randomUUID(),
          teamId,
          questionId: qId,
          answer: null,
          elapsedUs: Math.round(this.elapsed() * 1000),
          wallMs: Date.now(),
          rttMs: null,
          verdict: 'wrong',
          scored: false,
        };
        s.answers.push(a);
        this.saveAnswer(a);
      }
    if (!s.answers.some((a) => a.questionId === qId && a.verdict === 'pending'))
      this.schedule('question.reveal');
  }
  private resolveRanking(explicit?: number) {
    const s = this.state;
    const scores = this.scores();
    const sorted = [...this.round.teamIds].sort((a, b) => scores[b] - scores[a]);
    const tied = sorted.filter((id) => scores[id] === scores[sorted[0]]);
    if (!explicit && tied.length > 1) {
      s.tieIds = tied;
      s.phase = 'REVIEW';
      s.winner = undefined;
      return;
    }
    const winner = explicit ?? sorted[0];
    this.require(winner, 'No winner');
    s.winner = winner;
    s.phase = 'RESULTS';
    this.round.winner = winner;
    this.round.completed = true;
    s.tieQuestion = undefined;
    s.tieIds = [];
    for (const id of this.round.teamIds)
      this.db
        .prepare('UPDATE teams SET status=? WHERE id=?')
        .run(
          id === winner
            ? this.round.stage === 3
              ? 'champion'
              : this.round.stage === 2
                ? 'finalist'
                : 'qualified'
            : 'eliminated',
          id,
        );
    if (this.round.stage === 1) {
      for (let i = 0; i < s.settings.stage2Mapping.length; i++) {
        const r = s.rounds.find((r) => r.key === `2-${i + 1}`)!;
        r.teamIds = s.settings.stage2Mapping[i]
          .map((seq) => s.rounds.find((r) => r.key === `1-${seq}`)?.winner)
          .filter((id): id is number => !!id);
      }
    }
    if (this.round.stage === 2)
      s.rounds.find((r) => r.key === '3-1')!.teamIds = s.rounds
        .filter((r) => r.stage === 2)
        .map((r) => r.winner)
        .filter((id): id is number => !!id);
  }
  dispatch(
    type: string,
    input: unknown,
    actor: Actor,
    cmdId?: string,
  ): { duplicate?: boolean; teamId?: number; accepted?: boolean } {
    this.require(
      actor.role === 'system' ||
        actor.role === 'admin' ||
        (actor.role === 'team' && teamCommands.has(type)),
      'Unauthorized command',
    );
    this.require(
      !!schema[type] ||
        emptyCommands.has(type) ||
        ['team.checkout', 'team.ready', 'system.tick'].includes(type),
      'Unknown command',
    );
    const p = (schema[type] ?? z.object({}).strict()).parse(input ?? {}) as any;
    const actorKey = `${actor.role}:${actor.deviceId}`;
    if (cmdId) {
      const prior = this.db
        .prepare('SELECT result_json FROM commands WHERE actor=? AND cmd_id=?')
        .get(actorKey, cmdId) as { result_json: string } | undefined;
      if (prior) return { ...JSON.parse(prior.result_json), duplicate: true };
    }
    this.bank = null;
    const before = structuredClone(this.state);
    const originBefore = this.origin,
      elapsedBefore = this.originElapsed;
    try {
      return this.db.transaction(() => {
        if (type === this.state.autoAction) {
          this.state.autoAt = 0;
          this.state.autoAction = '';
        }
        const result = this.apply(type, p, actor);
        this.bank = null;
        this.state.version++;
        this.persist();
        if (type !== 'system.tick')
          this.db
            .prepare('INSERT INTO event_log(at_wall_ms,actor,type,payload_json) VALUES(?,?,?,?)')
            .run(Date.now(), actorKey, type, JSON.stringify(p));
        if (cmdId)
          this.db
            .prepare('INSERT INTO commands VALUES(?,?,?)')
            .run(actorKey, cmdId, JSON.stringify(result));
        return result;
      })();
    } catch (e) {
      this.bank = null;
      this.state = before;
      this.origin = originBefore;
      this.originElapsed = elapsedBefore;
      throw e;
    }
  }
  private apply(type: string, p: any, actor: Actor): { teamId?: number; accepted?: boolean } {
    const s = this.state;
    switch (type) {
      case 'team.checkin': {
        const t = this.teams().find((t) => t.code === p.code);
        this.require(t, 'Unknown team code');
        const bound = this.db.prepare('SELECT id FROM devices WHERE team_id=?').get(t.id) as
          { id: string } | undefined;
        this.require(
          !bound || bound.id === actor.deviceId,
          'Team already checked in; ask admin to release it',
        );
        const rows = this.db
          .prepare('SELECT seat_no FROM devices WHERE team_id IS NOT NULL AND id<>?')
          .all(actor.deviceId) as { seat_no: number }[];
        const seat = [1, 2, 3, 4].find((n) => !rows.some((r) => r.seat_no === n));
        this.require(seat || bound, 'All four seats are occupied');
        this.db
          .prepare('UPDATE devices SET team_id=?,seat_no=? WHERE id=?')
          .run(t.id, seat ?? 1, actor.deviceId);
        return { teamId: t.id };
      }
      case 'team.checkout': {
        s.ready = s.ready.filter((id) => id !== actor.teamId);
        this.db
          .prepare('UPDATE devices SET team_id=NULL,seat_no=NULL WHERE id=?')
          .run(actor.deviceId);
        s.autoAt = 0;
        s.autoAction = '';
        break;
      }
      case 'team.ready': {
        this.phase('HANDSHAKE', 'TIE_READY');
        this.require(
          actor.teamId &&
            (s.phase === 'TIE_READY' ? s.tieIds : this.round.teamIds).includes(actor.teamId),
          'Not in lineup',
        );
        if (!s.ready.includes(actor.teamId)) s.ready.push(actor.teamId);
        const ids = s.phase === 'TIE_READY' ? s.tieIds : this.round.teamIds;
        if (ids.every((id) => s.ready.includes(id)))
          this.schedule(s.phase === 'TIE_READY' ? 'tiebreak.launch' : 'round.start');
        break;
      }
      case 'round.select': {
        this.phase('IDLE', 'RESULTS');
        const r = s.rounds.find((r) => r.key === p.key);
        this.require(r && !r.completed, 'Unknown or completed round');
        this.reset(r.key);
        break;
      }
      case 'round.assignTeams':
      case 'bracket.override': {
        this.phase('IDLE', 'RULES', 'HANDSHAKE');
        const r = type === 'bracket.override' ? s.rounds.find((r) => r.key === p.key) : this.round;
        this.require(r && !r.completed, 'Round cannot be changed');
        this.require(
          p.teamIds.length === (r.stage === 3 ? 3 : 4) &&
            new Set(p.teamIds).size === p.teamIds.length &&
            p.teamIds.every((id: number) => this.teams().some((t) => t.id === id)),
          'Invalid lineup',
        );
        r.teamIds = p.teamIds;
        if (r === this.round) {
          s.ready = [];
          s.autoAt = 0;
          s.autoAction = '';
        }
        break;
      }
      case 'bracket.bulk': {
        this.phase('IDLE', 'RULES', 'HANDSHAKE');
        const all = this.teams();
        const seen = new Set<number>();
        for (const a of p.assignments) {
          const r = s.rounds.find((r) => r.key === a.key);
          this.require(r && !r.completed, 'Round cannot be changed');
          this.require(
            a.teamIds.length === (r.stage === 3 ? 3 : 4) &&
              new Set(a.teamIds).size === a.teamIds.length &&
              a.teamIds.every((id: number) => all.some((t) => t.id === id)),
            'Invalid lineup',
          );
          for (const id of a.teamIds) {
            this.require(!seen.has(id), 'A team appears twice in the draw');
            seen.add(id);
          }
        }
        for (const a of p.assignments) {
          const r = s.rounds.find((r) => r.key === a.key)!;
          r.teamIds = a.teamIds;
          if (r === this.round) {
            s.ready = [];
            s.autoAt = 0;
            s.autoAction = '';
          }
        }
        break;
      }
      case 'round.showRules':
        this.phase('IDLE');
        s.phase = 'RULES';
        break;
      case 'lineup.announce':
      case 'round.openHandshake':
        this.phase('RULES', 'IDLE');
        s.phase = 'HANDSHAKE';
        s.ready = [];
        break;
      case 'round.start':
        this.phase('HANDSHAKE');
        this.require(
          this.round.teamIds.every((id) => s.ready.includes(id)),
          'Teams are not ready',
        );
        this.begin();
        break;
      case 'round.forceStart':
        this.phase('HANDSHAKE');
        this.begin();
        break;
      case 'round.pause': {
        this.require(
          ['RUNNING', 'COUNTDOWN', 'TIE_RUNNING'].includes(s.phase) && !s.paused,
          'Cannot pause',
        );
        s.remainingMs = Math.max(0, s.endsAt - Date.now());
        s.elapsedMs = this.elapsed();
        s.paused = true;
        s.autoAt = 0;
        s.autoAction = '';
        break;
      }
      case 'round.resume': {
        this.require(s.paused, 'Not paused');
        s.paused = false;
        this.origin = this.clock();
        this.originElapsed = s.elapsedMs;
        s.endsAt = Date.now() + s.remainingMs;
        break;
      }
      case 'automation.set':
        s.settings.automation = p.mode;
        s.autoAt = 0;
        s.autoAction = '';
        break;
      case 'auto.cancel':
        s.autoAt = 0;
        s.autoAction = '';
        break;
      case 'system.tick': {
        if (s.paused) break;
        if (['RUNNING', 'COUNTDOWN', 'TIE_RUNNING'].includes(s.phase)) {
          s.remainingMs = Math.max(0, s.endsAt - Date.now());
          s.elapsedMs = this.elapsed();
          if (Date.now() >= s.endsAt + (s.phase === 'COUNTDOWN' ? 0 : s.settings.graceMs)) {
            if (s.phase === 'COUNTDOWN') this.startRunning();
            else if (this.round.stage === 1 && !s.tieQuestion) this.finishBlitz();
            else this.closeQuestion();
          }
        }
        if (s.autoAt && Date.now() >= s.autoAt) {
          const action = s.autoAction;
          s.autoAt = 0;
          s.autoAction = '';
          this.apply(action, {}, actor);
        }
        break;
      }
      case 'card.select': {
        this.phase('CARD_PICK');
        this.require(actor.teamId && this.round.teamIds.includes(actor.teamId), 'Not in lineup');
        this.require(s.settings.cards.includes(p.value), 'Invalid card');
        this.require(!s.cards[actor.teamId], 'Card already chosen');
        const uses = s.cardUses[actor.teamId]?.[p.value] ?? 0;
        this.require(
          !s.settings.cardReuseLimit || uses < s.settings.cardReuseLimit,
          'Card reuse limit reached',
        );
        s.cards[actor.teamId] = p.value;
        if (this.round.teamIds.every((id) => s.cards[id])) this.schedule('question.start');
        break;
      }
      case 'wheel.spin': {
        this.phase('WHEEL');
        const qs = this.questions().filter((q) => q.stage === 2 && q.pool === 'main' && !q.used);
        const cats = [...new Set(qs.map((q) => q.category))];
        this.require(cats.length, 'Stage 2 bank exhausted');
        s.category = cats[randomInt(cats.length)];
        s.phase = 'CARD_PICK';
        s.cards = {};
        s.spinAt = Date.now();
        break;
      }
      case 'cards.forceFill': {
        this.phase('CARD_PICK');
        const lowest = Math.min(...s.settings.cards);
        for (const id of this.round.teamIds) s.cards[id] ??= lowest;
        this.schedule('question.start');
        break;
      }
      case 'question.start': {
        this.phase('CARD_PICK');
        this.require(
          this.round.teamIds.every((id) => s.cards[id]),
          'Every team must pick a card',
        );
        const qs = this.questions().filter(
          (q) => q.stage === 2 && q.pool === 'main' && !q.used && q.category === s.category,
        );
        this.require(qs.length, 'Category exhausted');
        s.set[s.index] = qs[randomInt(qs.length)].id;
        for (const id of this.round.teamIds) {
          s.cardUses[id] ??= {};
          s.cardUses[id][s.cards[id]] = (s.cardUses[id][s.cards[id]] ?? 0) + 1;
        }
        this.startQuestion();
        break;
      }
      case 'question.reroll': {
        this.phase('CARD_PICK');
        const qs = this.questions().filter((q) => q.stage === 2 && q.pool === 'main' && !q.used);
        this.require(qs.length, 'Bank exhausted');
        s.category = qs[randomInt(qs.length)].category;
        s.cards = {};
        s.spinAt = Date.now();
        s.autoAt = 0;
        s.autoAction = '';
        break;
      }
      case 'answer.submit': {
        this.phase('RUNNING', 'TIE_RUNNING');
        this.require(
          Date.now() < s.endsAt + s.settings.graceMs &&
            this.elapsed() < s.allottedMs + s.settings.graceMs,
          'Answer deadline passed',
        );
        const id = actor.teamId;
        this.require(
          id && (s.tieQuestion ? s.tieIds : this.round.teamIds).includes(id),
          'Not in lineup',
        );
        const qId =
          s.tieQuestion ?? (this.round.stage === 1 ? s.set[s.progress[id] ?? 0] : s.set[s.index]);
        this.require(qId === p.roundQuestionId, 'Stale question');
        this.require(
          !s.answers.some((a) => a.teamId === id && a.questionId === qId && a.verdict !== 'void'),
          'Answer already submitted',
        );
        const q = this.question(qId)!;
        this.require(
          q.type === 'mcq'
            ? typeof p.answer === 'number' && p.answer < q.options.length
            : typeof p.answer === 'string' && p.answer.trim().length,
          'Invalid answer',
        );
        const a: Answer = {
          id: randomUUID(),
          teamId: id,
          questionId: qId,
          answer: p.answer,
          elapsedUs: Math.round(this.elapsed() * 1000),
          wallMs: Date.now(),
          rttMs: actor.rttMs ?? null,
          verdict: q.type === 'mcq' ? (p.answer === q.correct ? 'correct' : 'wrong') : 'pending',
          scored: false,
        };
        s.answers.push(a);
        this.saveAnswer(a);
        if (this.round.stage === 1 && !s.tieQuestion) {
          this.score(
            id,
            blitzScore(q.difficulty, a.verdict === 'correct', s.settings),
            'question',
            qId,
          );
          a.scored = true;
          this.saveAnswer(a);
          s.progress[id] = (s.progress[id] ?? 0) + 1;
          if (s.progress[id] === s.set.length) {
            s.finishMs[id] = a.elapsedUs / 1000;
            this.score(id, speedBonus(s.finishMs[id], true, s.settings), 'speed_bonus');
          } else this.use(s.set[s.progress[id]]);
          if (this.round.teamIds.every((id) => s.progress[id] === s.set.length)) this.finishBlitz();
        } else if (
          (s.tieQuestion ? s.tieIds : this.round.teamIds).every((id) =>
            s.answers.some((a) => a.teamId === id && a.questionId === qId && a.verdict !== 'void'),
          )
        )
          this.closeQuestion();
        return { accepted: true };
      }
      case 'grade.set': {
        this.phase('RUNNING', 'AUDIENCE', 'TIE_RUNNING', 'TIE_REVIEW');
        const a = s.answers.find((a) => a.id === p.answerId);
        this.require(a && a.verdict === 'pending' && !a.scored, 'Answer is not pending');
        a.verdict = p.verdict;
        this.saveAnswer(a);
        if (
          ['AUDIENCE', 'TIE_REVIEW'].includes(s.phase) &&
          !s.answers.some(
            (other) => other.questionId === a.questionId && other.verdict === 'pending',
          )
        )
          this.schedule('question.reveal');
        break;
      }
      case 'question.reveal': {
        this.phase('AUDIENCE', 'TIE_REVIEW');
        const qId = s.tieQuestion ?? s.set[s.index];
        const answers = s.answers.filter((a) => a.questionId === qId && a.verdict !== 'void');
        this.require(
          !answers.some((a) => a.verdict === 'pending'),
          'Grade all text answers before revealing',
        );
        if (s.tieQuestion) {
          const winner = fastestCorrect(answers);
          s.tieQuestion = undefined;
          if (winner) this.resolveRanking(winner);
          else {
            s.phase = 'TIE_READY';
            s.ready = [];
          }
          break;
        }
        const beforeScores = this.scores();
        for (const a of answers) {
          if (a.scored) continue;
          const correct = a.verdict === 'correct';
          let delta = 0;
          if (a.answer !== null || s.settings.unansweredWrong) {
            delta =
              this.round.stage === 2
                ? gamblerScore(s.cards[a.teamId], correct)
                : climbPosition(beforeScores[a.teamId], correct, s.settings) -
                  beforeScores[a.teamId];
          }
          this.score(a.teamId, delta, this.round.stage === 2 ? 'card' : 'ladder_step', qId);
          a.scored = true;
          this.saveAnswer(a);
        }
        s.phase = 'REVEAL';
        if (this.round.stage === 3) {
          const scores = this.scores();
          const finalists = answers.filter((a) => scores[a.teamId] >= s.settings.ladderTop);
          if (finalists.length) {
            const winner = fastestCorrect(finalists);
            if (winner) this.resolveRanking(winner);
            else {
              s.tieIds = finalists.map((a) => a.teamId);
              s.phase = 'REVIEW';
            }
            break;
          }
        }
        if (s.index + 1 >= (this.round.stage === 2 ? s.settings.gamblerCount : s.set.length))
          this.resolveRanking();
        else this.schedule('question.next');
        break;
      }
      case 'question.next': {
        this.phase('REVEAL');
        s.index++;
        if (this.round.stage === 2) {
          s.phase = 'WHEEL';
          this.schedule('wheel.spin');
        } else this.startQuestion();
        break;
      }
      case 'tiebreak.open': {
        this.phase('REVIEW');
        this.require(s.tieIds.length > 1, 'No tied leaders');
        s.phase = 'TIE_READY';
        s.ready = [];
        break;
      }
      case 'tiebreak.launch': {
        this.phase('TIE_READY');
        this.require(
          s.tieIds.every((id) => s.ready.includes(id)),
          'Tied teams are not ready',
        );
        const qs = this.questions().filter((q) => q.pool !== 'main' && !q.used);
        const q = p.questionId ? qs.find((q) => q.id === p.questionId) : qs[0];
        this.require(q, 'No unused tie-breaker question');
        s.tieQuestion = q.id;
        this.use(q.id);
        s.phase = 'TIE_RUNNING';
        this.setTimer(s.settings.questionMs);
        break;
      }
      case 'round.next': {
        this.phase('RESULTS');
        const idx = s.rounds.indexOf(this.round);
        const next = s.rounds[idx + 1];
        this.require(next, 'Tournament finished');
        this.db.prepare('UPDATE devices SET team_id=NULL,seat_no=NULL').run();
        this.reset(next.key);
        break;
      }
      case 'score.adjust': {
        this.require(this.round.teamIds.includes(p.teamId), 'Not in lineup');
        this.require(
          this.round.stage !== 3,
          'Ladder adjustments are disabled to preserve ladder bounds',
        );
        this.require(!this.round.completed, 'Completed result is locked');
        this.score(p.teamId, p.delta, 'manual', undefined, p.reason);
        break;
      }
      case 'undo.last': {
        this.require(!this.round.completed, 'Completed result is locked');
        const row = this.db
          .prepare(
            "SELECT * FROM score_events e WHERE round_key=? AND kind='manual' AND NOT EXISTS(SELECT 1 FROM score_events r WHERE r.reverses_id=e.id) ORDER BY id DESC LIMIT 1",
          )
          .get(s.roundKey) as any;
        this.require(row, 'No reversible manual adjustment');
        this.score(
          row.team_id,
          -row.delta,
          'reversal',
          undefined,
          'Undo manual adjustment',
          row.id,
        );
        break;
      }
      case 'question.cancelLeak': {
        this.require(!this.round.completed, 'Completed result is locked');
        this.require(
          ['RUNNING', 'AUDIENCE', 'REVEAL'].includes(s.phase),
          'Cannot replace in this phase',
        );
        this.require(!s.tieQuestion, 'Use a new tie-breaker instead');
        const index =
          this.round.stage === 1
            ? p.questionId
              ? s.set.indexOf(p.questionId)
              : Math.min(...this.round.teamIds.map((id) => s.progress[id] ?? 0))
            : s.index;
        this.require(index >= 0 && index < s.set.length, 'Select the leaked question');
        const old = s.set[index];
        const reserve = this.questions().filter(
          (q) => q.pool === 'reserve' && !q.used && (this.round.stage !== 1 || q.type === 'mcq'),
        );
        const replacement = p.replacementId
          ? reserve.find((q) => q.id === p.replacementId)
          : reserve.find((q) => q.difficulty === 'hard' || q.difficulty === 'joker');
        this.require(replacement, 'No suitable unused harder reserve question');
        const cancelled = this.round.stage === 1 ? s.set.slice(index) : [old];
        const rows = this.db
          .prepare(
            "SELECT * FROM score_events e WHERE round_key=? AND kind<>'reversal' AND NOT EXISTS(SELECT 1 FROM score_events r WHERE r.reverses_id=e.id)",
          )
          .all(s.roundKey) as any[];
        for (const row of rows)
          if (
            cancelled.includes(row.question_id) ||
            (this.round.stage === 1 && row.kind === 'speed_bonus')
          )
            this.score(
              row.team_id,
              -row.delta,
              'reversal',
              row.question_id,
              'Audience leak',
              row.id,
            );
        for (const a of s.answers)
          if (cancelled.includes(a.questionId) && a.verdict !== 'void') {
            a.verdict = 'void';
            this.saveAnswer(a);
          }
        this.use(old);
        s.set[index] = replacement.id;
        if (this.round.stage === 1) {
          for (const id of this.round.teamIds) {
            s.progress[id] = Math.min(s.progress[id] ?? 0, index);
            delete s.finishMs[id];
          }
          s.phase = 'RUNNING';
          this.use(replacement.id);
        } else {
          this.startQuestion();
        }
        s.paused = false;
        s.autoAt = 0;
        s.autoAction = '';
        break;
      }
      case 'checkin.kick':
        s.ready = s.ready.filter((id) => id !== p.teamId);
        this.db
          .prepare('UPDATE devices SET team_id=NULL,seat_no=NULL WHERE team_id=?')
          .run(p.teamId);
        s.autoAt = 0;
        s.autoAction = '';
        break;
      case 'devices.reset':
        this.require(
          ['IDLE', 'RULES', 'HANDSHAKE', 'RESULTS'].includes(s.phase),
          'Cannot reset live devices',
        );
        this.db.prepare('UPDATE devices SET team_id=NULL,seat_no=NULL').run();
        s.ready = [];
        s.autoAt = 0;
        s.autoAction = '';
        break;
      case 'display.scene':
        s.scene = p.scene;
        break;
      case 'settings.update': {
        this.phase('IDLE', 'RESULTS');
        const merged = { ...s.settings, ...p.settings };
        const positive = [
          'blitzMs',
          'questionMs',
          'countdownMs',
          'autoDelayMs',
          'ladderTop',
          'climbUp',
          'climbDown',
        ];
        for (const k of Object.keys(p.settings)) this.require(k in DEFAULTS, 'Unknown setting');
        for (const k of positive)
          this.require(
            Number.isInteger((merged as any)[k]) &&
              (merged as any)[k] > 0 &&
              (merged as any)[k] <= 3_600_000,
            'Invalid duration or ladder setting',
          );
        for (const k of [
          'easyPoints',
          'mediumPoints',
          'hardPoints',
          'jokerCorrect',
          'jokerWrong',
          'gamblerInitial',
          'blitzUnansweredPenalty',
        ])
          this.require(
            Number.isInteger((merged as any)[k]) && Math.abs((merged as any)[k]) <= 1000,
            'Invalid points',
          );
        this.require(
          ['auto', 'assisted', 'manual'].includes(merged.automation) &&
            Number.isInteger(merged.graceMs) &&
            merged.graceMs >= 0 &&
            merged.graceMs <= 1000,
          'Invalid mode/grace',
        );
        this.require(
          merged.blitzCount === 10 &&
            merged.gamblerCount === 8 &&
            merged.climbCount === 15 &&
            merged.teamCount === 48 &&
            merged.stage1Rounds === 12 &&
            merged.stage2Rounds === 3 &&
            merged.reserveCount === 21,
          'Tournament sizes are fixed',
        );
        this.require(
          Number.isInteger(merged.jokerPosition) &&
            merged.jokerPosition >= 1 &&
            merged.jokerPosition <= 10,
          'Invalid joker position',
        );
        this.require(
          Array.isArray(merged.cards) &&
            merged.cards.length === 3 &&
            merged.cards.every((n: number) => [5, 10, 15].includes(n)) &&
            new Set(merged.cards).size === 3,
          'Cards must be 5/10/15',
        );
        this.require(
          Number.isInteger(merged.cardReuseLimit) &&
            merged.cardReuseLimit >= 0 &&
            merged.cardReuseLimit <= 100,
          'Invalid reuse limit',
        );
        this.require(
          typeof merged.sound === 'boolean' &&
            typeof merged.unansweredWrong === 'boolean' &&
            typeof merged.liveScores === 'boolean',
          'Invalid boolean',
        );
        this.require(
          JSON.stringify(merged.speedTiers.map((x: any) => x.untilMs)) ===
            JSON.stringify([90000, 100000, 110000]) &&
            merged.speedTiers.every(
              (x: any) => Number.isInteger(x.points) && x.points >= 0 && x.points <= 1000,
            ),
          'Invalid speed tiers',
        );
        this.require(
          merged.stage2Mapping.length === 3 &&
            merged.stage2Mapping.every((group: number[]) => group.length === 4) &&
            new Set(merged.stage2Mapping.flat()).size === 12 &&
            merged.stage2Mapping
              .flat()
              .every((n: number) => Number.isInteger(n) && n >= 1 && n <= 12),
          'Invalid grouping',
        );
        s.settings = merged;
        break;
      }
      case 'questions.save': {
        for (const q of p.questions) {
          const prior = q.id ? this.question(q.id) : undefined;
          this.require(!prior?.used, 'Used questions are immutable');
          this.require(
            !q.id || !s.set.includes(q.id) || ['IDLE', 'RESULTS'].includes(s.phase),
            'Question belongs to the active set',
          );
          if (q.id) {
            this.require(prior, 'Unknown question');
            this.db.prepare('UPDATE questions SET json=? WHERE id=?').run(JSON.stringify(q), q.id);
          } else {
            const id = (
              this.db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM questions').get() as {
                id: number;
              }
            ).id;
            this.db
              .prepare('INSERT INTO questions(id,json) VALUES(?,?)')
              .run(id, JSON.stringify({ ...q, id }));
          }
        }
        break;
      }
      case 'questions.delete': {
        const q = this.question(p.id);
        this.require(q && !q.used, 'Cannot delete used question');
        this.require(
          !s.set.includes(p.id) || ['IDLE', 'RESULTS'].includes(s.phase),
          'Question belongs to the active set',
        );
        this.db.prepare('UPDATE questions SET is_deleted=1 WHERE id=?').run(p.id);
        break;
      }
      case 'questions.resetUsed':
        this.require(
          s.rounds.every((r) => !r.completed) && s.phase === 'IDLE',
          'Usage reset allowed only before tournament starts',
        );
        this.db.prepare('UPDATE questions SET is_used=0').run();
        break;
      case 'set.build': {
        this.phase('IDLE');
        this.require(new Set(p.questionIds).size === 10, 'Duplicate questions');
        const qs = p.questionIds.map((id: number) => this.question(id));
        this.require(
          qs.every((q: Question | undefined) => q && q.stage === 1 && q.pool === 'main' && !q.used),
          'Invalid set',
        );
        for (const [d, n] of [
          ['easy', 3],
          ['medium', 3],
          ['hard', 3],
          ['joker', 1],
        ] as const)
          this.require(
            qs.filter((q: Question) => q.difficulty === d).length === n,
            'Set distribution must be 3/3/3/1',
          );
        for (const q of this.questions().filter(
          (q) => q.setNo === p.seq && q.stage === 1 && !q.used,
        )) {
          q.setNo = null;
          this.db.prepare('UPDATE questions SET json=? WHERE id=?').run(JSON.stringify(q), q.id);
        }
        for (const q of qs) {
          q.setNo = p.seq;
          this.db.prepare('UPDATE questions SET json=? WHERE id=?').run(JSON.stringify(q), q.id);
        }
        break;
      }
      case 'teams.save': {
        this.phase('IDLE', 'RESULTS');
        for (const t of p.teams) {
          if (t.id) {
            this.require(
              this.teams().some((x) => x.id === t.id),
              'Unknown team',
            );
            this.db
              .prepare('UPDATE teams SET code=?,name=?,color=? WHERE id=?')
              .run(t.code, t.name, t.color, t.id);
            if (t.logo !== undefined) this.saveLogo(t.id, t.logo);
          } else {
            const info = this.db
              .prepare('INSERT INTO teams(code,name,color) VALUES(?,?,?)')
              .run(t.code, t.name, t.color);
            if (t.logo) this.saveLogo(Number(info.lastInsertRowid), t.logo);
          }
        }
        break;
      }
      case 'teams.delete':
        this.phase('IDLE');
        this.require(
          !s.rounds.some((r) => r.teamIds.includes(p.id)),
          'Remove team from all lineups before deleting',
        );
        this.db.prepare('DELETE FROM teams WHERE id=?').run(p.id);
        break;
    }
    return {};
  }
  snapshot(actor: Actor) {
    const s = this.state;
    const id = actor.teamId;
    const admin = actor.role === 'admin';
    const teams = this.teams();
    const safeTeam = (t: Team) =>
      admin ? t : { id: t.id, name: t.name, color: t.color, status: t.status };
    const qId =
      s.tieQuestion ?? (this.round.stage === 1 ? s.set[s.progress[id ?? 0] ?? 0] : s.set[s.index]);
    const q = this.question(qId);
    const active =
      actor.role !== 'team' ||
      (!!id && (s.tieQuestion ? s.tieIds : this.round.teamIds).includes(id));
    const questionVisible =
      admin ||
      (actor.role === 'team' &&
        active &&
        ['RUNNING', 'TIE_RUNNING'].includes(s.phase) &&
        !s.paused) ||
      (actor.role === 'display' &&
        this.round.stage !== 1 &&
        ['AUDIENCE', 'REVEAL'].includes(s.phase));
    const reveal = admin || ['REVEAL', 'RESULTS'].includes(s.phase);
    const publicQuestion =
      q && questionVisible
        ? {
            id: q.id,
            body: q.body,
            type: q.type,
            options: q.options,
            category: q.category,
            difficulty: q.difficulty,
            ...(reveal ? { correct: q.correct, explanation: q.explanation } : {}),
          }
        : null;
    const scores = this.scores();
    const scoreVisible =
      admin || actor.role === 'display' || s.phase === 'RESULTS' || s.phase === 'REVEAL';
    const devices = this.db
      .prepare(
        "SELECT id,role,team_id,seat_no,last_seen_at,rtt_ms FROM devices WHERE role='team' AND team_id IS NOT NULL",
      )
      .all() as any[];
    const bonusRows = this.db
      .prepare(
        "SELECT e.team_id,SUM(e.delta) AS bonus FROM score_events e WHERE e.round_key=? AND (e.kind='speed_bonus' OR (e.kind='reversal' AND e.reverses_id IN (SELECT id FROM score_events WHERE kind='speed_bonus'))) GROUP BY e.team_id",
      )
      .all(s.roundKey) as { team_id: number; bonus: number }[];
    const bonusOf = (teamId: number) => bonusRows.find((r) => r.team_id === teamId)?.bonus ?? 0;
    const currentQuestionOf = (teamId: number) =>
      s.tieQuestion ?? (this.round.stage === 1 ? s.set[s.progress[teamId] ?? 0] : s.set[s.index]);
    const stage2Categories = [
      ...new Set(
        this.questions()
          .filter((x) => x.stage === 2 && x.pool === 'main')
          .map((x) => x.category),
      ),
    ];
    return {
      version: s.version,
      serverNow: Date.now(),
      spinAt: s.spinAt,
      categories: stage2Categories,
      roundKey: s.roundKey,
      stage: this.round.stage,
      seq: this.round.seq,
      phase: s.phase,
      scene: s.scene,
      paused: s.paused,
      endsAt: s.endsAt,
      remainingMs: s.remainingMs,
      autoAt: admin ? s.autoAt : 0,
      autoAction: admin ? s.autoAction : '',
      category: s.category,
      index: s.index,
      settings: s.settings,
      winner: s.winner,
      tieIds: s.tieIds,
      ready: s.ready,
      team:
        actor.role === 'team' && id
          ? {
              ...safeTeam(teams.find((t) => t.id === id)!),
              code: teams.find((t) => t.id === id)?.code,
            }
          : null,
      active,
      lineup:
        actor.role === 'team'
          ? []
          : this.round.teamIds.map((id) => ({
              ...safeTeam(teams.find((t) => t.id === id)!),
              ready: s.ready.includes(id),
              progress: s.progress[id] ?? 0,
              score: scoreVisible ? scores[id] : null,
              card: s.cards[id] ?? null,
              finishMs: s.finishMs[id] ?? null,
              checkedIn: devices.some((d) => d.team_id === id && d.role === 'team'),
              online: devices.some(
                (d) => d.team_id === id && d.role === 'team' && d.last_seen_at > Date.now() - 6000,
              ),
              answered: s.answers.some(
                (a) =>
                  a.teamId === id && a.questionId === currentQuestionOf(id) && a.verdict !== 'void',
              ),
              bonus: scoreVisible ? bonusOf(id) : 0,
              verdict:
                reveal && s.phase !== 'RESULTS' && this.round.stage !== 1
                  ? (s.answers.find(
                      (a) => a.teamId === id && a.questionId === qId && a.verdict !== 'void',
                    )?.verdict ?? null)
                  : null,
              device: admin ? devices.find((d) => d.team_id === id) : undefined,
            })),
      ownScore: actor.role === 'team' && s.phase === 'RESULTS' && id ? scores[id] : null,
      ownProgress: id ? (s.progress[id] ?? 0) : 0,
      ownFinishMs: id ? (s.finishMs[id] ?? null) : null,
      ownBonus: id && actor.role === 'team' && s.finishMs[id] !== undefined ? bonusOf(id) : 0,
      ownCard: id ? (s.cards[id] ?? null) : null,
      submitted:
        !!id &&
        s.answers.some((a) => a.teamId === id && a.questionId === qId && a.verdict !== 'void'),
      question: publicQuestion,
      rounds:
        actor.role === 'team'
          ? []
          : s.rounds.map((r) => ({
              ...r,
              teams: r.teamIds.map((id) => safeTeam(teams.find((t) => t.id === id)!)),
            })),
      ...(admin
        ? {
            teams,
            set: s.set,
            devices: this.db
              .prepare(
                'SELECT id,role,team_id,seat_no,last_seen_at,rtt_ms FROM devices ORDER BY role,id',
              )
              .all(),
            questions: this.questions(),
            answers: s.answers.filter((a) => a.verdict !== 'void'),
            audit: this.db.prepare('SELECT * FROM event_log ORDER BY id DESC LIMIT 100').all(),
          }
        : {}),
    };
  }
}
