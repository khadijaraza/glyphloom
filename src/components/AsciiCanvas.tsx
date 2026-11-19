/**
 * React wrapper around AsciiEngine. Owns the canvas, follows the container's
 * width, and pushes recipe/image/highlight changes into the engine without
 * restarting the animation (so slider drags are smooth).
 */

import { useEffect, useRef } from 'react'
import { AsciiEngine } from '../ascii/engine'
import type { Recipe } from '../ascii/recipe'
import { cn } from '../lib/utils'

interface Props {
  image: (CanvasImageSource & { width: number; height: number }) | null
  recipe: Recipe
  highlight?: string | null
  /** Draw a single still frame instead of animating (cheap thumbnails). */
  still?: boolean
  className?: string
  onEngine?: (engine: AsciiEngine | null, canvas: HTMLCanvasElement | null) => void
}

export function AsciiCanvas({ image, recipe, highlight = null, still = false, className, onEngine }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<AsciiEngine | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const engine = new AsciiEngine(canvas, recipe)
    engineRef.current = engine
    const ro = new ResizeObserver(([entry]) => engine.setWidth(entry.contentRect.width))
    ro.observe(wrapRef.current!)
    onEngine?.(engine, canvas)
    return () => {
      ro.disconnect()
      engine.stop()
      engineRef.current = null
      onEngine?.(null, null)
    }
  }, [])

  useEffect(() => {
    if (image) engineRef.current?.setImage(image)
  }, [image])

  useEffect(() => {
    engineRef.current?.setRecipe(recipe)
  }, [recipe])

  useEffect(() => {
    engineRef.current?.setHighlight(highlight)
  }, [highlight])

  useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.paused = still
    if (still) {
      engine.stop()
      // Let the first layout pass size the canvas, then draw once.
      const id = requestAnimationFrame(() => engine.draw(1.7))
      return () => cancelAnimationFrame(id)
    }
    engine.run()
    return () => engine.stop()
  }, [still, image])

  return (
    <div ref={wrapRef} className={cn('w-full', className)}>
      <canvas ref={canvasRef} className="block" />
    </div>
  )
}
