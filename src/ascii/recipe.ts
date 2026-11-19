/**
 * Recipe — the single, serializable description of an animated ASCII piece.
 *
 * The AI never writes code. It writes (or patches) one of these, the server
 * validates it with `parseRecipe`, and the fixed renderer in ./engine.ts draws
 * it. Every numeric field doubles as a Tweaks slider, which is what makes
 * small edits possible without regenerating anything.
 *
 * Shared by the browser and the worker, so keep it dependency-free apart
 * from zod.
 */

import { z } from 'zod'

export const EFFECT_KINDS = [
  'glow', // per-blob brightness pulse: lanterns, windows, fireflies
  'rise', // masked region drifts upward and wraps: lanterns, embers, bubbles
  'sway', // gentle horizontal bend, stronger toward the top: grass, trees, hair
  'wind', // masked region scrolls sideways and wraps: clouds, fog
  'shimmer', // rippling horizontal displacement + glints: water, heat haze
  'sparkle', // random cells flash bright: stars, snow, magic dust
  'cycle', // glyphs rotate through the ramp: rain, data, static
  'breathe', // slow brightness/scale breathing of the whole mask: sky, aura
  'bob', // masked region floats up and down in place: a creature, a balloon, a boat
  'drift', // masked region travels across the frame and loops, bobbing: fish, birds, jellyfish
  'phase', // a shadow disc sweeps across the region: moon phases, eclipses
] as const
export type EffectKind = (typeof EFFECT_KINDS)[number]

export const EFFECT_INFO: Record<EffectKind, { label: string; hint: string }> = {
  glow: { label: 'Glow', hint: 'Each bright blob pulses on its own rhythm.' },
  rise: { label: 'Rise', hint: 'The region floats upward and loops.' },
  sway: { label: 'Sway', hint: 'Bends side to side, more at the top.' },
  wind: { label: 'Wind', hint: 'Scrolls sideways and loops.' },
  shimmer: { label: 'Shimmer', hint: 'Ripples like water.' },
  sparkle: { label: 'Sparkle', hint: 'Random cells flash.' },
  cycle: { label: 'Cycle', hint: 'Characters flicker through the ramp.' },
  breathe: { label: 'Breathe', hint: 'Slow brightness swell.' },
  bob: { label: 'Bob', hint: 'Floats up and down in place.' },
  drift: { label: 'Drift', hint: 'Travels across and loops around.' },
  phase: { label: 'Phase', hint: 'A shadow sweeps across it, like the moon’s phases.' },
}

export const GLYPH_SETS = {
  classic: ' .:-=+*#%@',
  dense: " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  blocks: ' ░▒▓█',
  dots: ' ·∙•●',
  binary: ' 01',
  lines: ' -=≡',
} as const
export type GlyphSet = keyof typeof GLYPH_SETS

/** Ranges are inclusive [min, max]. Hue is degrees and may wrap (e.g. [330, 30]). */
const range01 = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])
const hueRange = z.tuple([z.number().min(0).max(360), z.number().min(0).max(360)])

export const maskSchema = z.object({
  lum: range01.optional(),
  hue: hueRange.optional(),
  sat: range01.optional(),
  /** Vertical band, 0 = top, 1 = bottom. */
  y: range01.optional(),
  /** Only the subject, i.e. cells the background cutout keeps (needs `cutout` > 0). */
  subject: z.boolean().optional(),
})
export type Mask = z.infer<typeof maskSchema>

export const effectSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(EFFECT_KINDS),
  label: z.string().max(40).default(''),
  enabled: z.boolean().default(true),
  mask: maskSchema.default({}),
  /** 0–3, 1 = default tempo. */
  speed: z.number().min(0).max(3).default(1),
  /** 0–1, how strong the effect is. */
  intensity: z.number().min(0).max(1).default(0.5),
  /** 0.2–3, spatial size of the effect's features (blob size, wave length). */
  scale: z.number().min(0.2).max(3).default(1),
})
export type Effect = z.infer<typeof effectSchema>

export const recipeSchema = z.object({
  version: z.literal(1).default(1),
  title: z.string().max(80).default('Untitled'),
  /** Grid width in characters; rows follow from the image aspect. */
  cols: z.number().int().min(40).max(200).default(110),
  glyphs: z.enum(Object.keys(GLYPH_SETS) as [GlyphSet, ...GlyphSet[]]).default('classic'),
  /** 'glyph' = colored characters on background; 'tile' = mosaic squares with glyphs. */
  cellStyle: z.enum(['glyph', 'tile']).default('glyph'),
  colorMode: z.enum(['source', 'mono', 'duotone']).default('source'),
  /** Used by mono/duotone, and as the background. Hex colors. */
  ink: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#f5e6c8'),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#07070c'),
  contrast: z.number().min(0.5).max(2).default(1.1),
  brightness: z.number().min(-0.5).max(0.5).default(0),
  saturation: z.number().min(0).max(2).default(1.1),
  hueShift: z.number().min(-180).max(180).default(0),
  /**
   * Background removal, 0 = off. Cells close in color to the image's border
   * (or very dark) become empty, so an object floats on its own.
   */
  cutout: z.number().min(0).max(1).default(0),
  /** Opacity of the faint cell grid behind the art, 0 = off. */
  grid: z.number().min(0).max(1).default(0.35),
  /** Global playback speed multiplier. */
  tempo: z.number().min(0).max(3).default(1),
  effects: z.array(effectSchema).max(8).default([]),
})
export type Recipe = z.infer<typeof recipeSchema>

export const DEFAULT_RECIPE: Recipe = recipeSchema.parse({})

/** Validate untrusted input (AI output, Yjs state, stored JSON). Throws on garbage. */
export function parseRecipe(input: unknown): Recipe {
  return recipeSchema.parse(input)
}

/** Lenient variant: returns null instead of throwing. */
export function safeRecipe(input: unknown): Recipe | null {
  const r = recipeSchema.safeParse(input)
  return r.success ? r.data : null
}

/**
 * Apply an AI "refine" patch. Top-level scalars replace; `effects` entries
 * merge by id (`remove: true` deletes, unknown ids append). The result is
 * re-validated so a bad patch can never produce an invalid recipe.
 */
export function applyPatch(base: Recipe, patch: Record<string, unknown>): Recipe {
  const next: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) {
    if (k === 'effects' || k === 'version') continue
    next[k] = v
  }
  if (Array.isArray(patch.effects)) {
    const effects = [...base.effects]
    for (const raw of patch.effects as Array<Record<string, unknown>>) {
      if (!raw || typeof raw.id !== 'string') continue
      const i = effects.findIndex((e) => e.id === raw.id)
      if (raw.remove === true) {
        if (i >= 0) effects.splice(i, 1)
        continue
      }
      const { remove: _remove, ...rest } = raw
      if (i >= 0) effects[i] = { ...effects[i], ...rest, mask: { ...effects[i].mask, ...((rest.mask as Mask) ?? {}) } } as Effect
      else effects.push(rest as Effect)
    }
    next.effects = effects
  }
  return parseRecipe(next)
}

/** Slider metadata for the Tweaks panel — one source of truth for ranges. */
export const GLOBAL_SLIDERS = [
  { key: 'cols', label: 'Density', min: 40, max: 200, step: 1 },
  { key: 'contrast', label: 'Contrast', min: 0.5, max: 2, step: 0.01 },
  { key: 'brightness', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01 },
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01 },
  { key: 'hueShift', label: 'Hue shift (°)', min: -180, max: 180, step: 1 },
  { key: 'tempo', label: 'Tempo', min: 0, max: 3, step: 0.01 },
  { key: 'grid', label: 'Grid', min: 0, max: 1, step: 0.01 },
  { key: 'cutout', label: 'Remove background', min: 0, max: 1, step: 0.01 },
] as const satisfies ReadonlyArray<{ key: keyof Recipe; label: string; min: number; max: number; step: number }>

export const EFFECT_SLIDERS = [
  { key: 'speed', label: 'Speed', min: 0, max: 3, step: 0.01 },
  { key: 'intensity', label: 'Intensity', min: 0, max: 1, step: 0.01 },
  { key: 'scale', label: 'Scale', min: 0.2, max: 3, step: 0.01 },
] as const satisfies ReadonlyArray<{ key: keyof Effect; label: string; min: number; max: number; step: number }>
