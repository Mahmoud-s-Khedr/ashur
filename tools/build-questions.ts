import { writeFileSync } from 'node:fs';
import { format } from 'prettier';
import { questionSchema, type Question } from '../packages/shared/src/index';
import source from '../packages/server/content/ashour-source.json';

// Workbook content is preserved; distractors are authored additions.
// Repetition across rounds fills the tournament with the supplied 112 questions.
const categories = [...new Set(source.map((q) => q.category))];
const interleave = (rows: typeof source) =>
  [...rows].sort(
    (a, b) =>
      ((a.id - 1) % 16) - ((b.id - 1) % 16) ||
      categories.indexOf(a.category) - categories.indexOf(b.category),
  );
const queues = Object.fromEntries(
  ['easy', 'medium', 'hard'].map((d) => [d, interleave(source.filter((q) => q.difficulty === d))]),
);
const cursors: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
const bank: Question[] = [];
const used = new Set<number>();
function add(
  row: (typeof source)[number],
  stage: number | null,
  pool: Question['pool'],
  difficulty: Question['difficulty'],
  setNo: number | null = null,
  type: Question['type'] = 'mcq',
) {
  const id = bank.length + 1;
  const correct = (id - 1) % 4;
  const options = [...row.distractors];
  if (options.length !== 3 || new Set([row.answer, ...options]).size !== 4)
    throw new Error(`Invalid options for workbook question ${row.id}`);
  options.splice(correct, 0, row.answer);
  bank.push({
    ...questionSchema.parse({
      id,
      stage,
      pool,
      difficulty,
      setNo,
      type,
      category: row.category,
      body: row.body,
      options: type === 'mcq' ? options : [],
      correct: type === 'mcq' ? correct : [row.answer],
      explanation: `المصدر: أسئلة عاشور.xlsx — السؤال ${row.id}. الإجابة: ${row.answer}`,
    }),
    id,
  });
  used.add(row.id);
}
for (let setNo = 1; setNo <= 12; setNo++) {
  for (const difficulty of [
    'easy',
    'easy',
    'easy',
    'medium',
    'medium',
    'medium',
    'hard',
    'hard',
    'hard',
    'joker',
  ] as const) {
    const level = difficulty === 'joker' ? 'hard' : difficulty;
    const queue = queues[level];
    add(queue[cursors[level]++ % queue.length], 1, 'main', difficulty, setNo);
  }
}
// Include every workbook row, then spread repeated content across categories.
const rest = interleave(source).sort((a, b) => Number(used.has(a.id)) - Number(used.has(b.id)));
let next = 0;
for (let i = 0; i < 24; i++) {
  const row = rest[next++ % rest.length];
  add(row, 2, 'main', row.difficulty as Question['difficulty'], null, 'text');
}
for (let i = 0; i < 15; i++) {
  const row = rest[next++ % rest.length];
  add(row, 3, 'main', row.difficulty as Question['difficulty']);
}
for (let i = 0; i < 21; i++) {
  const row = queues.hard[i % queues.hard.length];
  add(
    row,
    null,
    i < 10 ? 'tiebreaker' : 'reserve',
    row.difficulty as Question['difficulty'],
    null,
    i < 10 ? 'text' : 'mcq',
  );
}
if (bank.length !== 180 || used.size !== source.length) throw new Error('Incomplete question bank');
writeFileSync(
  new URL('../packages/server/content/questions.json', import.meta.url),
  await format(JSON.stringify(bank), { parser: 'json', printWidth: 100 }),
);
console.log(`Built ${bank.length} slots from all ${used.size} workbook questions.`);
