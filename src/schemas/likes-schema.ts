import type { CollectionSchema } from 'deepspace/schema'

/**
 * One like per person per piece, enforced by the Durable Object: `userId` is
 * user-bound (the server fills it from the verified JWT, so you can't like as
 * someone else) and `uniqueOn` refuses a second row for the same pair, even
 * from a forged or replayed write. Counts are public so the gallery can rank
 * signed-out.
 */
export const likesSchema: CollectionSchema = {
  name: 'likes',
  columns: [
    { name: 'pieceId', storage: 'text', interpretation: 'plain', required: true, immutable: true },
    { name: 'userId', storage: 'text', interpretation: 'plain', userBound: true, immutable: true },
  ],
  uniqueOn: ['pieceId', 'userId'],
  ownerField: 'userId',
  permissions: {
    '*': { read: true, create: false, update: false, delete: false },
    viewer: { read: true, create: false, update: false, delete: false },
    member: { read: true, create: true, update: false, delete: 'own' },
    admin: { read: true, create: true, update: false, delete: true },
  },
}
