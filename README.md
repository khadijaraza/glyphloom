# Glyphloom

Turn a sentence, a photo, or a GIF into moving ASCII art. Tune it with sliders or plain words, then send it to a friend who can tweak it with you live. Built with the [DeepSpace SDK](https://docs.deep.space).

**Live: [glyphloom.app.space](https://glyphloom.app.space)**

## Features

- Text → 1 or 4 painted source images, or upload your own image or GIF
- AI-chosen motion: glow, rise, sway, drift, shimmer, bloom, moon phases, and more
- Character, stipple-dot, and mosaic styles, at up to 320 columns
- Converter controls modeled on [ASCIInator](https://asciinator.app/): density bias, gamma, pixelate, invert, blend modes
- "Refine with words" edits the current settings in place, without regenerating
- Send to someone in the app or by email (the GIF plays inline in Gmail), then co-tweak live
- Public gallery with likes
- Export PNG (1–6×), SVG, TXT, HTML, JSON, ANSI, GIF, and WebM
- Agent tools: `npx deepspace agent invoke glyphloom glyphloom_set_settings …`

## How it works

The AI never writes code. It writes a validated JSON **recipe** (masks, effects, tone, style) for one fixed canvas renderer in `src/ascii/`, which is why every setting is a slider and two people's edits merge cleanly. Each piece's live settings are a record-bound Yjs doc, sends are readable only by sender and recipient, one like per person is enforced with `uniqueOn`, and paid calls go through server actions. Those actions give each person a free daily allowance, then bill the caller's own DeepSpace credits.

Integrations: `anthropic/chat-completion`, `openai/generate-image`, `email/send`, and R2 storage.

## Development

```bash
npm install
npx deepspace dev start
```

## Tests

```bash
npx deepspace test run                         # smoke + API
npx deepspace test run tests/sharing.spec.ts   # 3-user sharing, RBAC, live sync, gallery, GIFs, exports
```

## Deployment

```bash
npx deepspace deploy
```
