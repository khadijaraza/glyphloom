/**
 * The piece editor / viewer. Public when the piece is link-shared: anyone can
 * watch it; the owner and the people it was sent to co-tweak it live.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { AuthOverlay, getUserColor, useAuth, useMutations, useQuery, useR2Files, useUser } from 'deepspace'
import { Copy, Download, Film, GitFork, Globe, Loader2, Send, Undo2, Video } from 'lucide-react'
import { AsciiCanvas } from '../../../components/AsciiCanvas'
import { SendDialog } from '../../../components/SendDialog'
import { Tweaks } from '../../../components/Tweaks'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useToast,
} from '@/components/ui'
import { download, toAnsi, toHtml, toJson, toPng, toSvg, toText } from '../../../ascii/export'
import type { AsciiEngine } from '../../../ascii/engine'
import { loadSource, type Source } from '../../../ascii/source'
import { renderGif } from '../../../ascii/gif'
import { safeRecipe, type Recipe } from '../../../ascii/recipe'
import { api } from '../../../lib/actions'
import { useLiveRecipe } from '../../../lib/useLiveRecipe'

type PieceData = {
  title: string
  prompt: string
  sourceKey: string
  sourceKind?: 'image' | 'gif'
  recipe: Recipe
  visibility: 'private' | 'link'
  collaborators: string[]
  forkedFrom: string
  gifKey?: string
  inGallery?: boolean
  publishedAt?: string
  authorName?: string
  agentRecipe?: unknown
  agentAt?: string
}
type SendData = { pieceId: string; toUserId: string; seenAt: string }

export default function PiecePage() {
  const { id = '' } = useParams()
  const { records, status } = useQuery<PieceData>('pieces')
  const piece = records.find((r) => r.recordId === id)

  if (status === 'loading' && !piece) return <Centered>Loading…</Centered>
  if (!piece)
    return (
      <Centered>
        <p className="text-foreground">This piece is private or doesn’t exist.</p>
        <Link to="/create" className="mt-3 text-sm text-primary hover:underline">
          Make your own →
        </Link>
      </Centered>
    )
  return <Editor key={id} id={id} piece={piece.data} ownerId={piece.createdBy} />
}

function Editor({ id, piece, ownerId }: { id: string; piece: PieceData; ownerId: string }) {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const { isSignedIn, userId } = useAuth()
  const { user } = useUser()
  const { getUrl, upload } = useR2Files({ scope: 'app' })
  const { success, error } = useToast()
  const pieces = useMutations<PieceData>('pieces')
  const sends = useMutations<SendData>('sends')
  const { records: mySends } = useQuery<SendData>('sends')

  const me = useMemo(() => (userId ? { id: userId, name: user?.name || 'Someone' } : null), [userId, user?.name])
  const fallback = useMemo(() => safeRecipe(piece.recipe), [piece.recipe])
  const agentEdit = useMemo(() => ({ recipe: piece.agentRecipe, at: piece.agentAt }), [piece.agentRecipe, piece.agentAt])
  const live = useLiveRecipe(id, fallback, me, agentEdit)

  const [image, setImage] = useState<Source | null>(null)
  const [highlight, setHighlight] = useState<string | null>(null)
  const [history, setHistory] = useState<Recipe[]>([])
  const [sendOpen, setSendOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [recording, setRecording] = useState(false)
  const [gifBusy, setGifBusy] = useState<number | null>(null)
  const engineRef = useRef<{ engine: AsciiEngine | null; canvas: HTMLCanvasElement | null }>({ engine: null, canvas: null })

  useEffect(() => {
    let alive = true
    loadSource(getUrl(piece.sourceKey), piece.sourceKind)
      .then((img) => alive && setImage(img))
      .catch(() => error('Couldn’t load the source image'))
    return () => {
      alive = false
    }
  }, [piece.sourceKey])

  // Emailed invite: once signed in, attach this account to the piece.
  const invite = params.get('invite')
  useEffect(() => {
    if (!invite || !isSignedIn) return
    api
      .claimInvite(id, invite)
      .then((r) => r.claimed && success('You’re in', 'You can tweak this piece together now.'))
      .catch((e) => error('Invite problem', e instanceof Error ? e.message : undefined))
      .finally(() => setParams({}, { replace: true }))
  }, [invite, isSignedIn, id])

  // Opening a piece someone sent you marks it seen.
  useEffect(() => {
    if (!userId || !sends.ready) return
    for (const s of mySends) {
      if (s.data.pieceId === id && s.data.toUserId === userId && !s.data.seenAt) sends.put(s.recordId, { seenAt: new Date().toISOString() })
    }
  }, [mySends, id, userId, sends])

  const replace = useCallback(
    (next: Recipe) => {
      setHistory((h) => [...h.slice(-19), live.recipe])
      live.setRecipe(next)
    },
    [live],
  )

  async function refine(instruction: string) {
    try {
      const { recipe } = await api.refineRecipe(live.recipe, instruction)
      replace(recipe)
    } catch (e) {
      error('Couldn’t apply that', e instanceof Error ? e.message : undefined)
    }
  }

  function undo() {
    const prev = history[history.length - 1]
    if (!prev) return
    setHistory((h) => h.slice(0, -1))
    live.setRecipe(prev)
  }

  async function remix() {
    if (!isSignedIn) return setAuthOpen(true)
    try {
      const newId = await pieces.createConfirmed({
        title: `${piece.title || 'Untitled'} (remix)`,
        prompt: piece.prompt,
        sourceKey: piece.sourceKey,
        sourceKind: piece.sourceKind ?? 'image',
        recipe: live.recipe,
        visibility: 'private',
        collaborators: [],
        forkedFrom: id,
      })
      navigate(`/p/${newId}`)
    } catch (e) {
      error('Couldn’t remix', e instanceof Error ? e.message : undefined)
    }
  }

  async function copyText() {
    const f = engineRef.current.engine?.frameCells()
    const text = f && toText(f)
    if (!text) return
    await navigator.clipboard.writeText('```\n' + text + '\n```')
    success('Copied', 'This frame is on your clipboard as a Markdown code block.')
  }

  async function exportAs(kind: 'png' | 'svg' | 'txt' | 'html' | 'json' | 'ansi', scale = 1) {
    const engine = engineRef.current.engine
    const canvas = engineRef.current.canvas
    if (!engine || !canvas || !image) return
    const name = (piece.title || 'glyphloom').replace(/[^\w-]+/g, '-')
    try {
      if (kind === 'png') {
        const blob = await toPng(image, live.recipe, canvas.clientWidth, engine.now(), scale)
        return download(blob, `${name}${scale > 1 ? `@${scale}x` : ''}.png`)
      }
      const f = engine.frameCells()
      if (!f) return
      if (kind === 'svg') download(toSvg(f), `${name}.svg`, 'image/svg+xml')
      else if (kind === 'txt') download(toText(f), `${name}.txt`)
      else if (kind === 'html') download(toHtml(f, piece.title), `${name}.html`, 'text/html')
      else if (kind === 'json') download(toJson(f), `${name}.json`, 'application/json')
      else download(toAnsi(f), `${name}.ans`)
    } catch (e) {
      error('Export failed', e instanceof Error ? e.message : undefined)
    }
  }

  function recordVideo() {
    const canvas = engineRef.current.canvas
    if (!canvas || recording || typeof MediaRecorder === 'undefined') return
    const stream = canvas.captureStream(30)
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm'
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 })
    const chunks: Blob[] = []
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    rec.onstop = () => {
      setRecording(false)
      const url = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `${(piece.title || 'glyphloom').replace(/[^\w-]+/g, '-')}.webm`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    }
    setRecording(true)
    rec.start()
    setTimeout(() => rec.stop(), 6000)
  }

  /** Render the current state to a GIF and store it publicly; returns its key. */
  async function makeGif(): Promise<string> {
    if (!image) throw new Error('Image still loading')
    setGifBusy(0)
    try {
      const blob = await renderGif(image, live.recipe, {}, (p) => setGifBusy(p))
      const up = await upload(blob, `${(piece.title || 'glyphloom').replace(/[^\w-]+/g, '-')}.gif`)
      if (!up.success || !up.key) throw new Error(up.error ?? 'Upload failed')
      return up.key
    } finally {
      setGifBusy(null)
    }
  }

  async function downloadGif() {
    if (!image || gifBusy !== null) return
    setGifBusy(0)
    try {
      const blob = await renderGif(image, live.recipe, {}, (p) => setGifBusy(p))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(piece.title || 'glyphloom').replace(/[^\w-]+/g, '-')}.gif`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } finally {
      setGifBusy(null)
    }
  }

  async function togglePublish() {
    if (!isOwner || gifBusy !== null) return
    if (piece.inGallery) {
      pieces.put(id, { inGallery: false })
      return success('Removed from the gallery')
    }
    try {
      const gifKey = await makeGif()
      await pieces.putConfirmed(id, {
        inGallery: true,
        visibility: 'link',
        gifKey,
        publishedAt: new Date().toISOString(),
        authorName: user?.name || 'Anonymous',
      })
      success('Published', 'It’s in the public gallery now.')
    } catch (e) {
      error('Couldn’t publish', e instanceof Error ? e.message : undefined)
    }
  }

  const isOwner = userId === ownerId
  const onEngine = useCallback((engine: AsciiEngine | null, canvas: HTMLCanvasElement | null) => {
    engineRef.current = { engine, canvas }
  }, [])

  return (
    <div className="flex min-h-full flex-col lg:h-full lg:flex-row">
      {/* Stage */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <TitleField
            value={piece.title || 'Untitled'}
            editable={isOwner}
            onSave={(title) => pieces.put(id, { title })}
          />
          <span className="flex-1" />
          <PeerStack peers={live.peers} me={me} />
          {live.canWrite && (
            <Button size="sm" variant="ghost" onClick={undo} disabled={!history.length} aria-label="Undo">
              <Undo2 />
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline" disabled={!image}>
                  {gifBusy !== null || recording ? <Loader2 className="animate-spin" /> : <Download />}
                  {gifBusy !== null ? `GIF ${Math.round(gifBusy * 100)}%` : recording ? 'Recording…' : 'Export'}
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Image</DropdownMenuLabel>
              {[1, 2, 4, 6].map((sc) => (
                <DropdownMenuItem key={sc} onClick={() => exportAs('png', sc)}>
                  PNG {sc}×
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => exportAs('svg')}>SVG (vector)</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Moving</DropdownMenuLabel>
              <DropdownMenuItem onClick={downloadGif}>
                <Film /> GIF (loops, plays in email)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={recordVideo}>
                <Video /> Video (6 s WebM)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Text</DropdownMenuLabel>
              <DropdownMenuItem onClick={copyText}>
                <Copy /> Copy as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAs('txt')}>TXT</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAs('html')}>HTML (color)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAs('json')}>JSON (color)</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportAs('ansi')}>ANSI (color terminal)</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={remix}>
            <GitFork /> Remix
          </Button>
          {isOwner && (
            <Button size="sm" variant={piece.inGallery ? 'secondary' : 'outline'} onClick={togglePublish} disabled={gifBusy !== null || !image}>
              <Globe /> {piece.inGallery ? 'In gallery' : 'Publish'}
            </Button>
          )}
          {live.canWrite && (
            <Button size="sm" onClick={() => setSendOpen(true)}>
              <Send /> Send
            </Button>
          )}
        </div>

        {!live.canWrite && live.synced && (
          <div className="border-b border-border bg-primary/10 px-4 py-2 text-xs text-foreground">
            {isSignedIn ? (
              <>You’re watching. <button className="text-primary underline" onClick={remix}>Remix it</button> to make your own version.</>
            ) : (
              <>
                You’re watching.{' '}
                <button className="text-primary underline" onClick={() => setAuthOpen(true)}>
                  Sign in
                </button>{' '}
                {invite ? 'to tweak it together live.' : 'to remix it.'}
              </>
            )}
          </div>
        )}

        <div className="loom-grid flex flex-1 items-center justify-center p-4 sm:p-8">
          <div className="w-full max-w-5xl overflow-hidden rounded-xl border border-border shadow-xl shadow-[#161412]/20" style={{ background: live.recipe.background }}>
            {image ? (
              <AsciiCanvas image={image} recipe={live.recipe} highlight={highlight} onEngine={onEngine} />
            ) : (
              <div className="flex aspect-[3/2] items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading image…
              </div>
            )}
          </div>
        </div>
        {piece.prompt && <p className="px-6 pb-4 text-center text-xs text-muted-foreground">“{piece.prompt}”</p>}
      </div>

      {/* Tweaks */}
      <aside className="w-full shrink-0 border-t border-border bg-card/70 p-4 lg:w-[340px] lg:overflow-y-auto lg:border-l lg:border-t-0">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Tweaks</h2>
          {!live.synced && <span className="text-xs text-muted-foreground">connecting…</span>}
        </div>
        <Tweaks
          recipe={live.recipe}
          canWrite={live.canWrite && live.synced}
          peers={live.peers}
          onGlobal={live.setGlobal}
          onEffect={live.setEffect}
          onReplace={replace}
          onHold={live.hold}
          onHighlight={setHighlight}
          onRefine={refine}
        />
      </aside>

      <SendDialog pieceId={id} open={sendOpen} onClose={() => setSendOpen(false)} makeGif={makeGif} />
      {authOpen && <AuthOverlay onClose={() => setAuthOpen(false)} />}
    </div>
  )
}

function PeerStack({ peers, me }: { peers: { clientId: number; name: string; color: string }[]; me: { id: string; name: string } | null }) {
  const everyone = [...(me ? [{ key: 'me', name: `${me.name} (you)`, color: getUserColor(me.id) }] : []), ...peers.map((p) => ({ key: String(p.clientId), name: p.name, color: p.color }))]
  if (everyone.length < 2) return null
  return (
    <div className="mr-1 flex -space-x-1.5" aria-label={`${everyone.length} people here`}>
      {everyone.slice(0, 5).map((p) => (
        <span
          key={p.key}
          title={p.name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-background text-[11px] font-semibold text-black"
          style={{ background: p.color }}
        >
          {p.name[0]?.toUpperCase()}
        </span>
      ))}
    </div>
  )
}

function TitleField({ value, editable, onSave }: { value: string; editable: boolean; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  if (!editable) return <h1 className="truncate text-sm font-semibold text-foreground">{value}</h1>
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() && draft !== value && onSave(draft.trim().slice(0, 80))}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="min-w-0 max-w-xs truncate rounded bg-transparent px-1 text-sm font-semibold text-foreground hover:bg-accent focus:bg-accent focus:outline-none"
      aria-label="Title"
    />
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full flex-col items-center justify-center p-8 text-center text-sm text-muted-foreground">{children}</div>
}
