import * as THREE from 'three'

function createBasketballTexture(): THREE.CanvasTexture {
  const W = 512, H = 256
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!

  // Orange base
  ctx.fillStyle = '#e85d04'
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = '#1a0800'
  ctx.lineWidth = 4
  ctx.lineCap = 'round'

  const amp = H * 0.22  // ±22% vertical swing

  // Two sinusoidal horizontal seams (the "equatorial" great-circle pair)
  for (const phase of [0, Math.PI]) {
    ctx.beginPath()
    for (let x = 0; x <= W; x++) {
      const y = H / 2 + amp * Math.sin((x / W) * Math.PI * 2 + phase)
      if (x === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }

  // Two sinusoidal vertical seams (the perpendicular great-circle pair)
  // centered at u=0.25 and u=0.75, with slight horizontal curvature
  const ampU = W * 0.03
  for (const uCenter of [W * 0.25, W * 0.75]) {
    ctx.beginPath()
    for (let y = 0; y <= H; y++) {
      const x = uCenter + ampU * Math.sin((y / H) * Math.PI * 2)
      if (y === 0) {
        ctx.moveTo(x, y)
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
  }

  return new THREE.CanvasTexture(canvas)
}

// Created once at module load — shared by all ball instances
export const basketballTexture = createBasketballTexture()
