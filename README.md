# Glyphloom

**Animated ASCII art you make together.** Describe a scene or upload a photo. Glyphloom pixelizes it, turns it into colored characters, and makes parts of it move: lanterns glow and rise, grass sways, water shimmers, stars sparkle. Fine-tune it with sliders or plain words without starting over, then send it to someone. It lands in their inbox instantly (or by email), and you can drag the sliders together, live.

**Live:** https://glyphloom.app.space

## The main path

1. **Create** (`/create`): type a prompt → `openai/generate-image` paints **4 versions** → pick one. Or upload an image, or use the free procedural demo scene.
2. **Choreograph:** the client samples the image into a cell grid and summarizes its color regions (hue, brightness and vertical position stats). That summary, a 512 px thumbnail and the prompt go to `anthropic/chat-completion`, which returns a **recipe**: which effects to apply, to which region (mask), and how strongly.
3. **Tweak** (`/p/:id`): every recipe number is a slider. "Refine with words" ("slower lanterns, warmer orange") asks Claude for a **small JSON patch** to the current recipe, so nothing regenerates. Undo is available.
4. **Send:** pick a person on Glyphloom (their inbox updates live) or enter an email (an invite link via `email/send`). Recipients become collaborators and **co-tweak in real time**, with presence showing who's holding which slider. Anyone can **Remix** a copy. Export as a text frame (Markdown code block), PNG, or a 6-second WebM.

## How it's built

| Concern | DeepSpace primitive | Where |
|---|---|---|
| Pieces, sends, spend ledger | Collections with server-side RBAC | `src/schemas/*` |
| "Only sender and recipient can see a send" | `collaboratorsField: 'participants'` + `read: 'collaborator'` | `sends-schema.ts` |
| "Private until shared, then anyone with the link can watch" | `visibilityField` + `read: 'published'/'shared'` | `pieces-schema.ts` |
| Live co-tweaking | Record-bound Yjs doc (`useYjsField('pieces', id, 'live')`); write access follows the piece's `update: 'collaborator'` | `src/lib/useLiveRecipe.ts` |
| Who's here / who's holding a slider | Yjs awareness on the same socket | `useLiveRecipe.ts` |
| Owner-billed AI + email, ownership checks, spend caps | Server actions (`tools.integration`, RBAC-bypassing writes after explicit checks) | `src/actions/index.ts` |
| Source images | R2 via `useR2Files({ scope: 'app' })` / `appFiles` in the worker | `create.tsx`, `actions/index.ts` |
| Sign-in | DeepSpace auth (`AuthGate`, `AuthOverlay`) | `src/pages/(app)/(protected)/` |

The renderer (`src/ascii/engine.ts`) is plain canvas-2D code with no dependencies. It samples the image to a grid, grades it (contrast, saturation, hue rotation, shadow lift), computes soft **masks** (by brightness, hue, saturation and vertical band), and runs eight effects per frame: `glow`, `rise`, `sway`, `wind`, `shimmer`, `sparkle`, `cycle` and `breathe`. Moving effects (`rise`, `wind`) translate the masked region and fill the hole it leaves with a per-row background estimate. The "Mosaic" style (solid cells with sparse glyphs, plus a faint grid) takes its visual ideas from [ascii-animals](https://github.com/DesignerStephen1/ascii-animals) (MIT). No code was copied.

## Integrations, and why

| Used | Why it earns its place |
|---|---|
| `anthropic/chat-completion` | The main feature: it decides *what moves and how*, and turns "make it warmer" into a precise edit. |
| `openai/generate-image` (`n: 4`) | Text-to-scene in one call, giving the "pick from four" moment. The prompt is steered toward high contrast and strong silhouettes, because that's what reads well as ASCII. |
| `email/send` | Sharing with people who aren't on the app yet, using a one-time invite link. |
| R2 file storage | Uploaded and generated source images. |

**Left out on purpose:** Slack (duplicates email for this audience), ElevenLabs or speech (adds nothing to visual art), the GitHub integration (read-only, so it can't "post to code"; the Markdown/text export covers that), and `gemini/generate-image` (a second image provider adds cost without a new capability).

## The main tradeoff

**The AI writes a recipe for a fixed renderer, never code.** Letting a model generate animation JS would allow more variety, but:
- it would run untrusted code in every viewer's browser;
- each result would be a black box (no sliders, no patching, no live merging of two people's edits);
- the quality would be inconsistent.

A validated JSON recipe (zod, checked on the server before it leaves the worker) is safe and small to share. It also maps 1:1 to sliders and splits into per-field Yjs entries, so two people dragging different sliders never clobber each other. The cost is range: Glyphloom can only do what its eight effects can express.

Smaller calls:
- **Masks are color statistics, not segmentation.** They're cheap, deterministic and editable, but they can't isolate "the girl" from "the sky" when the two share colors.
- **Source images live in the public R2 scope**, so link-shared pieces load for signed-out viewers. Don't upload anything private.
- **Spend control** is a per-user daily cap in a server-written ledger (`generations`), because the owner pays for every call.

## Running it

```bash
npm install
npx deepspace auth login
npx deepspace dev start                 # http://localhost:5173
npx deepspace test run                  # smoke + api
npx deepspace test run tests/sharing.spec.ts   # 3-user sharing/RBAC/co-tweak spec (needs 3 test accounts)
npx deepspace deploy
```

## What's not finished

- **"Export as standalone code"** (an HTML file with the renderer plus the recipe) is designed but not built. Text, PNG and WebM export work.
- **Version history** is an in-memory undo stack per session, not saved snapshots or an A/B compare.
- **Masks can't be edited by hand** in the UI (only by the AI or by refine). The next step would be click-to-select a region on the canvas, deriving the mask from the clicked cell's color.
- **Performance:** about 13k cells redrawn with `fillText` at ~40 fps is fine on a laptop. Phones would want a glyph atlas or WebGL.
- **Inbox thumbnails** load their source image each, which is fine for tens of pieces but not hundreds.
