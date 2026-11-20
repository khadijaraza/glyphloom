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
  // Ink on paper: black stipple on the page's own cream.
  return <AsciiCanvas image={scene} recipe={{ ...LILY_RECIPE, background: '#f3eee3', ink: '#161412', grid: 0 }} />
}

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <span className="text-base font-bold tracking-wide">
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
          <h1 className="mt-6 text-center text-2xl tracking-tight sm:text-3xl">
            pictures that move, <span className="text-primary">made of letters</span>
          </h1>
          <p className="mt-3 max-w-md text-center text-sm text-muted-foreground">
            Describe something or upload a photo. Glyphloom turns it into living ASCII you can tweak and send to a friend.
          </p>
          <div className="mt-7 flex gap-3">
            <Link to="/create" className="rounded-sm bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90">
              Make one
            </Link>
            <Link to="/gallery" className="rounded-sm border border-foreground/60 px-5 py-2.5 text-sm text-foreground hover:bg-accent">
              See the gallery
            </Link>
          </div>
        </main>
      </div>
    </>
  )
}
