/** Inbox: pieces people sent you (live), and what you've sent. */

import { useAuth, useQuery, useUserLookup } from 'deepspace'
import { PieceCard } from '../../../components/PieceCard'
import type { Recipe } from '../../../ascii/recipe'

type SendData = { pieceId: string; pieceTitle: string; fromUserId: string; fromName: string; toUserId: string; toEmail: string; note: string; seenAt: string }
type PieceData = { title: string; sourceKey: string; recipe: Recipe }

const ago = (iso: string) => {
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return new Date(iso).toLocaleDateString()
}

export default function InboxPage() {
  const { userId } = useAuth()
  const { getName } = useUserLookup()
  const { records: sends, status } = useQuery<SendData>('sends', { orderBy: 'createdAt', orderDir: 'desc' })
  const { records: pieces } = useQuery<PieceData>('pieces')
  const pieceById = new Map(pieces.map((p) => [p.recordId, p]))

  const received = sends.filter((s) => s.data.toUserId === userId)
  const sent = sends.filter((s) => s.data.fromUserId === userId)

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">Inbox</p>
      <h1 className="mt-1 text-2xl font-semibold text-foreground">Sent to you</h1>
      {status === 'loading' && sends.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      ) : received.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing yet. When someone sends you a piece it appears here instantly.</p>
      ) : (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {received.map((s) => {
            const p = pieceById.get(s.data.pieceId)
            return (
              <div key={s.recordId} className="relative">
                {!s.data.seenAt && <span className="absolute -right-1 -top-1 z-10 h-3 w-3 rounded-full bg-primary ring-2 ring-background" aria-label="New" />}
                {p ? (
                  <PieceCard
                    id={p.recordId}
                    title={s.data.pieceTitle || p.data.title}
                    sourceKey={p.data.sourceKey}
                    recipe={p.data.recipe}
                    footer={
                      <>
                        from <span className="text-foreground">{s.data.fromName}</span> · {ago(s.createdAt)}
                        {s.data.note && <span className="mt-1 block italic text-foreground/80">“{s.data.note}”</span>}
                      </>
                    }
                  />
                ) : (
                  <div className="rounded-xl border border-border p-4 text-sm text-muted-foreground">“{s.data.pieceTitle}” was deleted.</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <h2 className="mt-12 text-lg font-semibold text-foreground">You sent</h2>
      {sent.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Open a piece and press Send.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border">
          {sent.map((s) => (
            <li key={s.recordId} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="truncate text-foreground">“{s.data.pieceTitle}”</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                to {s.data.toEmail || (s.data.toUserId && getName(s.data.toUserId)) || 'a friend'} · {s.data.seenAt ? 'opened' : 'not opened yet'} · {ago(s.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
