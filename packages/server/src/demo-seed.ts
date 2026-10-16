import 'dotenv/config';
import { openDb } from './db';
import { DEFAULTS, type Question } from '@ashour/shared';
export function seed(db: ReturnType<typeof openDb>) {
  if ((db.prepare('SELECT COUNT(*) AS n FROM teams').get() as { n: number }).n) return;
  const colors = ['#27d6b0', '#f8bc55', '#8f91ff', '#ff7d9f'];
  db.transaction(() => {
    for (let i = 1; i <= DEFAULTS.teamCount; i++)
      db.prepare('INSERT INTO teams(id,code,name,color) VALUES(?,?,?,?)').run(
        i,
        String(110 + i),
        `الفريق ${i}`,
        colors[(i - 1) % 4],
      );
    let id = 0;
    const add = (q: Omit<Question, 'id'>) => {
      id++;
      db.prepare('INSERT INTO questions(id,json) VALUES(?,?)').run(
        id,
        JSON.stringify({ ...q, id }),
      );
    };
    const categories = ['هندسة', 'دين', 'رياضة', 'سينما'];
    for (let setNo = 1; setNo <= DEFAULTS.stage1Rounds; setNo++)
      for (let j = 0; j < DEFAULTS.blitzCount; j++)
        add({
          stage: 1,
          pool: 'main',
          difficulty: j < 3 ? 'easy' : j < 6 ? 'medium' : j < 9 ? 'hard' : 'joker',
          category: categories[j % 4],
          type: 'mcq',
          body: `سؤال تجريبي ${setNo} / ${j + 1}: ما ناتج ${setNo} + ${j + 1}؟`,
          options: [String(setNo + j + 1), String(setNo + j + 2), '0', '100'],
          correct: 0,
          explanation: 'محتوى تجريبي، يجب استبداله قبل المسابقة.',
          setNo,
        });
    for (let stage = 2; stage <= 3; stage++)
      for (
        let j = 0;
        j < (stage === 2 ? DEFAULTS.gamblerCount * DEFAULTS.stage2Rounds : DEFAULTS.climbCount);
        j++
      )
        add({
          stage,
          pool: 'main',
          difficulty: 'hard',
          category: categories[j % 4],
          type: j % 3 === 0 ? 'text' : 'mcq',
          body: `سؤال تجريبي للمرحلة ${stage} رقم ${j + 1}: ما ناتج ${j + 1} + 1؟`,
          options: j % 3 === 0 ? [] : [String(j + 2), '0', '1', '99'],
          correct: j % 3 === 0 ? [String(j + 2)] : 0,
          explanation: 'محتوى تجريبي.',
          setNo: null,
        });
    for (let j = 0; j < DEFAULTS.reserveCount; j++)
      add({
        stage: null,
        pool: j < 10 ? 'tiebreaker' : 'reserve',
        difficulty: 'hard',
        category: categories[j % 4],
        type: j < 10 ? 'numeric' : 'mcq',
        body: `سؤال احتياطي تجريبي ${j + 1}: كم يساوي ${j + 1} × 2؟`,
        options: j < 10 ? [] : [String((j + 1) * 2), '0', '1', '99'],
        correct: j < 10 ? [String((j + 1) * 2)] : 0,
        explanation: 'محتوى تجريبي.',
        setNo: null,
      });
  })();
}
