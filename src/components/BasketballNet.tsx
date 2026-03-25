import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useBasketball } from "../contexts/BasketballContext";
import { RIM_RADIUS, BALL_RADIUS } from "../constants/basketball";

interface NetProps {
  position: [number, number, number];
}

const NUM_RINGS = 8;
const NET_HEIGHT = 0.45;
const TUBE_SEGMENTS = NUM_RINGS - 1;
const RADIAL_SEGMENTS = 16;
const RING_SPACING = NET_HEIGHT / TUBE_SEGMENTS;
const TOP_RADIUS = RIM_RADIUS;
const BOTTOM_RADIUS = 0.08; // Slightly wider than 0.05 so it's more realistic but still stretches

interface RingState {
  center: THREE.Vector3;
  velocity: THREE.Vector3;
  naturalRadius: number;
  currentRadius: number;
  radiusVelocity: number;
}

export function BasketballNet({ position: [posX, posY, posZ] }: NetProps) {
  const { ballRefs } = useBasketball();
  const geometryRef = useRef<THREE.CylinderGeometry>(null);

  const ringsRef = useRef<RingState[] | null>(null);
  if (ringsRef.current === null) {
    const state: RingState[] = [];
    for (let i = 0; i < NUM_RINGS; i++) {
      const naturalRadius = THREE.MathUtils.lerp(
        TOP_RADIUS,
        BOTTOM_RADIUS,
        i / TUBE_SEGMENTS,
      );
      state.push({
        center: new THREE.Vector3(0, -i * RING_SPACING, 0), // Relative to top of net
        velocity: new THREE.Vector3(0, 0, 0),
        naturalRadius,
        currentRadius: naturalRadius,
        radiusVelocity: 0,
      });
    }
    ringsRef.current = state;
  }

  useFrame((_, delta) => {
    const rings = ringsRef.current!;
    // Clamp delta to prevent explosions on lag
    const dt = Math.min(delta, 0.033);

    // Reset top ring (anchored to rim)
    rings[0].center.set(0, 0, 0);
    rings[0].velocity.set(0, 0, 0);
    rings[0].currentRadius = rings[0].naturalRadius;

    // 1. Apply spring forces between rings
    const springK = 300;
    const damping = 15;

    for (let i = 1; i < NUM_RINGS; i++) {
      const ring = rings[i];
      const above = rings[i - 1];

      // Spring pointing towards the resting position relative to the ring above
      const restPos = above.center
        .clone()
        .add(new THREE.Vector3(0, -RING_SPACING, 0));

      const force = restPos.clone().sub(ring.center).multiplyScalar(springK);

      // Gravity (keep it pulling down so it hangs straight)
      force.y -= 20;

      // Natural restoring force towards center line to prevent wild swinging
      const naturalPos = new THREE.Vector3(0, -i * RING_SPACING, 0);
      force.add(
        naturalPos
          .clone()
          .sub(ring.center)
          .multiplyScalar(springK * 0.2),
      );

      // Apply damping
      force.sub(ring.velocity.clone().multiplyScalar(damping));

      // Update velocity and position
      ring.velocity.add(force.multiplyScalar(dt));
      ring.center.add(ring.velocity.clone().multiplyScalar(dt));

      // Radius spring
      const rForce =
        (ring.naturalRadius - ring.currentRadius) * springK * 0.5 -
        ring.radiusVelocity * damping;
      ring.radiusVelocity += rForce * dt;
      ring.currentRadius += ring.radiusVelocity * dt;
    }

    // 2. Interact with basketballs
    const netWorldY = posY;
    ballRefs.current.forEach((ballRef) => {
      if (!ballRef) return;
      const pos = ballRef.translation();
      const vel = ballRef.linvel();

      // Convert ball pos to net local space
      const localBallY = pos.y - netWorldY;

      // Is the ball near the net vertically?
      if (localBallY > -NET_HEIGHT - BALL_RADIUS && localBallY < BALL_RADIUS) {
        let interacting = false;

        // Find closest ring
        for (let i = 1; i < NUM_RINGS; i++) {
          const ring = rings[i];
          const distY = Math.abs(localBallY - ring.center.y);

          if (distY < BALL_RADIUS) {
            // XZ distance from ring center to ball
            const dx = pos.x - posX - ring.center.x;
            const dz = pos.z - posZ - ring.center.z;
            const distXZ = Math.sqrt(dx * dx + dz * dz);

            // Strictly ignore balls that are outside the funnel/net bounds
            if (distXZ > ring.naturalRadius * 1.5 + BALL_RADIUS) {
              continue;
            }

            // Ball is pushing this ring
            interacting = true;

            // Calculate how much the ball pushes outward
            // The ball's cross-section radius at this Y distance
            const halfChord = Math.sqrt(
              Math.max(0, BALL_RADIUS * BALL_RADIUS - distY * distY),
            );

            const isInside = distXZ < ring.naturalRadius;

            if (isInside) {
              // If ball pushes past current radius
              const targetRadius = Math.max(
                ring.naturalRadius,
                distXZ + halfChord,
              );
              if (targetRadius > ring.currentRadius) {
                ring.currentRadius = targetRadius;
                ring.radiusVelocity = 0; // kill inward velocity
              }

              // Swish friction: pull ring center towards ball XZ, and drag it in ball velocity direction
              const dragForce = 150;
              const pullDir = new THREE.Vector3(dx, 0, dz).normalize();
              ring.velocity.add(pullDir.multiplyScalar(dragForce * dt));

              // Add some of ball's velocity to the ring (mostly downwards/directional)
              ring.velocity.add(
                new THREE.Vector3(vel.x, vel.y, vel.z).multiplyScalar(8 * dt),
              );
            } else {
              // Ball is completely outside the natural ring
              const ballEdgesIntoNet = distXZ - halfChord < ring.currentRadius;
              if (ballEdgesIntoNet) {
                const overlap = ring.currentRadius - (distXZ - halfChord);
                // Push the net's center AWAY from the ball
                const pushDir = new THREE.Vector3(-dx, 0, -dz).normalize();
                ring.velocity.add(pushDir.multiplyScalar(overlap * 300 * dt));
                // Add a little friction from grazing
                ring.velocity.add(
                  new THREE.Vector3(vel.x, vel.y, vel.z).multiplyScalar(3 * dt),
                );
              } else {
                interacting = false; // Ball was near but didn't touch
              }
            }
          }
        }

        // Apply resistance to the ball if it is moving through the net
        if (interacting && vel.y < 0) {
          const depthRatio = Math.max(0, Math.min(1, -localBallY / NET_HEIGHT));

          // Use velocity damping instead of raw impulses to avoid physics explosions.
          // The deeper the ball goes, the more velocity is damped per frame.
          // 8.0 * dt at 60fps means losing ~12.8% of velocity per frame when at maximum depth.
          const dampingFactor = 1 - Math.min(0.99, 8.0 * depthRatio * dt);

          ballRef.setLinvel(
            {
              x: vel.x * dampingFactor,
              y: vel.y * dampingFactor,
              z: vel.z * dampingFactor,
            },
            true,
          );
        }
      }
    });

    // 3. Update geometry vertices
    if (geometryRef.current) {
      const positions = geometryRef.current.attributes.position;

      // For a cylinder geometry (openEnded=true), the vertices are arranged in horizontal rings.
      // There are (heightSegments + 1) rings.
      // Each ring has (radialSegments + 1) vertices (the last one overlaps the first for UV seams).

      let vertexIndex = 0;
      for (let i = 0; i <= TUBE_SEGMENTS; i++) {
        const ring = rings[i];

        for (let j = 0; j <= RADIAL_SEGMENTS; j++) {
          const u = j / RADIAL_SEGMENTS;
          const theta = u * Math.PI * 2;

          const vx = ring.center.x + Math.cos(theta) * ring.currentRadius;
          const vy = ring.center.y;
          const vz = ring.center.z + Math.sin(theta) * ring.currentRadius;

          positions.setXYZ(vertexIndex, vx, vy, vz);
          vertexIndex++;
        }
      }

      positions.needsUpdate = true;
      geometryRef.current.computeVertexNormals();
    }
  });

  return (
    <mesh position={[posX, posY, posZ]}>
      <cylinderGeometry
        args={[
          TOP_RADIUS,
          BOTTOM_RADIUS,
          NET_HEIGHT,
          RADIAL_SEGMENTS,
          TUBE_SEGMENTS,
          true,
        ]}
        ref={geometryRef}
      />
      <meshStandardMaterial color="white" wireframe side={THREE.DoubleSide} />
    </mesh>
  );
}
