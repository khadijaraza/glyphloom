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
  cols: 120,
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
  cols: 96,
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
  cols: 120,
  glyphs: 'classic',
  cellStyle: 'tile',
  cutout: 0.35,
  grid: 0.5,
  contrast: 1.1,
  saturation: 1.2,
  effects: [
    { id: 'koi-drift', kind: 'drift', label: 'Koi', mask: { subject: true }, speed: 0.6, intensity: 0.3, scale: 1 },
    { id: 'koi-shimmer', kind: 'glow', label: 'Scales', mask: { subject: true, lum: [0.6, 1] }, speed: 1.2, intensity: 0.35, scale: 0.6 },
  ],
})

export const PREVIEW_OBJECT_RECIPE: Recipe = parseRecipe({
  cols: 80,
  cellStyle: 'tile',
  cutout: 0.35,
  grid: 0.5,
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
  cols: 150,
  glyphs: 'classic',
  cellStyle: 'glyph',
  cutout: 0.3,
  grid: 0.25,
  contrast: 0.95,
  brightness: -0.08,
  saturation: 1.25,
  effects: [
    { id: 'lily-bloom', kind: 'bloom', label: 'Lily', mask: { subject: true }, speed: 0.55, intensity: 0.55, scale: 1 },
    { id: 'lily-glow', kind: 'glow', label: 'Heart', mask: { subject: true, hue: [35, 60] }, speed: 0.8, intensity: 0.35, scale: 1.5 },
    { id: 'lily-dust', kind: 'sparkle', label: 'Pollen', mask: { subject: true, lum: [0.7, 1] }, speed: 0.6, intensity: 0.25, scale: 1 },
  ],
})
