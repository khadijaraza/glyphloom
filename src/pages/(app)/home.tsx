/** Studio: your pieces and the ones you've been invited into. */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AuthOverlay, useAuth, useQuery } from 'deepspace'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import { PieceCard } from '../../components/PieceCard'
import type { Recipe } from '../../ascii/recipe'

type PieceData = { title: string; sourceKey: string; recipe: Recipe; collaborators: string[]; forkedFrom: string }

export default function StudioPage() {
  const { isSignedIn, userId } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const { records, status } = useQuery<PieceData>('pieces', { orderBy: 'updatedAt', orderDir: 'desc' })

  if (!isSignedIn)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <h1 className="text-xl font-semibold text-foreground">Your studio</h1>
        <p className="max-w-sm text-sm text-muted-foreground">Sign in to make moving ASCII pieces and send them to friends.</p>
        <Button onClick={() => setAuthOpen(true)}>Sign in</Button>
        {authOpen && <AuthOverlay onClose={() => setAuthOpen(false)} />}
      </div>
    )

  // Link-shared pieces from everyone are readable too; the studio shows only yours.
  const mine = records.filter((r) => r.createdBy === userId)
  const shared = records.filter((r) => r.createdBy !== userId && (r.data.collaborators ?? []).includes(userId!))

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Studio</p>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Your pieces</h1>
        </div>
        <Link to="/create">
          <Button>
            <Plus /> New piece
          </Button>
        </Link>
      </div>

      {status === 'loading' && records.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">Loading…</p>
      ) : mine.length === 0 ? (
        <div className="mt-10 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-foreground">Nothing here yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">Describe a scene, or try the demo lanterns.</p>
          <Link to="/create" className="mt-4 inline-block text-sm text-primary hover:underline">
            Make your first piece →
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mine.map((p) => (
            <PieceCard key={p.recordId} id={p.recordId} title={p.data.title} sourceKey={p.data.sourceKey} recipe={p.data.recipe} footer={p.data.forkedFrom ? 'Remix' : undefined} />
          ))}
        </div>
      )}

      {shared.length > 0 && (
        <>
          <h2 className="mt-10 text-lg font-semibold text-foreground">Shared with you</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shared.map((p) => (
              <PieceCard key={p.recordId} id={p.recordId} title={p.data.title} sourceKey={p.data.sourceKey} recipe={p.data.recipe} footer="You can tweak this" />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
