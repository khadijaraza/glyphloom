/** Typed client for /api/actions/* (see src/actions/index.ts). */

import { getAuthToken } from 'deepspace'
import type { Recipe } from '../ascii/recipe'

/** "Always use my own DeepSpace credits", remembered per browser. */
export const ownCreditsPref = {
  get: () => {
    try {
      return localStorage.getItem('glyphloom.ownCredits') === '1'
    } catch {
      return false
    }
  },
  set: (v: boolean) => {
    try {
      localStorage.setItem('glyphloom.ownCredits', v ? '1' : '0')
    } catch {
      /* private mode: the choice just doesn't persist */
    }
  },
}

async function call<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Sign in first.')
  const res = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: string }
  if (!res.ok || !json.success) throw new Error(json.error ?? `Request failed (${res.status})`)
  return json.data as T
}

export type Allowance = Record<'image' | 'recipe' | 'refine', { free: number; usedFree: number }>

export const api = {
  allowance: () => call<Allowance>('allowance', {}),
  generateSources: (prompt: string, mode: 'scene' | 'object' = 'scene', count: 1 | 4 = 1) =>
    call<{ keys: string[]; payer: 'owner' | 'caller' }>('generateSources', { prompt, mode, count, ownCredits: ownCreditsPref.get() }),
  buildRecipe: (prompt: string, summary: string, thumbnail: string | null, mode: 'scene' | 'object' = 'scene') =>
    call<{ recipe: Recipe }>('buildRecipe', { prompt, summary, thumbnail, mode, ownCredits: ownCreditsPref.get() }),
  refineRecipe: (recipe: Recipe, instruction: string) =>
    call<{ recipe: Recipe; patch: Record<string, unknown> }>('refineRecipe', { recipe, instruction, ownCredits: ownCreditsPref.get() }),
  sendPiece: (p: { pieceId: string; toUserId?: string; toEmail?: string; note?: string; fromName?: string; gifKey?: string }) =>
    call<{ sendId: string }>('sendPiece', p),
  claimInvite: (pieceId: string, token: string) => call<{ claimed: boolean }>('claimInvite', { pieceId, token }),
}
