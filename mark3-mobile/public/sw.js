// 오프라인 캐시 — 한 번 켠 판은 인터넷 없이도 켜지게
//
// 규칙은 둘뿐이다.
//   화면(HTML)   네트워크 먼저. 새 판을 올리면 다음에 켤 때 바로 새 것이 온다.
//                 인터넷이 없으면 캐시에서.
//   번들·그림    캐시 먼저. 이름에 내용 해시가 붙어 있어(bundles/web-<해시>.js)
//                 내용이 바뀌면 이름이 바뀐다 — 옛 것을 붙잡을 일이 없다.
//   /api         건드리지 않는다. 기록 전송은 늘 네트워크로.
//
// 서비스 워커를 잘못 짜면 고친 게 영영 안 보이는 앱이 된다. 그래서 HTML 은 절대
// 캐시 먼저로 두지 않는다.

const CACHE = 'mark3-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  const isPage = req.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html');
  if (isPage) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((r) => r || Response.error()))
    );
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
    )
  );
});
