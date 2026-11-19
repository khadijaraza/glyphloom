/**
 * Live, co-editable recipe for one piece.
 *
 * The recipe lives in a Yjs doc bound to `pieces/<id>/live` (synced over the
 * existing RecordRoom socket; write access mirrors the piece's `update`
 * permission, i.e. owner + collaborators). It's stored granularly so two
 * people dragging different sliders never clobber each other:
 *
 *   Y.Map "g"   top-level recipe fields (cols, contrast, glyphs, …)
 *   Y.Map "fx"  effect id → effect object (with an `order` number)
 *
 * Awareness carries who is here and which slider each person is holding.
 * Every local change is also snapshotted (debounced) into the record's
 * `recipe` column, which thumbnails and the inbox read.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getUserColor, useMutations, useYjsField } from 'deepspace'
import * as Y from 'yjs'
import { safeRecipe, DEFAULT_RECIPE, type Effect, type Recipe } from '../ascii/recipe'

export interface Peer {
  clientId: number
  name: string
  color: string
  holding: string | null
}

type StoredEffect = Effect & { order: number }

function readRecipe(doc: Y.Doc): Recipe | null {
  const g = doc.getMap('g')
  if (g.size === 0) return null
  const fx = doc.getMap<StoredEffect>('fx')
  const effects = [...fx.values()].sort((a, b) => a.order - b.order).map(({ order: _o, ...e }) => e)
  return safeRecipe({ ...g.toJSON(), effects })
}

function writeRecipe(doc: Y.Doc, recipe: Recipe) {
  const g = doc.getMap('g')
  const fx = doc.getMap<StoredEffect>('fx')
  doc.transact(() => {
    const { effects, ...globals } = recipe
    for (const [k, v] of Object.entries(globals)) {
      if (JSON.stringify(g.get(k)) !== JSON.stringify(v)) g.set(k, v)
    }
    const ids = new Set(effects.map((e) => e.id))
    for (const id of [...fx.keys()]) if (!ids.has(id)) fx.delete(id)
    effects.forEach((e, order) => {
      const next = { ...e, order }
      if (JSON.stringify(fx.get(e.id)) !== JSON.stringify(next)) fx.set(e.id, next)
    })
  }, 'local')
}

export function useLiveRecipe(pieceId: string, fallback: Recipe | null, me: { id: string; name: string } | null) {
  const { doc, awareness, synced, canWrite, updateCount } = useYjsField('pieces', pieceId, 'live')
  const { put } = useMutations<{ recipe: Recipe }>('pieces')
  const [peers, setPeers] = useState<Peer[]>([])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // Seed an empty doc from the saved snapshot (first open after creation).
  useEffect(() => {
    if (synced && canWrite && fallback && doc.getMap('g').size === 0) writeRecipe(doc, fallback)
  }, [synced, canWrite, fallback, doc])

  const recipe = useMemo(
    () => readRecipe(doc) ?? fallback ?? DEFAULT_RECIPE,
    // updateCount is the render trigger for remote and local Yjs updates.
    [doc, updateCount, fallback],
  )

  const snapshot = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const r = readRecipe(doc)
      if (r) put(pieceId, { recipe: r })
    }, 1500)
  }, [doc, pieceId, put])

  useEffect(() => () => clearTimeout(saveTimer.current), [])

  /** Replace the whole recipe (AI refine, undo, version restore). */
  const setRecipe = useCallback(
    (next: Recipe) => {
      if (!canWrite) return
      writeRecipe(doc, next)
      snapshot()
    },
    [canWrite, doc, snapshot],
  )

  /** Set one top-level field — the slider fast path. */
  const setGlobal = useCallback(
    <K extends keyof Recipe>(key: K, value: Recipe[K]) => {
      if (!canWrite) return
      doc.transact(() => doc.getMap('g').set(key as string, value), 'local')
      snapshot()
    },
    [canWrite, doc, snapshot],
  )

  /** Patch one effect by id. */
  const setEffect = useCallback(
    (id: string, patch: Partial<Effect>) => {
      if (!canWrite) return
      const fx = doc.getMap<StoredEffect>('fx')
      const cur = fx.get(id)
      if (!cur) return
      doc.transact(() => fx.set(id, { ...cur, ...patch }), 'local')
      snapshot()
    },
    [canWrite, doc, snapshot],
  )

  // Awareness: announce ourselves, and track everyone else.
  useEffect(() => {
    if (!me) return
    awareness.setLocalStateField('user', { name: me.name, color: getUserColor(me.id) })
  }, [awareness, me])

  useEffect(() => {
    const update = () => {
      const next: Peer[] = []
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return
        const s = state as { user?: { name: string; color: string }; holding?: string | null }
        if (s.user) next.push({ clientId, name: s.user.name, color: s.user.color, holding: s.holding ?? null })
      })
      setPeers(next)
    }
    awareness.on('change', update)
    update()
    return () => awareness.off('change', update)
  }, [awareness])

  const hold = useCallback((key: string | null) => awareness.setLocalStateField('holding', key), [awareness])

  return { recipe, synced, canWrite, peers, hold, setRecipe, setGlobal, setEffect }
}
