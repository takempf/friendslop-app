import { Quaternion, Vector3 } from "three";
export const DISC_MASS = 0.175;
export const DISC_ANGULAR_DAMPING = 0.18;
type Vector = { x: number; y: number; z: number };
const normal = new Vector3(),
  direction = new Vector3(),
  liftDirection = new Vector3();
const quaternion = new Quaternion();

/** Arcade disc aerodynamics: bank redirects lift, nose angle changes drag,
 * and signed spin supplies stability and handed late-flight fade. */
export function discAcceleration(
  velocity: Vector,
  rotation: Vector & { w: number },
  angularVelocity: Vector,
): Vector {
  quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  normal.set(0, 1, 0).applyQuaternion(quaternion);
  direction.set(velocity.x, velocity.y, velocity.z);
  const speed = direction.length();
  if (speed < 0.01) return { x: 0, y: 0, z: 0 };
  direction.divideScalar(speed);
  const incidence = normal.dot(direction);
  const signedSpin =
    normal.x * angularVelocity.x +
    normal.y * angularVelocity.y +
    normal.z * angularVelocity.z;
  const stability = Math.min(1, Math.abs(signedSpin) / 16);
  liftDirection.copy(normal).addScaledVector(direction, -incidence).normalize();
  const lift =
    Math.min(8.8, speed * speed * 0.045) *
    (0.45 + 0.55 * stability) *
    (1 - Math.min(0.9, Math.abs(incidence)));
  const drag = speed * (0.007 + Math.abs(incidence) * 0.035);
  return {
    x: liftDirection.x * lift - velocity.x * drag,
    y: liftDirection.y * lift - velocity.y * drag,
    z: liftDirection.z * lift - velocity.z * drag,
  };
}

/** Reduced-order gyroscopic precession. The rolling moment changes the
 * normal over time: high-speed turn, then stronger fade as speed falls.
 * This rotates the lift vector instead of applying a scripted sideways push.
 * More spin resists precession. Rapier still handles impacts and tumbling. */
export function discAngularVelocity(
  velocity: Vector,
  rotation: Vector & { w: number },
  angularVelocity: Vector,
): Vector {
  quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w).normalize();
  normal.set(0, 1, 0).applyQuaternion(quaternion);
  const speed = Math.hypot(velocity.x, velocity.z);
  const spin =
    normal.x * angularVelocity.x +
    normal.y * angularVelocity.y +
    normal.z * angularVelocity.z;
  if (speed < 2 || Math.abs(spin) < 4 || normal.y < 0.2)
    return { ...angularVelocity };
  const smooth = (min: number, max: number, value: number) => {
    const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
    return t * t * (3 - 2 * t);
  };
  const turn = smooth(11, 19, speed) * 1.65;
  const fade = (1 - smooth(9, 17, speed)) * 1.8;
  const spinResistance = Math.min(1.5, 30 / Math.max(12, Math.abs(spin)));
  const rollRate = (turn - fade) * -Math.sign(spin) * spinResistance;
  // Bank around travel direction, with a soft restoring limit at steep banks.
  const bank = Math.atan2(
    normal.x * -velocity.z + normal.z * velocity.x,
    normal.y * speed,
  );
  const limitedRate = rollRate - bank * 0.32;
  return {
    x: normal.x * spin + (velocity.x / speed) * limitedRate,
    y: normal.y * spin,
    z: normal.z * spin + (velocity.z / speed) * limitedRate,
  };
}
