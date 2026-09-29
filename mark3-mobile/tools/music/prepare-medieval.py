"""새 곡에 쓰는 SSO 원본만 내려받는다. 게임/기존 곡은 건드리지 않는다."""
from pathlib import Path
import concurrent.futures
import argparse
import json
import re
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.music-cache'
BASE = 'https://raw.githubusercontent.com/peastman/sso/'
SSO_COMMIT = '32bbdb169aef636b8216029a2e056424ba7c2abb'

def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as response:
        return response.read()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--extra-sfz', action='append', default=[])
    args = parser.parse_args()
    CACHE.mkdir(exist_ok=True)
    manifest = CACHE / 'sso-tree.json'
    if not manifest.exists():
        commit = SSO_COMMIT
        tree = json.loads(fetch(f'https://api.github.com/repos/peastman/sso/git/trees/{commit}?recursive=1'))
        tree['commit'] = commit
        manifest.write_text(json.dumps(tree), encoding='utf-8')
    tree = json.loads(manifest.read_text(encoding='utf-8'))
    paths = [x['path'] for x in tree['tree']]
    if not (ROOT / 'tools/music/medieval-instruments.json').exists():
        print('\n'.join(p for p in paths if p.endswith('.sfz') and ('Percussion' in p or p.count('/') == 1)))
        return
    instruments = json.loads((ROOT / 'tools/music/medieval-instruments.json').read_text(encoding='utf-8'))
    needed = set()
    def download(p):
        target = CACHE / 'sso' / p
        if not target.exists():
            data = fetch(BASE + tree['commit'] + '/' + urllib.parse.quote(p))
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        return target
    def sfz(p):
        if p in needed:
            return
        needed.add(p)
        data = download(p).read_text(encoding='utf-8-sig')
        for inc in re.findall(r'#include\s+"([^"]+)"', data):
            sfz((Path(p).parent / inc.replace('\\', '/')).as_posix())
        for sample in re.findall(r'sample=(.*?)(?=\s+\w+=|[\r\n<]|$)', data):
            # 이 라이브러리는 sample 경로가 항상 최상위 악기 파일 기준이다.
            name = sample.strip().replace('\\', '/').removeprefix('../')
            needed.add('Sonatina Symphonic Orchestra/' + name)
    for config in instruments.values():
        sfz('Sonatina Symphonic Orchestra/' + config['sfz'])
    for name in args.extra_sfz:
        sfz('Sonatina Symphonic Orchestra/' + name)
    needed.add('LICENSE')
    size = sum(x.get('size', 0) for x in tree['tree'] if x['path'] in needed)
    print(f'SSO {tree["commit"]}: {len(needed)} files, {size/1e6:.1f} MB', flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        for i, _ in enumerate(executor.map(download, sorted(needed))):
            if i % 25 == 0:
                print(f'{i+1}/{len(needed)}', flush=True)
    print('Samples ready', flush=True)

if __name__ == '__main__':
    main()
