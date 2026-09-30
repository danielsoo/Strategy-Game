"""공개 CC0 숲 바닥의 색·법선·거칠기를 PC 2K, 모바일 1K로 내려받는다."""
import pathlib,json,urllib.request,hashlib,concurrent.futures
root=pathlib.Path(__file__).resolve().parents[1]/'public/realm'
def read(url):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ChronicleOfCrowns/1.0'}),timeout=120) as r:return r.read()
meta=json.loads(read('https://api.polyhaven.com/files/forest_floor'))
jobs=[]
for folder,res in [('', '2k'),('mobile','1k')]:
    for channel,key in [('diff','Diffuse'),('nor_gl','nor_gl'),('rough','Rough')]:
        jobs.append((root/folder/'forest_floor'/(channel+'.jpg'),meta[key][res]['jpg']))
def fetch(job):
    path,entry=job
    if path.exists() and hashlib.md5(path.read_bytes()).hexdigest()==entry['md5']:return
    data=read(entry['url']);assert hashlib.md5(data).hexdigest()==entry['md5']
    path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(data)
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(fetch,jobs))
(root/'forest_floor'/'SOURCES.json').write_text(json.dumps([{'file':str(p.relative_to(root)),'url':e['url'],'md5':e['md5']} for p,e in jobs],indent=2))
print('숲 바닥 6개 재질 다운로드·MD5 검증 완료')
