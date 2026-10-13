// RFC 4180: commas, quoted multiline cells and escaped quotes are supported.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (quoted) throw new Error('Unclosed CSV quote');
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift()?.map((h) => h.replace(/^\uFEFF/, '').trim());
  if (!headers || new Set(headers).size !== headers.length) throw new Error('Invalid CSV headers');
  return rows.map((r, i) => {
    if (r.length !== headers.length)
      throw new Error(`CSV row ${i + 2}: expected ${headers.length} cells`);
    return Object.fromEntries(headers.map((h, j) => [h, r[j]]));
  });
}
export function parseImport(text: string, kind: 'questions' | 'teams') {
  if (text.trim().startsWith('[')) return JSON.parse(text);
  const rows = parseCsv(text);
  return rows.map((r) =>
    kind === 'teams'
      ? {
          ...(r.id ? { id: Number(r.id) } : {}),
          code: r.code,
          name: r.name,
          color: r.color || '#27d6b0',
        }
      : {
          ...(r.id ? { id: Number(r.id) } : {}),
          stage: r.stage ? Number(r.stage) : null,
          pool: r.pool || 'main',
          difficulty: r.difficulty || 'hard',
          category: r.category,
          type: r.type || 'mcq',
          body: r.body,
          options: r.options ? JSON.parse(r.options) : [],
          correct: JSON.parse(r.correct),
          explanation: r.explanation || '',
          setNo: r.setNo ? Number(r.setNo) : null,
        },
  );
}
