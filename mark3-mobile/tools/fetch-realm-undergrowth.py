"""CC0 풀과 고사리의 원본 UV·형상을 게임 자산으로 보존한다."""
import pathlib,json,urllib.request,hashlib,concurrent.futures
root=pathlib.Path(__file__).resolve().parents[1]/'public/realm'
def read(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ChronicleOfCrowns/1.0'}),timeout=120) as r:return r.read()
jobs=[]
for asset in ['grass_medium_01','fern_02']:
    meta=json.loads(read('https://api.polyhaven.com/files/'+asset))
    data=meta['gltf']['1k']['gltf']
    if 'Alpha' in meta:jobs.append((root/asset/'alpha.png',meta['Alpha']['1k']['png']))
    jobs.append((root/asset/'model.gltf',data))
    for name,item in data['include'].items():jobs.append((root/asset/name,item))
def fetch(job):
    path,entry=job
    if path.exists() and hashlib.md5(path.read_bytes()).hexdigest()==entry['md5']:return
    data=read(entry['url']);assert hashlib.md5(data).hexdigest()==entry['md5']
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(fetch,jobs))
(root/'grass_medium_01'/'SOURCES.json').write_text(json.dumps([{'file':str(p.relative_to(root)),'url':e['url'],'md5':e['md5']} for p,e in jobs],indent=2))
print('CC0 vegetation downloaded; MD5 verified')
