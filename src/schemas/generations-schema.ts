import type { CollectionSchema } from 'deepspace/schema'

/**
 * Ledger of paid AI calls, written only by server actions. Decides who pays:
 * each person gets a small daily allowance billed to the app owner, then calls
 * bill their own DeepSpace credits (see BILLING in src/actions/index.ts).
 */
export const generationsSchema: CollectionSchema = {
  name: 'generations',
  columns: [
    { name: 'userId', storage: 'text', interpretation: 'plain', required: true },
    { name: 'kind', storage: 'text', interpretation: { kind: 'select', options: ['image', 'recipe', 'refine', 'email'] } },
    { name: 'day', storage: 'text', interpretation: 'plain' },
    /** Images for 'image' (1 or 4), otherwise 1. */
    { name: 'units', storage: 'number', interpretation: 'plain' },
    /** Who was billed: the app owner (free allowance) or the caller's own credits. */
    { name: 'payer', storage: 'text', interpretation: { kind: 'select', options: ['owner', 'caller'] } },
  ],
  ownerField: 'userId',
  permissions: {
    member: { read: 'own', create: false, update: false, delete: false },
    admin: { read: true, create: false, update: false, delete: true },
  },
}
