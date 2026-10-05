# Mixamo native character review — 2026-10-05

Source: [Adobe Mixamo](https://www.mixamo.com/), downloaded through the user's signed-in session. Usage reference: [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html).

| Game review candidate | Original character | Folder |
| --- | --- | --- |
| Armored knight | Paladin W/Prop J Nordstrom | paladin |
| Cloaked bandit candidate | Arissa | arissa |
| Light mercenary candidate | Erika Archer | erika |

These are game-integrated assets for the `?art=1&mocap=1` review route, not a standalone asset library. Source ZIP/FBX files remain outside version control in `.realm-source/`. They have not replaced the campaign units or battle result presentation yet. National knight variants and dedicated equipment/reactions for the light characters remain to be made.

Preserved: native skeletons, skin weights, embedded diffuse and normal textures, 30 fps animations. Converted FBX centimetres to metres and texture V coordinates to glTF conventions. Materials use approximate PBR factors; the source does not supply full metallic/roughness maps.

The review includes 21 named actions/poses. The original eight sword/shield actions remain intact. A standing downward strike from Pro Melee Axe Pack restores the sword heavy action. That pack also supplies one-handed axe idle, downward/horizontal strikes, block reaction and walking. Great Sword Pack supplies the two-handed idle, downward/diagonal strikes, block and walking; these are adaptations for the battle axe and halberd, not dedicated polearm captures. Bayonet Stab supplies the advancing spear thrust; its first pose supplies spear guard. Each pack/action was downloaded on each of the three characters, preserving character-specific animation transforms. Jump, crouch, low attacks and lower defense are excluded.

Five original procedural weapon meshes are attached to the native captured hands: battle axe, hatchet, spear, halberd and chain flail. The two-handed shaft follows both palms; no shoulder/elbow IK overwrites the capture. Blade roll is calibrated to the cutting plane. Light characters use shorter axes/poleaxes to keep the selected follow-through above the flat review floor. The flail uses a one-handed axe capture plus deterministic chain lag, not flail motion capture or a collision simulation. These adaptations still need paired-opponent timing/contact work before campaign integration. The light characters' cloaks and existing back equipment are retained.

Conversion:

```sh
node tools/prepare-paladin.mjs
node tools/prepare-paladin.mjs .realm-source/arissa Arissa public/realm/arissa
node tools/prepare-paladin.mjs .realm-source/erika "Erika Archer" public/realm/erika
node tools/check-native-combat-models.mjs
node node_modules/tsx/dist/cli.mjs tools/check-native-weapons.ts
```

Extra source directories: `.realm-source/axe`, `.realm-source/greatsword` for Paladin, and `.realm-source/{arissa,erika}-{axe,greatsword}` for the light characters. Each original character source directory also contains its own `Bayonet Stab.fbx`. Converted binary names include content hashes to prevent mixed cached animation buffers after deployment.

