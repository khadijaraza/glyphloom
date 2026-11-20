// Generates tests/fixtures/pulse.gif: a circle that grows and shrinks (8 frames).
// Run: node tests/fixtures/make-pulse-gif.mjs
import { writeFileSync } from 'node:fs'
import gifenc from 'gifenc'
const { GIFEncoder, quantize, applyPalette } = gifenc
const W = 160, H = 100
const gif = GIFEncoder()
for (let f = 0; f < 8; f++) {
  const data = new Uint8Array(W * H * 4)
  const r = 12 + 30 * Math.sin((f / 8) * Math.PI)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    const inside = Math.hypot(x - W / 2, y - H / 2) < r
    data[i] = inside ? 255 : 0; data[i + 1] = inside ? 120 : 0; data[i + 2] = inside ? 60 : 0; data[i + 3] = 255
  }
  const palette = quantize(data, 16)
  gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay: 120 })
}
gif.finish()
writeFileSync(new URL('./pulse.gif', import.meta.url), gif.bytes())
