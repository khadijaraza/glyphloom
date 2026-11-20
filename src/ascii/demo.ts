/**
 * A procedurally painted scene + matching recipe. Used by the landing hero
 * and the "try the demo scene" path in Create, so people can play with the
 * engine without spending any credits. Deterministic (seeded).
 */

import { parseRecipe, type Recipe } from './recipe'

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
}

/** Night sky, moon, hills, a lake, and drifting paper lanterns. */
export function paintLanternScene(w = 960, h = 600): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const rand = rng(7)
  const horizon = h * 0.64

  const sky = ctx.createLinearGradient(0, 0, 0, horizon)
  sky.addColorStop(0, '#05061a')
  sky.addColorStop(0.6, '#1b1648')
  sky.addColorStop(1, '#4a2a5e')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, horizon)

  // Stars
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(230,230,255,${0.3 + rand() * 0.6})`
    ctx.fillRect(rand() * w, rand() * horizon * 0.7, 1.6, 1.6)
  }

  // Moon
  const moon = ctx.createRadialGradient(w * 0.8, h * 0.16, 4, w * 0.8, h * 0.16, 70)
  moon.addColorStop(0, '#fffbe8')
  moon.addColorStop(0.45, '#f4eccc')
  moon.addColorStop(0.5, 'rgba(244,236,204,0.25)')
  moon.addColorStop(1, 'rgba(244,236,204,0)')
  ctx.fillStyle = moon
  ctx.fillRect(w * 0.8 - 80, h * 0.16 - 80, 160, 160)

  // Hills
  ctx.fillStyle = '#0d0b22'
  ctx.beginPath()
  ctx.moveTo(0, horizon)
  for (let x = 0; x <= w; x += 20) ctx.lineTo(x, horizon - 40 - Math.sin(x / 140) * 30 - Math.sin(x / 53) * 10)
  ctx.lineTo(w, horizon)
  ctx.fill()

  // Lake
  const lake = ctx.createLinearGradient(0, horizon, 0, h)
  lake.addColorStop(0, '#231b4a')
  lake.addColorStop(1, '#070818')
  ctx.fillStyle = lake
  ctx.fillRect(0, horizon, w, h - horizon)

  // Lanterns (+ their reflections in the lake)
  const lanterns: Array<[number, number, number]> = []
  for (let i = 0; i < 26; i++) {
    const y = h * (0.08 + rand() * 0.46)
    const s = 6 + (y / horizon) * 12 + rand() * 4
    lanterns.push([rand() * w, y, s])
  }
  for (const [x, y, s] of lanterns) {
    const halo = ctx.createRadialGradient(x, y, 0, x, y, s * 3)
    halo.addColorStop(0, 'rgba(255,170,60,0.55)')
    halo.addColorStop(1, 'rgba(255,120,40,0)')
    ctx.fillStyle = halo
    ctx.fillRect(x - s * 3, y - s * 3, s * 6, s * 6)
    const body = ctx.createLinearGradient(x, y - s, x, y + s)
    body.addColorStop(0, '#ffe09a')
    body.addColorStop(1, '#ff8a2b')
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.ellipse(x, y, s * 0.7, s, 0, 0, Math.PI * 2)
    ctx.fill()
    // reflection
    const ry = horizon + (horizon - y) * 0.5
    if (ry < h) {
      ctx.fillStyle = 'rgba(255,150,60,0.35)'
      ctx.fillRect(x - s * 0.6, ry, s * 1.2, s * 0.35)
    }
  }

  // Moon reflection column
  for (let y = horizon + 4; y < h; y += 7) {
    const wdt = 14 + rand() * 40
    ctx.fillStyle = `rgba(244,236,204,${0.12 + rand() * 0.2})`
    ctx.fillRect(w * 0.8 - wdt / 2, y, wdt, 2.5)
  }
  return c
}

export const DEMO_RECIPE: Recipe = parseRecipe({
  title: 'Lanterns over the lake',
  cols: 170,
  glyphs: 'classic',
  cellStyle: 'glyph',
  contrast: 1.25,
  brightness: 0.04,
  saturation: 1.25,
  effects: [
    { id: 'lantern-rise', kind: 'rise', label: 'Lanterns', mask: { hue: [15, 50], sat: [0.45, 1], lum: [0.4, 1], y: [0, 0.62] }, speed: 0.35, intensity: 0.2, scale: 1 },
    { id: 'lantern-glow', kind: 'glow', label: 'Lantern glow', mask: { hue: [10, 55], sat: [0.4, 1], lum: [0.25, 1] }, speed: 1, intensity: 0.45, scale: 1 },
    { id: 'lake', kind: 'shimmer', label: 'Lake', mask: { y: [0.66, 1] }, speed: 0.8, intensity: 0.55, scale: 1 },
    { id: 'stars', kind: 'sparkle', label: 'Stars', mask: { y: [0, 0.45], sat: [0, 0.3], lum: [0.25, 1] }, speed: 1, intensity: 0.5, scale: 1 },
  ],
})

/** Generic first-look recipe for previews before the AI has seen the image. */
export const PREVIEW_RECIPE: Recipe = parseRecipe({
  cols: 150,
  contrast: 1.2,
  saturation: 1.2,
  effects: [
    { id: 'glow', kind: 'glow', label: 'Highlights', mask: { lum: [0.6, 1] }, speed: 1, intensity: 0.4 },
    { id: 'breathe', kind: 'breathe', label: 'Ambience', mask: {}, speed: 0.6, intensity: 0.25 },
  ],
})

/** A koi on black: the free "object mode" demo. */
export function paintKoi(w = 1800, h = 1100): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  const cx = w * 0.46
  const cy = h * 0.5
  // The koi is painted at a fixed size, so in this larger frame it's small
  // and has room to swim.
  // tail
  ctx.fillStyle = '#ff7a2e'
  ctx.beginPath()
  ctx.moveTo(cx - 210, cy)
  ctx.quadraticCurveTo(cx - 330, cy - 120, cx - 360, cy - 70)
  ctx.quadraticCurveTo(cx - 300, cy, cx - 360, cy + 70)
  ctx.quadraticCurveTo(cx - 330, cy + 120, cx - 210, cy)
  ctx.fill()
  // fins
  ctx.fillStyle = '#ffb07a'
  for (const s of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(cx + 40, cy + s * 70, 70, 26, s * 0.7, 0, Math.PI * 2)
    ctx.fill()
  }
  // body
  const body = ctx.createLinearGradient(cx, cy - 90, cx, cy + 90)
  body.addColorStop(0, '#ff9a3c')
  body.addColorStop(0.5, '#ffe2c2')
  body.addColorStop(1, '#ff8a2b')
  ctx.fillStyle = body
  ctx.beginPath()
  ctx.ellipse(cx, cy, 230, 88, 0, 0, Math.PI * 2)
  ctx.fill()
  // spots
  ctx.fillStyle = '#e8322a'
  for (const [dx, dy, r] of [[-60, -30, 38], [40, 20, 30], [120, -20, 26], [-130, 25, 22]] as const) {
    ctx.beginPath()
    ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2)
    ctx.fill()
  }
  // eye
  ctx.fillStyle = '#111'
  ctx.beginPath()
  ctx.arc(cx + 185, cy - 22, 9, 0, Math.PI * 2)
  ctx.fill()
  return c
}

export const DEMO_OBJECT_RECIPE: Recipe = parseRecipe({
  title: 'Koi',
  cols: 240,
  glyphs: 'classic',
  cellStyle: 'dots',
  cutout: 0.35,
  grid: 0,
  contrast: 1.1,
  saturation: 1.2,
  effects: [
    { id: 'koi-drift', kind: 'drift', label: 'Koi', mask: { subject: true }, speed: 0.5, intensity: 0.35, scale: 1 },
    { id: 'koi-shimmer', kind: 'glow', label: 'Scales', mask: { subject: true, lum: [0.6, 1] }, speed: 1.2, intensity: 0.35, scale: 0.6 },
  ],
})

export const PREVIEW_OBJECT_RECIPE: Recipe = parseRecipe({
  cols: 220,
  cellStyle: 'dots',
  cutout: 0.35,
  grid: 0,
  saturation: 1.15,
  effects: [{ id: 'bob', kind: 'bob', label: 'Subject', mask: { subject: true }, speed: 0.8, intensity: 0.4 }],
})

/** A single pink water lily on black, painted fully open; the `bloom` effect closes and opens it. */
export function paintLily(w = 1400, h = 820): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  const cx = w / 2
  const cy = h * 0.8

  const petal = (angle: number, len: number, width: number, base: string, tip: string) => {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate(angle)
    const g = ctx.createLinearGradient(0, 0, 0, -len)
    g.addColorStop(0, base)
    g.addColorStop(1, tip)
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.quadraticCurveTo(width, -len * 0.45, 0, -len)
    ctx.quadraticCurveTo(-width, -len * 0.45, 0, 0)
    ctx.fill()
    // Dark outline: in ASCII the gaps between petals are what make them read as petals.
    ctx.strokeStyle = '#000'
    ctx.lineWidth = 10
    ctx.stroke()
    // A pale midrib down each petal.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(0, -len * 0.15)
    ctx.lineTo(0, -len * 0.85)
    ctx.stroke()
    ctx.restore()
  }
  const deg = Math.PI / 180
  // Outer ring: wide fan, deeper pink.
  for (const a of [-84, -62, -41, -20, 0, 20, 41, 62, 84]) petal(a * deg, 560 - Math.abs(a) * 1.6, 120, '#c2255c', '#ffc9de')
  // Inner ring: paler, more upright.
  for (const a of [-52, -27, 0, 27, 52]) petal(a * deg, 450 - Math.abs(a) * 1.4, 100, '#e64980', '#fff0f6')
  // Heart: a few cupped petals and the golden centre.
  for (const a of [-14, 14]) petal(a * deg, 300, 74, '#f06595', '#ffffff')
  const heart = ctx.createRadialGradient(cx, cy - 60, 4, cx, cy - 60, 100)
  heart.addColorStop(0, '#fff3bf')
  heart.addColorStop(1, '#f59f00')
  ctx.fillStyle = heart
  ctx.beginPath()
  ctx.ellipse(cx, cy - 60, 90, 56, 0, 0, Math.PI * 2)
  ctx.fill()
  return c
}

export const LILY_RECIPE: Recipe = parseRecipe({
  title: 'Lily',
  cols: 260,
  glyphs: 'classic',
  cellStyle: 'dots',
  colorMode: 'mono',
  ink: '#f3ede0',
  cutout: 0.3,
  grid: 0,
  contrast: 1.05,
  brightness: 0,
  saturation: 1,
  effects: [
    { id: 'lily-bloom', kind: 'bloom', label: 'Lily', mask: { subject: true }, speed: 0.55, intensity: 0.85, scale: 1 },
    { id: 'lily-glow', kind: 'glow', label: 'Heart', mask: { subject: true, hue: [35, 60] }, speed: 0.8, intensity: 0.35, scale: 1.5 },
    { id: 'lily-dust', kind: 'sparkle', label: 'Pollen', mask: { subject: true, lum: [0.7, 1] }, speed: 0.6, intensity: 0.25, scale: 1 },
  ],
})

/**
 * An original flower drawn for line-art stipple: long thin curling petals, a
 * trailing leaf and stem, and stamens radiating from the heart. Painted as
 * soft grey fills with bright rims; the recipe's `edges` turns rims into dense
 * dot outlines and fills into sparse speckle.
 */
export function paintStippleFlower(w = 1200, h = 1200): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, w, h)
  const rand = rng(11)
  const O = { x: 600, y: 470 } // heart of the flower

  type P = [number, number]
  /**
   * A petal from the heart to `tip`: `width` is its half-width at the widest
   * point, `bend` curves it sideways (positive = clockwise), `fill` its body.
   */
  const petal = (tip: P, width: number, bend = 0, fill = 0.3) => {
    const dx = tip[0] - O.x
    const dy = tip[1] - O.y
    const len = Math.hypot(dx, dy)
    const nx = -dy / len
    const ny = dx / len
    const at = (t: number, off: number): P => [O.x + dx * t + nx * (off + bend * Math.sin(t * Math.PI)), O.y + dy * t + ny * (off + bend * Math.sin(t * Math.PI))]
    const a1 = at(0.3, width * 0.9)
    const a2 = at(0.78, width * 0.75)
    const b1 = at(0.3, -width * 0.9)
    const b2 = at(0.78, -width * 0.75)
    ctx.beginPath()
    ctx.moveTo(O.x, O.y)
    ctx.bezierCurveTo(a1[0], a1[1], a2[0], a2[1], tip[0], tip[1])
    ctx.bezierCurveTo(b2[0], b2[1], b1[0], b1[1], O.x, O.y)
    const g = ctx.createLinearGradient(O.x, O.y, tip[0], tip[1])
    g.addColorStop(0, `rgba(255,255,255,${fill + 0.3})`)
    g.addColorStop(1, `rgba(255,255,255,${fill * 0.55})`)
    ctx.fillStyle = g
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'
    ctx.lineWidth = 6
    ctx.stroke()
    // A few soft veins running out toward the tip.
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 3
    for (const off of [-0.35, 0, 0.35]) {
      const m = at(0.55, width * off)
      ctx.beginPath()
      ctx.moveTo(O.x, O.y)
      ctx.quadraticCurveTo(m[0], m[1], ...at(0.92, width * off * 0.4))
      ctx.stroke()
    }
  }

  // Stem and a long trailing leaf, drawn first so petals sit over them.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'
  ctx.lineWidth = 9
  ctx.beginPath()
  ctx.moveTo(O.x - 20, O.y + 40)
  ctx.bezierCurveTo(540, 760, 450, 980, 340, 1170)
  ctx.stroke()
  petal([150, 880], 46, -40, 0.18)

  // Back petals, broad and overlapping.
  petal([380, 120], 120, 30, 0.28)
  petal([640, 60], 110, -20, 0.3)
  // The big petal to the right, bending down with its tip folded back.
  petal([1010, 360], 150, 70, 0.34)
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.moveTo(1010, 360)
  ctx.quadraticCurveTo(1070, 330, 1030, 420)
  ctx.stroke()
  // Wide petal sweeping left and slightly down.
  petal([140, 380], 130, -50, 0.3)
  // Lower petals: one drooping right, one hanging down.
  petal([900, 800], 85, 40, 0.22)
  petal([600, 940], 70, -30, 0.2)

  // Stamens: thin lines radiating up and out, each tipped with a bright anther.
  for (let i = 0; i < 60; i++) {
    const a = (-170 + rand() * 160) * (Math.PI / 180)
    const len = 90 + rand() * 150
    const ex = O.x + Math.cos(a) * len
    const ey = O.y + Math.sin(a) * len
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'
    ctx.lineWidth = 3.5
    ctx.beginPath()
    ctx.moveTo(O.x, O.y)
    ctx.quadraticCurveTo(O.x + Math.cos(a) * len * 0.5 + (rand() - 0.5) * 20, O.y + Math.sin(a) * len * 0.5, ex, ey)
    ctx.stroke()
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(ex, ey, 6 + rand() * 4, 0, Math.PI * 2)
    ctx.fill()
  }
  // Dense, bright heart.
  const heart = ctx.createRadialGradient(O.x, O.y, 0, O.x, O.y, 130)
  heart.addColorStop(0, 'rgba(255,255,255,0.95)')
  heart.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = heart
  ctx.beginPath()
  ctx.arc(O.x, O.y, 130, 0, Math.PI * 2)
  ctx.fill()
  return c
}

export const STIPPLE_FLOWER_RECIPE: Recipe = parseRecipe({
  title: 'Night flower',
  cols: 300,
  glyphs: 'classic',
  cellStyle: 'dots',
  colorMode: 'mono',
  ink: '#eef4f7',
  background: '#1b1b1b',
  cutout: 0.12,
  edges: 0.7,
  grid: 0,
  contrast: 1.2,
  brightness: 0.05,
  effects: [
    { id: 'flower-breathe', kind: 'bloom', label: 'Flower', mask: { subject: true }, speed: 0.3, intensity: 0.12, scale: 1 },
    { id: 'flower-sway', kind: 'sway', label: 'Petals', mask: { subject: true }, speed: 0.5, intensity: 0.35, scale: 2.2 },
    { id: 'anthers', kind: 'sparkle', label: 'Anthers', mask: { subject: true, lum: [0.75, 1] }, speed: 0.5, intensity: 0.3, scale: 1 },
  ],
})
