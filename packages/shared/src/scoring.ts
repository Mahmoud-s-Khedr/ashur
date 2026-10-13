import {DEFAULTS, type Settings} from './constants';
export function speedBonus(ms:number, completed:boolean, s:Settings=DEFAULTS):number {
 if(!completed) return 0;
 const [a,b,c]=s.speedTiers;
 return ms<a.untilMs?a.points:ms<b.untilMs?b.points:ms<=c.untilMs?c.points:0;
}
export function blitzScore(difficulty:string, correct:boolean, s:Settings=DEFAULTS):number {
 if(difficulty==='joker') return correct?s.jokerCorrect:s.jokerWrong;
 return correct?({easy:s.easyPoints,medium:s.mediumPoints,hard:s.hardPoints}[difficulty]??0):0;
}
export function gamblerScore(card:number,correct:boolean):number{return correct?card:-card;}
export function climbPosition(position:number,correct:boolean,s:Settings=DEFAULTS):number{return Math.min(s.ladderTop,Math.max(0,position+(correct?s.climbUp:-s.climbDown)));}
export function fastestCorrect(answers:{teamId:number;elapsedUs:number;verdict:string}[]):number|undefined {
 const list=answers.filter(a=>a.verdict==='correct').sort((a,b)=>a.elapsedUs-b.elapsedUs);
 if(list.length>1&&list[0].elapsedUs===list[1].elapsedUs)return undefined;
 return list[0]?.teamId;
}
