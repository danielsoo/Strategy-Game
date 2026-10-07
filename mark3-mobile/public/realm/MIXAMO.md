# Mixamo native character review — 2026-10-05

Source: [Adobe Mixamo](https://www.mixamo.com/), downloaded through the user's signed-in session. Usage reference: [Adobe Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html).

| Game review candidate | Original character | Folder |
| --- | --- | --- |
| Armored knight | Paladin W/Prop J Nordstrom | paladin |
| Cloaked bandit candidate | Arissa | arissa |
| Light mercenary candidate | Erika Archer | erika |

These are game-integrated assets for the `?art=1&mocap=1` review route and the player's resolved-battle presentation, not a standalone asset library. Source ZIP/FBX files remain outside version control in `.realm-source/`. The campaign's distant standing units and AI map skirmish renderer are separate. National knight variants remain to be made.

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
## Paired mocap review — 2026-10-05

The default `?art=1&mocap=1` view now stages two native fighters. It offers friendly character/weapon selection, three opponent equipment presets, explicit friendly/enemy victory, slow playback, contact stepping and a return to the original single-motion review.

`nativeDuel.ts` consumes an ordered resolved-outcome event list. The review creates a small deterministic demonstration list; it does not change campaign combat calculations or claim that these example health numbers are campaign results. Root X/Z tracks are made in-place for this paired presentation. Actor movement is then continuous and separate from native bone animation, preventing root-motion jumps between captures. Guard, impact and death transitions are blended. Blocking ends the attack at its contact marker, followed by recoil/recovery; the winner stays at the last attack position.

Contact calibration samples the actual forward weapon surface and the opponent's guard position, with body spacing constraints. This is a choreographed contact system for the included pairs, not a general rigid-body collision engine. Native shield reactions are used by equipped knights; light fighters use weapon guards/reactions. Bow presentation uses the same release/arrival event to move the projectile, trigger the defense/impact, and stop the arrow at contact. Close approach before the final melee attack is included in the enemy-victory archery example.

Validation: `node node_modules/tsx/dist/cli.mjs tools/check-native-duel.ts` checks contact positions, projectile arrival/termination, minimum actor spacing, movement continuity, rewind determinism and the requested winner. Single-motion source assets and their original animation tracks are not modified by the paired player.

Blocked and landed attacks use different timings: successful blocks contact the raised guard and never remove health. Failed defense stays in a ready stance until 0.24 seconds before impact, then starts the original guard capture too late to cover the sword-side shoulder. It no longer freezes an attacking pose to manufacture an opening. The incoming strike targets the exposed shoulder; impact/death transitions blend from that exact partial guard. The additional backwards-and-forwards root slide on body hits has been removed. The review includes failure-before-impact and impact-reaction controls. These remain authored outcomes rather than a new combat rules engine.

All three native archers carry an original procedural leather quiver with seven spare arrows and a shoulder strap. The chest attachment follows movement and death; floor correction includes the quiver. The paired review offers 6 m direct fire and 18 m lofted shots. A gravity-driven trajectory controls launch angle, apex, descending arrow orientation and tip contact. The native upper-body chain is aimed as a unit (including Arissa's FBX wrapper hierarchy), preserving relative hand/elbow motion. This directional adjustment and the short flight trail are authored additions, not new Mixamo clips. Validation covers each archer's raised grips, quiver attachment, trajectory apex and arrival.

## Representative squads — 2026-10-05

The review now defaults to three representatives per side. Presets include 1v1, 3v1, 1v3, 3v3, 12v12 and 60v60; each side is capped at three actual native character instances. The displayed troop count is separate from the number of visible representatives. Rank stars mean proficiency/elite grade, independently selected in the review. They do not encode troop size, grant stats or implement campaign experience progression.

`nativeSquad.ts` schedules existing native paired engagements. Disjoint pairs run concurrently with staggered starts. Shared defenders resolve one engagement at a time, turning towards separate approach lanes; the same actor cannot play two conflicting reactions simultaneously. Continuous root paths and blended native walking connect engagements. Lane assignment preserves nearest formation order to avoid crossing another pair. Every actor retains its own animation mixer and equipment. Ranged squads preserve quivers, ballistic shots and their contact timing; a victorious melee unit approaches the archers before its final strike. The camera fits all representatives on desktop and narrow screens.

The initial representative-squad review used selectable victory; the resolved-record revision below replaces that demo scheduler. The spacing checks are root-level clearance checks, not general mesh collision guarantees. Rank progression remains separate.

Validation: `node node_modules/tsx/dist/cli.mjs tools/check-native-squad.ts` covers 16 formations/equipment configurations, both winners, simultaneous scheduling, root spacing and continuity, transformed weapon/arrow contact, final casualties and repeatable scrubbing. TypeScript and Expo web export also pass. Browser checks use desktop and 390×844 layouts.

## Individual choreography from resolved results — 2026-10-05

`nativeBattlePlan.ts` reads the original `DetailedCombatResult` without modifying it or consuming combat RNG. Initial strength, every round's losses, post-rout losses, final survivors and outcome come from that record. Each of up to three representatives owns an explicit troop-count interval: it dies only when that interval has no recorded survivors. A defeat with survivors ends in withdrawal, not invented annihilation; a stalemate preserves both sides. Round summaries retain exact numerical counts, including partial losses within a representative's group.

Each soldier has its own initiative, native attack variant and optional continuation. Mixed equipment is the default: knights use sword/spear/halberd, light troops use their primary weapon/hatchet/axe. Separate pairs can act concurrently, while shared actors cannot occupy conflicting engagements. Fighters acquire another living opponent after casualties. Clear engagement placement and obstacle-aware entry paths avoid walking through stationary comrades or fallen bodies. Unchanged rounds are compressed into record updates rather than repeating the same fight six times. These are authored individual exchanges derived from aggregate combat rounds; the engine does not provide literal per-swing combat events.

In the 3D game, a player-initiated attack with quick combat disabled opens this player using the **already resolved** `performAttack` result and the pre-battle unit kinds. Finishing/skipping opens the existing result table with that same result object. Replaying does not call `performAttack` or `resolveCombat` again. Turn input and competing encounter dialogs remain blocked during presentation. Quick combat, 2D results, and AI map skirmishes retain their existing paths.

The standalone review uses the same game resolver with explicit sample forces/seed; it is labeled as an engine example, not a historical campaign fight. It no longer offers victory-selection buttons. Equipment changes and playback controls do not change its resolved outcome. Real campaign playback hides force, equipment and sample-record controls.

Validation includes 330 seeded resolved battles (all three outcomes, zero-size sides, small and 60+ armies), immutable inputs, exact round/final counts, no resurrection and deterministic variation. `check-native-squad.ts --mixed` covers mixed equipment and grouped representatives. Browser validation also exercised a real local campaign attack: the native player and result table both reported defender victory and 2:2 survivors.

## Overlapping pressure and outnumbered movement — 2026-10-07

Squads now reserve individual actor tracks instead of locking both participants until an entire paired clip finishes. An attacker can approach and wind up while the shared opponent is completing its previous reaction. A killer recovers independently while the victim's native death animation continues. Recorded rounds advance at their last contact, without waiting for every recovery/death tail. No attack clip is globally sped up to obtain this overlap. A single body still owns exactly one movement/action track at any instant.

In outnumbered melee, approaching allies occupy separated angles on a fan. The lone fighter yields diagonally and changes facing between lanes, keeping the threats on its forward side rather than standing still for a queue of duels. The planner checks paths against other actors' positions at the same future times, including ongoing lunges and fallen bodies. Small detours or delayed entry preserve contact calibration. This is bounded authored choreography with root clearance, not a general physics/decision-making simulation; troop losses and winners still come exclusively from the original game result. There are no added motion-capture assets in this revision.

The review adds 2v1/1v2 controls and direct `squad=2v1` / `squad=1v2` links. A repeated-guard bug was also fixed: non-archers no longer reset their chest to bind pose before the animation mixer's cached update, and bow aiming restores the last unmodified native chest pose. One continuous idle phase per soldier connects recovery, walking and the next action, preventing hand snaps at ownership changes. Bow recovery retains the full capture tail before yielding its track.

Validation covers 20 formation/equipment configurations, 15 additional mixed-weapon tactics records, independent actor ownership, attack preparation overlapping an earlier block, angular separation, continuous paths, root clearance, weapon/arrow contact and recorded survivors. Each action handoff also checks both hands and the neck for pose discontinuities. `check-native-squad.ts --tactics` runs the additional records. This revision has automated geometry and timing checks; browser visual review was unavailable in the execution session.

## Encirclement and rear openings — 2026-10-07

Outnumbering is now evaluated around the assigned opponent, including a local 2v1 within 3v2. Two allies occupy opposite sides, and three occupy a triangle around the target. Circling paths treat the target as an obstacle; walking turns follow the path before settling into attack facing. The front pair continues zero-loss pressure/counter exchanges while a flanker travels, instead of waiting for a delayed contact in an idle pose.

An opportunistic attacker starts its native windup before the opponent's forward attack reaches contact, then strikes during that opponent's recovery. The receiving actor retains its original facing; a landed rear attack blends into impact/death without spinning the defender around to manufacture a frontal block. Rear contact is calibrated to the back of the captured torso. The scheduler reserves the victim's action track only at impact, leaving its preceding action intact. Zero-loss records use a committed miss with no contact spark, damage or extra death. These additional pressure beats remain authored presentation, not new engine damage rolls or new motion capture.

Routes also reject friendly bodies in the projected strike corridor. If a safe opening cannot be reached, the player retains the ordinary engagement rather than teleporting or overriding two actions on one body. This is still bounded choreography and geometric clearance, not a full rigid-body weapon simulation. Recorded casualties and final results are unchanged. The review includes `squad=3v1`, `squad=1v3` and a `협공 순간` control. Tests cover actual encirclement, back-facing contact, windup overlap with the target's attack, friendly strike-lane clearance, native transition continuity and exact survivors. Browser rendering could not be visually inspected in this session because no browser surface was connected.
