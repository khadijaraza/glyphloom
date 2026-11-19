/**
 * Server actions — everything that spends the owner's credits or writes on
 * someone else's behalf lives here, behind a verified JWT.
 *
 *  generateSources  text → 4 source images (openai/generate-image) → public R2
 *  buildRecipe      prompt + image summary (+ thumbnail) → validated Recipe (anthropic)
 *  refineRecipe     current Recipe + "make the lanterns slower" → patched Recipe (anthropic)
 *  sendPiece        share with an app user and/or an email address (email/send)
 *  claimInvite      the emailed person signs in and becomes a collaborator
 *
 * Actions run with RBAC off, so each one checks ownership itself before
 * writing. AI output is never trusted: recipes go through `parseRecipe` /
 * `applyPatch` (zod) before they leave the worker.
 */

import { appFiles } from 'deepspace/worker'
import type { ActionHandler, ActionResult, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { applyPatch, EFFECT_KINDS, GLYPH_SETS, parseRecipe, type Recipe } from '../ascii/recipe'

/** Per-user daily caps on owner-billed calls. */
const DAILY_LIMITS = { image: 12, recipe: 40, refine: 80, email: 20 } as const
type Kind = keyof typeof DAILY_LIMITS

const RECIPE_MODEL = 'claude-sonnet-5-5'
const FALLBACK_MODEL = 'claude-haiku-5-5'

const fail = (error: string): ActionResult<never> => ({ success: false, error })
const today = () => new Date().toISOString().slice(0, 10)

/** Count today's calls of `kind` and refuse past the cap; records the call when allowed. */
async function meter(tools: ActionTools, userId: string, kind: Kind): Promise<string | null> {
  const day = today()
  const r = await tools.query('generations', { where: { userId, kind, day }, limit: 200 })
  const used = r.success ? r.data.records.length : 0
  if (used >= DAILY_LIMITS[kind]) return `Daily limit reached for ${kind} (${DAILY_LIMITS[kind]}/day). Try again tomorrow.`
  await tools.create('generations', { userId, kind, day })
  return null
}

/** tools.integration returns the proxy body; normalize to { success, data | error }. */
async function callIntegration<T>(tools: ActionTools, endpoint: string, body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = (await tools.integration(endpoint, body)) as { success?: boolean; data?: T; error?: string }
    if (res && res.success === false) return { ok: false, error: res.error ?? `${endpoint} failed` }
    if (res && 'data' in res && res.data !== undefined) return { ok: true, data: res.data as T }
    return { ok: true, data: res as unknown as T }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : `${endpoint} failed` }
  }
}

type ClaudeContent = Array<Record<string, unknown>> | string
async function askClaude(tools: ActionTools, system: string, content: ClaudeContent, maxTokens = 2000): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  let lastError = 'AI call failed'
  for (const model of [RECIPE_MODEL, FALLBACK_MODEL]) {
    const r = await callIntegration<{ content?: Array<{ type: string; text?: string }> }>(tools, 'anthropic/chat-completion', {
      model,
      max_tokens: maxTokens,
      temperature: 0.7,
      system,
      messages: [{ role: 'user', content }],
    })
    if (r.ok) {
      const text = (r.data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('')
      if (text) return { ok: true, text }
      lastError = 'AI returned no text'
    } else lastError = r.error
  }
  return { ok: false, error: lastError }
}

/** Pull the first JSON object out of a model reply (tolerates ```json fences and prose). */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('No JSON in AI reply')
  return JSON.parse(body.slice(start, end + 1))
}

/** Rewrite a possibly time-based request into a prompt for one still frame. Falls back to the original. */
async function toSingleFrame(tools: ActionTools, prompt: string): Promise<string> {
  const r = await callIntegration<{ content?: Array<{ type: string; text?: string }> }>(tools, 'anthropic/chat-completion', {
    model: FALLBACK_MODEL,
    max_tokens: 200,
    temperature: 0,
    system:
      'Rewrite the request as a prompt for ONE still image: a single frame. Anything that changes over time (phases, stages, growing, blooming, transitions, cycles, before/after) must be depicted ONCE, in its most complete or recognizable state, as a single instance. Never ask for multiple copies, sequences, grids, or diagrams. Keep the subject, setting and style. Reply with the rewritten prompt only.',
    messages: [{ role: 'user', content: prompt }],
  })
  const text = r.ok ? (r.data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('').trim() : ''
  return text && text.length < 600 ? text : prompt
}

const RECIPE_GUIDE = `You direct a fixed ASCII-animation renderer. You never write code; you output JSON only.

The renderer turns an image into a grid of colored characters and animates regions selected by MASKS.
A mask is a soft selection over the ORIGINAL image: any of
  lum [min,max] (0-1 brightness), hue [min,max] (degrees, may wrap e.g. [330,30]), sat [min,max] (0-1), y [min,max] (0=top,1=bottom).
Hue is ignored for grey cells. An empty mask {} selects everything.

Effects (each: id, kind, label, enabled, mask, speed 0-3 (1=normal), intensity 0-1, scale 0.2-3):
  glow    — bright blobs pulse independently (lanterns, windows, fireflies, candles)
  rise    — masked region floats upward and loops (lanterns, embers, bubbles, sparks). Mask must be tight or the whole picture moves.
  sway    — side-to-side bend (grass, trees, hair, reeds, flowers)
  wind    — region scrolls sideways and loops (clouds, fog, mist)
  shimmer — water ripple + glints (lakes, rivers, sea, heat haze)
  sparkle — random cells flash (stars, snow, magic dust, sun glints)
  cycle   — characters flicker/rain (rain, data streams, static, waterfalls)
  breathe — slow brightness swell (sky, aura, glow of dusk)

Global fields: cutout (0-1 background removal, 0 = off), title, cols (40-200, ~110 typical; lower = chunkier), glyphs (${Object.keys(GLYPH_SETS).join(' | ')}),
cellStyle ('glyph' colored characters | 'tile' mosaic: bright areas become solid colored squares with glyphs, great for creatures and bold subjects; best at cols 60-100), grid (0-1 faint cell grid), colorMode ('source' | 'mono' | 'duotone'),
ink (#hex, used by mono/duotone), background (#hex, near-black usually), contrast 0.5-2, brightness -0.5..0.5,
saturation 0-2, hueShift -180..180, tempo 0-3.

Objects vs scenes: when the image is a single subject on a plain/black background (or the person asks for an object, creature, or "no background"),
set cutout 0.3-0.6 so the background disappears, use mask {"subject": true} for whole-subject motion, prefer cellStyle 'tile' with cols 60-90,
and use bob/drift for the subject itself plus small glow/sparkle accents. For full scenes keep cutout 0.

  bob     — the subject floats up and down in place (creature, balloon, boat). Use mask {"subject": true}.
  drift   — the subject travels sideways across the frame and loops while bobbing (fish, birds, jellyfish). Use mask {"subject": true}.
  phase   — a soft shadow disc sweeps across a round subject on a loop: moon phases (full → new → full), eclipses, a planet turning.
            Use mask {"subject": true} (with cutout) or a tight lum/hue mask on the disc. speed ~0.5-1 (one cycle ≈ 8 s at speed 1), intensity = how dark the shadow gets.

Motion beats multiplication: the image is ONE frame. If the person describes something changing over time (phases, blooming, growing,
day turning to night), express that change with effects on a single subject — never expect multiple copies in the picture.

Rules of taste:
- 2 to 5 effects. Each effect targets one recognizable thing with a mask derived from the image summary.
- Prefer subtle (intensity 0.3-0.6). Motion should feel alive, not seizure-y.
- Use the image summary's hue/lum/y statistics to set mask ranges; make masks tight enough to isolate the subject.
- Effect ids are short kebab-case and unique (e.g. "lantern-glow").
- Labels are 1-3 words naming the subject ("Lanterns", "Lake").
- This is ASCII art: default to glyphs 'classic' or 'dense'. Use 'blocks' or 'dots' only when the person asks for pixel/blocky/dotted looks.
- Title: 2-4 evocative words.`

const ALLOWED_KINDS = EFFECT_KINDS.join(', ')

export const actions: Record<string, ActionHandler<Env>> = {
  /** Text prompt → four candidate source images stored in the app's public R2 scope. */
  generateSources: async ({ userId, params, tools, env }) => {
    const prompt = String(params.prompt ?? '').trim().slice(0, 600)
    if (prompt.length < 3) return fail('Describe what you want to see.')
    const limited = await meter(tools, userId, 'image')
    if (limited) return fail(limited)

    // Image models draw one still frame. A prompt about change over time ("a moon
    // through all its phases") gets painted as a strip of copies, so first rewrite it
    // into a single-frame description; the motion step handles the change itself.
    const still = await toSingleFrame(tools, prompt)

    const r = await callIntegration<{ images: string[] }>(tools, 'openai/generate-image', {
      model: 'gpt-image-1-mini',
      n: 4,
      size: '1536x1024',
      quality: 'low',
      prompt:
        params.mode === 'object'
          ? `${still}. A single isolated subject, centered, filling most of the frame, on a pure flat black background. No scenery, no ground, no shadow, no text. Bold clean silhouette, bright saturated colors, simple shapes.`
          : `${still}. Composition for ASCII art: strong silhouettes, high contrast between subject and background, clear bright light sources, rich but limited color palette, minimal fine texture, no text.`,
    })
    if (!r.ok) return fail(r.error)

    const files = appFiles(env, { scope: 'app', userId })
    const keys: string[] = []
    for (const [i, img] of (r.data.images ?? []).entries()) {
      try {
        let blob: Blob
        if (img.startsWith('data:')) {
          const [meta, b64] = img.split(',')
          const mime = meta.match(/data:([^;]+)/)?.[1] ?? 'image/png'
          const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
          blob = new Blob([bytes], { type: mime })
        } else {
          const res = await fetch(img)
          if (!res.ok) continue
          blob = await res.blob()
        }
        const stored = await files.upload(blob, { key: `sources/${crypto.randomUUID()}.png`, name: `variant-${i + 1}.png` })
        keys.push(stored.key)
      } catch (err) {
        console.warn('[generateSources] store failed', err instanceof Error ? err.message : err)
      }
    }
    if (!keys.length) return fail('Image generation returned nothing usable. Try again.')
    return { success: true, data: { keys, stillPrompt: still } }
  },

  /** Prompt + client-computed color summary (+ small JPEG) → a validated recipe. */
  buildRecipe: async ({ userId, params, tools }) => {
    const prompt = String(params.prompt ?? '').slice(0, 600)
    const summary = String(params.summary ?? '').slice(0, 3000)
    const thumb = typeof params.thumbnail === 'string' && params.thumbnail.length < 400_000 ? params.thumbnail : null
    const limited = await meter(tools, userId, 'recipe')
    if (limited) return fail(limited)

    const mode = params.mode === 'object' ? 'OBJECT (isolated subject, remove the background)' : 'SCENE'
    const instruction = `Mode: ${mode}
What the person wants: ${prompt || '(no description — infer the scene from the image)'}

Image color summary (from the actual pixels):
${summary}

Return ONE JSON object matching the recipe fields. Effect kinds allowed: ${ALLOWED_KINDS}.`
    const content: ClaudeContent = thumb
      ? [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: thumb } },
          { type: 'text', text: instruction },
        ]
      : instruction

    let reply = await askClaude(tools, RECIPE_GUIDE, content)
    // If the vision block is refused, retry text-only rather than failing the flow.
    if (!reply.ok && thumb) reply = await askClaude(tools, RECIPE_GUIDE, instruction)
    if (!reply.ok) return fail(reply.error)
    try {
      const recipe = parseRecipe(extractJson(reply.text))
      return { success: true, data: { recipe } }
    } catch (err) {
      return fail(`The AI's recipe didn't validate: ${err instanceof Error ? err.message.slice(0, 200) : 'invalid'}`)
    }
  },

  /** Small natural-language edit → JSON patch → re-validated recipe. Never regenerates. */
  refineRecipe: async ({ userId, params, tools }) => {
    const instruction = String(params.instruction ?? '').trim().slice(0, 400)
    if (!instruction) return fail('Say what to change.')
    let base: Recipe
    try {
      base = parseRecipe(params.recipe)
    } catch {
      return fail('Current recipe is invalid.')
    }
    const limited = await meter(tools, userId, 'refine')
    if (limited) return fail(limited)

    const reply = await askClaude(
      tools,
      `${RECIPE_GUIDE}

You are now EDITING an existing recipe. Return a minimal JSON PATCH, not the whole recipe:
- include only top-level fields that change;
- "effects": list only effects that change, each with its "id" plus changed fields; add new effects with a new id and all fields; delete with {"id": "...", "remove": true}.
- Keep everything the person didn't ask to change.`,
      `Current recipe:\n${JSON.stringify(base)}\n\nChange requested: ${instruction}\n\nReturn only the JSON patch.`,
      1200,
    )
    if (!reply.ok) return fail(reply.error)
    try {
      const patch = extractJson(reply.text) as Record<string, unknown>
      const recipe = applyPatch(base, patch)
      return { success: true, data: { recipe, patch } }
    } catch (err) {
      return fail(`Couldn't apply that edit: ${err instanceof Error ? err.message.slice(0, 200) : 'invalid'}`)
    }
  },

  /**
   * Share a piece. Owner (or an existing collaborator) only. Adds an app user
   * as a collaborator and/or emails an invite link. Makes the piece link-visible.
   */
  sendPiece: async ({ userId, params, tools, env }) => {
    const pieceId = String(params.pieceId ?? '')
    const toUserId = typeof params.toUserId === 'string' && params.toUserId ? params.toUserId : null
    const toEmail = typeof params.toEmail === 'string' ? params.toEmail.trim().toLowerCase() : ''
    const note = String(params.note ?? '').slice(0, 280)
    const fromName = String(params.fromName ?? 'Someone').slice(0, 60)
    // A GIF the client rendered and uploaded to the public scope. Only a bare
    // key is accepted, and the URL is built here, so the email can't be made
    // to embed an arbitrary remote image.
    const gifKey = typeof params.gifKey === 'string' && /^[\w\-./]+\.gif$/.test(params.gifKey) && !params.gifKey.includes('..') ? params.gifKey : ''
    if (!toUserId && !toEmail) return fail('Pick a person or enter an email.')
    if (toEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) return fail('That email looks wrong.')
    if (toUserId === userId) return fail("You can't send to yourself.")

    const got = await tools.get<{ title?: string; collaborators?: string[] }>('pieces', pieceId)
    if (!got.success) return fail('Piece not found.')
    const piece = got.data.record as { createdBy: string; data: { title?: string; collaborators?: string[] } }
    const collaborators = piece.data.collaborators ?? []
    if (piece.createdBy !== userId && !collaborators.includes(userId)) return fail('Only people on this piece can share it.')

    const title = piece.data.title || 'Untitled'
    const nextCollaborators = toUserId ? [...new Set([...collaborators, toUserId])] : collaborators
    await tools.update('pieces', pieceId, { collaborators: nextCollaborators, visibility: 'link', ...(gifKey ? { gifKey } : {}) })

    const inviteToken = toEmail ? crypto.randomUUID().replace(/-/g, '') : ''
    const created = await tools.create('sends', {
      pieceId,
      pieceTitle: title,
      fromUserId: userId,
      fromName,
      toUserId: toUserId ?? '',
      toEmail,
      note,
      inviteToken,
      seenAt: '',
      participants: toUserId ? [userId, toUserId] : [userId],
    })
    if (!created.success) return fail(created.error)

    if (toEmail) {
      const limited = await meter(tools, userId, 'email')
      if (limited) return fail(limited)
      const base = `https://${env.APP_NAME}.app.space`
      const link = `${base}/p/${pieceId}?invite=${inviteToken}`
      const gifUrl = gifKey ? `${base}/api/files/${gifKey.split('/').map(encodeURIComponent).join('/')}?scope=app` : ''
      const safe = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!)
      const mail = await callIntegration(tools, 'email/send', {
        from: `${fromName.replace(/[<>"]/g, '')} via Glyphloom <${env.APP_NAME}@app.space>`,
        to: toEmail,
        subject: `${fromName} made you something: “${title}”`,
        html: `<div style="font-family:ui-monospace,Menlo,monospace;background:#07070c;color:#f5e6c8;padding:32px;border-radius:12px">
<p style="margin:0 0 8px;color:#9a8f7a;font-size:12px;letter-spacing:.1em">GLYPHLOOM</p>
<h1 style="margin:0 0 16px;font-size:22px">${safe(fromName)} sent you a moving ASCII piece</h1>
<p style="margin:0 0 8px">“${safe(title)}”</p>
${note ? `<p style="margin:0 0 20px;color:#cfc3a8">${safe(note)}</p>` : ''}
${gifUrl ? `<a href="${link}"><img src="${gifUrl}" alt="${safe(title)}, animated" width="520" style="display:block;max-width:100%;height:auto;border-radius:10px;margin:0 0 20px;border:1px solid #222" /></a>` : ''}
<a href="${link}" style="display:inline-block;background:#ffb347;color:#07070c;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Watch it move →</a>
<p style="margin:20px 0 0;color:#6b6457;font-size:12px">Sign in on the page to tweak it together live.</p></div>`,
        text: `${fromName} sent you “${title}”. ${note}\n\nWatch it: ${link}`,
      })
      if (!mail.ok) return fail(`Shared in-app, but the email failed: ${mail.error}`)
    }
    return { success: true, data: { sendId: created.data.recordId } }
  },

  /** Emailed link opened by a signed-in person: attach them to the send and the piece. */
  claimInvite: async ({ userId, params, tools }) => {
    const pieceId = String(params.pieceId ?? '')
    const token = String(params.token ?? '')
    if (!pieceId || token.length < 16) return fail('Invalid invite.')
    const r = await tools.query<{ toUserId?: string; fromUserId: string; participants?: string[] }>('sends', {
      where: { pieceId, inviteToken: token },
      limit: 1,
    })
    const send = r.success ? r.data.records[0] : undefined
    if (!send) return fail('This invite link is no longer valid.')
    const data = send.data as { toUserId?: string; fromUserId: string }
    if (data.fromUserId === userId) return { success: true, data: { claimed: false } }
    if (data.toUserId && data.toUserId !== userId) return fail('This invite was already used by someone else.')

    const got = await tools.get<{ collaborators?: string[] }>('pieces', pieceId)
    if (!got.success) return fail('Piece not found.')
    const collaborators = (got.data.record.data as { collaborators?: string[] }).collaborators ?? []
    await tools.update('pieces', pieceId, { collaborators: [...new Set([...collaborators, userId])] })
    await tools.update('sends', send.recordId, {
      toUserId: userId,
      participants: [data.fromUserId, userId],
      seenAt: new Date().toISOString(),
    })
    return { success: true, data: { claimed: true } }
  },
}

