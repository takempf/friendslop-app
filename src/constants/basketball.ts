import * as THREE from "three";

export const BALL_COUNT = 8;

// Ball rack centers — two rear corners of the main court
const LEFT_RACK_X = -8;
const RIGHT_RACK_X = 8;
const RACK_Z = -8;
// Ball height when sitting on top of the 1.05m tall rack (1.05m + 0.12m radius)
const RACK_Y = 1.17;
// Ball center x-offsets from rack center (4 balls, 0.29m spacing)
const SLOT_OFFSETS = [-0.435, -0.145, 0.145, 0.435] as const;

/** World-space center position for each of the 8 ball rack slots.
 *  Balls 0-3 → left rack, 4-7 → right rack. */
export const RACK_SLOT_POSITIONS: [number, number, number][] = [
  // Left rack — (0-3)
  ...SLOT_OFFSETS.map((dx): [number, number, number] => [
    LEFT_RACK_X + dx,
    RACK_Y,
    RACK_Z,
  ]),
  // Right rack — (4-7)
  ...SLOT_OFFSETS.map((dx): [number, number, number] => [
    RIGHT_RACK_X + dx,
    RACK_Y,
    RACK_Z,
  ]),
];

// Backboard geometry constants
export const BOARD_Z = 9.1;
export const BOARD_THICKNESS = 0.075;
export const BOARD_FRONT_FACE_Z = BOARD_Z - BOARD_THICKNESS / 2; // 9.0625

// 10 feet = 3.048m
export const RIM_Y = 3.048;
// Interior radius of standard NBA rim: 9 inches = 0.2286m
export const RIM_RADIUS = 0.2286;
// Standard basketball radius: ~4.7 inches = 0.12m
export const BALL_RADIUS = 0.12;

// Shared range for grab and interact actions
export const INTERACTION_RANGE = 2.66;

// NBA 3-point line dimensions (in meters)
// Arc: 23.75 ft = 7.24m from basket center
export const THREE_POINT_ARC_RADIUS = 7.24;
// Corner straight lines: 22 ft = 6.706m horizontal distance from basket center
export const THREE_POINT_CORNER_X = 6.706;

// Rim center: back edge of torus flush with backboard front face
export const HOOP_RIM_POS = new THREE.Vector3(
  0,
  RIM_Y,
  BOARD_FRONT_FACE_Z - RIM_RADIUS,
);
