import 'dotenv/config';
import { openDb } from './db';
import { DEFAULTS, questionSchema } from '@ashour/shared';
import questions from '../content/questions.json';
import { seed as seedDemo } from './demo-seed';

export function seed(db: ReturnType<typeof openDb>) {
  if (process.env.QUESTION_BANK === 'demo') return seedDemo(db);
  const colors = ['#27d6b0', '#f8bc55', '#8f91ff', '#ff7d9f'];
  db.transaction(() => {
    if (!(db.prepare('SELECT COUNT(*) AS n FROM teams').get() as { n: number }).n) {
      for (let i = 1; i <= DEFAULTS.teamCount; i++)
        db.prepare('INSERT INTO teams(id,code,name,color) VALUES(?,?,?,?)').run(
          i,
          String(110 + i),
          `الفريق ${i}`,
          colors[(i - 1) % colors.length],
        );
    }
    if ((db.prepare('SELECT COUNT(*) AS n FROM questions').get() as { n: number }).n) return;
    const insert = db.prepare('INSERT INTO questions(id,json) VALUES(?,?)');
    for (const question of questions) {
      const q = questionSchema.parse(question);
      insert.run(q.id, JSON.stringify(q));
    }
  })();
}

if (process.argv[1]?.endsWith('seed.ts')) {
  const db = openDb();
  seed(db);
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE is_deleted=0').get() as {
    n: number;
  };
  console.log(`Question bank ready: ${n} questions. Existing content is preserved.`);
  db.close();
}
