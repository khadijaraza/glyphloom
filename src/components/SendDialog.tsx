/** Send a piece to someone in the app (live inbox) or by email (invite link). */

import { useMemo, useState } from 'react'
import { useAuth, useUser, useUsers } from 'deepspace'
import { Loader2, Send } from 'lucide-react'
import { Button, Input, Modal, Textarea, useToast } from '@/components/ui'
import { api } from '../lib/actions'
import { cn } from '../lib/utils'

export function SendDialog({ pieceId, open, onClose }: { pieceId: string; open: boolean; onClose: () => void }) {
  const { userId } = useAuth()
  const { user } = useUser()
  const { users } = useUsers()
  const { success, error } = useToast()
  const [query, setQuery] = useState('')
  const [toUserId, setToUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)

  const people = useMemo(
    () =>
      users
        .filter((u) => u.id !== userId && !u.id.startsWith('anon-'))
        .filter((u) => !query || u.name?.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8),
    [users, userId, query],
  )

  async function send() {
    if (sending || (!toUserId && !email.trim())) return
    setSending(true)
    try {
      await api.sendPiece({
        pieceId,
        toUserId: toUserId ?? undefined,
        toEmail: email.trim() || undefined,
        note: note.trim(),
        fromName: user?.name || 'A friend',
      })
      success('Sent', toUserId ? 'It’s in their inbox now.' : 'The invite email is on its way.')
      setToUserId(null)
      setEmail('')
      setNote('')
      onClose()
    } catch (e) {
      error('Couldn’t send', e instanceof Error ? e.message : undefined)
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md" aria-label="Send this piece">
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Send this piece</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            They can watch it move, tweak it with you live, or remix their own copy.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Someone on Glyphloom</label>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search people…" />
          <div className="mt-2 flex max-h-44 flex-col gap-1 overflow-y-auto">
            {people.length === 0 && <p className="py-2 text-xs text-muted-foreground">No one found. Send by email instead.</p>}
            {people.map((u) => (
              <button
                key={u.id}
                onClick={() => setToUserId(toUserId === u.id ? null : u.id)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm',
                  toUserId === u.id ? 'bg-primary/15 text-foreground ring-1 ring-primary/50' : 'text-foreground/85 hover:bg-accent',
                )}
              >
                {u.imageUrl ? (
                  <img src={u.imageUrl} alt="" referrerPolicy="no-referrer" className="h-6 w-6 rounded-full" />
                ) : (
                  <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[11px]">{u.name?.[0] ?? '?'}</span>
                )}
                {u.name || 'Unnamed'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">…or by email</label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="friend@example.com" />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Note (optional)</label>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={280} placeholder="made this thinking of you" />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending || (!toUserId && !email.trim())}>
            {sending ? <Loader2 className="animate-spin" /> : <Send />}
            Send
          </Button>
        </div>
      </div>
    </Modal>
  )
}
