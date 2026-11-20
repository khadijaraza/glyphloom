/**
 * Exports of the current frame: plain text, colored HTML, JSON, 24-bit ANSI,
 * SVG (characters, dots, or mosaic tiles as vectors), and PNG at 1–6×.
 * All built from `AsciiEngine.frameCells()`, so they match what's on screen.
 */

import { AsciiEngine, type FrameCells } from './engine'
import type { Recipe } from './recipe'
import type { Source } from './source'

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
const xml = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c]!)

function rows<T>(f: FrameCells, cell: (ch: string, r: number, g: number, b: number, i: number) => T): T[][] {
  const out: T[][] = []
  for (let y = 0; y < f.rows; y++) {
    const row: T[] = []
    for (let x = 0; x < f.cols; x++) {
      const i = y * f.cols + x
      row.push(cell(f.chars[i] ?? ' ', f.rgb[i * 3], f.rgb[i * 3 + 1], f.rgb[i * 3 + 2], i))
    }
    out.push(row)
  }
  return out
}

/** Dots have no character; pick one so text formats still show the picture. */
const charFor = (f: FrameCells, ch: string, i: number) => (f.cellStyle === 'dots' ? (f.dot[i * 3] > 0 ? (f.dot[i * 3] > f.cw * 0.3 ? '●' : '•') : ' ') : ch)

export function toText(f: FrameCells): string {
  return rows(f, (ch, _r, _g, _b, i) => charFor(f, ch, i))
    .map((r) => r.join('').trimEnd())
    .join('\n')
}

export function toHtml(f: FrameCells, title = 'Glyphloom'): string {
  const body = rows(f, (ch, r, g, b, i) => ({ ch: charFor(f, ch, i), color: hex(r, g, b) }))
    .map((row) => {
      // Merge runs of the same color into one span.
      let html = ''
      let run = ''
      let color = ''
      const flush = () => {
        if (run) html += color && run.trim() ? `<span style="color:${color}">${xml(run)}</span>` : xml(run)
        run = ''
      }
      for (const c of row) {
        const col = c.ch === ' ' ? color : c.color
        if (col !== color) {
          flush()
          color = col
        }
        run += c.ch
      }
      flush()
      return html
    })
    .join('\n')
  const bg = f.transparent ? 'transparent' : f.background
  return `<!doctype html><html><head><meta charset="utf-8"><title>${xml(title)}</title></head>
<body style="margin:0;background:${bg}"><pre style="margin:0;padding:16px;font:10px/1 ui-monospace,Menlo,monospace;letter-spacing:0">${body}</pre></body></html>`
}

export function toJson(f: FrameCells): string {
  return JSON.stringify({
    cols: f.cols,
    rows: f.rows,
    style: f.cellStyle,
    background: f.transparent ? null : f.background,
    cells: rows(f, (ch, r, g, b, i) => [charFor(f, ch, i), hex(r, g, b)]),
  })
}

export function toAnsi(f: FrameCells): string {
  return rows(f, (ch, r, g, b, i) => {
    const c = charFor(f, ch, i)
    return c === ' ' ? ' ' : `\x1b[38;2;${r};${g};${b}m${c}`
  })
    .map((row) => row.join('') + '\x1b[0m')
    .join('\n')
}

export function toSvg(f: FrameCells): string {
  const W = f.cols * f.cw
  const H = f.rows * f.ch
  const parts: string[] = []
  if (!f.transparent) parts.push(`<rect width="100%" height="100%" fill="${f.background}"/>`)
  const font = f.ch * (f.cellStyle === 'tile' ? 0.72 : 0.92)
  for (let y = 0; y < f.rows; y++) {
    for (let x = 0; x < f.cols; x++) {
      const i = y * f.cols + x
      const fill = hex(f.rgb[i * 3], f.rgb[i * 3 + 1], f.rgb[i * 3 + 2])
      const cx = x * f.cw + f.cw / 2
      const cy = y * f.ch + f.ch / 2
      if (f.cellStyle === 'dots') {
        const rad = f.dot[i * 3]
        if (rad > 0) parts.push(`<circle cx="${(cx + f.dot[i * 3 + 1]).toFixed(1)}" cy="${(cy + f.dot[i * 3 + 2]).toFixed(1)}" r="${rad.toFixed(2)}" fill="${fill}"/>`)
        continue
      }
      const ch = f.chars[i]
      if (!ch || ch === ' ') continue
      parts.push(`<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" fill="${fill}">${xml(ch)}</text>`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W.toFixed(0)}" height="${H.toFixed(0)}" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}">
<g font-family="ui-monospace,Menlo,monospace" font-size="${font.toFixed(2)}" text-anchor="middle" dominant-baseline="central">
${parts.join('\n')}
</g></svg>`
}

/** Re-render the frame at time `t` at `scale`× resolution and return a PNG. */
export async function toPng(source: Source, recipe: Recipe, cssWidth: number, t: number, scale: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const engine = new AsciiEngine(canvas, recipe, { dpr: scale, maxCols: false })
  engine.paused = true
  engine.setImage(source)
  engine.setWidth(cssWidth)
  engine.draw(t)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'))
}

export function download(data: Blob | string, filename: string, type = 'text/plain') {
  const blob = typeof data === 'string' ? new Blob([data], { type: `${type};charset=utf-8` }) : data
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
