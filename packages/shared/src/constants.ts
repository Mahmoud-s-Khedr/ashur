export const DEFAULTS = {
  blitzMs:120_000, questionMs:30_000, countdownMs:3_000, autoDelayMs:3_000,
  easyPoints:5, mediumPoints:7, hardPoints:10, jokerCorrect:15, jokerWrong:-5,
  speedTiers:[{untilMs:90_000,points:15},{untilMs:100_000,points:10},{untilMs:110_000,points:5}],
  cards:[5,10,15], cardReuseLimit:0, gamblerInitial:0, climbUp:1, climbDown:2, ladderTop:10,
  blitzCount:10, gamblerCount:8, climbCount:15, jokerPosition:10,
  blitzUnansweredPenalty:0, unansweredWrong:true, graceMs:0,
  automation:'auto' as 'auto'|'assisted'|'manual', sound:true,
  stage2Mapping:[[1,2,3,4],[5,6,7,8],[9,10,11,12]],
  teamCount:48, stage1Rounds:12, stage2Rounds:3, reserveCount:21
};
export type Settings = typeof DEFAULTS;
