import type { CollectionSchema } from 'deepspace/schema'

/**
 * One "I made you this" delivery. Only the `sendPiece` / `claimInvite` server
 * actions create or attach these, so a client can't forge a send from someone
 * else. Readable only by the two people involved (`participants`), which the
 * Durable Object enforces before anything reaches the socket.
 *
 * Email sends start with `toUserId` empty and an `inviteToken`; the first
 * signed-in person to open the emailed link claims it.
 */
export const sendsSchema: CollectionSchema = {
  name: 'sends',
  columns: [
    { name: 'pieceId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'pieceTitle', storage: 'text', interpretation: 'plain' },
    { name: 'fromUserId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'fromName', storage: 'text', interpretation: 'plain' },
    { name: 'toUserId', storage: 'text', interpretation: 'plain' },
    { name: 'toEmail', storage: 'text', interpretation: 'plain' },
    { name: 'note', storage: 'text', interpretation: 'plain' },
    { name: 'inviteToken', storage: 'text', interpretation: 'plain' },
    { name: 'seenAt', storage: 'text', interpretation: 'plain' },
    { name: 'participants', storage: 'text', interpretation: { kind: 'json' } },
  ],
  ownerField: 'fromUserId',
  collaboratorsField: 'participants',
  permissions: {
    member: { read: 'collaborator', create: false, update: 'collaborator', delete: 'own' },
    admin: { read: true, create: false, update: true, delete: true },
  },
}
