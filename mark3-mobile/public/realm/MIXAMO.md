# Mixamo native character review — 2026-10-05

Source: [Adobe Mixamo](https://www.mixamo.com/), downloaded through the user's signed-in session. Usage reference: [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html).

| Game review candidate | Original character | Folder |
| --- | --- | --- |
| Armored knight | Paladin W/Prop J Nordstrom | paladin |
| Cloaked bandit candidate | Arissa | arissa |
| Light mercenary candidate | Erika Archer | erika |

These are game-integrated assets for the `?art=1&mocap=1` review route, not a standalone asset library. Source ZIP/FBX files remain outside version control in `.realm-source/`. They have not replaced the campaign units or battle result presentation yet. National knight variants and dedicated equipment/reactions for the light characters remain to be made.

Preserved: native skeletons, skin weights, embedded diffuse and normal textures, 30 fps animations. Converted FBX centimetres to metres and texture V coordinates to glTF conventions. Materials use approximate PBR factors; the source does not supply full metallic/roughness maps.

The review includes 38 named actions/poses. The original eight sword/shield actions remain intact. A standing downward strike from Pro Melee Axe Pack restores the sword heavy action. That pack also supplies one-handed axe idle, downward/horizontal strikes, block reaction, hit reactions, running jump attack and walking. Great Sword Pack supplies the two-handed idle, downward/diagonal strikes, jump attack, block, impact, death and walking; these are adaptations for the battle axe and halberd, not dedicated polearm captures. Bayonet Stab supplies the advancing spear thrust; its first pose supplies spear guard. Sword/shield impact variants, death and the jumping power slash (`sword and shield slash (4)`) are also included. Each pack/action was downloaded on each of the three characters, preserving character-specific animation transforms. Basic locomotion jumps, crouch, low attacks and lower defense are excluded. Attack jumps are explicitly requested and included.

Five original procedural weapon meshes are attached to the native captured hands: battle axe, hatchet, spear, halberd and chain flail. The two-handed shaft follows both palms; no shoulder/elbow IK overwrites the capture. Blade roll is calibrated to the cutting plane. Light characters use shorter axes/poleaxes to keep the selected follow-through above the flat review floor. The flail uses a one-handed axe capture plus deterministic chain lag, not flail motion capture or a collision simulation. These adaptations still need paired-opponent timing/contact work before campaign integration. The light characters' cloaks and existing back equipment are retained.

Grip revision: use the inside of curled middle-finger joints (previously the offset was on the back of the hand). Ordinary cut roll is fitted once per clip to the fastest cutting arc. Two-handed jump strikes instead use the captured head trajectory across the active descent (43–61% of the clip), blended into the ordinary grip during windup/recovery. This corrects the previous calibration that picked fast recovery instead of impact. Both palms remain on the haft; native shoulder/elbow tracks remain unchanged. Shield-bearing hatchet/flail characters use native sword/shield block, guard, recovery and impact. Their axe attacks use a masked native shield-guard left arm. The captured right shoulder/elbow stay intact. These combinations are edited adaptations, not untouched weapon-specific mocap.

Death playback releases added weapons at 28% of the capture, then deterministically drops and settles them on the flat review floor. Visible body geometry is grounded separately from the loose cloak; cloak vertices and its shadow fold onto the floor. Flail head ground contact is constrained. Camera tracking preserves captured forward travel during attack jumps. This is review-stage ground handling, not an opponent/terrain physics solver.

Conversion:

```sh
node tools/prepare-paladin.mjs
node tools/prepare-paladin.mjs .realm-source/arissa Arissa public/realm/arissa
node tools/prepare-paladin.mjs .realm-source/erika "Erika Archer" public/realm/erika
node tools/check-native-combat-models.mjs
node node_modules/tsx/dist/cli.mjs tools/check-native-weapons.ts
```

Extra source directories: `.realm-source/axe`, `.realm-source/greatsword` for Paladin, and `.realm-source/{arissa,erika}-{axe,greatsword}` for the light characters. Each original character source directory also contains its own `Bayonet Stab.fbx`. Converted binary names include content hashes to prevent mixed cached animation buffers after deployment.


Longbow addition: Pro Longbow Pack was downloaded separately on Paladin, Arissa and Erika. Included originals: standing idle 01, standing draw arrow, standing aim overdraw, standing aim recoil, standing walk forward, standing react small from front and standing death backward 01. A joined draw/aim/recoil/idle clip provides one complete shot. The wooden bow, bowstring and arrow are original procedural equipment: left-palm attachment, right-hand nock, release at frame 5 of recoil, independent ballistic arrow and floor-settled dropped bow. These are equipment effects, not additional motion capture. Sources: `.realm-source/{paladin,arissa,erika}-bow`. Validate with `node node_modules/tsx/dist/cli.mjs tools/check-native-bow.ts`.
