/**
 * The fixed ASCII renderer. Image → cell grid → glyphs → per-frame effects.
 *
 * Everything the AI controls arrives as a `Recipe`; this file is the only
 * code that draws. Effects work on *masks* (soft selections of cells by
 * brightness, hue, saturation and vertical band, computed from the original
 * image) so "the lanterns" or "the water" can move independently.
 *
 * Browser-only (canvas). Kept free of React so the editor, thumbnails and the
 * inbox can share one implementation.
 */

import { BLEND_MODES, GLYPH_SETS, type Effect, type Mask, type Recipe } from './recipe'
import { AnimatedSource, type Source } from './source'

/** Character cells are taller than wide; tiles are square. */
const CELL_ASPECT = { glyph: 0.58, tile: 1, dots: 1 } as const
/** Smallest legible cell width per style, CSS px. */
const MIN_CELL_PX = { glyph: 5, tile: 6, dots: 2.6 } as const

export interface SourceGrid {
  cols: number
  rows: number
  /** Original color, 0–1. */
  r: Float32Array
  g: Float32Array
  b: Float32Array
  lum: Float32Array
  hue: Float32Array
  sat: Float32Array
}

/** Downsample an image to the recipe's grid. Area-averaged by the browser's scaler. */
export function sampleImage(
  img: CanvasImageSource & { width: number; height: number },
  cols: number,
  cellStyle: Recipe['cellStyle'],
  opts: { pixelate?: number; heightScale?: number } = {},
): SourceGrid {
  const w = (img as HTMLImageElement).naturalWidth || img.width
  const h = (img as HTMLImageElement).naturalHeight || img.height
  const rows = Math.max(8, Math.round(cols * (h / w) * CELL_ASPECT[cellStyle] * (opts.heightScale ?? 1)))
  // Two-step downscale keeps detail without aliasing on large sources.
  const mid = document.createElement('canvas')
  mid.width = cols * 4
  mid.height = rows * 4
  const mctx = mid.getContext('2d')!
  mctx.imageSmoothingQuality = 'high'
  mctx.drawImage(img, 0, 0, mid.width, mid.height)
  const c = document.createElement('canvas')
  c.width = cols
  c.height = rows
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.imageSmoothingQuality = 'high'
  const block = (opts.pixelate ?? 0) + 1
  if (block > 1) {
    // Pixelate: average into coarse blocks, then blow back up with hard edges.
    const sw = Math.max(1, Math.round(cols / block))
    const sh = Math.max(1, Math.round(rows / block))
    const small = document.createElement('canvas')
    small.width = sw
    small.height = sh
    const sctx = small.getContext('2d')!
    sctx.imageSmoothingQuality = 'high'
    sctx.drawImage(mid, 0, 0, sw, sh)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(small, 0, 0, cols, rows)
  } else {
    ctx.drawImage(mid, 0, 0, cols, rows)
  }
  const data = ctx.getImageData(0, 0, cols, rows).data
  const n = cols * rows
  const grid: SourceGrid = {
    cols,
    rows,
    r: new Float32Array(n),
    g: new Float32Array(n),
    b: new Float32Array(n),
    lum: new Float32Array(n),
    hue: new Float32Array(n),
    sat: new Float32Array(n),
  }
  for (let i = 0; i < n; i++) {
    const r = data[i * 4] / 255
    const g = data[i * 4 + 1] / 255
    const b = data[i * 4 + 2] / 255
    grid.r[i] = r
    grid.g[i] = g
    grid.b[i] = b
    grid.lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
    const [hh, ss] = hueSat(r, g, b)
    grid.hue[i] = hh
    grid.sat[i] = ss
  }
  return grid
}

function hueSat(r: number, g: number, b: number): [number, number] {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d < 1e-5) return [0, 0]
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  if (h < 0) h += 360
  return [h, max === 0 ? 0 : d / max]
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

function inRange(v: number, [a, b]: [number, number], soft = 0.06) {
  return smooth(a - soft, a + soft, v) * (1 - smooth(b - soft, b + soft, v))
}

function inHue(h: number, [a, b]: [number, number], soft = 12) {
  if (a <= b) return inRange(h, [a, b], soft)
  // Wrapping range, e.g. [330, 30] for reds.
  return Math.max(inRange(h, [a, 360 + soft], soft), inRange(h, [-soft, b], soft))
}

/** Soft 0–1 membership of each cell in a mask. An empty mask selects everything. */
export function maskWeights(grid: SourceGrid, mask: Mask, keep?: Float32Array | null): Float32Array {
  const n = grid.cols * grid.rows
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    let w = 1
    if (mask.subject && keep) w *= keep[i]
    if (mask.lum) w *= inRange(grid.lum[i], mask.lum)
    if (mask.sat) w *= inRange(grid.sat[i], mask.sat)
    if (mask.hue) w *= inHue(grid.hue[i], mask.hue) * smooth(0.06, 0.18, grid.sat[i])
    if (mask.y) w *= inRange(Math.floor(i / grid.cols) / (grid.rows - 1), mask.y, 0.03)
    out[i] = w
  }
  return out
}

/** Integer hash → [0, 1). */
function hash2(x: number, y: number) {
  let h = (x * 374761393 + y * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

const hexToRgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16)
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]
}

/** Quantized color → cached CSS string (32 levels per channel). */
const colorCache = new Map<number, string>()
function css(r: number, g: number, b: number) {
  const qr = Math.max(0, Math.min(31, (r * 31 + 0.5) | 0))
  const qg = Math.max(0, Math.min(31, (g * 31 + 0.5) | 0))
  const qb = Math.max(0, Math.min(31, (b * 31 + 0.5) | 0))
  const key = (qr << 10) | (qg << 5) | qb
  let s = colorCache.get(key)
  if (!s) {
    s = `rgb(${(qr * 255) / 31 | 0},${(qg * 255) / 31 | 0},${(qb * 255) / 31 | 0})`
    colorCache.set(key, s)
  }
  return s
}

/**
 * Soft "keep" weight per cell for background removal: 1 = subject, 0 = background.
 * The background color is the median of the border cells; cells close to it,
 * or very dark, are dropped. `amount` widens the tolerance.
 */
export function cutoutWeights(grid: SourceGrid, amount: number): Float32Array {
  const { cols, rows } = grid
  const border: number[] = []
  for (let x = 0; x < cols; x++) border.push(x, (rows - 1) * cols + x)
  for (let y = 0; y < rows; y++) border.push(y * cols, y * cols + cols - 1)
  const med = (arr: Float32Array) => {
    const v = border.map((i) => arr[i]).sort((a, b) => a - b)
    return v[v.length >> 1]
  }
  const br = med(grid.r), bg = med(grid.g), bb = med(grid.b)
  const tol = 0.04 + amount * 0.42
  const dark = amount * 0.22
  const out = new Float32Array(cols * rows)
  for (let i = 0; i < out.length; i++) {
    const d = Math.hypot(grid.r[i] - br, grid.g[i] - bg, grid.b[i] - bb)
    out[i] = smooth(tol * 0.7, tol * 1.3, d) * smooth(dark * 0.6, dark * 1.4 + 0.001, grid.lum[i])
  }
  return out
}

interface PreparedEffect {
  effect: Effect
  weights: Float32Array
  /** Per-row background estimate used to fill the hole a moving region leaves. */
  fill?: Float32Array // rows * 3
  /** Drift: the mask's bounding box (cells), so the swim wave knows head from tail. */
  box?: { minX: number; maxX: number; minY: number; maxY: number }
  /** Phase/bloom: the masked region's centroid (cells), radius (column units) and base row. */
  disc?: { cx: number; cy: number; r: number; base: number }
}

function boxOf(grid: SourceGrid, weights: Float32Array) {
  let minX = grid.cols, maxX = 0, minY = grid.rows, maxY = 0
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0.5) continue
    const x = i % grid.cols
    const y = Math.floor(i / grid.cols)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  return minX > maxX ? { minX: 0, maxX: grid.cols - 1, minY: 0, maxY: grid.rows - 1 } : { minX, maxX, minY, maxY }
}

/** Centroid and equal-area radius of a mask, measured in column-width units. */
function discOf(grid: SourceGrid, weights: Float32Array, rowScale: number) {
  let sx = 0, sy = 0, n = 0
  const ys: number[] = []
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] > 0.5) {
      sx += i % grid.cols
      const y = Math.floor(i / grid.cols)
      sy += y
      ys.push(y)
      n++
    }
  }
  if (!n) return { cx: grid.cols / 2, cy: grid.rows / 2, r: 1, base: grid.rows - 1 }
  ys.sort((a, b) => a - b)
  return { cx: sx / n, cy: sy / n, r: Math.sqrt((n * rowScale) / Math.PI), base: ys[Math.floor(ys.length * 0.92)] }
}

/** Graded color after global tone controls, per cell. */
interface Graded {
  r: Float32Array
  g: Float32Array
  b: Float32Array
  lum: Float32Array
}

export class AsciiEngine {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private image: (CanvasImageSource & { width: number; height: number }) | null = null
  /** Set when the source is a GIF: the current frame is swapped into `image`. */
  private anim: AnimatedSource | null = null
  private frameIdx = -1
  private recipe: Recipe
  private grid: SourceGrid | null = null
  private graded: Graded | null = null
  private effects: PreparedEffect[] = []
  /** Background-cutout keep weights, or null when cutout is off. */
  private keep: Float32Array | null = null
  /** Fixed device-pixel ratio (GIF capture); null follows the screen. */
  private fixedDpr: number | null = null
  private gridKey = ''
  private highlight: string | null = null
  private raf = 0
  private start = performance.now()
  private lastFrame = 0
  private cssWidth = 0
  /** Last rendered glyphs, for text export. */
  private lastGlyphs: string[] = []
  private out = { rgb: new Uint8Array(0), dot: new Float32Array(0) }
  private lastMeta: Omit<FrameCells, 'chars' | 'rgb' | 'dot'> | null = null
  paused = false

  constructor(canvas: HTMLCanvasElement, recipe: Recipe, opts: { dpr?: number; maxCols?: boolean } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { willReadFrequently: opts.dpr !== undefined })!
    this.recipe = recipe
    this.fixedDpr = opts.dpr ?? null
    this.capCols = opts.maxCols !== false
  }

  private capCols: boolean

  setImage(src: Source) {
    this.anim = src instanceof AnimatedSource ? src : null
    this.frameIdx = this.anim ? 0 : -1
    this.image = this.anim ? this.anim.frames[0] : (src as Exclude<Source, AnimatedSource>)
    this.gridKey = ''
    this.prepare()
  }

  /** Swap in the GIF frame for time t (seconds); re-samples when it changes. */
  private syncFrame(t: number) {
    if (!this.anim) return
    const idx = this.anim.frameAt(t * 1000 * Math.max(0.05, this.recipe.tempo))
    if (idx === this.frameIdx) return
    this.frameIdx = idx
    this.image = this.anim.frames[idx]
    this.gridKey = ''
    this.prepare(false)
  }

  setRecipe(recipe: Recipe) {
    this.recipe = recipe
    this.prepare()
  }

  setHighlight(effectId: string | null) {
    this.highlight = effectId
  }

  /** Width in CSS pixels the canvas should fill. Height follows the grid. */
  setWidth(cssWidth: number) {
    this.cssWidth = Math.max(100, Math.floor(cssWidth))
    // Narrow screens get fewer columns so glyphs stay legible.
    if (this.effectiveCols() !== this.grid?.cols) this.prepare()
    else this.resize()
    // Draw immediately rather than waiting for the next animation frame: resizing
    // clears the canvas, and hidden tabs don't get animation frames at all.
    this.draw(this.paused ? 1.7 : (performance.now() - this.start) / 1000)
  }

  get rows() {
    return this.grid?.rows ?? 0
  }

  run() {
    cancelAnimationFrame(this.raf)
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop)
      // ~40 fps cap: plenty for ASCII and halves the draw cost.
      if (now - this.lastFrame < 24) return
      this.lastFrame = now
      if (!this.paused) this.draw((now - this.start) / 1000)
    }
    this.raf = requestAnimationFrame(loop)
  }

  stop() {
    cancelAnimationFrame(this.raf)
  }

  /** The most recently drawn frame as plain text (for "copy as text"). */
  textFrame(): string {
    if (!this.grid) return ''
    const { cols, rows } = this.grid
    const lines: string[] = []
    for (let y = 0; y < rows; y++) lines.push(this.lastGlyphs.slice(y * cols, (y + 1) * cols).join('').trimEnd())
    return lines.join('\n')
  }

  private effectiveCols() {
    if (!this.cssWidth || !this.capCols) return this.recipe.cols
    return Math.max(32, Math.min(this.recipe.cols, Math.floor(this.cssWidth / MIN_CELL_PX[this.recipe.cellStyle])))
  }

  private prepare(drawAfter = true) {
    if (!this.image) return
    const cols = this.effectiveCols()
    const key = `${cols}:${this.recipe.cellStyle}:${this.recipe.pixelate}:${this.recipe.heightScale}`
    if (key !== this.gridKey) {
      this.grid = sampleImage(this.image, cols, this.recipe.cellStyle, { pixelate: this.recipe.pixelate, heightScale: this.recipe.heightScale })
      this.gridKey = key
      this.resize()
    }
    const grid = this.grid!
    this.graded = grade(grid, this.recipe)
    this.keep = this.recipe.cutout > 0 ? cutoutWeights(grid, this.recipe.cutout) : null
    this.effects = this.recipe.effects
      .filter((e) => e.enabled)
      .map((effect) => {
        const weights = maskWeights(grid, effect.mask, this.keep)
        const p: PreparedEffect = { effect, weights }
        if (isMover(effect.kind)) p.fill = rowFill(grid, this.graded!, weights)
        if (effect.kind === 'drift') p.box = boxOf(grid, weights)
        if (effect.kind === 'phase' || effect.kind === 'bloom') p.disc = discOf(grid, weights, 1 / CELL_ASPECT[this.recipe.cellStyle])
        return p
      })
    // Moving effects decide *which* cell shows, so they run before the rest.
    this.effects.sort((a, b) => order(a.effect.kind) - order(b.effect.kind))
    if (drawAfter) this.draw(this.paused ? 1.7 : (performance.now() - this.start) / 1000)
  }

  private resize() {
    if (!this.grid || !this.cssWidth) return
    const dpr = this.fixedDpr ?? Math.min(2, window.devicePixelRatio || 1)
    const cw = this.cssWidth / this.grid.cols
    const ch = cw / CELL_ASPECT[this.recipe.cellStyle]
    const cssHeight = Math.round(ch * this.grid.rows)
    this.canvas.style.width = `${this.cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    this.canvas.width = Math.round(this.cssWidth * dpr)
    this.canvas.height = Math.round(cssHeight * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  /** Render one frame at time t (seconds). Public so paused/thumbnail views can draw once. */
  draw(t: number) {
    this.syncFrame(t)
    const grid = this.grid
    const graded = this.graded
    if (!grid || !graded || !this.cssWidth) return
    const ctx = this.ctx
    const { cols, rows } = grid
    const recipe = this.recipe
    const ramp = GLYPH_SETS[recipe.glyphs]
    const rampMax = ramp.length - 1
    const cw = this.cssWidth / cols
    const ch = cw / CELL_ASPECT[recipe.cellStyle]
    const [bgR, bgG, bgB] = hexToRgb(recipe.background)
    const [inkR, inkG, inkB] = hexToRgb(recipe.ink)
    const tile = recipe.cellStyle === 'tile'
    const dots = recipe.cellStyle === 'dots'
    const blocks = recipe.glyphs === 'blocks'
    const time = t * recipe.tempo

    ctx.globalCompositeOperation = 'source-over'
    if (recipe.transparent) ctx.clearRect(0, 0, this.cssWidth, ch * rows)
    else {
      ctx.fillStyle = recipe.background
      ctx.fillRect(0, 0, this.cssWidth, ch * rows)
    }
    // At stipple density a grid is just noise.
    if (recipe.grid > 0 && cw >= 5) {
      ctx.strokeStyle = `rgba(255,255,255,${0.09 * recipe.grid})`
      ctx.lineWidth = 0.5
      ctx.beginPath()
      for (let c = 0; c <= cols; c++) {
        ctx.moveTo(c * cw, 0)
        ctx.lineTo(c * cw, ch * rows)
      }
      for (let r = 0; r <= rows; r++) {
        ctx.moveTo(0, r * ch)
        ctx.lineTo(this.cssWidth, r * ch)
      }
      ctx.stroke()
    }
    ctx.font = `${Math.max(4, ch * (tile ? 0.72 : 0.92))}px ui-monospace, "SF Mono", Menlo, monospace`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'

    const highlight = this.highlight ? this.effects.find((e) => e.effect.id === this.highlight) : null
    const glyphs = this.lastGlyphs
    glyphs.length = cols * rows
    // Per-cell record of what was drawn, for the SVG/HTML/JSON/ANSI exports.
    const n = cols * rows
    if (this.out.rgb.length !== n * 3) this.out = { rgb: new Uint8Array(n * 3), dot: new Float32Array(n * 3) }
    this.out.dot.fill(0)
    this.lastMeta = { cols, rows, cw, ch, t, cellStyle: recipe.cellStyle, background: recipe.background, transparent: recipe.transparent }
    // Characters composite over the ground with the chosen blend mode.
    ctx.globalCompositeOperation = BLEND_MODES[recipe.blend]

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let src = y * cols + x
        let fillRgb: [number, number, number] | null = null
        let blend: { fx: number; fy: number; wrapX: boolean; wrapY: boolean; weights: Float32Array } | null = null
        let dx = 0
        let m = 1
        let glyphOverride = -1

        for (const p of this.effects) {
          const e = p.effect
          const sp = e.speed
          const k = e.intensity
          switch (e.kind) {
            case 'rise':
            case 'wind':
            case 'bob':
            case 'drift':
            case 'bloom': {
              if (fillRgb === null && src !== y * cols + x) break // another mover already claimed it
              // Each mover maps this cell to a *fractional* source position; the color is
              // blended from the neighbouring cells so motion glides instead of snapping.
              // The whole masked layer moves as one sheet.
              let fx = x
              let fy = y
              if (e.kind === 'rise') {
                fy = y + (((time * sp * (2 + 10 * k)) % rows) + rows) % rows
                fx = x + Math.sin(time * sp * 0.7 + y * 0.15) * e.scale * 0.8
              } else if (e.kind === 'wind') {
                fx = x - (((time * sp * (2 + 10 * k)) % cols) + cols) % cols
              } else if (e.kind === 'bob') {
                fy = y + Math.sin(time * sp * 1.4) * (1 + k * 4) * e.scale
                fx = x + Math.sin(time * sp * 0.7) * k * 1.5
              } else if (e.kind === 'drift') {
                // Swim: travel across along one slow sine path, while a wave runs down the
                // body from head (leading edge) to tail, growing toward the tail.
                const travel = time * sp * (1.5 + 5 * k)
                const path = Math.sin((travel / cols) * Math.PI * 2 * e.scale) * rows * 0.16 * (0.4 + k)
                const bx = (((x - travel) % cols) + cols) % cols
                const box = p.box!
                const u = Math.min(1, Math.max(0, (box.maxX - bx) / Math.max(1, box.maxX - box.minX))) // 0 head, 1 tail
                const wag = Math.sin(time * sp * 6 - u * 5) * u * u * (box.maxY - box.minY) * 0.18
                fx = x - travel
                fy = y - path - wag
              } else if (p.disc) {
                // Bloom: open out from the base, hold, close. Horizontal opens more than vertical.
                const c = (((time * sp * 0.1) % 1) + 1) % 1
                const ease = (u: number) => u * u * (3 - 2 * u)
                const open = c < 0.42 ? ease(c / 0.42) : c < 0.72 ? 1 : 1 - ease((c - 0.72) / 0.28)
                // intensity = how far it closes: 0 barely breathes, 1 folds to a tight bud.
                const lo = 1 - k * 0.82
                const sxs = lo + (1 - lo) * open
                const sys = 1 - (1 - lo) * 0.62 * (1 - open)
                fx = p.disc.cx + (x - p.disc.cx) / sxs
                fy = p.disc.base + (y - p.disc.base) / sys
                m *= 0.75 + 0.35 * open
              }
              const wrapX = e.kind === 'wind' || e.kind === 'drift'
              const wrapY = e.kind === 'rise'
              const nx = wrapX ? ((Math.round(fx) % cols) + cols) % cols : Math.round(fx)
              const ny = wrapY ? ((Math.round(fy) % rows) + rows) % rows : Math.round(fy)
              const inside = nx >= 0 && nx < cols && ny >= 0 && ny < rows
              const cand = inside ? ny * cols + nx : -1
              if (cand >= 0 && p.weights[cand] > 0.5) {
                src = cand
                fillRgb = null
                blend = { fx, fy, wrapX, wrapY, weights: p.weights }
              } else if (p.weights[y * cols + x] > 0.2) {
                // Fill the soft edge too, or a faint outline stays behind where the object was.
                const f = p.fill!
                fillRgb = this.keep ? EMPTY : [f[y * 3], f[y * 3 + 1], f[y * 3 + 2]]
                blend = null
              }
              break
            }
            case 'sway': {
              const w = p.weights[src]
              if (w > 0.01) dx += Math.sin(time * sp * 1.6 + x * 0.07 / e.scale + y * 0.22 / e.scale) * k * 2.6 * w
              break
            }
            case 'shimmer': {
              const w = p.weights[src]
              if (w > 0.01) {
                dx += Math.sin(y * 0.9 / e.scale + time * sp * 3) * k * 1.8 * w
                const glint = Math.max(0, Math.sin(x * 0.55 / e.scale + y * 1.7 - time * sp * 3.5))
                m *= 1 + 0.9 * k * w * glint ** 10
              }
              break
            }
            case 'glow': {
              const w = p.weights[src]
              if (w > 0.01) {
                const ph = hash2(Math.floor(x / (4 * e.scale)), Math.floor(y / (3 * e.scale))) * 6.283
                m *= 1 + k * 0.9 * w * Math.sin(time * sp * 2.2 + ph)
              }
              break
            }
            case 'phase': {
              const w = p.weights[src]
              if (w > 0.01 && p.disc) {
                // A same-size shadow disc slides across: offset -2r (full) → 0 (new) → +2r (full),
                // then wraps; both ends are a full disc, so the loop is seamless.
                const { cx, cy, r } = p.disc
                const t01 = (((time * sp * 0.12) % 1) + 1) % 1
                const offset = (t01 * 4 - 2) * r
                const rowScale = 1 / CELL_ASPECT[recipe.cellStyle]
                const dxs = (src % cols) - (cx + offset)
                const dys = (Math.floor(src / cols) - cy) * rowScale
                const soft = 0.6 + e.scale
                const shade = 1 - smooth(r - soft, r + soft, Math.hypot(dxs, dys))
                // Earthshine: the dark side never goes fully black at low intensity.
                m *= 1 - shade * w * (0.55 + 0.43 * k)
              }
              break
            }
            case 'breathe': {
              const w = p.weights[src]
              if (w > 0.01) m *= 1 + k * 0.4 * w * Math.sin(time * sp * 0.9 + y * 0.04 / e.scale)
              break
            }
            case 'sparkle': {
              const w = p.weights[src]
              if (w > 0.3) {
                const phase = (time * sp * 0.6 + hash2(x, y) * 9) % 1
                if (phase < 0.015 + 0.05 * k * k) {
                  m *= 2.4
                  glyphOverride = rampMax
                }
              }
              break
            }
            case 'cycle': {
              const w = p.weights[src]
              if (w > 0.3) {
                const drop = ((y * 0.08) / e.scale - time * sp * 0.8 + hash2(x, 3) * 5) % 1
                m *= 1 - k * 0.7 + k * 1.2 * (drop < 0 ? drop + 1 : drop)
                glyphOverride = Math.floor((time * sp * 12 + hash2(x, y) * 40) % (rampMax + 1))
              }
              break
            }
          }
        }

        if (dx !== 0 && fillRgb === null) {
          const sx = Math.min(cols - 1, Math.max(0, Math.round((src % cols) + dx)))
          src = Math.floor(src / cols) * cols + sx
        }

        // Background removed: leave the cell empty (only the grid shows).
        if (fillRgb === EMPTY || (this.keep && fillRgb === null && this.keep[src] < 0.5)) {
          glyphs[y * cols + x] = ' '
          if (highlight && highlight.weights[y * cols + x] > 0.15) {
            ctx.fillStyle = `rgba(255,64,160,${0.45 * highlight.weights[y * cols + x]})`
            ctx.fillRect(x * cw, y * ch, cw, ch)
          }
          continue
        }
        let r: number, g: number, b: number, l: number
        if (fillRgb) {
          ;[r, g, b] = fillRgb
          l = 0.2126 * r + 0.7152 * g + 0.0722 * b
        } else if (blend && dx === 0) {
          ;[r, g, b, l] = bilinear(graded, blend, cols, rows, src)
        } else {
          r = graded.r[src]
          g = graded.g[src]
          b = graded.b[src]
          l = graded.lum[src]
        }
        l = Math.min(1, l * m)
        r *= m
        g *= m
        b *= m

        if (recipe.colorMode === 'mono') {
          r = inkR * l
          g = inkG * l
          b = inkB * l
        } else if (recipe.colorMode === 'duotone') {
          r = bgR + (inkR - bgR) * l * 1.2
          g = bgG + (inkG - bgG) * l * 1.2
          b = bgB + (inkB - bgB) * l * 1.2
        }

        // Lift the ramp so mid-darks still get a glyph; density bias pushes it denser or sparser.
        const gi = glyphOverride >= 0 ? Math.max(1, glyphOverride) : Math.min(rampMax, Math.round(Math.pow(l, 0.62 / recipe.bias) * rampMax))
        const glyph = ramp[gi]
        glyphs[y * cols + x] = glyph
        const oi = (y * cols + x) * 3
        this.out.rgb[oi] = Math.min(255, r * 1.15 * 255)
        this.out.rgb[oi + 1] = Math.min(255, g * 1.15 * 255)
        this.out.rgb[oi + 2] = Math.min(255, b * 1.15 * 255)
        const px = x * cw
        const py = y * ch

        if (dots) {
          // Stipple: a round dot per cell, radius by brightness, nudged off the grid by a
          // fixed per-cell jitter so it reads as hand-placed ink rather than a lattice.
          // True stippling: dot *density* follows brightness (each cell keeps its dot
          // with probability ~ l^1.3), so highlights stay airy instead of a solid mass.
          if (l < 0.04 || hash2(x * 5 + 3, y * 11 + 7) > Math.pow(l, 1.1) * 1.3) {
            glyphs[y * cols + x] = ' '
          } else {
            const rad = cw * (0.16 + 0.24 * l)
            const jx = (hash2(x, y * 7 + 1) - 0.5) * cw * 0.55
            const jy = (hash2(x * 3 + 2, y) - 0.5) * ch * 0.55
            ctx.fillStyle = css(r * 1.2, g * 1.2, b * 1.2)
            ctx.beginPath()
            ctx.arc(px + cw / 2 + jx, py + ch / 2 + jy, rad, 0, 6.283)
            ctx.fill()
            this.out.dot[oi] = rad
            this.out.dot[oi + 1] = jx
            this.out.dot[oi + 2] = jy
          }
        } else if (tile) {
          // Mosaic: bright cells become solid blocks with a sparse dark glyph
          // (light reads as "less ink"); mid cells are bare glyphs; shadows stay empty.
          if (l >= 0.36) {
            ctx.fillStyle = css(r * 1.05, g * 1.05, b * 1.05)
            ctx.fillRect(px + 0.75, py + 0.75, cw - 1.5, ch - 1.5)
            const sparse = ramp[Math.max(1, rampMax - Math.round(((l - 0.36) / 0.64) * (rampMax - 1)))]
            glyphs[y * cols + x] = sparse
            ctx.fillStyle = css(r * 0.42 + bgR * 0.5, g * 0.42 + bgG * 0.5, b * 0.42 + bgB * 0.5)
            ctx.fillText(sparse, px + cw / 2, py + ch / 2)
          } else if (l >= 0.1) {
            ctx.fillStyle = css(r * 1.25, g * 1.25, b * 1.25)
            ctx.fillText(glyph, px + cw / 2, py + ch / 2)
          } else glyphs[y * cols + x] = ' '
        } else if (glyph !== ' ' && blocks) {
          // Font block glyphs never quite fill the cell and leave seams between rows,
          // so the block set is drawn as rectangles with density as opacity.
          ctx.globalAlpha = gi / rampMax
          ctx.fillStyle = css(r * 1.15, g * 1.15, b * 1.15)
          ctx.fillRect(px, py, cw + 0.5, ch + 0.5)
          ctx.globalAlpha = 1
        } else if (glyph !== ' ') {
          ctx.fillStyle = css(r * 1.15, g * 1.15, b * 1.15)
          ctx.fillText(glyph, px + cw / 2, py + ch / 2)
        }
        if (highlight && highlight.weights[y * cols + x] > 0.15) {
          ctx.fillStyle = `rgba(255,64,160,${0.45 * highlight.weights[y * cols + x]})`
          ctx.fillRect(px, py, cw, ch)
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over'
  }

  /** Everything the last frame drew, cell by cell (for vector and text exports). */
  frameCells(): FrameCells | null {
    if (!this.lastMeta) return null
    return { ...this.lastMeta, chars: this.lastGlyphs.slice(), rgb: this.out.rgb.slice(), dot: this.out.dot.slice() }
  }

  /** Seconds since start, on the engine's clock (for re-rendering the current frame). */
  now() {
    return (performance.now() - this.start) / 1000
  }
}

export interface FrameCells {
  cols: number
  rows: number
  cw: number
  ch: number
  t: number
  cellStyle: Recipe['cellStyle']
  background: string
  transparent: boolean
  chars: string[]
  /** r,g,b per cell, 0–255. */
  rgb: Uint8Array
  /** Dots style: radius, jitter x, jitter y per cell (0 radius = no dot). */
  dot: Float32Array
}

const EMPTY: [number, number, number] = [-1, -1, -1]

/**
 * Blend the 2×2 cells around a fractional position, using only cells inside
 * the moving mask (so edges don't smear into the background).
 */
function bilinear(
  graded: Graded,
  bl: { fx: number; fy: number; wrapX: boolean; wrapY: boolean; weights: Float32Array },
  cols: number,
  rows: number,
  fallback: number,
): [number, number, number, number] {
  const x0 = Math.floor(bl.fx)
  const y0 = Math.floor(bl.fy)
  const tx = bl.fx - x0
  const ty = bl.fy - y0
  let r = 0, g = 0, b = 0, l = 0, wsum = 0
  for (let j = 0; j < 2; j++) {
    for (let i = 0; i < 2; i++) {
      let xx = x0 + i
      let yy = y0 + j
      if (bl.wrapX) xx = ((xx % cols) + cols) % cols
      if (bl.wrapY) yy = ((yy % rows) + rows) % rows
      if (xx < 0 || xx >= cols || yy < 0 || yy >= rows) continue
      const idx = yy * cols + xx
      if (bl.weights[idx] <= 0.5) continue
      const w = (i ? tx : 1 - tx) * (j ? ty : 1 - ty)
      r += graded.r[idx] * w
      g += graded.g[idx] * w
      b += graded.b[idx] * w
      l += graded.lum[idx] * w
      wsum += w
    }
  }
  if (wsum < 1e-4) return [graded.r[fallback], graded.g[fallback], graded.b[fallback], graded.lum[fallback]]
  return [r / wsum, g / wsum, b / wsum, l / wsum]
}

function isMover(kind: Effect['kind']) {
  return kind === 'rise' || kind === 'wind' || kind === 'bob' || kind === 'drift' || kind === 'bloom'
}

function order(kind: Effect['kind']) {
  return isMover(kind) ? 0 : 1
}

function grade(grid: SourceGrid, recipe: Recipe): Graded {
  const n = grid.cols * grid.rows
  const out: Graded = { r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n), lum: new Float32Array(n) }
  const { contrast, brightness, saturation, hueShift } = recipe
  const cos = Math.cos((hueShift * Math.PI) / 180)
  const sin = Math.sin((hueShift * Math.PI) / 180)
  // Hue rotation matrix in RGB space (luminance-preserving approximation).
  const m00 = 0.213 + cos * 0.787 - sin * 0.213
  const m01 = 0.715 - cos * 0.715 - sin * 0.715
  const m02 = 0.072 - cos * 0.072 + sin * 0.928
  const m10 = 0.213 - cos * 0.213 + sin * 0.143
  const m11 = 0.715 + cos * 0.285 + sin * 0.14
  const m12 = 0.072 - cos * 0.072 - sin * 0.283
  const m20 = 0.213 - cos * 0.213 - sin * 0.787
  const m21 = 0.715 - cos * 0.715 + sin * 0.715
  const m22 = 0.072 + cos * 0.928 + sin * 0.072
  for (let i = 0; i < n; i++) {
    let r = grid.r[i]
    let g = grid.g[i]
    let b = grid.b[i]
    if (hueShift) {
      const nr = r * m00 + g * m01 + b * m02
      const ng = r * m10 + g * m11 + b * m12
      const nb = r * m20 + g * m21 + b * m22
      r = nr
      g = ng
      b = nb
    }
    const l0 = 0.2126 * r + 0.7152 * g + 0.0722 * b
    r = l0 + (r - l0) * saturation
    g = l0 + (g - l0) * saturation
    b = l0 + (b - l0) * saturation
    r = (r - 0.5) * contrast + 0.5 + brightness
    g = (g - 0.5) * contrast + 0.5 + brightness
    b = (b - 0.5) * contrast + 0.5 + brightness
    // Tone curve (default 0.8 lifts shadows: ASCII on near-black loses everything below ~0.15).
    const gm = recipe.gamma
    r = Math.pow(Math.min(1, Math.max(0, r)), gm)
    g = Math.pow(Math.min(1, Math.max(0, g)), gm)
    b = Math.pow(Math.min(1, Math.max(0, b)), gm)
    if (recipe.invert) {
      r = 1 - r
      g = 1 - g
      b = 1 - b
    }
    out.r[i] = r
    out.g[i] = g
    out.b[i] = b
    out.lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  if (recipe.edges > 0) emphasizeEdges(out, grid.cols, grid.rows, recipe.edges)
  return out
}

/**
 * Sobel edge strength on the graded brightness, blended in by `amount`.
 * Color is rescaled to the new brightness, so hue survives.
 */
function emphasizeEdges(out: Graded, cols: number, rows: number, amount: number) {
  const L = out.lum.slice()
  const at = (x: number, y: number) => L[Math.min(rows - 1, Math.max(0, y)) * cols + Math.min(cols - 1, Math.max(0, x))]
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)
      const gy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)
      const e = Math.min(1, Math.hypot(gx, gy) * 0.9)
      const i = y * cols + x
      const l0 = L[i]
      // Keep a faint trace of the fill so interiors read as sparse, not empty.
      const l1 = l0 * (1 - amount) + Math.max(e, l0 * 0.28) * amount
      const k = l0 > 1e-3 ? l1 / l0 : 0
      out.r[i] = l0 > 1e-3 ? Math.min(1, out.r[i] * k) : l1
      out.g[i] = l0 > 1e-3 ? Math.min(1, out.g[i] * k) : l1
      out.b[i] = l0 > 1e-3 ? Math.min(1, out.b[i] * k) : l1
      out.lum[i] = l1
    }
  }
}

/** Average color of non-masked cells per row, darkened slightly; falls back to the image mean. */
function rowFill(grid: SourceGrid, graded: Graded, weights: Float32Array): Float32Array {
  const { cols, rows } = grid
  const out = new Float32Array(rows * 3)
  let tr = 0, tg = 0, tb = 0, tn = 0
  for (let i = 0; i < cols * rows; i++) {
    if (weights[i] < 0.3) {
      tr += graded.r[i]; tg += graded.g[i]; tb += graded.b[i]; tn++
    }
  }
  const mr = tn ? tr / tn : 0, mg = tn ? tg / tn : 0, mb = tn ? tb / tn : 0
  for (let y = 0; y < rows; y++) {
    let r = 0, g = 0, b = 0, c = 0
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x
      if (weights[i] < 0.3) {
        r += graded.r[i]; g += graded.g[i]; b += graded.b[i]; c++
      }
    }
    out[y * 3] = (c ? r / c : mr) * 0.85
    out[y * 3 + 1] = (c ? g / c : mg) * 0.85
    out[y * 3 + 2] = (c ? b / c : mb) * 0.85
  }
  return out
}

/**
 * Compact text summary of an image's color regions, sent to the model with the
 * prompt so it can choose masks even without seeing the picture.
 */
export function describeGrid(grid: SourceGrid): string {
  const bins = new Map<string, { n: number; lum: number; y: number; sat: number }>()
  const n = grid.cols * grid.rows
  for (let i = 0; i < n; i++) {
    const sat = grid.sat[i]
    const hueBin = sat < 0.15 ? 'neutral' : `${Math.floor(grid.hue[i] / 30) * 30}-${Math.floor(grid.hue[i] / 30) * 30 + 30}`
    const lumBin = grid.lum[i] < 0.25 ? 'dark' : grid.lum[i] < 0.6 ? 'mid' : 'bright'
    const key = `${hueBin}|${lumBin}`
    const b = bins.get(key) ?? { n: 0, lum: 0, y: 0, sat: 0 }
    b.n++
    b.lum += grid.lum[i]
    b.sat += sat
    b.y += Math.floor(i / grid.cols) / (grid.rows - 1)
    bins.set(key, b)
  }
  return [...bins.entries()]
    .filter(([, b]) => b.n / n > 0.01)
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 14)
    .map(([key, b]) => {
      const [hue, lum] = key.split('|')
      return `hue ${hue}°, ${lum}: ${((100 * b.n) / n).toFixed(0)}% of cells, avg lum ${(b.lum / b.n).toFixed(2)}, avg sat ${(b.sat / b.n).toFixed(2)}, mean y ${(b.y / b.n).toFixed(2)}`
    })
    .join('\n')
}
