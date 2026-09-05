# First-person experiments

The gym and Pine Six share one world, one player, one held-equipment slot and one multiplayer session. Pine Six is through the open double doors at the back of the gym hallway. There are eight shared discs on the entrance bench and six numbered holes, returning toward the entrance. The geometry is procedural, with faceted trees, simple metal baskets and local canvas lettering; no new models, fonts or network asset requests are required.

## Playing Pine Six

- E / gamepad X picks up the targeted disc, or drops the held item.
- Aim before charging; look upward for loft. Hold Q / RT to charge. While charging, the mouse / right stick tilts the disc instead of moving the camera: left adds hyzer, right adds anhyzer, up lifts the nose, down lowers it. Release to throw with that wrist angle. Tilt resets for each throw, drop or menu interruption. Final bank and nose angle are bounded by a combined 35° / 20° gameplay envelope.
- Start at tee 1 and complete baskets 1–6 in order. Each released throw counts; picking up, walking and dropping do not add strokes. Lies and foot faults are self-policed.
- Only a thrown disc entering its current basket from above completes the hole. The HUD reports the result and next tee. Recover the disc from the tray and continue.
- The standing sign at the entrance shows every player's hole scores, in-progress throws and cumulative score relative to completed-hole par. It cycles pages for groups larger than six. Disconnected players' cards remain visible.
- Aim at its red button and press E / X to clear the entire course scoreboard and restart everyone at hole 1. Basketball scores are independent. Discs already airborne cannot score into the new round.
- A disc leaving the course returns to its current tee. No automatic penalty is added. After hole 6, throws are practice until the course scoreboard is cleared.

## Disc motion and navigation

Charging follows a shoulder-centered arc across the chest toward the left, with wrist cocking and a modest hyzer bank. The release retains that orientation and clockwise backhand spin. The owner applies speed-dependent precession during fixed physics steps: early turn rolls the lift vector right, then slowing flight banks it left into fade. More spin resists precession; nose angle changes drag. Ground damping dissipates rolling on grass. This is a tuned, reduced-order flight model, not a full aerodynamic solver. The turn/fade convention follows [Innova's flight-rating guide](https://www.innovadiscs.com/home/disc-golf-faq/flight-ratings-system/).

Three ground chevrons point along each tee's basket bearing. A tall translucent pillar and ground ring in the local player's color mark their current basket. The marker reads that player's replicated scorecard, advances after scoring, resets to hole 1 when the scoreboard is cleared, and disappears after hole 6. Other players' progress does not move it.

## Composition and extension

`gameplay/EquipmentContext.tsx` is the shared runtime registry: physics bodies, visuals, held id, ownership, generic game data and spawn lifecycle. Stable numeric ids in `gameplay/equipment.ts` are network identities, not array positions to shuffle between releases. Append definitions when adding equipment; protocol-breaking registry changes need a new room protocol version.

`PlayerController` handles locomotion, grounding, jumping, crouching and camera placement. `EquipmentController` handles pickup/drop, charging, aiming and launching. `EquipmentBehavior` injects hold poses, throw tuning, target kind and release rules. `games/FirstPersonPlayer.tsx` composes the basketball and disc behaviors; game rules are absent from the shared controller. Basketball keeps its dribble/gather animation and grounded two/three-point calculation in its own module.

`WorldAction` registers world interactions with the existing reticle ranking and occlusion system. `WorldSign` supplies local canvas signs. Equipment pickup targeting works for every registered body. Additional games can register their own target providers and actions. A hitscan weapon can build on the same movement, input, targeting, registry and transport, with a weapon-specific firing controller rather than forcing hitscan into the throw lifecycle. Weapons, damage and FPS game modes are not implemented by this change.

Frame ordering is explicit: input/look (-1), locomotion (-0.8), targeting (-0.6), world actions (-0.4), equipment (-0.2), replication (-0.15), physics (-0.1), then held-item presentation and ordinary frame subscribers (0). Held items render from their camera-authored pose after Rapier interpolation, and replicate that same pose. Release/drop transfers the visible transform back to physics before dynamic motion begins. Disc lift, drag, fade and basket crossing checks use Rapier's fixed-step callbacks.

## Multiplayer contract

`IGameSync` provides transient presence; `ISharedWorld` provides transport-independent durable entity checkpoints and scoped session records. `SharedWorld` implements that contract using the existing Yjs document. Room names carry a `:world-v2` suffix so older basketball-only clients cannot join this incompatible protocol. All participants need the updated client.

- The owner simulates an entity. Other peers render kinematic replicas with frame-rate-independent smoothing.
- Motion uses 20 Hz awareness updates. Sleeping bodies stop sending repeated transforms.
- Ownership changes, held/free transitions, settle transitions and one-second moving checkpoints persist in the document. Late joiners receive resting objects as well as active ones.
- Ownership uses a Lamport epoch and peer-id tie break; motion uses a monotonically increasing sequence. Delayed packets cannot override newer ownership or motion. Durable checkpoints use separate writer keys and the same deterministic winner rule.
- When an owner disappears, the lowest connected peer recovers its entities after a three-second discovery grace period. Held items become free bodies. Game metadata travels with an entity so an orphaned disc can still finish its throw.
- Scorecards have separate player keys. Course resets change a scoped generation; writes and in-flight shots from older generations remain excluded even if they arrive afterward. Catch processing checks the current throw id and hole, preventing duplicate scoring.

This remains cooperative peer-authoritative multiplayer. It does not provide trusted hit validation, server rewind, anti-cheat or partition-proof competitive authority. A competitive FPS needs a server-authoritative implementation behind these interfaces and a shot-command/validation protocol. Document state survives while peers retain the session; it is not persisted after everyone leaves or across a full reload of all peers. Old reset generations remain in the session document for convergence, so long-running hosted sessions would benefit from server-managed compaction.

## Validation

Run `npm run validate` and `npm run build`. The CLI suites cover concurrent Yjs ownership claims, delayed/invalid snapshots, late-join checkpoints, concurrent player scorecards, reset isolation, stale-round rejection, complete six-hole rounds, duplicate/wrong-basket rejection and Rapier disc flight/landing/catching. Browser automation is prohibited by this workspace's AGENTS.md; visual tuning and a real two-device WebRTC playthrough still require manual playtesting.
