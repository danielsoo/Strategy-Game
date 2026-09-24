// 사람이 둔 판을 한곳에 모은다 — Vercel 서버 함수
//
// 가족들이 각자 브라우저에서 두면 기록이 그 브라우저에만 남는다. '기록
// 내보내기' 로 파일을 보내 달라고 하면 현실에서는 안 온다. 그래서 매 턴
// 여기로 보내 MongoDB 에 쌓는다.
//
// 브라우저가 MongoDB 에 바로 붙지 않는 것은 일부러다. 연결 문자열이 게임
// 코드에 들어가면 누구나 DB 를 통째로 읽고 지울 수 있다. 연결 문자열은
// Vercel 환경변수 MONGODB_URI 에만 있다.
//
// 받기만 하고 내주지 않는다(GET 없음). 모인 것은 PC 에서 연결 문자열로 직접
// 읽는다 — 가족 기록을 아무나 볼 수 있는 주소를 만들 이유가 없다.
//
// 턴마다 판 전체를 덮어쓴다. 조각(그 턴만)을 보내면 요청 하나가 빠질 때
// 기록에 구멍이 나지만, 전체를 덮으면 다음 턴이 저절로 메운다. 백 턴짜리가
// 50KB 남짓이라 그 값을 치를 만하다.

import { MongoClient, Collection } from 'mongodb';

const DB = process.env.MONGODB_DB || 'game';
const COLL = 'matches';
/** 백 턴 50KB. 넉넉히 스무 배. Vercel 의 요청 한도(4.5MB)보다 한참 아래다. */
const MAX_BYTES = 1_000_000;
const ID_RE = /^[a-z0-9]{4,16}-[a-z0-9]{4,12}$/;

// 함수가 데워져 있는 동안은 연결을 다시 쓴다. 요청마다 새로 붙으면
// Atlas 무료 등급의 연결 수 한도(500)를 금방 채운다.
let collPromise: Promise<Collection> | null = null;
function coll(): Promise<Collection> {
  if (!collPromise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI 가 없다');
    collPromise = new MongoClient(uri, { maxPoolSize: 5 })
      .connect()
      .then((c) => c.db(DB).collection(COLL))
      .catch((e) => {
        collPromise = null; // 다음 요청에서 다시 붙어본다
        throw e;
      });
  }
  return collPromise;
}

// @vercel/node 를 들이지 않으려고 쓰는 만큼만 적었다.
interface Req {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
}

/** 받을 만한 기록인가. 아니면 까닭을 준다. */
function reject(m: any): string | null {
  if (!m || typeof m !== 'object') return '형식';
  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) return 'id';
  if (typeof m.version !== 'number') return 'version';
  if (typeof m.stamp !== 'string' || m.stamp.length > 64) return 'stamp';
  if (typeof m.player !== 'string' || m.player.length > 24) return 'player';
  if (typeof m.startedAt !== 'string' || m.startedAt.length > 40) return 'startedAt';
  if (!Array.isArray(m.turns) || m.turns.length > 5000) return 'turns';
  if (m.device !== undefined && (typeof m.device !== 'string' || m.device.length > 40))
    return 'device';
  return null;
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false });
  }
  let m: any = req.body;
  if (typeof m === 'string') {
    try {
      m = JSON.parse(m);
    } catch {
      return res.status(400).json({ ok: false, why: 'json' });
    }
  }
  if (JSON.stringify(m ?? null).length > MAX_BYTES) {
    return res.status(413).json({ ok: false, why: 'size' });
  }
  const why = reject(m);
  if (why) return res.status(400).json({ ok: false, why });

  // 서버가 매기는 칸은 받지 않는다. 같이 오면 $set 과 $setOnInsert 가 부딪힌다.
  const { id, _id, turnCount: _t, updatedAt: _u, firstSeenAt: _f, ...rest } = m;
  const turnCount = m.turns.length;
  const now = new Date();
  try {
    const c = await coll();
    /*
      늦게 도착한 옛 요청이 새 기록을 덮지 않게 한다. 턴 수가 같거나 늘어난
      것만 덮고, 줄어든 것은 조건에 안 걸려 upsert 가 같은 _id 로 새로 넣으려다
      중복 키(11000)로 튕긴다 — 그건 실패가 아니라 '이미 더 새 것이 있다' 다.
    */
    await c.updateOne(
      { _id: id as any, turnCount: { $lte: turnCount } },
      {
        $set: { ...rest, turnCount, updatedAt: now },
        $setOnInsert: { firstSeenAt: now },
      },
      { upsert: true }
    );
    return res.status(200).json({ ok: true });
  } catch (e: any) {
    if (e?.code === 11000) return res.status(200).json({ ok: true, stale: true });
    console.error('matches 저장 실패', e?.message);
    return res.status(500).json({ ok: false });
  }
}
