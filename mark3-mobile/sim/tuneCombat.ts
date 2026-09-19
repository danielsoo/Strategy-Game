// 전투 상수 자동 탐색
//
// 설계 목표를 승률 표로 적어두고, 상수 조합을 격자 탐색해 목표에 가장 가까운 걸 찾는다.
// 감으로 숫자를 만지는 대신 "원하는 게임 느낌"을 먼저 선언하고 거기에 맞춘다.
//
//   npm run sim:tune
//   npm run sim:tune -- --trials 4000
//
// 나중에 AI 평가 함수 가중치를 자가대전으로 학습시킬 때도 같은 구조를 쓴다:
// 목표(승률)를 정의하고 → 파라미터 공간을 탐색하고 → 점수로 고른다.

import {
  resolveCombat,
  makeRng,
  DEFAULT_COMBAT_CONFIG,
  CombatConfig,
  CombatSide,
} from '../src/services/combatSystem';

function side(units: number, extra: Partial<CombatSide> = {}): CombatSide {
  return { units, morale: 100, exhaustion: 0, driftPP: 0, fear: 50, justice: 50, ...extra };
}

/** 측정 항목: 이름, 시나리오, 목표값, 가중치 */
interface Target {
  key: string;
  attacker: CombatSide;
  defender: CombatSide;
  /** 'attacker' = 공격 승률, 'stalemate' = 교착률 */
  measure: 'attacker' | 'stalemate';
  goal: number;
  weight: number;
}

const TARGETS: Target[] = [
  // 기본 전력비 — 대등은 반반, 우세는 확실히 유리하되 절대적이진 않게
  { key: '10v10', attacker: side(10), defender: side(10), measure: 'attacker', goal: 0.47, weight: 2 },
  { key: '10v7 ', attacker: side(10), defender: side(7), measure: 'attacker', goal: 0.75, weight: 1 },
  { key: '10v5 ', attacker: side(10), defender: side(5), measure: 'attacker', goal: 0.88, weight: 1 },
  // 핵심: 열세도 가끔은 이긴다. 운이지만 무시할 수 없는 확률.
  { key: '5v10 ', attacker: side(5), defender: side(10), measure: 'attacker', goal: 0.17, weight: 3 },
  { key: '3v10 ', attacker: side(3), defender: side(10), measure: 'attacker', goal: 0.04, weight: 2 },
  // 조건을 만들면 열세가 대등해진다 — 설계의 심장
  {
    key: '5v10 포위',
    attacker: side(5),
    defender: side(10, { encircled: true }),
    measure: 'attacker',
    goal: 0.5,
    weight: 3,
  },
  {
    key: '5v10 적피로70',
    attacker: side(5),
    defender: side(10, { exhaustion: 70 }),
    measure: 'attacker',
    goal: 0.33,
    weight: 2,
  },
  // 교착이 존재해야 전선과 소모전이 생긴다
  { key: '교착률', attacker: side(10), defender: side(10), measure: 'stalemate', goal: 0.12, weight: 2 },
  // 기세 눈덩이 상한 — 극단 격차여도 결정론이 되면 안 된다
  {
    key: 'drift극단',
    attacker: side(10, { driftPP: 15 }),
    defender: side(10, { driftPP: -15 }),
    measure: 'attacker',
    goal: 0.7,
    weight: 2,
  },
];

function measure(t: Target, trials: number, cfg: CombatConfig, seed: number): number {
  const rng = makeRng(seed);
  let hits = 0;
  for (let i = 0; i < trials; i++) {
    const r = resolveCombat(t.attacker, t.defender, rng, cfg);
    if (t.measure === 'attacker' ? r.outcome === 'attacker-win' : r.outcome === 'stalemate') hits++;
  }
  return hits / trials;
}

function score(cfg: CombatConfig, trials: number, seed: number) {
  let total = 0;
  const detail: Record<string, number> = {};
  for (const t of TARGETS) {
    const v = measure(t, trials, cfg, seed);
    detail[t.key] = v;
    const err = v - t.goal;
    total += t.weight * err * err;
  }
  return { total, detail };
}

function parseArg(name: string, fallback: number): number {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return fallback;
  const v = Number(process.argv[i + 1]);
  return Number.isFinite(v) ? v : fallback;
}

function main() {
  const trials = parseArg('trials', 3000);
  const seed = parseArg('seed', 987654);

  // 가장 영향이 큰 손잡이들만 성기게 훑는다
  // routThreshold(붕괴 임계치)는 교착률을 좌우하는 유일한 구조적 손잡이다.
  // 임계치가 낮으면 쉽게 안 무너져 6라운드를 버티고 교착이 생긴다.
  const grid = {
    roundSwing: [0.8, 0.95],
    // 손실률은 사기 하락 속도를 직접 정한다. 낮추면 6라운드를 버텨 교착이 생긴다.
    baseLossRate: [0.06, 0.08, 0.1],
    moraleLossMultiplier: [1.0, 1.2, 1.4],
    maxRounds: [5, 6],
    encircleMoralePenalty: [5, 6],
    resolvePowerScale: [10],
    routThreshold: [20, 25, 30],
    moraleDecayPerRound: [0, 0.12, 0.22],
  };

  const combos: CombatConfig[] = [];
  for (const rs of grid.roundSwing)
    for (const bl of grid.baseLossRate)
      for (const ml of grid.moraleLossMultiplier)
        for (const mr of grid.maxRounds)
          for (const en of grid.encircleMoralePenalty)
            for (const rp of grid.resolvePowerScale)
              for (const rt of grid.routThreshold)
                for (const md of grid.moraleDecayPerRound)
                combos.push({
                  ...DEFAULT_COMBAT_CONFIG,
                  roundSwing: rs,
                  baseLossRate: bl,
                  moraleLossMultiplier: ml,
                  maxRounds: mr,
                  encircleMoralePenalty: en,
                  resolvePowerScale: rp,
                  routThreshold: rt,
                  moraleDecayPerRound: md,
                  resolveCapPP: Math.max(DEFAULT_COMBAT_CONFIG.resolveCapPP, rp + 5),
                });

  console.log(
    `조합 ${combos.length}개 × 시나리오 ${TARGETS.length}개 × ${trials.toLocaleString()}회 탐색 중...\n`
  );

  const scored = combos
    .map((cfg) => ({ cfg, ...score(cfg, trials, seed) }))
    .sort((a, b) => a.total - b.total);

  const header =
    '순위  점수   swing  손실률 사기배수 라운드 포위 붕괴  참호 ' + TARGETS.map((t) => t.key.padStart(9)).join('');
  console.log(header);
  console.log('─'.repeat(header.length + 4));
  console.log(
    '목표                                                   ' +
      TARGETS.map((t) => (t.goal * 100).toFixed(0).padStart(8) + '%').join('')
  );
  console.log('─'.repeat(header.length + 4));

  for (let i = 0; i < 8; i++) {
    const s = scored[i];
    console.log(
      String(i + 1).padStart(3) +
        s.total.toFixed(4).padStart(8) +
        s.cfg.roundSwing.toFixed(2).padStart(7) +
        s.cfg.baseLossRate.toFixed(2).padStart(7) +
        s.cfg.moraleLossMultiplier.toFixed(2).padStart(9) +
        String(s.cfg.maxRounds).padStart(6) +
        String(s.cfg.encircleMoralePenalty).padStart(5) +
        String(s.cfg.routThreshold).padStart(5) +
        s.cfg.moraleDecayPerRound.toFixed(2).padStart(6) +
        '  ' +
        TARGETS.map((t) => (s.detail[t.key] * 100).toFixed(1).padStart(8) + '%').join('')
    );
  }

  const best = scored[0];
  console.log('\n최적 조합:');
  console.log(
    JSON.stringify(
      {
        roundSwing: best.cfg.roundSwing,
        moraleLossMultiplier: best.cfg.moraleLossMultiplier,
        maxRounds: best.cfg.maxRounds,
        encircleMoralePenalty: best.cfg.encircleMoralePenalty,
        baseLossRate: best.cfg.baseLossRate,
        resolvePowerScale: best.cfg.resolvePowerScale,
        routThreshold: best.cfg.routThreshold,
        moraleDecayPerRound: best.cfg.moraleDecayPerRound,
        resolveCapPP: best.cfg.resolveCapPP,
      },
      null,
      2
    )
  );
}

main();
