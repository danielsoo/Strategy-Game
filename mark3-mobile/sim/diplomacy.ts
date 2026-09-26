// 외교와 행군 사건이 실제로 얼마나 일어나나
//
//   npm run sim:diplo -- <판크기> <판수> <외교 0|1> [사건확률]
//   npm run sim:diplo -- 11 20 1        외교 켬
//   npm run sim:diplo -- 11 20 0 0      둘 다 끔 (견줄 기준)
//
// 성격 다섯(균형·공격형·수비형·경제형·확장형)으로 둔다 — sim:eval 의 동일 강도
// AI 와 판 길이가 다르므로, 견줄 것은 이 스크립트끼리다.
// 로그를 가로채 센다. 측정이 0 을 내면 손잡이가 없는 것인지 배선이 끊긴 것인지
// 부터 볼 것 — 처음 값은 배신이 판당 0.05 였다(docs/diplomacy-2026-09-26.md).

import { makeRng } from '../src/services/combatSystem';
import { playGame } from './gameSim';
import { PERSONALITIES } from '../src/engine/ai';
import { DEFAULT_ECONOMY } from '../src/engine/types';
const size = Number(process.argv[2] ?? 11), games = Number(process.argv[3] ?? 20), on = Number(process.argv[4] ?? 1);
const enc = Number(process.argv[5] ?? DEFAULT_ECONOMY.encounterChance);
const eco = { ...DEFAULT_ECONOMY, diplomacyOn: on, encounterChance: enc };
const c: Record<string, number> = {};
let turns = 0, attacks = 0, limit = 0;
const roster = ['균형','공격형','수비형','경제형','확장형'].map(k => (PERSONALITIES as any)[k]);
for (let g = 0; g < games; g++) {
  const rng = makeRng(1000 + g);
  const r = playGame(roster, size, size, rng, 250, eco, undefined, undefined, (s) => {
    const push = s.log.push.bind(s.log);
    s.log.push = (...xs: string[]) => {
      for (const x of xs) {
        if (x.includes('휴전 체결')) c['휴전']=(c['휴전']??0)+1;
        else if (x.includes('동맹 체결')) c['동맹']=(c['동맹']??0)+1;
        else if (x.includes('배신')) c['배신']=(c['배신']??0)+1;
        else if (x.includes('제안 거절')) c['거절']=(c['거절']??0)+1;
        else if (x.includes('기한이 끝')) c['휴전만료']=(c['휴전만료']??0)+1;
        else if (x.includes('동맹이 풀렸다')) c['동맹해제']=(c['동맹해제']??0)+1;
      }
      return push(...xs);
    };
  });
  turns += r.turns; attacks += r.attacksMade.reduce((a: number, b: number) => a + b, 0);
  if ((r as any).hitLimit || r.winner === null) limit++;
}
console.log(`${size}x${size} ${games}판 diplomacy=${on} enc=${enc}: 평균 ${(turns/games).toFixed(1)}턴, 공격 ${(attacks/games).toFixed(1)}/판, 미결 ${limit}`, JSON.stringify(Object.fromEntries(Object.entries(c).map(([k,v])=>[k,(v/games).toFixed(2)]))));
