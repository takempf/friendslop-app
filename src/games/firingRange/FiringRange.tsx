import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RigidBody } from "@react-three/rapier";
import { Group } from "three";
import { WorldSign } from "@/gameplay/WorldSign";
import { WorldAction } from "@/gameplay/WorldAction";
import { useEquipment } from "@/gameplay/EquipmentContext";
import { EQUIPMENT } from "@/gameplay/equipment";
import { useGameSync } from "@/sync/GameSyncProvider";
import { targetingSystem } from "@/targeting/TargetingSystem";
import type { TargetProvider } from "@/targeting/types";
import { useRangeSession } from "./FiringRangeProvider";
import { Guns } from "./Guns";
import { RangeEffects } from "./RangeEffects";
import {
  accuracy,
  inRange,
  RANGE_SCOPE,
  targetAt,
  TIERS,
  type Tier,
  type Trial,
} from "./trials";
import { WEAPONS } from "./weapons";

function Block({
  position,
  size,
  color = "#38444e",
}: {
  position: [number, number, number];
  size: [number, number, number];
  color?: string;
}) {
  return (
    <RigidBody type="fixed" position={position} colliders="cuboid">
      <mesh receiveShadow castShadow>
        <boxGeometry args={size} />
        <meshLambertMaterial color={color} />
      </mesh>
    </RigidBody>
  );
}
function Target({ index }: { index: number }) {
  const range = useRangeSession();
  const root = useRef<Group>(null);
  useFrame(() => {
    if (!root.current) return;
    const target = targetAt(index, range.winner, Date.now() / 1000);
    root.current.position.copy(target.point);
    root.current.rotation.y = Math.PI / 2 + target.angle;
    root.current.visible = target.visible;
  }, -0.55);
  return (
    <group ref={root}>
      <mesh>
        <boxGeometry args={[1.28, 1.58, 0.08]} />
        <meshLambertMaterial color="#909b9f" />
      </mesh>
      <mesh position={[0, 1.35, 0]}>
        <boxGeometry args={[0.055, 1.1, 0.06]} />
        <meshLambertMaterial color="#555f69" />
      </mesh>
      <group position={[0, 0, 0.045]} scale={[0.6, 0.75, 1]}>
        {[
          { radius: 1, color: "#e6e3ce" },
          { radius: 0.8, color: "#315c84" },
          { radius: 0.5, color: "#e6e3ce" },
          { radius: 0.2, color: "#d9513d" },
        ].map((ring, i) => (
          <mesh key={i} position={[0, 0, i * 0.002]}>
            <circleGeometry args={[ring.radius, 32]} />
            <meshBasicMaterial color={ring.color} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0, -0.046]}>
        <boxGeometry args={[0.06, 1.1, 0.008]} />
        <meshBasicMaterial color="#e45949" />
      </mesh>
      <mesh position={[0, 0, -0.046]}>
        <boxGeometry args={[0.9, 0.06, 0.008]} />
        <meshBasicMaterial color="#e45949" />
      </mesh>
    </group>
  );
}
function Console({ active }: { active: boolean }) {
  const range = useRangeSession();
  const { heldEntityRef } = useEquipment();
  const { camera } = useThree();
  const { sync } = useGameSync();
  const [, refresh] = useState(0);
  useEffect(() => sync?.world.subscribe(() => refresh((n) => n + 1)), [sync]);
  const rows = [...(sync?.world.records<Trial>(RANGE_SCOPE).values() ?? [])]
    .sort((a, b) => b.start - a.start)
    .slice(0, 4);
  const lines = [
    "CARRINGTON / TRAINING",
    "SELECT A WEAPON FROM THE RACK",
    "HOLD GUN + E / X ON A TRIAL BUTTON",
    "BLUE RINGS 2 / WHITE 5 / BULL 10",
    "BACK FACES SCORE ZERO",
    ...rows.map(
      (t) =>
        `${t.name.slice(0, 10)} ${WEAPONS[t.weapon].name} ${t.score} ${Math.round(accuracy(t))}% ${t.status.toUpperCase()}`,
    ),
  ];
  return (
    <>
      <Block
        position={[-7, 0.65, -21.15]}
        size={[3.3, 1.3, 0.7]}
        color="#283a4a"
      />
      <group position={[-7, 2.45, -20.55]} rotation={[0, Math.PI, 0]}>
        <WorldSign lines={lines} width={4.4} height={1.8} accent="#6edce5" />
      </group>
      {(["bronze", "silver", "gold"] as Tier[]).map((tier, i) => {
        const position: [number, number, number] = [
          -5.9 - i * 1.1,
          1.45,
          -21.55,
        ];
        const goal = TIERS[tier];
        return (
          <group key={tier}>
            <group position={position} rotation={[0, Math.PI, 0]}>
              <WorldSign
                lines={[
                  tier.toUpperCase(),
                  `${goal.seconds}s / ${goal.score} PTS`,
                  `${goal.accuracy}% / ${goal.destroyed} TARGETS`,
                ]}
                width={0.9}
                height={0.55}
                accent={["#d3a16e", "#c5d6e2", "#f7d55e"][i]}
              />
            </group>
            <WorldAction
              id={`range:start:${tier}`}
              position={[position[0], position[1], position[2] - 0.12]}
              allowWhileHolding
              onInteract={() =>
                active &&
                range.start(
                  EQUIPMENT[heldEntityRef.current]?.variant,
                  tier,
                  Date.now() / 1000,
                  camera.position,
                )
              }
            />
          </group>
        );
      })}
    </>
  );
}
export function FiringRange({ active }: { active: boolean }) {
  const range = useRangeSession();
  const { sync, myId, getPlayers } = useGameSync();
  const { heldEntityRef, entityGameData, ownedEntityIds } = useEquipment();
  const hud = useRef<HTMLElement | null>(null);
  const status = useRef<HTMLElement | null>(null);
  const hints = useRef<HTMLElement | null>(null);
  useEffect(() => {
    range.attach(sync?.world ?? null, myId, sync?.myName ?? "Player");
    hud.current = document.getElementById("range-hud");
    status.current = document.getElementById("range-status");
    hints.current = document.getElementById("range-hints");
    return () => {
      range.attach(null, myId, "Player");
    };
  }, [sync, myId, range]);
  const provider = useMemo<TargetProvider>(
    () => ({
      kind: "shooting-target",
      isActive: (ctx) =>
        ctx.heldEquipmentKind === "gun" && inRange(ctx.cameraPosition),
      collect(_ctx, out) {
        for (let i = 0; i < 3; i++) {
          const target = targetAt(i, range.winner, Date.now() / 1000);
          if (target.visible && Math.cos(target.angle) > 0.2)
            out.push({
              id: `range:target:${i}`,
              kind: "shooting-target",
              index: i,
              point: target.point,
            });
        }
      },
    }),
    [range],
  );
  useEffect(() => targetingSystem.registerProvider(provider), [provider]);
  useFrame(({ camera }) => {
    const now = Date.now() / 1000;
    range.setConnected(getPlayers().keys());
    const weapon = EQUIPMENT[heldEntityRef.current]?.variant;
    const armed = [...entityGameData.current.entries()].some(
      ([id, data]) =>
        ownedEntityIds.current.has(id) &&
        data?.mine === true &&
        data.trialId === range.mine?.id,
    );
    range.update(now, camera.position, weapon, armed);
    if (hud.current)
      hud.current.style.display =
        inRange(camera.position) || weapon ? "block" : "none";
    const hit = document.getElementById("range-hit");
    if (hit) {
      hit.style.opacity = now < range.lastHitUntil ? "1" : "0";
      hit.textContent = `HIT +${range.lastHitPoints}`;
    }
    const readout = document.getElementById("weapon-readout");
    if (readout && !weapon)
      readout.textContent = "NO WEAPON · E / X TO PICK UP";
    if (hints.current)
      hints.current.textContent = weapon
        ? "LMB / Q / RT: fire · RMB / F / LT: aim · R / Y: reload · B / RB: function · E / X: drop / terminal"
        : "E / X: pick up a weapon · Trial buttons are on the blue terminal";
    if (!weapon && range.recoverUntil > now && readout)
      readout.textContent = `RECOVER DRAGON FROM RACK · ${Math.ceil(range.recoverUntil - now)}s · E / X`;
    if (!status.current) return;
    const trial = range.winner;
    const mine = range.mine;
    if (trial) {
      const goal = TIERS[trial.tier];
      status.current.textContent =
        now < trial.start
          ? `${trial.name} · ${trial.tier.toUpperCase()} · START IN ${Math.ceil(trial.start - now)}`
          : `${trial.name} · ${Math.ceil(trial.end - now)}s · SCORE ${trial.score}/${goal.score} · ACC ${Math.round(accuracy(trial))}/${goal.accuracy}% · TARGETS ${trial.destroyed}/${goal.destroyed}`;
    } else if (mine && mine.status !== "active") {
      status.current.textContent = `${mine.tier.toUpperCase()} ${mine.status.toUpperCase()} · ${mine.score} PTS · ${Math.round(accuracy(mine))}% · ${mine.destroyed} TARGETS${mine.reason ? ` · ${mine.reason}` : ""} · Select a trial to retry.`;
    } else status.current.textContent = range.notice;
  }, -0.7);
  return (
    <group>
      <Block
        position={[-20, -0.25, -25]}
        size={[36, 0.5, 10]}
        color="#4b5660"
      />
      <Block position={[-20, 4.2, -25]} size={[36, 0.35, 10]} color="#202c39" />
      <Block position={[-20, 2, -20]} size={[36, 4, 0.4]} />
      <Block position={[-20, 2, -30]} size={[36, 4, 0.4]} />
      <Block position={[-38, 2, -25]} size={[0.5, 4, 10]} color="#17242d" />
      {/* Open metal door parked against the inside wall, clear of the passage. */}
      <Block
        position={[-2.4, 1.55, -27.9]}
        size={[0.12, 3.1, 2.5]}
        color="#526b79"
      />
      <group position={[-2.51, 1.9, -27.9]} rotation={[0, -Math.PI / 2, 0]}>
        <WorldSign
          lines={["RANGE 01", "AUTHORIZED TRAINING"]}
          width={1.8}
          height={0.6}
          accent="#71d6e0"
        />
      </group>
      <Console active={active} />
      {[0, 1, 2].map((i) => (
        <group key={i}>
          <Block
            position={[-4.65, 0.8, -22 - i * 2.5]}
            size={[1.8, 0.22, 0.8]}
            color="#536773"
          />
          <Block
            position={[-4.65, 0.4, -22 - i * 2.5]}
            size={[0.2, 0.8, 0.5]}
          />
          <group
            position={[-3.65, 1.45, -22 - i * 2.5]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <WorldSign
              lines={[
                WEAPONS[(["falcon9", "dragon", "cmp150"] as const)[i]].name,
              ]}
              width={0.85}
              height={0.3}
              accent="#74d8e5"
            />
          </group>
          <Target index={i} />
          <Block
            position={[-10, 0.55, -22 - i * 3]}
            size={[0.45, 1.1, 2.5]}
            color="#5b6a73"
          />
          <mesh position={[-23, 3.65, -22 - i * 3]}>
            <boxGeometry args={[25, 0.08, 0.08]} />
            <meshLambertMaterial color="#89969a" />
          </mesh>
          <mesh position={[-10.8, 0.008, -22 - i * 3]}>
            <boxGeometry args={[0.2, 0.015, 2.4]} />
            <meshBasicMaterial color="#e8b548" />
          </mesh>
          <group
            position={[-9.73, 0.75, -22 - i * 3]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <WorldSign
              lines={[`LANE 0${i + 1}`]}
              width={1.2}
              height={0.3}
              accent="#72d5de"
            />
          </group>
        </group>
      ))}
      {[-23.5, -26.5].map((z) => (
        <Block
          key={z}
          position={[-8.7, 1.3, z]}
          size={[2.7, 2.6, 0.12]}
          color="#304654"
        />
      ))}
      {[-9, -18, -28, -35].map((x) => (
        <group key={x}>
          <mesh position={[x, 3.96, -25]}>
            <boxGeometry args={[0.25, 0.05, 8]} />
            <meshBasicMaterial color="#b9e9f0" />
          </mesh>
          <pointLight
            position={[x, 3.5, -25]}
            intensity={18}
            distance={14}
            color="#b3ddeb"
          />
          <Block
            position={[x, 1.9, -29.72]}
            size={[0.14, 3.8, 0.15]}
            color="#637781"
          />
          <Block
            position={[x, 1.9, -20.28]}
            size={[0.14, 3.8, 0.15]}
            color="#637781"
          />
        </group>
      ))}
      <group position={[-37.65, 2.8, -25]} rotation={[0, Math.PI / 2, 0]}>
        <WorldSign
          lines={["CARRINGTON INSTITUTE", "PRECISION / CONTROL / DISCIPLINE"]}
          width={5.5}
          height={0.8}
          accent="#70cdd8"
        />
      </group>
      <Guns />
      <RangeEffects />
    </group>
  );
}
