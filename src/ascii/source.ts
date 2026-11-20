/**
 * Sources the renderer can draw from: a still image, or an animated GIF
 * decoded into full frames. The engine re-samples the grid whenever the GIF's
 * current frame changes, so the ASCII moves with the source and effects
 * layer on top.
 */

import { decompressFrames, parseGIF } from 'gifuct-js'
import { loadImage } from './image'

export type StillSource = CanvasImageSource & { width: number; height: number }

/** Max frames kept in memory, and the width they're stored at. */
const MAX_FRAMES = 72
const MAX_WIDTH = 640

export class AnimatedSource {
  readonly width: number
  readonly height: number
  /** Cumulative end time of each frame, ms. */
  private readonly ends: number[]
  readonly duration: number

  constructor(readonly frames: HTMLCanvasElement[], delays: number[]) {
    this.width = frames[0].width
    this.height = frames[0].height
    let acc = 0
    this.ends = delays.map((d) => (acc += d))
    this.duration = acc
  }

  /** Index of the frame showing at time `ms` (looping). */
  frameAt(ms: number): number {
    const t = ((ms % this.duration) + this.duration) % this.duration
    // Frames are few; a linear scan is fine and allocation-free.
    for (let i = 0; i < this.ends.length; i++) if (t < this.ends[i]) return i
    return this.ends.length - 1
  }

  static async fromBuffer(buffer: ArrayBuffer): Promise<AnimatedSource> {
    const gif = parseGIF(buffer)
    const raw = decompressFrames(gif, true)
    if (!raw.length) throw new Error('That GIF has no frames')
    const W = gif.lsd.width
    const H = gif.lsd.height
    const scale = Math.min(1, MAX_WIDTH / W)

    // Composite patches onto a full canvas, honouring disposal, then snapshot.
    const full = document.createElement('canvas')
    full.width = W
    full.height = H
    const fctx = full.getContext('2d')!
    const patch = document.createElement('canvas')
    const pctx = patch.getContext('2d')!

    const step = Math.max(1, Math.ceil(raw.length / MAX_FRAMES))
    const frames: HTMLCanvasElement[] = []
    const delays: number[] = []
    let pendingDelay = 0
    let prevDispose = 0
    let prevDims: { left: number; top: number; width: number; height: number } | null = null

    raw.forEach((f, i) => {
      if (prevDispose === 2 && prevDims) fctx.clearRect(prevDims.left, prevDims.top, prevDims.width, prevDims.height)
      const { width, height, left, top } = f.dims
      patch.width = width
      patch.height = height
      pctx.putImageData(new ImageData(new Uint8ClampedArray(f.patch), width, height), 0, 0)
      fctx.drawImage(patch, left, top)
      prevDispose = f.disposalType
      prevDims = f.dims
      // Browsers treat tiny delays as 100 ms; match them.
      pendingDelay += f.delay && f.delay >= 20 ? f.delay : 100
      if (i % step === 0) {
        const snap = document.createElement('canvas')
        snap.width = Math.round(W * scale)
        snap.height = Math.round(H * scale)
        const sctx = snap.getContext('2d')!
        sctx.fillStyle = '#000'
        sctx.fillRect(0, 0, snap.width, snap.height)
        sctx.drawImage(full, 0, 0, snap.width, snap.height)
        frames.push(snap)
        delays.push(pendingDelay)
        pendingDelay = 0
      }
    })
    if (pendingDelay && delays.length) delays[delays.length - 1] += pendingDelay
    return new AnimatedSource(frames, delays)
  }

  static async fromUrl(url: string): Promise<AnimatedSource> {
    const res = await fetch(url)
    if (!res.ok) throw new Error('Could not load GIF')
    return AnimatedSource.fromBuffer(await res.arrayBuffer())
  }
}

export type Source = StillSource | AnimatedSource

/** The still to show for a source (first frame of a GIF). */
export const firstFrame = (s: Source): StillSource => (s instanceof AnimatedSource ? s.frames[0] : s)

export async function loadSource(url: string, kind: 'image' | 'gif' | undefined): Promise<Source> {
  return kind === 'gif' ? AnimatedSource.fromUrl(url) : loadImage(url)
}
