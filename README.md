# Glyphloom

**Animated ASCII art you make together.** Describe a scene, or upload a photo or a GIF. Glyphloom pixelizes it, turns it into colored characters, and makes parts of it move: lanterns glow and rise, grass sways, water shimmers, stars sparkle. Fine-tune it with sliders or plain words without starting over, then send it to someone. It lands in their inbox instantly (or by email), and you can drag the sliders together, live.

**Live:** https://glyphloom.app.space

## The main path

0. **Sources:** a text prompt, an uploaded image, or an **uploaded GIF**. GIFs are decoded in the browser (`gifuct-js`, disposal-aware compositing, up to 72 frames). The engine re-samples its grid whenever the GIF's frame changes, so the ASCII plays along with the source, and effects layer on top.
1. **Create** (`/create`): type a prompt → a quick Claude call rewrites it as a *single still frame* (so "a moon through its phases" becomes one moon, not a strip of moons) → `openai/generate-image` paints **1 or 4 versions** → pick one. Or upload an image, or use the free procedural demo scene.
2. **Choreograph:** the client samples the image into a cell grid and summarizes its color regions (hue, brightness and vertical position stats). That summary, a 512 px thumbnail and the prompt go to `anthropic/chat-completion`, which returns a **recipe**: which effects to apply, to which region (mask), and how strongly.
3. **Tweak** (`/p/:id`): every recipe number is a slider. "Refine with words" ("slower lanterns, warmer orange") asks Claude for a **small JSON patch** to the current recipe, so nothing regenerates. Undo is available.
4. **Objects, not just scenes:** "Object, no background" mode prompts for an isolated subject. **Remove background** blanks out cells that match the image's border color, so the subject floats on its own. **Bob** and **Drift** move the whole subject (mask `{ subject: true }`). There's a free koi demo.
5. **Send:** pick a person on Glyphloom (their inbox updates live) or enter an email (an invite link via `email/send`). Recipients become collaborators and **co-tweak in real time**, with presence showing who's holding which slider. Anyone can **Remix** a copy. Export as PNG (1–6×), SVG, TXT, colored HTML/JSON/ANSI, a **looping GIF**, or a 6-second WebM.
6. **Gallery** (`/gallery`, no sign-in needed): owners **Publish** a piece, which renders a GIF and lists it publicly with their name.

**Moving pictures in Gmail.** Email clients won't run the renderer and strip video, but they play animated GIFs inline. Sending by email renders 3 seconds of the piece to a GIF in the browser (`gifenc`, one shared palette so colors don't flicker), stores it publicly in R2, and embeds it in the invite. The server builds the image URL from a validated key, never from a client-supplied URL. The gallery reuses the same GIFs as thumbnails, so a page of 30 animations costs no rendering.

## How it's built

| Concern | DeepSpace primitive | Where |
|---|---|---|
| Pieces, sends, spend ledger | Collections with server-side RBAC | `src/schemas/*` |
| "Only sender and recipient can see a send" | `collaboratorsField: 'participants'` + `read: 'collaborator'` | `sends-schema.ts` |
| "Private until shared, then anyone with the link can watch" | `visibilityField` + `read: 'published'/'shared'` | `pieces-schema.ts` |
| Live co-tweaking | Record-bound Yjs doc (`useYjsField('pieces', id, 'live')`); write access follows the piece's `update: 'collaborator'` | `src/lib/useLiveRecipe.ts` |
| Who's here / who's holding a slider | Yjs awareness on the same socket | `useLiveRecipe.ts` |
| Owner-billed AI + email, ownership checks, spend caps | Server actions (`tools.integration`, RBAC-bypassing writes after explicit checks) | `src/actions/index.ts` |
| Source images, GIFs | R2 via `useR2Files({ scope: 'app' })` / `appFiles` in the worker | `create.tsx`, `actions/index.ts` |
| Sign-in | DeepSpace auth (`AuthGate`, `AuthOverlay`) | `src/pages/(app)/(protected)/` |

The renderer (`src/ascii/engine.ts`) is plain canvas-2D code with no dependencies. It has three cell styles: **Characters** (colored glyphs), **Mosaic** (solid cells with sparse glyphs), and **Dots**, a true stipple. In Dots, each cell keeps a jittered round dot with a probability that follows brightness, so dot *density* draws the image, at 200–300 columns. The demos (lily, koi) use Dots. It samples the image to a grid, grades it (contrast, saturation, hue rotation, shadow lift), computes soft **masks** (by brightness, hue, saturation and vertical band), and runs twelve effects per frame: `glow`, `rise`, `sway`, `wind`, `shimmer`, `sparkle`, `cycle`, `breathe`, `bob`, `drift`, `phase` and `bloom`. Moving effects map each cell to a *fractional* source position and blend the neighboring cells' colors, so motion glides instead of snapping a cell at a time. They fill the hole they leave with a per-row background estimate (or with nothing, when the background has been removed). `phase` slides a soft shadow disc across a round subject (moon phases). `bloom` opens the subject out from its base and closes it again (the lily on the landing page). The "Mosaic" style (solid cells with sparse glyphs, plus a faint grid) takes its visual ideas from [ascii-animals](https://github.com/DesignerStephen1/ascii-animals) (MIT). No code was copied.

### Converter controls (modeled on Asciinator)

The still-image controls follow [ASCIInator](https://asciinator.app/), a free in-browser converter with no API or published license, so this is an independent implementation of the same feature set, not its code:
- character ramps (Standard, Minimal, Detailed, Blocks…)
- **density bias**, **width**, **height scale**, **pixelate**
- brightness, contrast, **gamma**
- **invert**, a **transparent background**
- ten **blend modes**
- Original / Mono / Duotone color
- exports to **PNG 1–6×, SVG, TXT, HTML, JSON and ANSI**

Glyphloom then adds what a converter doesn't do: animation, AI direction, live co-editing, sending and the gallery.

## Integrations, and why

| Used | Why it earns its place |
|---|---|
| `anthropic/chat-completion` | The main feature: it decides *what moves and how*, and turns "make it warmer" into a precise edit. |
| `openai/generate-image` (`n: 4`) | Text-to-scene in one call, giving the "pick from four" moment. The prompt is steered toward high contrast and strong silhouettes, because that's what reads well as ASCII. |
| `email/send` | Sharing with people who aren't on the app yet: a one-time invite link plus the piece as an inline animated GIF. |
| R2 file storage | Uploaded and generated source images. |

**Left out on purpose:** Slack (duplicates email for this audience), ElevenLabs or speech (adds nothing to visual art), the GitHub integration (read-only, so it can't "post to code"; the Markdown/text export covers that), and `gemini/generate-image` (a second image provider adds cost without a new capability).

## The main tradeoff

**The AI writes a recipe for a fixed renderer, never code.** Letting a model generate animation JS would allow more variety, but:
- it would run untrusted code in every viewer's browser;
- each result would be a black box (no sliders, no patching, no live merging of two people's edits);
- the quality would be inconsistent.

A validated JSON recipe (zod, checked on the server before it leaves the worker) is safe and small to share. It also maps 1:1 to sliders and splits into per-field Yjs entries, so two people dragging different sliders never clobber each other. The cost is range: Glyphloom can only do what its twelve effects can express. The moon is a good example. Until there was a `phase` effect, no prompt could make one moon change shape, because effects move and relight regions but can't redraw them.

Smaller calls:
- **Gallery publishing is owner-only in the UI**, but RBAC can't restrict single fields, so a collaborator could technically flip `inGallery` with a raw write. Moving publish into a server action would close that.
- **Masks are color statistics, not segmentation.** They're cheap, deterministic and editable, but they can't isolate "the girl" from "the sky" when the two share colors.
- **Source images live in the public R2 scope**, so link-shared pieces load for signed-out viewers. Don't upload anything private.
- **Who pays: a free allowance first, then your own credits.** Each person gets a small daily allowance the app owner covers (4 images, 6 animations, 15 refinements). After that, or any time they tick "Always use my own credits", the server makes the call with *their* verified login token, so DeepSpace bills their account instead. `src/integrations.ts` sets billing per integration, not per call, so the per-call switch lives in one helper (`callIntegration` in `src/actions/index.ts`). A server-written ledger (`generations`) records who paid for what, and hard caps bound even self-paid use. Email invites stay owner-paid, because they're how people *without* an account get in. Choosing **1 version instead of 4** uses a quarter of the image allowance.

## Running it

```bash
npm install
npx deepspace auth login
npx deepspace dev start                 # http://localhost:5173
npx deepspace test run                  # smoke + api
npx deepspace test run tests/sharing.spec.ts   # 3-user sharing/RBAC/co-tweak + publish/GIF/gallery (needs 3 test accounts)
npx deepspace deploy
```

## What's not finished

- **"Export as standalone code"** (an HTML file with the renderer plus the recipe) is designed but not built. Text, PNG and WebM export work.
- **Version history** is an in-memory undo stack per session, not saved snapshots or an A/B compare.
- **Background removal is color-based** (it matches the border color). It works well for "subject on a plain background" and poorly for busy photos. Real segmentation would need a model call.
- **Masks can't be edited by hand** in the UI (only by the AI or by refine). The next step would be click-to-select a region on the canvas, deriving the mask from the clicked cell's color.
- **Performance:** Dots at 260 columns is about 40k cells a frame, which is fine on a laptop at ~40 fps. Phones get fewer columns automatically (a minimum cell size per style), but a WebGL path would be the real fix.
- **Swim motion assumes the fish faces its direction of travel** (head on the leading edge). A GIF source of a swimming creature will always look better than `drift` on a still.
- **Inbox thumbnails** load their source image each, which is fine for tens of pieces but not hundreds.
