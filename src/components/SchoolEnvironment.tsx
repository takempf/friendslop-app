import { RigidBody } from '@react-three/rapier'
import { BasketballHoop } from './BasketballHoop'
import { Basketballs } from './Basketballs'

// Helper component for Walls/Floors
const Block = ({ position, args, color, restitution = 0 }: { position: [number, number, number], args: [number, number, number], color: string, restitution?: number }) => (
  <RigidBody type="fixed" position={position} colliders="cuboid" restitution={restitution}>
    <mesh castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshLambertMaterial color={color} />
    </mesh>
  </RigidBody>
)

export function SchoolEnvironment() {
  const wallHeight = 8;
  const wallThickness = 0.5;

  return (
    <group>
      {/* Lights */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 20, 10]} intensity={1.5} castShadow />

      {/* --- Gymnasium --- */}
      {/* Floor 20x20 */}
      <Block position={[0, -0.25, 0]} args={[20, 0.5, 20]} color="#8b5a2b" restitution={0.84} />
      
      {/* Walls for Gym */}
      {/* West Wall */}
      <Block position={[-10, wallHeight/2, 0]} args={[wallThickness, wallHeight, 20]} color="#dcdcdc" />
      {/* East Wall */}
      <Block position={[10, wallHeight/2, 0]} args={[wallThickness, wallHeight, 20]} color="#dcdcdc" />
      {/* South Wall */}
      <Block position={[0, wallHeight/2, 10]} args={[20, wallHeight, wallThickness]} color="#dcdcdc" />
      {/* North Wall - with a gap for the hallway */}
      <Block position={[-6, wallHeight/2, -10]} args={[8, wallHeight, wallThickness]} color="#dcdcdc" />
      <Block position={[6, wallHeight/2, -10]} args={[8, wallHeight, wallThickness]} color="#dcdcdc" />
      {/* The Hallway gap is from X=-2 to X=2 at Z=-10 */}

      {/* --- Hallway --- */}
      {/* Floor 4x20 (Z from -10 to -30) */}
      <Block position={[0, -0.25, -20]} args={[4, 0.5, 20]} color="#708090" restitution={0.84} />
      
      {/* Hallway Walls */}
      <Block position={[-2, wallHeight/2, -20]} args={[wallThickness, wallHeight, 20]} color="#f5f5dc" />
      <Block position={[2, wallHeight/2, -20]} args={[wallThickness, wallHeight, 20]} color="#f5f5dc" />
      {/* End of Hallway */}
      <Block position={[0, wallHeight/2, -30]} args={[4, wallHeight, wallThickness]} color="#f5f5dc" />

      {/* --- Classroom A (West of Hallway at Z=-25) --- */}
      {/* Opening in West Hallway wall is at Z=-25, width=2 */}
      <Block position={[-2, wallHeight/2, -15]} args={[wallThickness, wallHeight, 10]} color="#f5f5dc" />
      <Block position={[-2, wallHeight/2, -28]} args={[wallThickness, wallHeight, 6]} color="#f5f5dc" />
      
      {/* Floor 10x10 */}
      <Block position={[-7.5, -0.25, -25]} args={[10, 0.5, 10]} color="#5f9ea0" restitution={0.84} />
      {/* Classroom A Walls */}
      <Block position={[-12.5, wallHeight/2, -25]} args={[wallThickness, wallHeight, 10]} color="#fdf5e6" />
      <Block position={[-7.5, wallHeight/2, -20]} args={[10, wallHeight, wallThickness]} color="#fdf5e6" />
      <Block position={[-7.5, wallHeight/2, -30]} args={[10, wallHeight, wallThickness]} color="#fdf5e6" />

      {/* Basketball */}
      <BasketballHoop />
      <Basketballs />

      {/* --- Classroom B (East of Hallway at Z=-25) --- */}
      {/* Opening in East Hallway wall is at Z=-25, width=2 */}
      <Block position={[2, wallHeight/2, -15]} args={[wallThickness, wallHeight, 10]} color="#f5f5dc" />
      <Block position={[2, wallHeight/2, -28]} args={[wallThickness, wallHeight, 6]} color="#f5f5dc" />
      
      {/* Floor 10x10 */}
      <Block position={[7.5, -0.25, -25]} args={[10, 0.5, 10]} color="#5f9ea0" restitution={0.84} />
      {/* Classroom B Walls */}
      <Block position={[12.5, wallHeight/2, -25]} args={[wallThickness, wallHeight, 10]} color="#fdf5e6" />
      <Block position={[7.5, wallHeight/2, -20]} args={[10, wallHeight, wallThickness]} color="#fdf5e6" />
      <Block position={[7.5, wallHeight/2, -30]} args={[10, wallHeight, wallThickness]} color="#fdf5e6" />

    </group>
  )
}
