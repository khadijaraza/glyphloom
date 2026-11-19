/**
 * Landing page — static (no auth, no socket), prerendered for crawlers.
 * The hero is the real engine running the procedural demo scene, mounted
 * client-side only so prerender stays browser-free.
 */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'
import { AsciiCanvas } from '../components/AsciiCanvas'
import { DEMO_RECIPE, paintLanternScene } from '../ascii/demo'
import { seo } from '../seo'

function HeroArt() {
  const [scene, setScene] = useState<HTMLCanvasElement | null>(null)
  useEffect(() => setScene(paintLanternScene()), [])
  if (!scene) return <div className="aspect-[8/5] w-full" />
  return <AsciiCanvas image={scene} recipe={DEMO_RECIPE} />
}

const STEPS = [
  ['Describe or upload', 'Type a scene (“lanterns rising over a lake”) and pick from four painted versions, or bring a photo.'],
  ['It starts moving', 'An AI picks what should move and how: glowing lanterns, swaying grass, rippling water, falling rain.'],
  ['Tweak without starting over', 'Sliders for everything, or say “slower, warmer” and only that changes.'],
  ['Send it to someone', 'It shows up in their inbox instantly, or by email. Open it together and drag the sliders at the same time.'],
]

export default function Landing() {
  return (
    <>
      <Seo {...seo} path="/" />
      <div data-testid="static-landing" className="min-h-screen bg-background text-foreground">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="font-mono text-sm font-semibold tracking-wide">
            glyph<span className="text-primary">loom</span>
          </span>
          <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">
            Open studio →
          </Link>
        </header>

        <section className="mx-auto max-w-6xl px-6 pb-10 pt-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-[#07070c] shadow-2xl shadow-black/60">
            <HeroArt />
          </div>
          <div className="mt-10 grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-end">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                Pictures that move,
                <br />
                <span className="text-primary">made of letters.</span>
              </h1>
              <p className="mt-4 max-w-lg text-muted-foreground">
                Glyphloom turns a sentence or a photo into animated ASCII art. Tune it by hand or in plain words,
                then send it to a friend who can tweak it with you live.
              </p>
            </div>
            <div className="flex gap-3 md:justify-end">
              <Link to="/create" className="inline-flex items-center rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                Make one
              </Link>
              <Link to="/home" className="inline-flex items-center rounded-full border border-border px-5 py-2.5 text-sm text-foreground hover:bg-accent">
                Your studio
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, body], i) => (
            <div key={title} className="rounded-xl border border-border bg-card p-5">
              <p className="font-mono text-xs text-primary">0{i + 1}</p>
              <h2 className="mt-2 font-medium">{title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </section>
      </div>
    </>
  )
}
