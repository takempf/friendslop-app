import * as THREE from "three";

export const BALL_COUNT = 16;

// Ball rack centers — two rear corners of the main court
const LEFT_RACK_X = -8;
const RIGHT_RACK_X = 8;
const RACK_Z = -8;
// Ball row heights inside the rack (ball centers)
const BOTTOM_ROW_Y = 0.25;
const TOP_ROW_Y = 0.56;
// Ball center x-offsets from rack center (4 balls, 0.29m spacing)
const SLOT_OFFSETS = [-0.435, -0.145, 0.145, 0.435] as const;

/** World-space center position for each of the 16 ball rack slots.
 *  Balls 0-7 → left rack, 8-15 → right rack.
 *  Within each rack: slots 0-3 bottom row, 4-7 top row. */
export const RACK_SLOT_POSITIONS: [number, number, number][] = [
  // Left rack — bottom row (0-3)
  ...SLOT_OFFSETS.map((dx): [number, number, number] => [
    LEFT_RACK_X + dx,
    BOTTOM_ROW_Y,
    RACK_Z,
  ]),
  // Left rack — top row (4-7)
  ...SLOT_OFFSETS.map((dx): [number, number, number] => [
    LEFT_RACK_X + dx,
    TOP_ROW_Y,
    RACK_Z,
  ]),
  // Right rack — bottom row (8-11)
  ...SLOT_OFFSETS.map((dx): [number, number, number] => [
    RIGHT_RACK_X + dx,
    BOTTOM_ROW_Y,
    RACK_Z,
  ]),
  // Right rack — top row (12-15)
  ...SLOT_OFFSETS.map((dx): [number, number, number] => [
    RIGHT_RACK_X + dx,
    TOP_ROW_Y,
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
