# Ashour client updates

Track the five approved requests below. Each request gets its own commit; update its status and record the commit hash when completed. Preserve existing event data when changing seeded content.

Status: **Not started** · **In progress** · **Done** · **Blocked**

## 1. Remove Gambler difficulty label (request 10)

**Status:** Done  
**Commit:** ac10140

- [x] Hide the difficulty/Blitz points label on Gambler questions, retaining the relevant category, wager and question number.
- [x] Check the player screen in Arabic and English and confirm Blitz labels still work.
- [x] Commit this request separately.

## 2. Seed written-answer questions (request 12)

**Status:** Done  
**Commit:** 11be84f

- [x] Update the question-generation/seeding source so Gambler and Final Climb questions are written-answer questions, retaining their model answers.
- [x] Regenerate the bundled question bank and check both the real and demo seed paths as applicable.
- [x] Verify question counts and types, written-answer submission and manual grading; update seed tests and documentation as needed.
- [x] Document how existing databases receive the updated questions without overwriting active or used data. Seeding an empty database alone does not update an existing bank.
- [x] Commit this request separately.

## 3. Separate audience questions between rounds (request 13)

**Status:** Not started  
**Commit:** —

- [ ] Define how audience questions are stored, selected and managed, independently of competition questions and scores.
- [ ] Add an operator-controlled flow after each competition round and before the next group, with projector question and answer reveal.
- [ ] Handle round progression, refresh/reconnect and automation without skipping or repeating the audience step unintentionally.
- [ ] Verify the flow across stages and update the operator documentation.
- [ ] Commit this request separately.

**Decision needed:** Confirm whether “after each competition round” includes the final round, and provide or approve the audience questions and answers. The existing audience phase reuses the teams' question and does not satisfy this request.

## 4. Five valuable-prize audience questions (request 14)

**Status:** Not started  
**Commit:** —

- [ ] Build on the separate audience-question flow to identify and present five difficult prize questions.
- [ ] Add operator controls for the agreed placement, question progression and answer reveal; keep prize questions separate from team scoring.
- [ ] Verify all five questions can be presented once in the intended sequence and that competition progression remains intact.
- [ ] Update operator documentation and commit this request separately.

**Decision needed:** Confirm where the five questions appear between Blitz and Final Climb, and provide or approve the five questions and answers.

## 5. Show Gambler question on projector (request 15)

**Status:** Not started  
**Commit:** —

- [ ] Make the current Gambler question available to the projector after wager selection, while teams are answering; keep the model answer hidden until reveal.
- [ ] Update the projector layout to show the question alongside useful timer and team information.
- [ ] Verify question visibility before and after wagers, during answering and at reveal, including refresh/reconnect and both languages.
- [ ] Commit this request separately.

## Progress log

- Request 1 completed in `ac10140`; Arabic and English player rendering, Blitz labels, type checking and production build verified.
- Request 2 completed in `11be84f`; seed tests, written-answer grading, type checking and production build verified.
