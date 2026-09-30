"""실제 소나무·관목을 추가한다. 원본은 로컬 캐시, 게임에는 경량 glTF만 배포한다."""
import pathlib,json,urllib.request,hashlib,concurrent.futures
base=pathlib.Path(__file__).resolve().parents[1]
def read(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ChronicleOfCrowns/1.0'}),timeout=180) as r:return r.read()
def fetch(job):
    p,e=job
    if not p.exists() or hashlib.md5(p.read_bytes()).hexdigest()!=e['md5']:
        data=read(e['url']);assert hashlib.md5(data).hexdigest()==e['md5'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
jobs=[]
for name in ['pine_sapling_small','shrub_01']:
    entry=json.loads(read('https://api.polyhaven.com/files/'+name))['gltf']['1k']['gltf']
    jobs.append((base/'.realm-source'/name/'model.gltf',entry))
    for filename,e in entry['include'].items():jobs.append((base/('.realm-source' if filename.endswith('.bin') else 'public/realm')/name/filename,e))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(fetch,jobs))
print('Vegetation source files downloaded and MD5 verified')
