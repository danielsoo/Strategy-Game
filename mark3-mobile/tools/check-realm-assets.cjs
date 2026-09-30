const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'../public/realm');
for(const relative of ['grass_medium_01/model.gltf','fern_02/model.gltf','knight/knight.gltf','medieval/architecture.gltf','modular_fort_01/model.gltf','mobile/modular_fort_01/model.gltf','rock_face_01/model.gltf','mobile/rock_face_01/model.gltf','tree_small_02/campaign-tree.gltf','pine_sapling_small/campaign-tree.gltf','shrub_01/campaign-tree.gltf']){
 const filename=path.join(root,relative),g=JSON.parse(fs.readFileSync(filename));
 for(const entry of [...g.buffers,...g.images])assert(entry.uri.startsWith('data:')||fs.existsSync(path.resolve(path.dirname(filename),entry.uri)),`누락된 자산: ${entry.uri}`);
 for(const view of g.bufferViews)assert((view.byteOffset||0)+view.byteLength<=g.buffers[view.buffer].byteLength,'모델 버퍼 범위 초과');
 for(const mesh of g.meshes)for(const p of mesh.primitives){const count=g.accessors[p.attributes.POSITION].count;assert(count>0);for(const a of Object.values(p.attributes))assert.equal(g.accessors[a].count,count);}
 console.log(relative,'자산 참조·형상 버퍼 통과');
}
for(const prefix of ['', 'mobile/'])for(const material of ['forest_floor','grass_ground','aerial_rocks_02','medieval_blocks_05','medieval_wood','grey_roof_tiles','rough_plaster_03'])for(const channel of ['diff','nor_gl','rough'])assert(fs.statSync(path.join(root,prefix,material,channel+'.jpg')).size>1000);
assert(fs.existsSync(path.join(root,'CREDITS.md')));console.log('PC·모바일 재질과 라이선스 기록 통과');
const architecture=JSON.parse(fs.readFileSync(path.join(root,'medieval/architecture.gltf')));
const catalog=JSON.parse(fs.readFileSync(path.join(root,'medieval/catalog.json')));
assert.equal(Object.keys(catalog).length,16);
for(const asset of Object.keys(catalog))assert(architecture.nodes.some(n=>n.name===asset),`누락된 건축 모델: ${asset}`);
for(const file of ['LICENSE.txt','LICENSE-Wildfire-Games.txt','SOURCES.json','CREDITS.md'])assert(fs.existsSync(path.join(root,'medieval',file)));
assert.equal(fs.statSync(path.join(root,'medieval/architecture.bin')).size,architecture.buffers[0].byteLength);
console.log('중세 건축 16종·원본 출처·버퍼 길이 통과');
