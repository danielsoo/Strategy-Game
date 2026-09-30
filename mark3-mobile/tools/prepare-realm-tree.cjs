// 실사 수목의 UV와 법선을 보존하면서 캠페인용 LOD를 만든다.
const fs=require('node:fs'),path=require('node:path');
const {MeshoptSimplifier}=require('meshoptimizer');
async function main(){
 await MeshoptSimplifier.ready;
 const asset=process.argv[2]||'tree_small_02';
 if(!['tree_small_02','pine_sapling_small','shrub_01'].includes(asset))throw new Error('Unknown vegetation asset');
 const root=path.join(__dirname,'../public/realm',asset);
 const originals=path.join(__dirname,'../.realm-source',asset);
 const source=JSON.parse(fs.readFileSync(path.join(originals,'model.gltf'),'utf8'));
 const bin=fs.readFileSync(path.join(originals,source.buffers[0].uri));
 const components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
 const read=id=>{const a=source.accessors[id],v=source.bufferViews[a.bufferView];const C=a.componentType===5126?Float32Array:a.componentType===5125?Uint32Array:Uint16Array;
   const n=components[a.type],out=new C(a.count*n),offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||n*C.BYTES_PER_ELEMENT;
   for(let i=0;i<a.count;i++)for(let j=0;j<n;j++)out[i*n+j]=C===Float32Array?bin.readFloatLE(offset+i*stride+j*4):C===Uint32Array?bin.readUInt32LE(offset+i*stride+j*4):bin.readUInt16LE(offset+i*stride+j*2);return out;};
 const output={...source,accessors:[],bufferViews:[]};let chunks=[],bytes=0,total=0;
 const append=(data,type,min,max)=>{const b=Buffer.from(data.buffer,data.byteOffset,data.byteLength);const id=output.accessors.length;
   output.bufferViews.push({buffer:0,byteOffset:bytes,byteLength:b.length});output.accessors.push({bufferView:output.bufferViews.length-1,componentType:data instanceof Float32Array?5126:5125,count:data.length/components[type],type,...(min?{min,max}:{})});chunks.push(b);bytes+=b.length;return id;};
 output.meshes=source.meshes.map(m=>({...m,primitives:m.primitives.map((p,part)=>{
   const positions=read(p.attributes.POSITION),indices=new Uint32Array(read(p.indices));
   const [simple,error]=MeshoptSimplifier.simplify(indices,positions,3,part===1?24000:4500,.12);
   const [remap,count]=MeshoptSimplifier.compactMesh(simple); const attributes={};
   for(const [name,id] of Object.entries(p.attributes)) {const src=read(id),type=source.accessors[id].type,n=components[type],dst=new Float32Array(count*n);for(let i=0;i<remap.length;i++)if(remap[i]!==0xffffffff)for(let j=0;j<n;j++)dst[remap[i]*n+j]=src[i*n+j];
     attributes[name]=append(dst,type,source.accessors[id].min,source.accessors[id].max);}
   total+=simple.length/3;console.log('part',part,'triangles',indices.length/3,'->',simple.length/3,'error',error);
   return {...p,attributes,indices:append(simple,'SCALAR')};
 })}));
 output.buffers=[{uri:'campaign-tree.bin',byteLength:bytes}];
 output.materials=output.materials.map(m=>({...m,alphaMode:m.alphaMode||'OPAQUE'}));
 fs.writeFileSync(path.join(root,'campaign-tree.bin'),Buffer.concat(chunks));fs.writeFileSync(path.join(root,'campaign-tree.gltf'),JSON.stringify(output));
 console.log('campaign tree:',total,'triangles,',bytes,'bytes');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
