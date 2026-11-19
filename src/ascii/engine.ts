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

import { GLYPH_SETS, type Effect, type Mask, type Recipe } from './recipe'

/** Character cells are taller than wide; tiles are square. */
const CELL_ASPECT = { glyph: 0.58, tile: 1 } as const

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
export function sampleImage(img: CanvasImageSource & { width: number; height: number }, cols: number, cellStyle: Recipe['cellStyle']): SourceGrid {
  const w = (img as HTMLImageElement).naturalWidth || img.width
  const h = (img as HTMLImageElement).naturalHeight || img.height
  const rows = Math.max(8, Math.round(cols * (h / w) * CELL_ASPECT[cellStyle]))
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
  ctx.drawImage(mid, 0, 0, cols, rows)
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
  /** Phase: the masked region's centroid (cells) and radius (column units). */
  disc?: { cx: number; cy: number; r: number }
}

/** Centroid and equal-area radius of a mask, measured in column-width units. */
function discOf(grid: SourceGrid, weights: Float32Array, rowScale: number) {
  let sx = 0, sy = 0, n = 0
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] > 0.5) {
      sx += i % grid.cols
      sy += Math.floor(i / grid.cols)
      n++
    }
  }
  if (!n) return { cx: grid.cols / 2, cy: grid.rows / 2, r: 1 }
  return { cx: sx / n, cy: sy / n, r: Math.sqrt((n * rowScale) / Math.PI) }
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
  paused = false

  constructor(canvas: HTMLCanvasElement, recipe: Recipe, opts: { dpr?: number; maxCols?: boolean } = {}) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: opts.dpr !== undefined })!
    this.recipe = recipe
    this.fixedDpr = opts.dpr ?? null
    this.capCols = opts.maxCols !== false
  }

  private capCols: boolean

  setImage(img: CanvasImageSource & { width: number; height: number }) {
    this.image = img
    this.gridKey = ''
    this.prepare()
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
    return Math.max(32, Math.min(this.recipe.cols, Math.floor(this.cssWidth / 6.5)))
  }

  private prepare() {
    if (!this.image) return
    const cols = this.effectiveCols()
    const key = `${cols}:${this.recipe.cellStyle}`
    if (key !== this.gridKey) {
      this.grid = sampleImage(this.image, cols, this.recipe.cellStyle)
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
        if (effect.kind === 'phase') p.disc = discOf(grid, weights, 1 / CELL_ASPECT[this.recipe.cellStyle])
        return p
      })
    // Moving effects decide *which* cell shows, so they run before the rest.
    this.effects.sort((a, b) => order(a.effect.kind) - order(b.effect.kind))
    this.draw(this.paused ? 1.7 : (performance.now() - this.start) / 1000)
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
    const blocks = recipe.glyphs === 'blocks'
    const time = t * recipe.tempo

    ctx.fillStyle = recipe.background
    ctx.fillRect(0, 0, this.cssWidth, ch * rows)
    if (recipe.grid > 0) {
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

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        let src = y * cols + x
        let fillRgb: [number, number, number] | null = null
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
            case 'drift': {
              if (fillRgb === null && src !== y * cols + x) break // another mover already claimed it
              // Each mover maps this cell to the source cell whose content should appear here.
              // The whole masked layer moves as one sheet (per-band speeds tore objects apart).
              let sx = x
              let sy = y
              if (e.kind === 'rise') {
                const shift = (((time * sp * (2 + 10 * k)) % rows) + rows) % rows
                sy = Math.floor((y + shift) % rows)
                sx = Math.min(cols - 1, Math.max(0, x + Math.round(Math.sin(time * sp * 0.7 + y * 0.15) * e.scale * 0.8)))
              } else if (e.kind === 'wind') {
                const shift = (((time * sp * (2 + 10 * k)) % cols) + cols) % cols
                sx = Math.floor((x - shift + cols * 2) % cols)
              } else if (e.kind === 'bob') {
                sy = Math.min(rows - 1, Math.max(0, y + Math.round(Math.sin(time * sp * 1.4) * (1 + k * 4) * e.scale)))
                sx = Math.min(cols - 1, Math.max(0, x + Math.round(Math.sin(time * sp * 0.7) * k * 1.5)))
              } else {
                const shift = (((time * sp * (1.5 + 6 * k)) % cols) + cols) % cols
                sx = Math.floor((x - shift + cols * 2) % cols)
                sy = Math.min(rows - 1, Math.max(0, y + Math.round(Math.sin(time * sp * 1.2 + x * 0.05) * (1 + k * 2.5) * e.scale)))
              }
              const cand = sy * cols + sx
              if (p.weights[cand] > 0.5) {
                src = cand
                fillRgb = null
              } else if (p.weights[y * cols + x] > 0.2) {
                // Fill the soft edge too, or a faint outline stays behind where the object was.
                const f = p.fill!
                fillRgb = this.keep ? EMPTY : [f[y * 3], f[y * 3 + 1], f[y * 3 + 2]]
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

        // Gamma-lift the ramp so mid-darks still get a glyph instead of going blank.
        const gi = glyphOverride >= 0 ? Math.max(1, glyphOverride) : Math.round(Math.pow(l, 0.62) * rampMax)
        const glyph = ramp[gi]
        glyphs[y * cols + x] = glyph
        const px = x * cw
        const py = y * ch

        if (tile) {
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
  }
}

const EMPTY: [number, number, number] = [-1, -1, -1]

function isMover(kind: Effect['kind']) {
  return kind === 'rise' || kind === 'wind' || kind === 'bob' || kind === 'drift'
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
    // Lift shadows: ASCII on near-black loses everything below ~0.15 otherwise.
    r = Math.pow(Math.min(1, Math.max(0, r)), 0.8)
    g = Math.pow(Math.min(1, Math.max(0, g)), 0.8)
    b = Math.pow(Math.min(1, Math.max(0, b)), 0.8)
    out.r[i] = r
    out.g[i] = g
    out.b[i] = b
    out.lum[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  return out
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
