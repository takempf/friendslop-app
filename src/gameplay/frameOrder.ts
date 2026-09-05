/** Negative priorities preserve R3F's automatic rendering. Held presentation
 * must run after Rapier has copied/interpolated its transforms into Three. */
export const EQUIPMENT_REPLICATION_PRIORITY = -0.15;
export const PHYSICS_PRIORITY = -0.1;
export const HELD_PRESENTATION_PRIORITY = 0;
