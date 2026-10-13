import { it, expect } from 'vitest';
import { parseCsv, parseImport } from './import';
it('parses multiline quoted Arabic CSV and preserves numeric codes', () => {
  expect(parseCsv('code,name,color\n111,"الفريق، الأول\nالجديد",#27d6b0\n')).toEqual([
    { code: '111', name: 'الفريق، الأول\nالجديد', color: '#27d6b0' },
  ]);
});
it('imports zero based answer indexes and accepted text', () => {
  expect(
    parseImport(
      'stage,pool,difficulty,category,type,body,options,correct\n2,main,hard,هندسة,mcq,سؤال,"[""أ"",""ب""]",0',
      'questions',
    )[0],
  ).toMatchObject({ correct: 0, options: ['أ', 'ب'] });
});
it('rejects malformed CSV', () => {
  expect(() => parseCsv('a,b\n"x,y')).toThrow('Unclosed');
});
