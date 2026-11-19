/**
 * Public gallery: pieces their owners chose to publish. Readable signed out
 * (published pieces are link-visible, which the RecordRoom serves to '*').
 * Cards are the stored GIFs, so a page of 30 animations costs no rendering.
 */

import { Link } from 'react-router-dom'
import { useQuery, useR2Files } from 'deepspace'
import { PieceCard } from '../../components/PieceCard'
import type { Recipe } from '../../ascii/recipe'

type PieceData = { title: string; sourceKey: string; recipe: Recipe; gifKey?: string; inGallery?: boolean; publishedAt?: string; authorName?: string; forkedFrom?: string }

export default function GalleryPage() {
  const { getUrl } = useR2Files({ scope: 'app' })
  const { records, status } = useQuery<PieceData>('pieces')
  const items = records
    .filter((r) => r.data.inGallery)
    .sort((a, b) => (b.data.publishedAt ?? '').localeCompare(a.data.publishedAt ?? ''))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Gallery</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Made on Glyphloom</h1>
          <p className="mt-1 text-sm text-muted-foreground">Open one to watch it live, then remix your own version.</p>
        </div>
        <Link to="/create" className="text-sm text-primary hover:underline">
          Make one →
        </Link>
      </div>

      {status === 'loading' && items.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">Nothing published yet. Open one of your pieces and press Publish.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) =>
            p.data.gifKey ? (
              <Link key={p.recordId} to={`/p/${p.recordId}`} className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50">
                <div className="flex aspect-[3/2] items-center justify-center overflow-hidden bg-[#07070c]">
                  <img src={getUrl(p.data.gifKey)} alt={`${p.data.title}, animated ASCII`} loading="lazy" className="h-full w-full object-cover" />
                </div>
                <div className="px-3 py-2.5">
                  <p className="truncate text-sm font-medium text-foreground">{p.data.title || 'Untitled'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    by {p.data.authorName || 'Anonymous'}
                    {p.data.forkedFrom ? ' · remix' : ''}
                  </p>
                </div>
              </Link>
            ) : (
              <PieceCard key={p.recordId} id={p.recordId} title={p.data.title} sourceKey={p.data.sourceKey} recipe={p.data.recipe} footer={`by ${p.data.authorName || 'Anonymous'}`} />
            ),
          )}
        </div>
      )}
    </div>
  )
}
