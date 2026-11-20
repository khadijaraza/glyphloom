/**
 * Landing page — static (no auth, no socket), prerendered for crawlers.
 * One thing on stage: a lily blooming, drawn live by the real engine
 * (mounted client-side only, so prerender stays browser-free).
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { AsciiCanvas } from '../components/AsciiCanvas'
import { LILY_RECIPE, paintLily } from '../ascii/demo'
import { seo } from '../seo'

function Lily() {
  const [scene, setScene] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => setScene(paintLily()), [])
  if (!scene) return <div className="aspect-[8/5] w-full" />
  return <AsciiCanvas image={scene} recipe={{ ...LILY_RECIPE, background: '#000000', grid: 0 }} />
}

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="flex min-h-screen flex-col bg-black text-foreground">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <span className="font-mono text-sm font-semibold tracking-wide">
            glyph<span className="text-primary">loom</span>
          </span>
          <nav className="flex gap-5 text-sm text-muted-foreground">
            <Link to="/gallery" className="hover:text-foreground">
              Gallery
            </Link>
            <Link to="/home" className="hover:text-foreground">
              Studio
            </Link>
          </nav>
        </header>

        <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 pb-16">
          <div className="w-full">
            <Lily />
          </div>
          <h1 className="mt-6 text-center font-mono text-2xl tracking-tight sm:text-3xl">
            pictures that move, made of letters
          </h1>
          <p className="mt-3 max-w-md text-center text-sm text-muted-foreground">
            Describe something or upload a photo. Glyphloom turns it into living ASCII you can tweak and send to a friend.
          </p>
          <div className="mt-7 flex gap-3">
            <Link to="/create" className="rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
              Make one
            </Link>
            <Link to="/gallery" className="rounded-full border border-border px-5 py-2.5 text-sm text-foreground hover:bg-accent">
              See the gallery
            </Link>
          </div>
        </main>
      </div>
    </>
  )
}
