/**
 * Glyphloom's own agent tools, shared by the website assistant and local
 * agents (`npx deepspace agent invoke glyphloom <tool>`). Reads go through the
 * caller-scoped executor, so RBAC applies exactly as in the app; paid work
 * reuses the server actions, so allowance, billing and ownership checks are
 * the same code the website uses.
 */

import { tool } from 'ai'
import type { ToolSet } from 'ai'
import { z } from 'zod/v4'
import type { AgentToolContext, UserToolExecutor } from 'deepspace/worker'
import type { Env } from '../../worker.js'
import { actions } from '../actions/index.js'
import { applyPatch, safeRecipe, type Recipe } from '../ascii/recipe.js'
import { createActionTools } from '../server/action-routes.js'

type Piece = { recordId: string; createdBy: string; data: { title?: string; recipe?: unknown; collaborators?: string[]; inGallery?: boolean; visibility?: string; prompt?: string } }

/** Executor results come back as the tools-API envelope; unwrap defensively. */
function unwrap<T>(res: unknown): T {
  const r = res as { success?: boolean; data?: unknown; error?: string }
  if (r && r.success === false) throw new Error(r.error ?? 'Request failed')
  return (r && 'data' in r ? r.data : r) as T
}

/**
 * Return failures as data instead of throwing, so the calling agent sees the
 * reason ("cols: must be ≤ 320") rather than a generic execution error.
 */
function safe<A>(fn: (args: A) => Promise<unknown>) {
  return async (args: A) => {
    try {
      return await fn(args)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      // zod errors carry a JSON list of issues; condense them.
      try {
        const issues = JSON.parse(msg) as Array<{ path: unknown[]; message: string }>
        if (Array.isArray(issues)) return { ok: false, error: issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
      } catch {
        /* not a zod error */
      }
      return { ok: false, error: msg }
    }
  }
}

export function buildGlyphloomTools(executor: UserToolExecutor, context?: AgentToolContext<Env>): ToolSet {
  const userId = context?.userId ?? ''
  const base = context ? `https://${context.env.APP_NAME}.app.space` : ''
  const bearer = context?.request.headers.get('Authorization') ?? ''
  const callerJwt = bearer.startsWith('Bearer ') ? bearer.slice(7) : ''

  async function getEditable(pieceId: string): Promise<{ piece: Piece; recipe: Recipe }> {
    const { record } = unwrap<{ record: Piece }>(await executor('records.get', { collection: 'pieces', recordId: pieceId }))
    if (!record) throw new Error('Piece not found, or you can’t see it.')
    const canEdit = record.createdBy === userId || (record.data.collaborators ?? []).includes(userId)
    if (!canEdit) throw new Error('You can view this piece but not edit it.')
    const recipe = safeRecipe(record.data.recipe)
    if (!recipe) throw new Error('This piece has no valid settings yet.')
    return { piece: record, recipe }
  }

  /** Save an agent edit: the snapshot plus the field open editors apply live. */
  async function save(pieceId: string, recipe: Recipe) {
    unwrap(await executor('records.update', { collection: 'pieces', recordId: pieceId, data: { recipe, agentRecipe: recipe, agentAt: new Date().toISOString() } }))
  }

  const summary = (r: Recipe) => ({
    style: r.cellStyle,
    characters: r.glyphs,
    width: r.cols,
    color: r.colorMode,
    invert: r.invert,
    effects: r.effects.map((e) => `${e.label || e.kind} (${e.kind}${e.enabled ? '' : ', off'})`),
  })

  return {
    glyphloom_list_pieces: tool({
      description: 'List the Glyphloom pieces you own or were invited to edit, with a link and a short summary of each one’s look.',
      inputSchema: z.object({}),
      execute: safe(async () => {
        const { records } = unwrap<{ records: Piece[] }>(await executor('records.query', { collection: 'pieces', limit: 100 }))
        return records
          .filter((p) => p.createdBy === userId || (p.data.collaborators ?? []).includes(userId))
          .map((p) => {
            const r = safeRecipe(p.data.recipe)
            return { pieceId: p.recordId, title: p.data.title ?? 'Untitled', url: `${base}/p/${p.recordId}`, mine: p.createdBy === userId, inGallery: !!p.data.inGallery, ...(r ? summary(r) : {}) }
          })
      }),
    }),

    glyphloom_get_piece: tool({
      description: 'Get one piece’s full settings (the recipe JSON the renderer draws from). Use before glyphloom_set_settings to see field names and current values.',
      inputSchema: z.object({ pieceId: z.string().describe('From glyphloom_list_pieces') }),
      execute: safe(async ({ pieceId }) => {
        const { record } = unwrap<{ record: Piece }>(await executor('records.get', { collection: 'pieces', recordId: pieceId }))
        return { pieceId, title: record.data.title, prompt: record.data.prompt, url: `${base}/p/${pieceId}`, recipe: safeRecipe(record.data.recipe) }
      }),
    }),

    glyphloom_set_settings: tool({
      description:
        'Change a piece’s settings directly, with no AI call and no cost. Pass a partial recipe: top-level fields replace (e.g. {"cols": 240, "cellStyle": "dots", "invert": true}); "effects" entries merge by id, {"id": "...", "remove": true} deletes one. Invalid values are rejected. Anyone with the piece open sees the change live.',
      inputSchema: z.object({ pieceId: z.string(), settings: z.record(z.string(), z.unknown()) }),
      execute: safe(async ({ pieceId, settings }) => {
        const { recipe } = await getEditable(pieceId)
        const next = applyPatch(recipe, settings)
        await save(pieceId, next)
        return { ok: true, url: `${base}/p/${pieceId}`, now: summary(next) }
      }),
    }),

    glyphloom_refine_piece: tool({
      description:
        'Change a piece by describing it in plain words ("slower lanterns, warmer orange", "make it ink on paper"). Uses AI: it counts against your daily free allowance, then your own DeepSpace credits. Edits the current settings in place; never regenerates the image.',
      inputSchema: z.object({ pieceId: z.string(), instruction: z.string().min(2).max(400) }),
      execute: safe(async ({ pieceId, instruction }) => {
        if (!context) throw new Error('Unavailable here')
        const { recipe } = await getEditable(pieceId)
        const result = await actions.refineRecipe({
          userId,
          params: { recipe, instruction },
          tools: createActionTools(context.env, userId, callerJwt),
          env: context.env,
          callerJwt,
        })
        const r = result as { success: boolean; data?: { recipe: Recipe; patch: unknown }; error?: string }
        if (!r.success || !r.data) throw new Error(r.error ?? 'Refine failed')
        await save(pieceId, r.data.recipe)
        return { ok: true, url: `${base}/p/${pieceId}`, patch: r.data.patch, now: summary(r.data.recipe) }
      }),
    }),

    glyphloom_send_piece: tool({
      description:
        'Send a piece to someone by email (they get an invite link to watch it and tweak it with you). You must own or be invited to the piece. The email has no GIF preview when sent from an agent.',
      inputSchema: z.object({ pieceId: z.string(), toEmail: z.string().email(), note: z.string().max(280).optional() }),
      execute: safe(async ({ pieceId, toEmail, note }) => {
        if (!context) throw new Error('Unavailable here')
        const result = await actions.sendPiece({
          userId,
          params: { pieceId, toEmail, note: note ?? '', fromName: 'A Glyphloom user' },
          tools: createActionTools(context.env, userId, callerJwt),
          env: context.env,
          callerJwt,
        })
        const r = result as { success: boolean; error?: string }
        if (!r.success) throw new Error(r.error ?? 'Send failed')
        return { ok: true, sentTo: toEmail }
      }),
    }),
  }
}
