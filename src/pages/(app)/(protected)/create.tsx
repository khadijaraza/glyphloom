/**
 * Create: describe a scene (→ 4 generated images) or upload one, pick a
 * version, and let the AI choreograph its motion. Ends by creating the piece
 * record and opening it in the editor.
 */

import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutations, useR2Files } from 'deepspace'
import { ImageUp, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { AsciiCanvas } from '../../../components/AsciiCanvas'
import { Button, Textarea, useToast } from '@/components/ui'
import { describeGrid, sampleImage } from '../../../ascii/engine'
import { loadImage, thumbnailBase64 } from '../../../ascii/image'
import { DEMO_RECIPE, paintLanternScene, PREVIEW_RECIPE } from '../../../ascii/demo'
import type { Recipe } from '../../../ascii/recipe'
import { api } from '../../../lib/actions'
import { cn } from '../../../lib/utils'

type Candidate = { key: string | null; image: CanvasImageSource & { width: number; height: number }; demo?: boolean }
type PieceData = {
  title: string
  prompt: string
  sourceKey: string
  recipe: Recipe
  visibility: 'private' | 'link'
  collaborators: string[]
  forkedFrom: string
}

const EXAMPLES = [
  'Hundreds of floating paper lanterns rising over a dark lake at night',
  'A Ghibli-esque hillside meadow, tall grass in the wind, big drifting clouds',
  'A koi pond at dusk in gentle rain, lily pads and glowing fish',
  'A lone campfire in a desert under a sky full of stars',
]

export default function CreatePage() {
  const navigate = useNavigate()
  const { error } = useToast()
  const { upload, getUrl } = useR2Files({ scope: 'app' })
  const { createConfirmed, ready } = useMutations<PieceData>('pieces')
  const fileRef = useRef<HTMLInputElement>(null)

  const [prompt, setPrompt] = useState('')
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [picked, setPicked] = useState<number | null>(null)
  const [phase, setPhase] = useState<'idle' | 'generating' | 'uploading' | 'choreographing'>('idle')

  const busy = phase !== 'idle'

  async function generate() {
    if (prompt.trim().length < 3 || busy) return
    setPhase('generating')
    setCandidates([])
    setPicked(null)
    try {
      const { keys } = await api.generateSources(prompt.trim())
      const imgs = await Promise.all(keys.map((k) => loadImage(getUrl(k)).then((image) => ({ key: k, image }))))
      setCandidates(imgs)
    } catch (e) {
      error('Generation failed', e instanceof Error ? e.message : undefined)
    } finally {
      setPhase('idle')
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || busy) return
    if (!file.type.startsWith('image/')) return error('That isn’t an image')
    if (file.size > 12 * 1024 * 1024) return error('Image too large', 'Keep it under 12 MB.')
    setPhase('uploading')
    try {
      const res = await upload(file, file.name)
      if (!res.success || !res.key) throw new Error(res.error ?? 'Upload failed')
      const image = await loadImage(getUrl(res.key))
      setCandidates([{ key: res.key, image }])
      setPicked(0)
    } catch (e) {
      error('Upload failed', e instanceof Error ? e.message : undefined)
    } finally {
      setPhase('idle')
    }
  }

  function useDemo() {
    const image = paintLanternScene()
    setCandidates([{ key: null, image, demo: true }])
    setPicked(0)
    setPrompt((p) => p || 'Floating lanterns over a lake at night')
  }

  async function animate() {
    if (picked === null || busy) return
    const cand = candidates[picked]
    setPhase('choreographing')
    try {
      let sourceKey = cand.key
      let recipe: Recipe
      if (cand.demo) {
        // The demo scene ships with a hand-tuned recipe: no AI call needed.
        const blob = await new Promise<Blob>((res) => (cand.image as HTMLCanvasElement).toBlob((b) => res(b!), 'image/png'))
        const up = await upload(blob, 'lantern-demo.png')
        if (!up.success || !up.key) throw new Error(up.error ?? 'Upload failed')
        sourceKey = up.key
        recipe = DEMO_RECIPE
      } else {
        const grid = sampleImage(cand.image, 110, 'glyph')
        const thumb = cand.image instanceof HTMLImageElement ? thumbnailBase64(cand.image) : null
        recipe = (await api.buildRecipe(prompt, describeGrid(grid), thumb)).recipe
      }
      const id = await createConfirmed({
        title: recipe.title || prompt.slice(0, 60) || 'Untitled',
        prompt,
        sourceKey: sourceKey!,
        recipe,
        visibility: 'private',
        collaborators: [],
        forkedFrom: '',
      })
      navigate(`/p/${id}`)
    } catch (e) {
      error('Couldn’t animate that', e instanceof Error ? e.message : undefined)
      setPhase('idle')
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">New piece</p>
      <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">What should come alive?</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        Describe a scene and pick from four versions, or bring your own image. Describe how things move,
        too: “lanterns drifting up”, “grass bending in the wind”.
      </p>

      <div className="mt-6 rounded-xl border border-border bg-card p-4">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Floating lanterns over a lake at night, warm orange glow, stars…"
          rows={3}
          maxLength={600}
          className="resize-none border-0 bg-transparent p-1 text-base shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) generate()
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={generate} disabled={busy || prompt.trim().length < 3}>
            {phase === 'generating' ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {phase === 'generating' ? 'Painting 4 versions…' : 'Generate 4 versions'}
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            {phase === 'uploading' ? <Loader2 className="animate-spin" /> : <ImageUp />}
            Upload an image
          </Button>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="ghost" onClick={useDemo} disabled={busy}>
            Try the demo scene
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setPrompt(ex)}
              className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {phase === 'generating' && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="loom-grid aspect-[3/2] animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      )}

      {candidates.length > 0 && (
        <>
          <div className={cn('mt-6 grid gap-4', candidates.length > 1 && 'sm:grid-cols-2')}>
            {candidates.map((c, i) => (
              <button
                key={c.key ?? `demo-${i}`}
                onClick={() => setPicked(i)}
                disabled={busy}
                className={cn(
                  'group relative overflow-hidden rounded-xl border bg-[#07070c] p-2 text-left transition-all',
                  picked === i ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-foreground/25',
                )}
              >
                <AsciiCanvas image={c.image} recipe={c.demo ? DEMO_RECIPE : PREVIEW_RECIPE} />
                <span className="absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[11px] text-foreground">
                  {String.fromCharCode(65 + i)}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button size="lg" onClick={animate} disabled={picked === null || busy || !ready}>
              {phase === 'choreographing' ? <Loader2 className="animate-spin" /> : <Wand2 />}
              {phase === 'choreographing' ? 'Choreographing the motion…' : picked === null ? 'Pick a version' : 'Bring it to life'}
            </Button>
            <p className="text-xs text-muted-foreground">
              The AI picks which parts move and how. You can tweak everything after.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
