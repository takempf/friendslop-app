import { interactionGroups } from "@react-three/rapier";

export const GRAVITY = -9.81; // m/s²
export const GRAVITY_VEC3 = [0, GRAVITY, 0] as const;

export const GROUP_ENVIRONMENT = 0;
export const GROUP_PLAYER = 1;
export const GROUP_BALL = 2;
export const GROUP_REMOTE_PLAYER = 3;

/** Local dynamic player collides with environment, balls, and remote players */
export const PLAYER_COLLISION_GROUPS = interactionGroups(
  [GROUP_PLAYER],
  [GROUP_ENVIRONMENT, GROUP_BALL, GROUP_REMOTE_PLAYER],
);

/** Free/thrown/loose balls collide with environment, local player, other balls, and remote players */
export const BALL_COLLISION_GROUPS = interactionGroups(
  [GROUP_BALL],
  [GROUP_ENVIRONMENT, GROUP_PLAYER, GROUP_BALL, GROUP_REMOTE_PLAYER],
);

/** Held/dribbled balls interact only with environment to prevent self-shove against the holder */
export const HELD_BALL_COLLISION_GROUPS = interactionGroups(
  [GROUP_BALL],
  [GROUP_ENVIRONMENT],
);

/** Remote kinematic players collide with the local player and balls */
export const REMOTE_PLAYER_COLLISION_GROUPS = interactionGroups(
  [GROUP_REMOTE_PLAYER],
  [GROUP_PLAYER, GROUP_BALL],
);

/** Ground raycast filter queries environment only, ignoring balls and remote players */
export const GROUND_RAY_COLLISION_GROUPS = interactionGroups(
  [GROUP_PLAYER],
  [GROUP_ENVIRONMENT],
);

/** Player rigid body mass (kg) — authoritative mass prevents balls from knocking or launching the player */
export const PLAYER_MASS = 75;
