"""piacenti의 CC-BY 3.0 기사를 glTF 표준 재질로 연결한다. KTX RGBA를 PNG로 무손실 변환한다."""
import json, pathlib, struct, shutil
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[1]
source=root/'.realm-source'/'armor'; out=root/'public'/'realm'/'knight'
out.mkdir(parents=True,exist_ok=True)
for name in ('colormap','normalmap'):
    data=(source/(name+'_rgba.ktx')).read_bytes()
    header=struct.unpack('<13I',data[12:64])
    assert header[:4]==(0x04030201,5121,1,6408)
    width,height=header[6:8]; offset=64+header[12]+4
    Image.frombytes('RGBA',(width,height),data[offset:offset+width*height*4]).save(out/(name+'.png'))
g=json.loads((source/'armor.gltf').read_text())
g['images']=[{'uri':'colormap.png'},{'uri':'normalmap.png'}]
g['samplers']=[{'magFilter':9729,'minFilter':9987,'wrapS':10497,'wrapT':10497}]
g['textures']=[{'source':0,'sampler':0},{'source':1,'sampler':0}]
g['materials']=[{'name':'Forged steel and leather','pbrMetallicRoughness':{'baseColorTexture':{'index':0},'metallicFactor':.72,'roughnessFactor':.48},'normalTexture':{'index':1,'scale':.7},'doubleSided':False}]
g['asset']['copyright']='Knight by piacenti, CC BY 3.0; https://opengameart.org/content/knight-2'
(out/'knight.gltf').write_text(json.dumps(g,separators=(',',':')))
shutil.copyfile(source/'license.txt',out/'LICENSE.txt')
(out/'CREDITS.md').write_text('''# Knight
Original model and textures by **piacenti**.
[Original work](https://opengameart.org/content/knight-2) · [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/).
glTF distribution: Sascha Willems, [Vulkan-Assets](https://github.com/SaschaWillems/Vulkan-Assets/tree/a27c0e584434d59b7c7a714e9180eefca6f0ec4b/models/armor).
Adaptation for this game: lossless RGBA KTX to PNG container conversion, standard glTF material assignment, runtime proportions, equipment and formations. 2026-09-30. No endorsement implied.
''',encoding='utf8')
print('Knight geometry and 1024px color/normal maps prepared')
