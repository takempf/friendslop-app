import * as THREE from "three";

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

// Rim center: back edge of torus flush with backboard front face
export const HOOP_RIM_POS = new THREE.Vector3(
  0,
  RIM_Y,
  BOARD_FRONT_FACE_Z - RIM_RADIUS,
);
