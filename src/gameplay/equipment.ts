import { BALL_COUNT, RACK_SLOT_POSITIONS } from "@/constants/basketball";

export type EquipmentKind = "basketball" | "disc";
export interface EquipmentDefinition {
  id: number;
  kind: EquipmentKind;
  spawn: [number, number, number];
}

// Stable slots form the wire identity. New experiments append definitions;
// they never reuse another game's ids. Rendering and rules stay in game modules.
export const EQUIPMENT: EquipmentDefinition[] = [
  ...RACK_SLOT_POSITIONS.map((spawn, id) => ({
    id,
    kind: "basketball" as const,
    spawn,
  })),
  ...Array.from({ length: 8 }, (_, i) => ({
    id: BALL_COUNT + i,
    kind: "disc" as const,
    spawn: [-3.5 + (i % 4) * 0.65, 0.85, -34 - Math.floor(i / 4) * 0.7] as [
      number,
      number,
      number,
    ],
  })),
];
export const EQUIPMENT_COUNT = EQUIPMENT.length;
export const DISCS = EQUIPMENT.filter((item) => item.kind === "disc");
