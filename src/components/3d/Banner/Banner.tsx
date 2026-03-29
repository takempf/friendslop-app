import { useRef, useMemo, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { GRAVITY } from "@/constants/physics";

// Cloth grid resolution
const COLS = 32;
const ROWS = 20;

// Simulation constants
const DAMPING = 0.985; // per-step velocity damping (higher = less drag, more natural drape)
const CONSTRAINT_ITERS = 3; // fewer iterations = softer/more pliable cloth that can bunch
const PIN_INSET = 0.125; // how far each top-corner pin is moved inward, creating slack

interface Particle {
  x: number;
  y: number;
  z: number;
  px: number; // previous x (Verlet)
  py: number;
  pz: number;
  pinned: boolean;
}

interface Spring {
  a: number;
  b: number;
  rest: number;
}

interface SimState {
  particles: Particle[];
  springs: Spring[];
  geometry: THREE.BufferGeometry;
}

function initSim(
  centerX: number,
  topY: number,
  wallZ: number,
  width: number,
  height: number,
): SimState {
  const leftX = centerX - width / 2;

  // --- particles ---
  const particles: Particle[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const u = col / (COLS - 1);
      const v = row / (ROWS - 1);
      const x = leftX + u * width;
      const y = topY - v * height;
      const z = wallZ;
      const pinned = row === 0 && (col === 0 || col === COLS - 1);
      particles.push({ x, y, z, px: x, py: y, pz: z, pinned });
    }
  }

  // --- springs (computed from natural positions before inset) ---
  const springs: Spring[] = [];
  const addSpring = (a: number, b: number) => {
    const pa = particles[a];
    const pb = particles[b];
    const dx = pb.x - pa.x;
    const dy = pb.y - pa.y;
    const dz = pb.z - pa.z;
    springs.push({ a, b, rest: Math.sqrt(dx * dx + dy * dy + dz * dz) });
  };

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      if (col < COLS - 1) addSpring(i, i + 1); // horizontal structural
      if (row < ROWS - 1) addSpring(i, i + COLS); // vertical structural
      if (col < COLS - 1 && row < ROWS - 1) addSpring(i, i + COLS + 1); // shear ↘
      if (col > 0 && row < ROWS - 1) addSpring(i, i + COLS - 1); // shear ↙
    }
  }

  // Move pins inward after springs are computed — excess cloth length creates the natural sag.
  const leftPin = particles[0];
  leftPin.x += PIN_INSET;
  leftPin.px = leftPin.x;
  const rightPin = particles[COLS - 1];
  rightPin.x -= PIN_INSET;
  rightPin.px = rightPin.x;

  // --- geometry ---
  const nVerts = COLS * ROWS;
  const positions = new Float32Array(nVerts * 3);
  const uvs = new Float32Array(nVerts * 2);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      const p = particles[i];
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = p.z;
      uvs[i * 2] = 1 - col / (COLS - 1); // flip U: front face would mirror otherwise
      uvs[i * 2 + 1] = 1 - row / (ROWS - 1); // flip V so top of image is top of banner
    }
  }

  const indices: number[] = [];
  for (let row = 0; row < ROWS - 1; row++) {
    for (let col = 0; col < COLS - 1; col++) {
      const a = row * COLS + col;
      const b = row * COLS + (col + 1);
      const c = (row + 1) * COLS + col;
      const d = (row + 1) * COLS + (col + 1);
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return { particles, springs, geometry };
}

interface BannerProps {
  /** Top-center point of the banner on the wall: [centerX, topY, wallZ] */
  position: [number, number, number];
  /** URL or imported asset path for the banner image */
  imageSrc: string;
  /** Banner width in meters */
  width: number;
  /** Banner height in meters */
  height: number;
}

export function Banner({ position, imageSrc, width, height }: BannerProps) {
  const [centerX, topY, wallZ] = position;

  const texture = useMemo(() => {
    const t = new THREE.TextureLoader().load(imageSrc);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [imageSrc]);

  const [sim] = useState<SimState>(() =>
    initSim(centerX, topY, wallZ, width, height),
  );
  const simRef = useRef<SimState>(sim);

  useFrame((_, delta) => {
    const { particles, springs, geometry } = simRef.current;
    const wz = wallZ;

    const dt = Math.min(delta, 1 / 60);
    const dtSq = dt * dt;

    // 1. Verlet integration with damping + gravity
    for (const p of particles) {
      if (p.pinned) continue;

      const vx = (p.x - p.px) * DAMPING;
      const vy = (p.y - p.py) * DAMPING;
      const vz = (p.z - p.pz) * DAMPING;

      p.px = p.x;
      p.py = p.y;
      p.pz = p.z;

      p.x += vx;
      p.y += vy + GRAVITY * dtSq;
      p.z += vz;
    }

    // 2. Constraint relaxation (Gauss-Seidel)
    for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
      for (const s of springs) {
        const pa = particles[s.a];
        const pb = particles[s.b];

        const dx = pb.x - pa.x;
        const dy = pb.y - pa.y;
        const dz = pb.z - pa.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 1e-10) continue;

        const factor = ((dist - s.rest) / dist) * 0.5;
        const cx = dx * factor;
        const cy = dy * factor;
        const cz = dz * factor;

        if (!pa.pinned) {
          pa.x += cx;
          pa.y += cy;
          pa.z += cz;
        }
        if (!pb.pinned) {
          pb.x -= cx;
          pb.y -= cy;
          pb.z -= cz;
        }
      }
    }

    // 3. Wall collision: never let the banner sink into the wall.
    for (const p of particles) {
      if (p.z > wz + 0.01) p.z = wz + 0.01;
    }

    // 4. Push geometry update to GPU.
    const posAttr = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < particles.length; i++) {
      posAttr.setXYZ(i, particles[i].x, particles[i].y, particles[i].z);
    }
    posAttr.needsUpdate = true;
    geometry.computeVertexNormals();
  });

  return (
    <mesh>
      <primitive object={sim.geometry} attach="geometry" />
      <meshStandardMaterial
        map={texture}
        side={THREE.DoubleSide}
        roughness={0.85}
        metalness={0.0}
      />
    </mesh>
  );
}
