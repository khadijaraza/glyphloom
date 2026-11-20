/**
 * Render a piece to an animated GIF in the browser. GIF is the one moving
 * format Gmail (and most mail clients) play inline, so this is what invite
 * emails and gallery thumbnails use.
 *
 * A separate offscreen engine draws deterministic frames at fixed times, so
 * capture doesn't depend on the visible canvas or the screen's pixel ratio.
 */

import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import { AsciiEngine } from './engine'
import type { Recipe } from './recipe'
import { AnimatedSource, type Source } from './source'

export interface GifOptions {
  width?: number
  seconds?: number
  fps?: number
}

export async function renderGif(
  image: Source,
  recipe: Recipe,
  { width = 520, seconds: secondsOpt, fps = 12 }: GifOptions = {},
  onProgress?: (p: number) => void,
): Promise<Blob> {
  // A GIF source loops on its own length (capped); a still loops every 3 s.
  const seconds = secondsOpt ?? (image instanceof AnimatedSource ? Math.min(6, Math.max(1, image.duration / 1000)) : 3)
  const canvas = document.createElement('canvas')
  // Fewer columns at GIF size keeps detail legible and the file small.
  const engine = new AsciiEngine(canvas, { ...recipe, cols: Math.min(recipe.cols, recipe.cellStyle === 'dots' ? 170 : 96) }, { dpr: 1 })
  engine.paused = true
  engine.setImage(image)
  engine.setWidth(width)
  const ctx = canvas.getContext('2d')!
  const w = canvas.width
  const h = canvas.height
  const frames = Math.round(seconds * fps)

  // Build one palette from a few spread-out frames so colors don't flicker.
  const sample = new Uint8ClampedArray(w * h * 4 * 3)
  for (let k = 0; k < 3; k++) {
    engine.draw(1 + (k * seconds) / 3)
    sample.set(ctx.getImageData(0, 0, w, h).data, k * w * h * 4)
  }
  const palette = quantize(sample, 128)

  const gif = GIFEncoder()
  const delay = Math.round(1000 / fps)
  for (let i = 0; i < frames; i++) {
    engine.draw(1 + i / fps)
    const { data } = ctx.getImageData(0, 0, w, h)
    gif.writeFrame(applyPalette(data, palette), w, h, { palette: i === 0 ? palette : undefined, delay, repeat: 0 })
    onProgress?.((i + 1) / frames)
    // Yield so the UI keeps painting while we encode.
    if (i % 6 === 5) await new Promise((r) => setTimeout(r, 0))
  }
  gif.finish()
  return new Blob([new Uint8Array(gif.bytes())], { type: 'image/gif' })
}
