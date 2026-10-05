# Mixamo native character review — 2026-10-05

Source: [Adobe Mixamo](https://www.mixamo.com/), downloaded through the user's signed-in session. Usage reference: [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html).

| Game review candidate | Original character | Folder |
| --- | --- | --- |
| Armored knight | Paladin W/Prop J Nordstrom | paladin |
| Cloaked bandit candidate | Arissa | arissa |
| Light mercenary candidate | Erika Archer | erika |

These are game-integrated assets for the `?art=1&mocap=1` review route, not a standalone asset library. Source ZIP/FBX files remain outside version control in `.realm-source/`. They have not replaced the campaign units or battle result presentation yet. National knight variants and dedicated equipment/reactions for the light characters remain to be made.

Preserved: native skeletons, skin weights, embedded diffuse and normal textures, 30 fps animations. Converted FBX centimetres to metres and texture V coordinates to glTF conventions. Materials use approximate PBR factors; the source does not supply full metallic/roughness maps.

Only eight standing sword/shield pack actions are included: idle, two slashes, block, block idle, block recovery, impact, walk. Jump, crouch, low attacks and lower defense are excluded. Light candidates expose only appearance idle and walk because they have no equipped shield; the long cloak needs additional ground-contact work for impact poses. They are appearance candidates, not finished combat classes.

Conversion:

```sh
node tools/prepare-paladin.mjs
node tools/prepare-paladin.mjs .realm-source/arissa Arissa public/realm/arissa
node tools/prepare-paladin.mjs .realm-source/erika "Erika Archer" public/realm/erika
node tools/check-native-combat-models.mjs
```

