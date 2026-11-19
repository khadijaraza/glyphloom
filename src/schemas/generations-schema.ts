import type { CollectionSchema } from 'deepspace/schema'

/**
 * Ledger of paid AI calls, written only by server actions. Used to cap spend
 * per user per day (the platform doesn't rate-limit these integrations, and
 * the app owner pays for them).
 */
export const generationsSchema: CollectionSchema = {
  name: 'generations',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'kind', storage: 'text', interpretation: { kind: 'select', options: ['image', 'recipe', 'refine', 'email'] } },
    { name: 'day', storage: 'text', interpretation: 'plain' },
  ],
  ownerField: 'userId',
  permissions: {
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
