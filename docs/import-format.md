# Import formats

Imports are available in **بنك الأسئلة** and **الفرق والأكواد**. UTF-8 JSON arrays or RFC-4180 CSV are supported. Commas, quoted multiline text and doubled quotes in CSV cells are handled. Numeric-looking team codes stay strings. Validation occurs on the server; one invalid row rejects the complete import without partial writes. The error banner names validation issues; fix the file and try again.

## Teams

```json
[
  { "id": 1, "code": "111", "name": "الفريق الأول", "color": "#27d6b0" },
  { "id": 2, "code": "112", "name": "الفريق الثاني", "color": "#f8bc55" }
]
```

`id` updates an existing team; omit it to add one. Codes must be unique numeric strings with three or four digits. Names are unique. Colors use six-digit hex. Imports/edits are available while idle or at results. Initial lineups reference seeded team IDs 1–48, so use IDs to rename/recode those teams rather than appending a second roster.

```csv
id,code,name,color
1,111,الفريق الأول,#27d6b0
2,112,الفريق الثاني,#f8bc55
```

## Questions

```json
[
  {
    "id": 1,
    "stage": 1,
    "pool": "main",
    "difficulty": "easy",
    "category": "هندسة",
    "type": "mcq",
    "body": "كم ضلعاً للمثلث؟",
    "options": ["2", "3", "4", "5"],
    "correct": 1,
    "explanation": "للمثلث ثلاثة أضلاع.",
    "setNo": 1
  }
]
```

- `id`: update an unused question; omit to create. Used questions are immutable. Questions in an active set cannot be changed/deleted.
- `stage`: 1, 2, 3; `null` for reserve/tie-breaker.
- `pool`: `main`, `reserve`, `tiebreaker`.
- `difficulty`: `easy`, `medium`, `hard`, `joker`.
- `category`: free text; identical spelling groups a Gambler category.
- `type`: `mcq`, `text`, `numeric`. Blitz requires MCQ.
- `options`: 2–8 strings for MCQ; empty for text/numeric.
- `correct`: **zero-based option index** for MCQ; an array of accepted answer strings for text/numeric. Text/numeric grading is always manual; accepted strings help the operator.
- `setNo`: Blitz set number 1–12; null for other content.
- `explanation`: optional string.

```csv
id,stage,pool,difficulty,category,type,body,options,correct,explanation,setNo
1,1,main,easy,هندسة,mcq,كم ضلعاً للمثلث؟,"[""2"",""3"",""4"",""5""]",1,ثلاثة أضلاع,1
121,2,main,hard,رياضة,text,أدخل الإجابة,[],"[""إجابة مقبولة""]",تصحيح يدوي,
```

The default seed already uses the workbook questions. To replace an older unused demo bank, import `packages/server/content/questions.json`; its IDs update slots 1–180. Appending questions without IDs does not remove existing content. You can also delete unused demo questions, import new content, and build sets explicitly by ID. A set builder verifies 3/3/3/1 and ten unique Stage-1 MCQs. Coverage cards count unused content by stage/pool; they do not verify factual accuracy or difficulty. Run a complete content review.

Reserve content should include MCQs for Blitz leak replacement and text/numeric/speed questions for tie-breakers. Imports are capped at 1,000 questions or 200 teams per file and 2 MB HTTP body. Binary media and logos are not currently supported.
