import { audioManager } from "@/audio/AudioManager";
import { useEffect, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Line } from "@react-three/drei";
import { Group } from "three";
import { useGameSync } from "@/sync/GameSyncProvider";
import type { SessionRecord } from "@/sync/ISharedWorld";
import { SHOT_SCOPE } from "./RangeSession";
import type { WeaponId } from "./weapons";

type Shot = SessionRecord & {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  weapon: WeaponId;
  time: number;
  explosion: boolean;
};
function sound(shot: Shot, distance: number) {
  if (distance > 50 || Date.now() / 1000 - shot.time > 0.3) return;
  audioManager.playWeaponSound(
    shot.from,
    shot.explosion
      ? "explosion"
      : shot.weapon === "falcon9"
        ? "pistol"
        : shot.weapon === "dragon"
          ? "rifle"
          : "smg",
  );
}
function Trace({ shot }: { shot: Shot }) {
  const group = useRef<Group>(null);
  const played = useRef(false);
  useFrame(({ camera }) => {
    const age = Date.now() / 1000 - shot.time;
    if (group.current)
      group.current.visible = age >= 0 && age < (shot.explosion ? 0.45 : 0.12);
    if (!played.current) {
      played.current = true;
      sound(
        shot,
        Math.hypot(
          camera.position.x - shot.from[0],
          camera.position.y - shot.from[1],
          camera.position.z - shot.from[2],
        ),
      );
    }
  });
  return (
    <group ref={group} visible={false}>
      {shot.explosion ? (
        <mesh position={shot.to}>
          <icosahedronGeometry args={[2, 1]} />
          <meshBasicMaterial color="#ffb54e" transparent opacity={0.45} />
        </mesh>
      ) : (
        <Line points={[shot.from, shot.to]} color="#ffe8a0" lineWidth={1.5} />
      )}
      <mesh position={shot.to}>
        <octahedronGeometry args={[0.06]} />
        <meshBasicMaterial color="#fff8da" />
      </mesh>
    </group>
  );
}
export function RangeEffects() {
  const { sync } = useGameSync();
  const [shots, setShots] = useState<Shot[]>([]);
  useEffect(() => {
    const update = () =>
      setShots(
        [...(sync?.world.records<Shot>(SHOT_SCOPE).values() ?? [])].filter(
          (s) => Date.now() / 1000 - s.time < 0.5,
        ),
      );
    return sync?.world.subscribe(update);
  }, [sync]);
  return (
    <>
      {shots.map((shot) => (
        <Trace key={shot.id} shot={shot} />
      ))}
    </>
  );
}
