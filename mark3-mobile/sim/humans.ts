// 모인 사람 기록을 꺼낸다
//
// 가족들이 둔 판은 api/matches.ts 를 거쳐 MongoDB 에 쌓인다. 이걸로 PC 에
// 내려받아 하네스와 같은 눈으로 본다. 연결 문자열은 환경변수로만 받는다 —
// 저장소에 적으면 DB 가 통째로 새어나간다.
//
//   MONGODB_URI='mongodb+srv://...' npm run sim:humans
//
// 받은 것은 sim/humans.json 에 둔다(가족 기록이라 커밋하지 않는다 — .gitignore).
// 규칙 도장별로 나눠 센다. 도장이 다른 기록은 다른 게임의 기록이다.

import { writeFileSync } from 'fs';
import { join } from 'path';
import { MongoClient } from 'mongodb';
import { rulesStamp } from '../src/engine/stamp';

(async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI 가 없다 — MONGODB_URI='mongodb+srv://...' npm run sim:humans");
    process.exit(1);
  }
  const client = new MongoClient(uri);
  await client.connect();
  try {
    const docs = await client
      .db(process.env.MONGODB_DB || 'game')
      .collection('matches')
      .find()
      .sort({ firstSeenAt: 1 })
      .toArray();
    const out = join(__dirname, 'humans.json');
    writeFileSync(out, JSON.stringify(docs, null, 1));

    const now = rulesStamp();
    console.log(`${docs.length}판 → ${out}`);
    console.log(`지금 규칙 도장 ${now}\n`);
    console.log('이름        기기      판  끝낸판  턴(평균)  지금규칙');
    const by = new Map<string, any[]>();
    for (const d of docs) {
      const k = `${d.player}\t${d.device ?? '-'}`;
      by.set(k, [...(by.get(k) ?? []), d]);
    }
    for (const [k, list] of by) {
      const [player, device] = k.split('\t');
      const done = list.filter((d) => d.result && d.result.winner !== null).length;
      const avg = list.reduce((s, d) => s + (d.turnCount ?? 0), 0) / list.length;
      const cur = list.filter((d) => d.stamp === now).length;
      console.log(
        `${player.padEnd(10)}  ${device.padEnd(8)}  ${String(list.length).padStart(2)}  ` +
          `${String(done).padStart(6)}  ${avg.toFixed(1).padStart(8)}  ${String(cur).padStart(8)}`
      );
    }
  } finally {
    await client.close();
  }
})();
