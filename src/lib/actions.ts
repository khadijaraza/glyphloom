/** Typed client for /api/actions/* (see src/actions/index.ts). */

import { getAuthToken } from 'deepspace'
import type { Recipe } from '../ascii/recipe'

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

export const api = {
  generateSources: (prompt: string) => call<{ keys: string[] }>('generateSources', { prompt }),
  buildRecipe: (prompt: string, summary: string, thumbnail: string | null) =>
    call<{ recipe: Recipe }>('buildRecipe', { prompt, summary, thumbnail }),
  refineRecipe: (recipe: Recipe, instruction: string) =>
    call<{ recipe: Recipe; patch: Record<string, unknown> }>('refineRecipe', { recipe, instruction }),
  sendPiece: (p: { pieceId: string; toUserId?: string; toEmail?: string; note?: string; fromName?: string }) =>
    call<{ sendId: string }>('sendPiece', p),
  claimInvite: (pieceId: string, token: string) => call<{ claimed: boolean }>('claimInvite', { pieceId, token }),
}
