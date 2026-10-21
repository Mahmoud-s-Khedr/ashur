import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Server, Client, until } from './test-harness';
import {
  blitzScore,
  speedBonus,
  gamblerScore,
  climbPosition,
} from '../packages/shared/src/scoring';

export async function seat(admin: Client, teams: Client[]) {
  const ids = admin.s.lineup.map((t: any) => t.id);
  for (let i = 0; i < teams.length; i++) {
    if (teams[i].s.team) await teams[i].cmd('team.checkout');
    if (i < ids.length) {
      await teams[i].cmd('team.checkin', {
        code: admin.s.teams.find((t: any) => t.id === ids[i]).code,
      });
    }
  }
  // The real device's welcome animation must finish before automatic readiness starts.
  for (const team of teams.slice(0, ids.length))
    if (team.page) {
      await team.page.evaluate(
        () =>
          new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))),
      );
      await team.page.locator('.ready-orb').waitFor({ state: 'visible' });
    }
  for (const team of teams.slice(0, ids.length)) await team.cmd('team.ready');
}
export async function begin(admin: Client, teams: Client[], auto = false) {
  await admin.cmd('round.showRules');
  await admin.cmd('lineup.announce');
  await seat(admin, teams);
  if (!auto) await admin.cmd('round.start');
  await until(() => ['RUNNING', 'WHEEL', 'CARD_PICK'].includes(admin.s.phase), 'round start');
}
export type TourHook = (event: string, admin: Client, teams: Client[]) => Promise<void>;
export async function answer(admin: Client, team: Client, right: boolean) {
  await until(() => !!team.s.question && !team.s.submitted, 'team question');
  const q = team.s.question;
  assert(!('correct' in q) && !('explanation' in q), 'Team received model answer');
  const model = admin.s.questions.find((item: any) => item.id === q.id);
  assert(model, 'Authenticated admin must have the model answer');
  await team.cmd('answer.submit', {
    roundQuestionId: q.id,
    answer:
      q.type === 'mcq'
        ? right
          ? model.correct
          : (model.correct + 1) % q.options.length
        : right
          ? model.correct[0]
          : '__audit_wrong__',
  });
}

export async function tournament(s: Server, auto: boolean, hook?: TourHook) {
  const admin = await s.client('admin'),
    display = await s.client('display');
  const teams = await Promise.all(Array.from({ length: 4 }, () => s.client('team')));
  // Demo stays deterministic. The bundled real bank is never rewritten.
  const originalQuestions = (await admin.export()).questions;
  const winners: number[] = [];
  await hook?.('setup', admin, teams);
  for (let round = 0; round < 16; round++) {
    const stage = admin.s.stage;
    const detailed = !!hook && [0, 12, 15].includes(round);
    const emit = async (name: string) => {
      if (detailed) await hook!(name, admin, teams);
    };
    await admin.cmd('settings.update', {
      settings: {
        automation: auto ? 'auto' : 'manual',
        countdownMs: detailed ? 1800 : 5,
        autoDelayMs: detailed ? 1800 : 5,
      },
    });
    await admin.cmd('round.showRules');
    await emit('rules');
    await admin.cmd('lineup.announce');
    await emit('lobby');
    await seat(admin, teams);
    await emit('ready');
    if (!auto) await admin.cmd('round.start');
    if (detailed) {
      await until(() => admin.s.phase === 'COUNTDOWN', 'visual countdown');
      await emit('countdown');
    }
    await until(() => ['RUNNING', 'WHEEL', 'CARD_PICK'].includes(admin.s.phase), 'round start');
    const ids = admin.s.lineup.map((t: any) => t.id);
    const count = stage === 1 ? 10 : stage === 2 ? 8 : auto ? 15 : 10;
    const expected = ids.map(() => (stage === 2 ? admin.s.settings.gamblerInitial : 0));
    for (let index = 0; index < count; index++) {
      const capture = detailed && index === 0;
      if (stage === 2) {
        if (capture) await emit('wheel');
        if (!auto) await admin.cmd('wheel.spin');
        await until(() => admin.s.phase === 'CARD_PICK', 'cards');
        if (capture) await emit('cards');
        for (const team of teams) {
          assert.equal(team.s.question, null);
          await team.cmd('card.select', { value: 15 });
        }
        if (!auto) await admin.cmd('question.start');
      }
      await until(
        () => admin.s.phase === 'RUNNING' && admin.s.index === (stage === 1 ? 0 : index),
        'question running',
      );
      if (capture) {
        await emit('question');
        await admin.cmd('round.pause');
        await emit('pause');
        await admin.cmd('round.resume');
        if (teams[0].page) {
          const id = teams[0].s.team.id;
          teams[0].s = undefined;
          await teams[0].page.reload();
          await until(
            () => teams[0].s?.team?.id === id && !!teams[0].s.question,
            'refresh restores seat and question',
          );
          await emit('reconnect');
        }
      }
      await until(() => !!teams[0].s.question, 'question reaches first team');
      const model = admin.s.questions.find((q: any) => q.id === teams[0].s.question.id);
      for (let i = 0; i < ids.length; i++) {
        const right = i === 0 && (stage !== 3 || !auto || index % 2 === 0);
        await answer(admin, teams[i], right);
        expected[i] =
          stage === 1
            ? expected[i] + blitzScore(model.difficulty, right, admin.s.settings)
            : stage === 2
              ? expected[i] + gamblerScore(15, right)
              : climbPosition(expected[i], right, admin.s.settings);
      }
      if (stage !== 1) {
        await until(
          () => ['AUDIENCE', 'REVEAL', 'RESULTS'].includes(admin.s.phase),
          'collection closes',
        );
        if (admin.s.phase === 'AUDIENCE') {
          await until(() => !!display.s.question, 'audience question');
          assert(!('correct' in display.s.question));
        }
        // Pending written answers block automatic reveal until the operator grades them.
        if (capture) await emit('audience');
        for (const a of admin.s.answers.filter((a: any) => a.verdict === 'pending'))
          await admin.cmd('grade.set', {
            answerId: a.id,
            verdict:
              a.teamId === ids[0] && (stage !== 3 || !auto || index % 2 === 0)
                ? 'correct'
                : 'wrong',
          });
        if (!auto) await admin.cmd('question.reveal');
        await until(() => admin.s.phase !== 'AUDIENCE', 'reveal');
        if (capture) await emit('reveal');
        if (index + 1 < count && !auto) await admin.cmd('question.next');
      }
    }
    await until(() => admin.s.phase === 'RESULTS', 'round results');
    if (stage === 1) {
      const data = await admin.export();
      const r = data.state.rounds.find((r: any) => r.key === admin.s.roundKey);
      // Scores derive from the shared rules and actual monotonic finish receipts.
      for (let i = 0; i < ids.length; i++) {
        const elapsed = data.state.finishMs?.[ids[i]] ?? admin.s.lineup[i].finishMs;
        assert.equal(
          typeof elapsed,
          'number',
          `Missing finish receipt for ${ids[i]} (${JSON.stringify(r)})`,
        );
        expected[i] += speedBonus(elapsed, true, admin.s.settings);
      }
    }
    assert.equal(admin.s.winner, ids[0]);
    assert.deepEqual(
      admin.s.lineup.map((t: any) => t.score),
      expected,
    );
    winners.push(ids[0]);
    await emit(stage === 3 ? 'champion' : 'results');
    if ([11, 14, 15].includes(round)) {
      const data = await admin.export();
      const completed = data.state.rounds.filter((r: any) => r.completed);
      assert.equal(completed.length, round + 1);
      assert.equal(
        new Set(completed.filter((r: any) => r.stage === stage).map((r: any) => r.winner)).size,
        stage === 1 ? 12 : stage === 2 ? 3 : 1,
      );
      if (hook) {
        await admin.cmd('display.scene', { scene: 'bracket' });
        await hook('bracket', admin, teams);
        await admin.cmd('display.scene', { scene: 'auto' });
      }
    }
    console.log(
      `  ${s.bank}/${auto ? 'auto' : 'manual'} round ${round + 1}/16: winner ${ids[0]}, scores ${expected}`,
    );
    if (round < 15) await admin.cmd('round.next');
  }
  const data = await admin.export();
  assert(data.state.rounds.every((r: any) => r.completed));
  assert.equal(data.teams.filter((t: any) => t.status === 'champion').length, 1);
  assert.equal(data.answers.length, auto ? 621 : 606);
  assert.deepEqual(
    winners.slice(0, 12),
    Array.from({ length: 12 }, (_, i) => 4 * i + 1),
  );
  assert.deepEqual(winners.slice(12, 15), [1, 17, 33]);
  assert.equal(winners[15], 1);
  // Seeding/playing may mark usage, but must preserve all authored question content.
  const content = (qs: any[]) => qs.map(({ used, ...q }) => q);
  assert.deepEqual(content(data.questions), content(originalQuestions));
  await assert.rejects(admin.cmd('round.next'), /finished/);
  await assert.rejects(admin.cmd('score.adjust', { teamId: 1, delta: 5, reason: 'Too late' }));
  writeFileSync(
    join(s.evidence, `tournament-${s.bank}-${auto ? 'auto' : 'manual'}.json`),
    JSON.stringify(data, null, 2),
  );
}
