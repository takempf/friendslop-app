import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import * as THREE from 'three'
import { useGameSync } from '../sync/GameSyncProvider'
import { audioManager } from '../audio/AudioManager'
import { getPlayerColor, getPlayerEmoji } from '../utils/colors'
import { getEmojiTexture } from '../utils/emojiTexture'
const _targetEuler = new THREE.Euler(0, 0, 0, 'XYZ')
const _targetQuat = new THREE.Quaternion()

export function RemotePlayers() {
  const { getPlayers } = useGameSync()
  const { camera, scene } = useThree()
  const groupRef = useRef<THREE.Group>(null)

  // Use a map to track existing player meshes
  const playerMeshes = useRef(new Map<number, THREE.Mesh>())
  const raycaster = useRef(new THREE.Raycaster())

  // We manually manage the children of the group based on getPlayers()
  // to avoid causing React re-renders 20 times a second.
  useFrame(() => {
    if (!groupRef.current) return
    const players = getPlayers()
    
    // Create new meshes & update existing
    players.forEach((state, id) => {
      let mesh = playerMeshes.current.get(id)
      
      if (!mesh) {
        // Create simple avatar representation (a capsule)
        const geometry = new THREE.CapsuleGeometry(0.3, 1, 4, 8)
        
        // Use 12 equidistant HSL colors deterministically assigned by clientId
        const color = new THREE.Color(getPlayerColor(id))
        
        const material = new THREE.MeshLambertMaterial({ color })
        mesh = new THREE.Mesh(geometry, material)
        mesh.castShadow = true
        mesh.receiveShadow = true
        
        const emoji = getPlayerEmoji(id)
        const emojiTexture = getEmojiTexture(emoji)
        const faceGeometry = new THREE.PlaneGeometry(0.6, 0.6)
        const faceMaterial = new THREE.MeshBasicMaterial({ 
          map: emojiTexture, 
          transparent: true,
          depthWrite: false
        })
        const faceMesh = new THREE.Mesh(faceGeometry, faceMaterial)
        faceMesh.position.set(0, 0.2, -0.31)
        faceMesh.rotation.y = Math.PI
        mesh.add(faceMesh)

        playerMeshes.current.set(id, mesh)
        groupRef.current!.add(mesh)
      }

      // Smoothly interpolate position and rotation
      if (state.position) {
         mesh.position.lerp(new THREE.Vector3(...state.position), 0.2)
         
         // Update audio positioning
         audioManager.updateRemotePlayer(id, [mesh.position.x, mesh.position.y, mesh.position.z])
         
         // Throttled Audio Occlusion via Raycasting (5Hz to save CPU)
         const now = performance.now()
         if (!mesh.userData.lastRaycast || now - mesh.userData.lastRaycast > 200) {
           mesh.userData.lastRaycast = now
           const dir = new THREE.Vector3().subVectors(mesh.position, camera.position)
           const dist = dir.length()
           dir.normalize()
           raycaster.current.set(camera.position, dir)
           
           const intersects = raycaster.current.intersectObjects(scene.children, true)
           let occluded = false
           for (const hit of intersects) {
             if (hit.distance < dist - 0.5 && hit.object !== mesh) {
                occluded = true
                break
             }
           }
           audioManager.setOcclusion(id, occluded)
         }
      }
      if (state.rotation) {
         _targetEuler.set(state.rotation[0], state.rotation[1], state.rotation[2], 'XYZ')
         _targetQuat.setFromEuler(_targetEuler)
         mesh.quaternion.slerp(_targetQuat, 0.2)
      }
    })

    // Remove stale meshes
    playerMeshes.current.forEach((mesh, id) => {
      if (!players.has(id)) {
        groupRef.current!.remove(mesh)
        playerMeshes.current.delete(id)
      }
    })
  })

  return <group ref={groupRef} />
}
