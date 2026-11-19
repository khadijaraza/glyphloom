import type { CollectionSchema } from 'deepspace/schema'

/**
 * An animated ASCII piece: a source image plus a recipe.
 *
 * - Private while `visibility` is 'private'. Sending it (or turning on "anyone
 *   with the link") flips it to 'link', which makes it readable to anyone,
 *   signed out included, so an emailed link just works.
 * - People it was sent to are added to `collaborators` by the `sendPiece`
 *   action and can co-tweak it live. The live slider state is a Yjs doc bound
 *   to the `live` field; its write access follows `update` below.
 * - `recipe` is the last saved snapshot (thumbnails, inbox, fallback when the
 *   Yjs doc is empty).
 */
export const piecesSchema: CollectionSchema = {
  name: 'pieces',
  columns: [
    { name: 'title', storage: 'text', interpretation: 'plain' },
    { name: 'prompt', storage: 'text', interpretation: 'plain' },
    /** R2 key in the app (public) scope. */
    { name: 'sourceKey', storage: 'text', interpretation: 'plain', required: true },
    { name: 'recipe', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'visibility', storage: 'text', interpretation: { kind: 'select', options: ['private', 'link'] } },
    { name: 'collaborators', storage: 'text', interpretation: { kind: 'json' } },
    { name: 'forkedFrom', storage: 'text', interpretation: 'plain' },
  ],
  visibilityField: { field: 'visibility', value: 'link' },
  collaboratorsField: 'collaborators',
  permissions: {
    '*': { read: 'published', create: false, update: false, delete: false },
    viewer: { read: 'published', create: false, update: false, delete: false },
    member: { read: 'shared', create: true, update: 'collaborator', delete: 'own' },
    admin: { read: true, create: true, update: true, delete: true },
  },
}
