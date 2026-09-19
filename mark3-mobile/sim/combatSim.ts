// 전투 시뮬레이터
//
// 감으로 숫자를 맞추지 않기 위한 도구. 시나리오마다 수만 번 전투를 돌려
// 승률·평균 라운드·생존자를 표로 뽑는다.
//
//   npm run sim:combat
//   npm run sim:combat -- --trials 50000
//
// 이 디렉터리는 React에 의존하지 않는다. 나중에 전체 게임 자가대전(self-play)과
// AI 평가 함수 가중치 학습도 여기에 붙인다.

import {
  resolveCombat,
  makeRng,
  DEFAULT_COMBAT_CONFIG,
  CombatConfig,
  CombatSide,
} from '../src/services/combatSystem';

interface Scenario {
  name: string;
  attacker: CombatSide;
  defender: CombatSide;
}

interface Stats {
  trials: number;
  attackerWinRate: number;
  defenderWinRate: number;
  stalemateRate: number;
  routRate: number;
  annihilationRate: number;
  avgRounds: number;
  avgAttackerSurvivors: number;
  avgDefenderSurvivors: number;
}

function runScenario(sc: Scenario, trials: number, cfg: CombatConfig, seed: number): Stats {
  let attWins = 0;
  let defWins = 0;
  let stale = 0;
  let rout = 0;
  let annih = 0;
  let totalRounds = 0;
  let totalAttSurv = 0;
  let totalDefSurv = 0;

  // 시행마다 새 시드를 쓰면 안 된다. mulberry32는 인접 시드의 첫 출력이 상관되어
  // "첫 난수는 항상 공격측 지터"라는 구조와 맞물려 계통 편향을 만든다.
  // 시나리오당 하나의 난수 스트림을 끝까지 흘린다.
  const rng = makeRng(seed);

  for (let i = 0; i < trials; i++) {
    const r = resolveCombat(sc.attacker, sc.defender, rng, cfg);

    if (r.outcome === 'attacker-win') attWins++;
    else if (r.outcome === 'defender-win') defWins++;
    else stale++;

    if (r.reason === 'rout') rout++;
    if (r.reason === 'annihilation') annih++;

    totalRounds += r.rounds.length;
    totalAttSurv += r.attackerSurvivors;
    totalDefSurv += r.defenderSurvivors;
  }

  return {
    trials,
    attackerWinRate: attWins / trials,
    defenderWinRate: defWins / trials,
    stalemateRate: stale / trials,
    routRate: rout / trials,
    annihilationRate: annih / trials,
    avgRounds: totalRounds / trials,
    avgAttackerSurvivors: totalAttSurv / trials,
    avgDefenderSurvivors: totalDefSurv / trials,
  };
}

const pct = (v: number) => (v * 100).toFixed(1).padStart(5) + '%';
const num = (v: number, d = 1) => v.toFixed(d).padStart(5);

function printTable(title: string, rows: Array<{ label: string; stats: Stats }>) {
  console.log('\n' + title);
  console.log('─'.repeat(88));
  console.log(
    '시나리오'.padEnd(34) +
      '공격승'.padStart(8) +
      '수비승'.padStart(8) +
      '교착'.padStart(8) +
      '라운드'.padStart(8) +
      '공생존'.padStart(8) +
      '수생존'.padStart(8)
  );
  console.log('─'.repeat(88));
  for (const { label, stats } of rows) {
    console.log(
      label.padEnd(34) +
        pct(stats.attackerWinRate).padStart(8) +
        pct(stats.defenderWinRate).padStart(8) +
        pct(stats.stalemateRate).padStart(8) +
        num(stats.avgRounds).padStart(8) +
        num(stats.avgAttackerSurvivors).padStart(8) +
        num(stats.avgDefenderSurvivors).padStart(8)
    );
  }
  console.log('─'.repeat(88));
}

function side(units: number, extra: Partial<CombatSide> = {}): CombatSide {
  return { units, morale: 100, exhaustion: 0, driftPP: 0, fear: 50, justice: 50, ...extra };
}

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

function main() {
  const trials = parseArg('trials', 20000);
  const seed = parseArg('seed', 12345);
  const cfg = DEFAULT_COMBAT_CONFIG;

  console.log(`전투 시뮬레이터 — 시나리오당 ${trials.toLocaleString()}회, 시드 ${seed}`);

  // 1. 전력비에 따른 기본 승률 (평지, 정상 상태)
  const ratioRows = [
    { label: '10 vs 10  대등', a: 10, d: 10 },
    { label: '10 vs  7  공격 우세', a: 10, d: 7 },
    { label: '10 vs  5  공격 2배', a: 10, d: 5 },
    { label: ' 7 vs 10  공격 열세', a: 7, d: 10 },
    { label: ' 5 vs 10  공격 절반', a: 5, d: 10 },
    { label: ' 3 vs 10  공격 1/3', a: 3, d: 10 },
  ].map(({ label, a, d }) => ({
    label,
    stats: runScenario({ name: label, attacker: side(a), defender: side(d) }, trials, cfg, seed),
  }));
  printTable('① 전력비 기본 승률 (평지 · 피로 없음 · 포위 없음)', ratioRows);

  // 2. 5 vs 10 열세가 조건을 만들었을 때 — 설계의 핵심
  const underdogRows = [
    {
      label: '기준: 평지, 양측 정상',
      a: side(5),
      d: side(10),
    },
    {
      label: '+ 적이 지쳐 있음 (피로 70)',
      a: side(5),
      d: side(10, { exhaustion: 70 }),
    },
    {
      label: '+ 적을 포위',
      a: side(5),
      d: side(10, { encircled: true }),
    },
    {
      label: '+ 적 피로 70 & 포위',
      a: side(5),
      d: side(10, { exhaustion: 70, encircled: true }),
    },
    {
      label: '+ 적 사기 이미 60',
      a: side(5),
      d: side(10, { morale: 60 }),
    },
    {
      label: '+ 내 공포 90 (적 사기 압박)',
      a: side(5, { fear: 90 }),
      d: side(10),
    },
    {
      label: '+ 피로 70 & 포위 & 공포 90',
      a: side(5, { fear: 90 }),
      d: side(10, { exhaustion: 70, encircled: true }),
    },
  ].map(({ label, a, d }) => ({
    label,
    stats: runScenario({ name: label, attacker: a, defender: d }, trials, cfg, seed),
  }));
  printTable('② 5 vs 10 — 열세가 조건을 만들면 (공격승 = 열세의 승리)', underdogRows);

  // 3. 방어 지형과 요새
  const terrainRows = [
    { label: '10 vs 10  평지', dm: 1.0 },
    { label: '10 vs 10  숲 (×1.25)', dm: 1.25 },
    { label: '10 vs 10  산 (×1.4)', dm: 1.4 },
    { label: '10 vs 10  완공 요새 (×1.3)', dm: 1.3 },
    { label: '10 vs 10  산 + 요새 (×1.82)', dm: 1.82 },
  ].map(({ label, dm }) => ({
    label,
    stats: runScenario(
      { name: label, attacker: side(10), defender: side(10, { defenseMultiplier: dm }) },
      trials,
      cfg,
      seed
    ),
  }));
  printTable('③ 방어 지형·요새 (수비승이 높아야 정상)', terrainRows);

  // 4. 정의 평판의 사기 저항
  const justiceRows = [
    { label: '수비 정의 0', j: 0 },
    { label: '수비 정의 50', j: 50 },
    { label: '수비 정의 100', j: 100 },
  ].map(({ label, j }) => ({
    label,
    stats: runScenario(
      { name: label, attacker: side(10, { fear: 80 }), defender: side(8, { justice: j }) },
      trials,
      cfg,
      seed
    ),
  }));
  printTable('④ 정의 평판의 사기 저항 (10 공포80 vs 8)', justiceRows);

  // 5. 기세(drift) 눈덩이 점검 — 상한이 제대로 막는지
  const driftRows = [
    { label: 'drift 0 vs 0', ad: 0, dd: 0 },
    { label: 'drift +15 vs 0 (연승 최대)', ad: 15, dd: 0 },
    { label: 'drift +15 vs -15 (극단)', ad: 15, dd: -15 },
  ].map(({ label, ad, dd }) => ({
    label,
    stats: runScenario(
      { name: label, attacker: side(10, { driftPP: ad }), defender: side(10, { driftPP: dd }) },
      trials,
      cfg,
      seed
    ),
  }));
  printTable('⑤ 기세 눈덩이 점검 (상한이 결정론을 막는지)', driftRows);

  console.log(
    '\n설계 목표: ②에서 기준 15~20%, 포위/피로 조합이면 35~50%+ 로 올라가야 한다.'
  );
  console.log('⑤에서 극단 격차가 90%를 넘으면 눈덩이가 심한 것이므로 상한을 낮춰야 한다.\n');
}

main();
