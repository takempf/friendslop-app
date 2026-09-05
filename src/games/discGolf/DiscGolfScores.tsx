import { useDiscGolfCards } from "./useDiscGolfCards";
import { useEffect, useState } from "react";
import { useGameSync } from "@/sync/GameSyncProvider";
import { WorldSign } from "@/gameplay/WorldSign";
import { WorldAction } from "@/gameplay/WorldAction";
import { RigidBody } from "@react-three/rapier";
import { HOLES, COURSE_PAR, COURSE_RESET } from "./course";
import { DISC_GOLF_SCOPE } from "./scoring";

export function DiscGolfScoreboard() {
  const { sync } = useGameSync();
  const cards = useDiscGolfCards();
  const [page, setPage] = useState(0);
  const rows = [...cards.entries()].sort((a, b) => a[0] - b[0]);
  const pages = Math.max(1, Math.ceil(rows.length / 6));
  useEffect(() => {
    const timer = setInterval(() => setPage((p) => p + 1), 7000);
    return () => clearInterval(timer);
  }, []);
  const lines = [
    "PINE SIX / SCORECARD",
    `6 HOLES     PAR ${COURSE_PAR}`,
    "PLAYER       1  2  3  4  5  6   +/-",
    ...rows
      .slice((page % pages) * 6, ((page % pages) + 1) * 6)
      .map(([, card]) => {
        const relative = card.completed.reduce(
          (s, n, i) => s + n - HOLES[i].par,
          0,
        );
        const holes = HOLES.map((_, i) =>
          String(
            card.completed[i] ??
              (i === card.hole && card.strokes ? `${card.strokes}*` : "-"),
          ).padStart(2),
        ).join(" ");
        return `${card.name.slice(0, 10).padEnd(10)} ${holes}  ${relative > 0 ? "+" : ""}${relative}`;
      }),
    ...(rows.length
      ? []
      : ["Pick up a disc to get started.", "Every release counts as a throw."]),
    "* IN PROGRESS   /   - UNPLAYED",
    `PAGE ${(page % pages) + 1}/${pages} · LOWEST SCORE WINS`,
    "RED BUTTON: CLEAR COURSE SCORES",
  ];
  return (
    <group>
      <RigidBody type="fixed" colliders="cuboid">
        {[-8, -4].map((x) => (
          <mesh key={x} position={[x, 1.65, -35]}>
            <boxGeometry args={[0.18, 3.3, 0.18]} />
            <meshLambertMaterial color="#765638" />
          </mesh>
        ))}
        <mesh position={[-6, 2.55, -35]}>
          <boxGeometry args={[4.6, 2.6, 0.18]} />
          <meshLambertMaterial color="#654a30" />
        </mesh>
      </RigidBody>
      <group position={[-6, 2.55, -34.88]}>
        <WorldSign lines={lines} width={4.4} height={2.45} />
      </group>
      <mesh position={COURSE_RESET}>
        <boxGeometry args={[0.45, 0.35, 0.2]} />
        <meshLambertMaterial color="#db573b" />
      </mesh>
      <WorldAction
        id="disc-golf:reset"
        position={COURSE_RESET}
        onInteract={() => sync?.world.reset(DISC_GOLF_SCOPE)}
      />
    </group>
  );
}

export function DiscGolfHUD() {
  const { myId } = useGameSync();
  const cards = useDiscGolfCards();
  const card = cards.get(myId);
  return (
    <div
      id="disc-golf-hud"
      role="status"
      aria-live="polite"
      style={{
        display: "none",
        position: "absolute",
        top: 24,
        left: "50%",
        transform: "translateX(-50%)",
        textAlign: "center",
        pointerEvents: "none",
        color: "#fff0c8",
        background: "#142b2bd9",
        padding: "12px 22px",
        borderTop: "3px solid #efbf59",
        fontFamily: "monospace",
        maxWidth: "75vw",
      }}
    >
      <strong>
        PINE SIX ·{" "}
        {card?.hole === 6
          ? "ROUND COMPLETE"
          : `HOLE ${(card?.hole ?? 0) + 1} / 6 · PAR ${HOLES[card?.hole ?? 0]?.par ?? 3}`}
      </strong>
      <div style={{ marginTop: 6 }}>
        {card?.message ?? "Pick up a disc at the entrance. Start at tee 1."}
      </div>
      <div id="disc-golf-hint" style={{ marginTop: 6, fontSize: 12 }}>
        E / X: pick up or drop · Hold Q / RT, release to throw
      </div>
    </div>
  );
}
