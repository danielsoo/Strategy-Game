import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {FBXLoader} from 'three/examples/jsm/loaders/FBXLoader.js';
import {GLTFExporter} from 'three/examples/jsm/exporters/GLTFExporter.js';
const source=process.argv[2]??'.realm-source/paladin';
const character=process.argv[3]??'Paladin WProp J Nordstrom';
const output=process.argv[4]??'public/realm/paladin';
fs.mkdirSync(output,{recursive:true});
globalThis.window={URL};
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(v=>{this.result=v;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(v=>{this.result='data:application/octet-stream;base64,'+Buffer.from(v).toString('base64');this.onloadend?.();});}};
// Embedded images are copied losslessly; no browser canvas is needed to export.
T.TextureLoader.prototype.load=function(url){const t=new T.Texture();t.userData.source=url;return t;};
function load(name,directory=source){const buffer=fs.readFileSync(`${directory}/${name}.fbx`),version=buffer.readUInt32LE(23);let end=27;for(;;){const next=version>=7500?Number(buffer.readBigUInt64LE(end)):buffer.readUInt32LE(end);if(!next)break;if(next<=end||next>buffer.length)throw Error('FBX boundary');end=next;}const b=Buffer.concat([buffer.subarray(0,end),Buffer.alloc(176)]);return new FBXLoader().parse(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const scene=load(character),materials=[];
scene.scale.setScalar(.01);scene.updateMatrixWorld(true);
const restReference=load('sword and shield idle (4)');restReference.updateMatrixWorld(true);
scene.userData.nativeRightBind=restReference.getObjectByName('mixamorigRightHand').getWorldQuaternion(new T.Quaternion()).toArray();
scene.traverse(o=>{if(!o.isMesh)return;const uv=o.geometry.attributes.uv;if(uv)for(let i=0;i<uv.count;i++)uv.setY(i,1-uv.getY(i));const originals=Array.isArray(o.material)?o.material:[o.material];o.material=originals.map(old=>{
 const material=new T.MeshStandardMaterial({name:old.name,color:old.color,roughness:.55,metalness:.45,side:old.side,transparent:old.transparent,opacity:old.opacity,alphaTest:old.alphaTest});
 material.userData.maps={};for(const key of ['map','normalMap'])if(old[key])material.userData.maps[key]=old[key].userData.source;
 materials.push(material);return material;});if(o.material.length===1)o.material=o.material[0];console.log('mesh',o.name,o.geometry.attributes.position.count,originals.map(m=>m.name));});
const files={idle:'sword and shield idle (4)',slash:'sword and shield slash',cross:'sword and shield slash (3)',block:'sword and shield block',guard:'sword and shield block idle',release:'sword and shield block (2)',impact:'sword and shield impact',walk:'sword and shield walk'};
const animations=Object.entries(files).map(([name,file])=>{const c=load(file).animations[0];c.name=name;return c;});
// Extra captures are downloaded on each character in Mixamo. Preserve their
// native transforms instead of approximating retargeting across body types.
const profile=output.split('/').at(-1);
const extra={heavy:['axe','standing melee attack downward'],axeIdle:['axe','standing idle'],axeChop:['axe','standing melee attack downward'],axeSweep:['axe','standing melee attack horizontal'],axeBlock:['axe','standing block react large'],axeWalk:['axe','standing walk forward'],twoIdle:['greatsword','great sword idle'],twoChop:['greatsword','great sword slash'],twoSweep:['greatsword','great sword slash (3)'],twoBlock:['greatsword','great sword blocking'],twoWalk:['greatsword','great sword walk'],spearThrust:['paladin','Bayonet Stab']};
for(const [name,[dir,file]] of Object.entries(extra)){
 const directory=dir==='paladin'?source:`.realm-source/${profile==='paladin'?'':profile+'-'}${dir}`;
 const capture=load(file,directory),clip=capture.animations[0].clone();clip.name=name;
 animations.push(clip);
}
const spearGuard=animations.find(c=>c.name==='spearThrust').clone();spearGuard.name='spearGuard';spearGuard.duration=2;
for(const track of spearGuard.tracks){const n=track.getValueSize(),value=track.values.slice(0,n);track.times=new Float32Array([0,2]);track.values=new Float32Array([...value,...value]);}animations.push(spearGuard);
const gltf=await new GLTFExporter().parseAsync(scene,{binary:false,animations,onlyVisible:true});
gltf.images=[];gltf.textures=[];gltf.samplers=[{magFilter:9729,minFilter:9987,wrapS:10497,wrapT:10497}];
const saved=new Map();
for(const material of gltf.materials){for(const [key,url] of Object.entries(material.extras?.maps??{})){
 if(!saved.has(url)){const response=await fetch(url),bytes=Buffer.from(await response.arrayBuffer()),mime=response.headers.get('content-type'),file=`texture-${saved.size}.${mime?.includes('png')?'png':'jpg'}`;fs.writeFileSync(`${output}/${file}`,bytes);const index=gltf.images.length;gltf.images.push({uri:file});gltf.textures.push({source:index,sampler:0});saved.set(url,index);}
 const texture={index:saved.get(url)};if(key==='map')material.pbrMetallicRoughness.baseColorTexture=texture;else material.normalTexture=texture;
 }delete material.extras;}
for(let i=0;i<gltf.buffers.length;i++){const b=gltf.buffers[i];const bytes=Buffer.from(b.uri.split(',')[1],'base64'),file=`mesh-${createHash('sha256').update(bytes).digest('hex').slice(0,12)}.bin`;fs.writeFileSync(`${output}/${file}`,bytes);b.uri=file;}
fs.writeFileSync(`${output}/model.gltf`,JSON.stringify(gltf));
console.log('clips',animations.map(c=>c.name),'textures',saved.size);
