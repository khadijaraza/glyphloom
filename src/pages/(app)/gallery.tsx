/**
 * Public gallery: pieces their owners chose to publish. Readable signed out
 * (published pieces are link-visible, which the RecordRoom serves to '*').
 * Cards are the stored GIFs, so a page of 30 animations costs no rendering.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, useAuth, useMutations, useQuery, useR2Files } from 'deepspace'
import { Heart } from 'lucide-react'
import { PieceCard } from '../../components/PieceCard'
import type { Recipe } from '../../ascii/recipe'

type PieceData = { title: string; sourceKey: string; recipe: Recipe; gifKey?: string; inGallery?: boolean; publishedAt?: string; authorName?: string; forkedFrom?: string }

export default function GalleryPage() {
  const { getUrl } = useR2Files({ scope: 'app' })
  const { isSignedIn, userId } = useAuth()
  const { records, status } = useQuery<PieceData>('pieces')
  const { records: likes } = useQuery<{ pieceId: string; userId: string }>('likes')
  const likeMut = useMutations<{ pieceId: string; userId?: string }>('likes')
  const [sort, setSort] = useState<'new' | 'loved'>('new')
  const [authOpen, setAuthOpen] = useState(false)

  const { counts, mine } = useMemo(() => {
    const counts = new Map<string, number>()
    const mine = new Map<string, string>() // pieceId -> my like's recordId
    for (const l of likes) {
      counts.set(l.data.pieceId, (counts.get(l.data.pieceId) ?? 0) + 1)
      if (l.data.userId === userId) mine.set(l.data.pieceId, l.recordId)
    }
    return { counts, mine }
  }, [likes, userId])

  const items = records
    .filter((r) => r.data.inGallery)
    .sort((a, b) =>
      sort === 'loved'
        ? (counts.get(b.recordId) ?? 0) - (counts.get(a.recordId) ?? 0) || (b.data.publishedAt ?? '').localeCompare(a.data.publishedAt ?? '')
        : (b.data.publishedAt ?? '').localeCompare(a.data.publishedAt ?? ''),
    )

  function toggleLike(pieceId: string) {
    if (!isSignedIn) return setAuthOpen(true)
    const existing = mine.get(pieceId)
    if (existing) likeMut.remove(existing)
    // userId is user-bound: the server sets it from the verified login.
    else likeMut.create({ pieceId })
  }

  const LikeButton = ({ pieceId }: { pieceId: string }) => {
    const liked = mine.has(pieceId)
    const n = counts.get(pieceId) ?? 0
    return (
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          toggleLike(pieceId)
        }}
        disabled={isSignedIn && !likeMut.ready}
        aria-pressed={liked}
        aria-label={liked ? 'Unlike' : 'Like'}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-50"
      >
        <Heart className={liked ? 'h-4 w-4 fill-primary text-primary' : 'h-4 w-4'} />
        <span data-testid="like-count">{n}</span>
      </button>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Gallery</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Made on Glyphloom</h1>
          <p className="mt-1 text-sm text-muted-foreground">Open one to watch it live, then remix your own version.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-sm border border-border text-xs" role="group" aria-label="Sort">
            {(['new', 'loved'] as const).map((k) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                aria-pressed={sort === k}
                className={sort === k ? 'bg-secondary px-3 py-1.5 text-foreground' : 'px-3 py-1.5 text-muted-foreground hover:text-foreground'}
              >
                {k === 'new' ? 'Newest' : 'Most loved'}
              </button>
            ))}
          </div>
          <Link to="/create" className="text-sm text-primary hover:underline">
            Make one →
          </Link>
        </div>
      </div>
      {authOpen && <AuthOverlay onClose={() => setAuthOpen(false)} />}

      {status === 'loading' && items.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">Nothing published yet. Open one of your pieces and press Publish.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <div key={p.recordId} data-testid="gallery-item" data-title={p.data.title}>{
            p.data.gifKey ? (
              <Link to={`/p/${p.recordId}`} className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50">
                <div className="flex aspect-[3/2] items-center justify-center overflow-hidden bg-[#1b1b1b]">
                  <img src={getUrl(p.data.gifKey)} alt={`${p.data.title}, animated ASCII`} loading="lazy" className="h-full w-full object-cover" />
                </div>
                <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{p.data.title || 'Untitled'}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      by {p.data.authorName || 'Anonymous'}
                      {p.data.forkedFrom ? ' · remix' : ''}
                    </p>
                  </div>
                  <LikeButton pieceId={p.recordId} />
                </div>
              </Link>
            ) : (
              <PieceCard id={p.recordId} title={p.data.title} sourceKey={p.data.sourceKey} recipe={p.data.recipe} footer={<span className="flex items-center justify-between">by {p.data.authorName || 'Anonymous'} <LikeButton pieceId={p.recordId} /></span>} />
            )}</div>
          ))}
        </div>
      )}
    </div>
  )
}
