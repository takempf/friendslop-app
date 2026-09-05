import { RACK_SLOT_POSITIONS } from "@/constants/basketball";

export type EquipmentKind = "basketball";
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
];
export const EQUIPMENT_COUNT = EQUIPMENT.length;
