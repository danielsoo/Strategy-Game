"""Millennium A.D.의 CC BY-SA 3.0 건축을 출처·UV·법선을 보존해 glTF로 변환한다.
원본 소프트웨어 코드는 사용하지 않는다. 결과 아트 파일도 CC BY-SA 3.0이다.
"""
import json,pathlib,urllib.request,urllib.error,xml.etree.ElementTree as ET,math,shutil
import numpy as np

ROOT=pathlib.Path(__file__).resolve().parents[1]
CACHE=ROOT/'.realm-source'/'millennium'
OUT=ROOT/'public'/'realm'/'medieval'
REV='91636b405ee8d0088ec3a34fba6074dbd5c9d0f3'
BASE=f'https://raw.githubusercontent.com/0ADMods/millenniumad/{REV}/'
OUT.mkdir(parents=True,exist_ok=True)
SOURCES={}
def get(path):
    p=CACHE/path
    url=BASE+path
    marker=p.with_suffix(p.suffix+'.url')
    if not p.exists():
        p.parent.mkdir(parents=True,exist_ok=True)
        try:
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ChronicleOfCrowns-ArtBuild'}),timeout=90) as r:p.write_bytes(r.read())
        except urllib.error.HTTPError as e:
            if e.code!=404 or not path.startswith('art/'):raise
            url='https://raw.githubusercontent.com/0ad/0ad/master/binaries/data/mods/public/'+path
            with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'ChronicleOfCrowns-ArtBuild'}),timeout=90) as r:p.write_bytes(r.read())
            marker.write_text(url)
    SOURCES[path]=marker.read_text() if marker.exists() else url
    return p
def xml(path):
    root=ET.parse(get(path)).getroot()
    for e in root.iter():e.tag=e.tag.split('}')[-1]
    return root

def matrix(node):
    m=np.eye(4)
    for e in node:
        if e.tag not in ('matrix','translate','scale','rotate'):continue
        a=np.fromstring(e.text,sep=' ');t=np.eye(4)
        if e.tag=='matrix':t=a.reshape(4,4)
        elif e.tag=='translate':t[:3,3]=a
        elif e.tag=='scale':t[:3,:3]=np.diag(a)
        else:
            x,y,z=a[:3]/np.linalg.norm(a[:3]);c=math.cos(math.radians(a[3]));s=math.sin(math.radians(a[3]));v=1-c
            t[:3,:3]=[[x*x*v+c,x*y*v-z*s,x*z*v+y*s],[y*x*v+z*s,y*y*v+c,y*z*v-x*s],[z*x*v-y*s,z*y*v+x*s,z*z*v+c]]
        m=m@t
    return m

def collada(path):
    doc=xml('art/meshes/'+path);geos={};source={}
    for e in doc.findall('.//source'):
        f=e.find('float_array');acc=e.find('technique_common/accessor')
        if f is not None and acc is not None:source[e.attrib['id']]=np.fromstring(f.text,sep=' ').reshape(-1,int(acc.get('stride','1')))
    for e in doc.findall('.//vertices'):
        p=e.find("input[@semantic='POSITION']");source[e.attrib['id']]=source[p.get('source')[1:]]
    for g in doc.findall('.//geometry'):
        parts=[]
        for p in list(g.find('mesh')):
            if p.tag not in ('triangles','polylist'):continue
            inputs=list(p.findall('input'));stride=max(int(i.get('offset','0')) for i in inputs)+1
            raw=np.fromstring(p.findtext('p'),sep=' ',dtype=np.int64).reshape(-1,stride)
            if p.tag=='polylist':
                sizes=np.fromstring(p.findtext('vcount'),sep=' ',dtype=np.int64);tri=[];cursor=0
                for n in sizes:
                    for k in range(1,n-1):tri.extend([raw[cursor],raw[cursor+k],raw[cursor+k+1]])
                    cursor+=n
                raw=np.array(tri)
            attrs={}
            for i in inputs:
                semantic=i.get('semantic');key='POSITION' if semantic=='VERTEX' else 'NORMAL' if semantic=='NORMAL' else 'TEXCOORD_'+i.get('set','0') if semantic=='TEXCOORD' else None
                if key is None:continue
                a=source[i.get('source')[1:]][raw[:,int(i.get('offset','0'))]].copy()
                if key.startswith('TEXCOORD'):a=a[:,:2];a[:,1]=1-a[:,1]
                attrs[key]=a
            parts.append(attrs)
        geos[g.get('id')]=parts
    axis=np.eye(4)
    if doc.findtext('asset/up_axis')=='Z_UP':axis[:3,:3]=[[1,0,0],[0,0,1],[0,-1,0]]
    # 0 A.D. 의 모델은 메타데이터 단위와 무관하게 게임 좌표로 저작되었다. 공통 배율은 배치 단계에서 정한다.
    result=[];props={}
    def visit(node,parent):
        m=parent@matrix(node)
        name=node.get('name',node.get('id',''))
        if name.startswith('prop'):props[name]=m
        for inst in node.findall('instance_geometry'):
            for attributes in geos[inst.get('url')[1:]]:
                a={k:v.copy() for k,v in attributes.items()}
                a['POSITION']=(np.c_[a['POSITION'],np.ones(len(a['POSITION']))]@m.T)[:,:3]
                if 'NORMAL' in a:
                    a['NORMAL']=a['NORMAL']@np.linalg.inv(m[:3,:3]);a['NORMAL']/=np.maximum(np.linalg.norm(a['NORMAL'],axis=1,keepdims=True),1e-8)
                if np.linalg.det(m[:3,:3])<0:a={k:v.reshape(-1,3,v.shape[1])[:,[0,2,1],:].reshape(v.shape) for k,v in a.items()}
                result.append(a)
        for child in node.findall('node'):visit(child,m)
    for n in doc.findall('.//visual_scene/node'):visit(n,axis)
    return result,props

gltf={'asset':{'version':'2.0','generator':'Chronicle of Crowns COLLADA asset converter','copyright':'The Council of Modders, Fallen Empire Studio, Scion Development; CC BY-SA 3.0; adapted 2026-09-30'},'scenes':[{'nodes':[]}],'scene':0,'nodes':[],'meshes':[],'materials':[],'textures':[],'images':[],'samplers':[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}],'accessors':[],'bufferViews':[]}
chunks=[];length=0;texcache={};matcache={};catalog={}
def texture(path):
    if path in texcache:return texcache[path]
    f=get('art/textures/skins/'+path);dest=OUT/'textures'/path;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(f,dest)
    index=len(gltf['textures']);gltf['images'].append({'uri':'textures/'+path});gltf['textures'].append({'source':index,'sampler':0});texcache[path]=index;return index
def material(textures,uv1):
    key=json.dumps(textures,sort_keys=True)+str(uv1)
    if key in matcache:return matcache[key]
    m={'name':textures['baseTex'],'pbrMetallicRoughness':{'baseColorTexture':{'index':texture(textures['baseTex'])},'metallicFactor':0,'roughnessFactor':.93},'doubleSided':True,'alphaMode':'OPAQUE'}
    if 'normTex' in textures:m['normalTexture']={'index':texture(textures['normTex']),'scale':.55}
    if 'aoTex' in textures and uv1:m['occlusionTexture']={'index':texture(textures['aoTex']),'texCoord':1,'strength':.82}
    index=len(gltf['materials']);gltf['materials'].append(m);matcache[key]=index;return index
def accessor(a):
    global length
    a=a.astype('<f4');data=a.tobytes();idx=len(gltf['accessors']);gltf['bufferViews'].append({'buffer':0,'byteOffset':length,'byteLength':len(data)});chunks.append(data);length+=len(data)
    gltf['accessors'].append({'bufferView':len(gltf['bufferViews'])-1,'componentType':5126,'count':len(a),'type':'VEC'+str(a.shape[1]),'min':a.min(axis=0).tolist(),'max':a.max(axis=0).tolist()});return idx
def actor(path,depth=0):
    doc=xml('art/actors/'+path);variants=[]
    for variant in doc.findall('group/variant'):
        mesh=variant.findtext('mesh')
        if mesh is None:continue
        textures={t.get('name'):t.get('file') for t in variant.findall('textures/texture')}
        # 이 두 메시의 UV는 목재/석재 공용 아틀라스 기준이다. 원본 actor의 대체 아틀라스 연결을 보정한다.
        if pathlib.Path(mesh).stem in ('caro_fortress_struct_02','caro_stable'):
            textures['baseTex']='structural/caro_struct.png'
            textures['normTex']='structural/caro_struct_norm.png'
        if 'baseTex' not in textures:continue
        parts,props=collada(mesh);spec=[(p,textures) for p in parts]
        if depth<1:
            for prop in variant.findall('props/prop'):
                name=prop.get('actor','');attach=prop.get('attachpoint')
                if '/carolingian/' in name and attach=='root':
                    for _,sub in actor(name,depth+1)[:1]:spec.extend(sub)
        variants.append((pathlib.Path(mesh).stem,spec))
    return variants

actors=['house','longhouse','civil_centre','church','lorsch_abbey','fortress','mayenne','market','blacksmith','farmstead','stables','storehouse','wall_long','wall_gate','wall_tower']
for name in actors:
    for asset,parts in actor('structures/carolingian/'+name+'.xml'):
        if asset in catalog:continue
        primitives=[]
        for attrs,maps in parts:primitives.append({'attributes':{k:accessor(v) for k,v in attrs.items()},'material':material(maps,'TEXCOORD_1' in attrs)})
        meshIndex=len(gltf['meshes']);gltf['meshes'].append({'name':asset,'primitives':primitives});gltf['nodes'].append({'name':asset,'mesh':meshIndex});gltf['scenes'][0]['nodes'].append(meshIndex)
        pos=np.concatenate([p['POSITION'] for p,_ in parts]);catalog[asset]={'bounds':[pos.min(axis=0).tolist(),pos.max(axis=0).tolist()],'triangles':len(pos)//3};print(asset,len(pos)//3)
gltf['buffers']=[{'uri':'architecture.bin','byteLength':length}]
(OUT/'architecture.bin').write_bytes(b''.join(chunks));(OUT/'architecture.gltf').write_text(json.dumps(gltf,separators=(',',':')),encoding='utf8')
(OUT/'catalog.json').write_text(json.dumps(catalog,indent=2),encoding='utf8')
shutil.copyfile(get('art/license.txt'),OUT/'LICENSE.txt')
shutil.copyfile(get('art/LICENSE.txt'),OUT/'LICENSE-Wildfire-Games.txt')
(OUT/'SOURCES.json').write_text(json.dumps({'revision':REV,'license':'CC-BY-SA-3.0','authors':'The Council of Modders, Fallen Empire Studio, Scion Development','source':BASE,'changes':'COLLADA to glTF; world transforms and Z-up conversion; V coordinate conversion; material/AO mapping; root props merged; stable and secondary fortress atlas corrected. 2026-09-30.','files':SOURCES},indent=2),encoding='utf8')
print('Architecture complete:',len(catalog),'assets;',length,'geometry bytes')
