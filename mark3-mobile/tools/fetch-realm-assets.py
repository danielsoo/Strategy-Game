"""Poly Haven 공개 API에서 게임용 CC0 자산을 내려받는다. 런타임 외부 요청은 없다."""
import concurrent.futures, hashlib, json, pathlib, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'public' / 'realm'
ROOT.mkdir(parents=True, exist_ok=True)
SOURCE = ROOT.parents[1] / '.realm-source'
MANIFEST = []

def read(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'ChronicleOfCrowns-AssetBuild/1.0'})
    with urllib.request.urlopen(req, timeout=180) as response:
        return response.read()

def fetch(item):
    path, entry = item
    if not path.exists() or hashlib.md5(path.read_bytes()).hexdigest() != entry['md5']:
        data = read(entry['url'])
        assert hashlib.md5(data).hexdigest() == entry['md5'], str(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return path.stat().st_size

jobs = []
for name, size in [('modular_fort_01','2k'),('modular_fort_01','1k'),('tree_small_02','1k'),('rock_face_01','2k'),('rock_face_01','1k')]:
    files = json.loads(read(f'https://api.polyhaven.com/files/{name}'))
    entry = files['gltf'][size]['gltf']
    folder=ROOT/('mobile' if size=='1k' and name!='tree_small_02' else '')/name
    jobs.append(((SOURCE/name if name=='tree_small_02' else folder)/'model.gltf',entry))
    jobs.extend(((SOURCE/name if name=='tree_small_02' and filename.endswith('.bin') else folder)/filename,item) for filename,item in entry['include'].items())
    MANIFEST.append({'asset':name,'source':f'https://polyhaven.com/a/{name}','license':'CC0-1.0','resolution':size})

for name in ['aerial_grass_rock','grass_ground','aerial_rocks_02','medieval_blocks_05','medieval_wood','grey_roof_tiles','rough_plaster_03']:
    files = json.loads(read(f'https://api.polyhaven.com/files/{name}'))
    for size in ['2k','1k']:
      for channel in ['diff','nor_gl','rough']:
        key=channel if channel in files else {'diff':'Diffuse','rough':'Rough'}.get(channel,channel)
        entry=files[key][size]['jpg']
        jobs.append((ROOT/('mobile' if size=='1k' else '')/name/f'{channel}.jpg',entry))
    MANIFEST.append({'asset':name,'source':f'https://polyhaven.com/a/{name}','license':'CC0-1.0','resolution':'2k'})

with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
    total=sum(pool.map(fetch,jobs))
(ROOT/'sources.json').write_text(json.dumps(MANIFEST,indent=2)+'\n',encoding='utf-8')
print(f'{len(jobs)} files / {total/1024/1024:.1f} MiB downloaded and MD5 verified')
