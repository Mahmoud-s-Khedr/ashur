import 'dotenv/config';
import { openDb } from './db';
import { DEFAULTS, questionSchema } from '@ashour/shared';
import questions from '../content/questions.json';
import { seed as seedDemo, normalizeWrittenQuestions } from './demo-seed';

export const REGISTERED_TEAMS = [
  'كفر الشيخ الحبيبه',
  'اعقلها و توكل',
  'الشيكوبانزاوية',
  'الشباينة',
  'المنتخب الجيبوتي',
  'Stfu',
  'عارفينا بس مش فاكرينها²',
  'الحزب',
  'سمير وشهير وبهير',
  '911',
  'شركه فارما الالمانيه لاباده الدرجات 🌟',
  'باموووو',
  'مزمز ميريندا',
  'فحول اتصالات',
  'Voy voy voy',
  'الناظر',
  'بخاتي',
  'على الله ان شاء الله',
  'حبايب ميس انشراح',
  'الاتحاد السوفيتي',
  'هبد موثق',
  'هبدة مرتدة',
  'الشقيان كسبان',
  'الهبيده',
  'بوكس',
  'الخوارزمى',
  'خريجين إلا نص',
  'منعرفش حاجة',
  'سلامنكا',
  'أزأز كابوريا',
  'Control panel',
  'فريق وهمي',
];

export function seed(db: ReturnType<typeof openDb>) {
  if (process.env.QUESTION_BANK === 'demo') return seedDemo(db);
  const colors = ['#27d6b0', '#f8bc55', '#8f91ff', '#ff7d9f'];
  db.transaction(() => {
    const existingTeams = db.prepare('SELECT id, name FROM teams ORDER BY id').all() as {
      id: number;
      name: string;
    }[];
    const hasPlaceholders =
      existingTeams.length === 0 || existingTeams.every((t) => /^الفريق\s+\d+$/.test(t.name));
    if (hasPlaceholders) {
      db.prepare('UPDATE devices SET team_id=NULL,seat_no=NULL').run();
      db.prepare('DELETE FROM teams').run();
      const insertTeam = db.prepare('INSERT INTO teams(id,code,name,color) VALUES(?,?,?,?)');
      REGISTERED_TEAMS.forEach((name, idx) => {
        const i = idx + 1;
        insertTeam.run(i, String(110 + i), name, colors[idx % colors.length]);
      });
      const saved = db.prepare('SELECT json FROM match_state WHERE id=1').get() as
        | { json: string }
        | undefined;
      if (saved) {
        const state = JSON.parse(saved.json);
        const rounds = [];
        for (let i = 1; i <= 8; i++)
          rounds.push({
            key: `1-${i}`,
            stage: 1,
            seq: i,
            teamIds: [4 * i - 3, 4 * i - 2, 4 * i - 1, 4 * i],
          });
        for (let i = 1; i <= 4; i++)
          rounds.push({ key: `2-${i}`, stage: 2, seq: i, teamIds: [] });
        rounds.push({ key: '3-1', stage: 3, seq: 1, teamIds: [] });
        state.settings = {
          ...structuredClone(DEFAULTS),
          ...state.settings,
          teamCount: 32,
          stage1Rounds: 8,
          stage1TeamsPerRound: 4,
          stage1QualifiersPerRound: 2,
          stage2Rounds: 4,
          stage2TeamsPerRound: 4,
          stage3Rounds: 1,
          stage3TeamsPerRound: 4,
          stage2Mapping: [
            [1, 2],
            [3, 4],
            [5, 6],
            [7, 8],
          ],
        };
        state.rounds = rounds;
        state.roundKey = '1-1';
        state.phase = 'IDLE';
        state.version = (state.version ?? 0) + 1;
        db.prepare('UPDATE match_state SET json=?, version=? WHERE id=1').run(
          JSON.stringify(state),
          state.version,
        );
      }
    }
    const existingQCount = (db.prepare('SELECT COUNT(*) AS n FROM questions').get() as { n: number })
      .n;
    if (existingQCount === 180 && questions.length === 112) {
      db.prepare('DELETE FROM questions').run();
    } else if (existingQCount > 0) {
      normalizeWrittenQuestions(db);
      return;
    }
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
