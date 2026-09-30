import fs from 'node:fs';
import * as T from 'three';
const gltf=JSON.parse(fs.readFileSync('public/realm/knight/knight.gltf','utf8'));
const bytes=Buffer.from(gltf.buffers[0].uri.split(',')[1],'base64');
const component:any={5126:Float32Array,5123:Uint16Array,5125:Uint32Array};
function attr(i:number){const a=gltf.accessors[i],v=gltf.bufferViews[a.bufferView],size:any={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};const C=component[a.componentType],offset=(a.byteOffset??0)+(v.byteOffset??0);return new T.BufferAttribute(new C(bytes.buffer.slice(bytes.byteOffset+offset,bytes.byteOffset+offset+a.count*size[a.type]*C.BYTES_PER_ELEMENT)),size[a.type]);}
export function testKnightScene(){const scene=new T.Group();for(const n of gltf.nodes){if(n.mesh===undefined)continue;const prim=gltf.meshes[n.mesh].primitives[0],g=new T.BufferGeometry();for(const [key,name] of [['POSITION','position'],['NORMAL','normal'],['TEXCOORD_0','uv'],['TANGENT','tangent']])if(prim.attributes[key]!==undefined)g.setAttribute(name,attr(prim.attributes[key]));g.setIndex(attr(prim.indices));const mesh=new T.Mesh(g,new T.MeshStandardMaterial({side:T.DoubleSide}));mesh.name=n.name.replaceAll('.','');mesh.position.fromArray(n.translation??[0,0,0]);mesh.quaternion.fromArray(n.rotation??[0,0,0,1]);scene.add(mesh);}
return scene;}
