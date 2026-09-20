// 큰 판에서 웅크리는 쪽이 왜 이기나 — 무엇으로 이기는지 본다
import { makeRng } from '../src/services/combatSystem';
import { PERSONALITIES, LEARNED_WEIGHTS } from '../src/engine/ai';
import { playGame } from './gameSim';
import { AIWeights } from '../src/engine/ai';

const NAMES = ['수비형', '경제형', '확장형', '공격형', '학습형'];
const R: AIWeights[] = [
  PERSONALITIES['수비형'], PERSONALITIES['경제형'], PERSONALITIES['확장형'],
  PERSONALITIES['공격형'], LEARNED_WEIGHTS,
];

for (const size of [11, 21]) {
  const reason: Record<string, number> = {};
  const winsBy: Record<string, number> = {};
  let n = 0;
  for (let s = 0; s < 24; s++) {
    for (let rot = 0; rot < 5; rot++) {
      const roster = R.slice(rot).concat(R.slice(0, rot));
      const names = NAMES.slice(rot).concat(NAMES.slice(0, rot));
      const r = playGame(roster, size, size, makeRng(5000 + s * 13 + rot), 250);
      n++;
      const w = r.winner;
      const why = w === null ? '무승부(턴제한)'
        : r.winReason?.includes('패권') ? '패권(모두 한 진영)'
        : r.winReason?.includes('영향력') ? '영향력(판 절반+2배)'
        : r.winReason ? '기타' : '전멸';
      reason[why] = (reason[why] ?? 0) + 1;
      if (w !== null) winsBy[names[w]] = (winsBy[names[w]] ?? 0) + 1;
    }
  }
  const p = (x: number) => `${((x / n) * 100).toFixed(0)}%`;
  console.log(`\n${size}x${size} · ${n}판`);
  console.log('  이긴 방식: ' + Object.entries(reason).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${p(v)}`).join(' · '));
  console.log('  이긴 성격: ' + Object.entries(winsBy).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${p(v)}`).join(' · '));
}
