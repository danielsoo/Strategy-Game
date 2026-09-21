// 경제 손잡이 하나하나가 판을 어떻게 바꾸나
//
// '넓은 판에서 원정이 수지맞게' 를 찾을 때 쓴 하네스다. 답은 행정비였고,
// 그건 손잡이를 돌릴 문제가 아니라 칸수가 절대값으로 들어간 버그였다
// (rules.ts adminCost).
//
// 여기 값을 보고 상수를 고칠 때는 반드시 두 판 크기를 같이 본다. 한쪽만
// 보고 고치면 다른 쪽이 조용히 망가진다.
import { makeRng } from '../src/services/combatSystem';
import { PERSONALITIES, LEARNED_WEIGHTS, AIWeights } from '../src/engine/ai';
import { DEFAULT_ECONOMY, EconomyConfig } from '../src/engine';
import { playGame } from './gameSim';

const NAMES = ['수비형', '경제형', '확장형', '공격형', '학습형'];
const R: AIWeights[] = [
  PERSONALITIES['수비형'], PERSONALITIES['경제형'], PERSONALITIES['확장형'],
  PERSONALITIES['공격형'], LEARNED_WEIGHTS,
];

function run(label: string, eco: EconomyConfig) {
  const wins: Record<string, number> = {};
  let n = 0, turns = 0, limit = 0, attacks = 0, vassals = 0;
  for (let s = 0; s < 14; s++) {
    for (let rot = 0; rot < 5; rot++) {
      const roster = R.slice(rot).concat(R.slice(0, rot));
      const names = NAMES.slice(rot).concat(NAMES.slice(0, rot));
      const r = playGame(roster, 21, 21, makeRng(7700 + s * 13 + rot), 250, eco);
      n++; turns += r.turns;
      if (r.turns >= 250) limit++;
      attacks += r.attacksMade.reduce((a, b) => a + b, 0);
      vassals += r.becameVassal.filter(Boolean).length;
      if (r.winner !== null) wins[names[r.winner]] = (wins[names[r.winner]] ?? 0) + 1;
    }
  }
  const p = (x: number) => ((x / n) * 100).toFixed(0) + '%';
  console.log(
    `  ${label.padEnd(26)} ${(turns / n).toFixed(0).padStart(3)}턴 · 턴제한 ${p(limit).padStart(4)}` +
    ` · 공격 ${(attacks / n).toFixed(0).padStart(3)} · 속국 ${(vassals / n).toFixed(1)}` +
    `  |  수비 ${p(wins['수비형'] ?? 0).padStart(4)} · 공격 ${p(wins['공격형'] ?? 0).padStart(4)}` +
    ` · 학습 ${p(wins['학습형'] ?? 0).padStart(4)} · 확장 ${p(wins['확장형'] ?? 0).padStart(4)}` +
    ` · 경제 ${p(wins['경제형'] ?? 0).padStart(4)}`
  );
}

const E = DEFAULT_ECONOMY;
console.log('21x21 · 설정당 70판\n');
run('기준', E);
console.log('\n약탈 (원정의 즉석 보상)');
run('cell 2% → 6%', { ...E, plunderCellShare: 0.06 });
run('cell 2% → 12%', { ...E, plunderCellShare: 0.12 });
run('castle 25% → 50%', { ...E, plunderCastleShare: 0.5 });
console.log('\n행정 (뻗어나가는 값)');
run('adminExponent 1.45 → 1.6', { ...E, adminExponent: 1.6 });
run('adminExponent 1.45 → 1.3', { ...E, adminExponent: 1.3 });
run('adminRange 2.5 → 4', { ...E, adminRange: 4 });
console.log('\n속국 (부리는 값)');
run('조공 정복분 ×1.6', { ...E, tributeRateConquest: Math.min(0.95, E.tributeRateConquest * 1.6) });
run('속국 영향력 가중 ×1.5', { ...E, vassalInfluenceWeight: E.vassalInfluenceWeight * 1.5 });
