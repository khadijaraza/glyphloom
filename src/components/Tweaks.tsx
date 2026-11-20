/**
 * Tweaks panel: every recipe number as a slider, the effect layers, and
 * "refine with words". Sliders show which collaborators are holding them.
 */

import { useState } from 'react'
import { Eye, Loader2, Plus, Trash2, Wand2 } from 'lucide-react'
import {
  DEFAULT_RECIPE,
  EFFECT_INFO,
  EFFECT_KINDS,
  EFFECT_SLIDERS,
  GLOBAL_SLIDERS,
  GLYPH_LABELS,
  GLYPH_SETS,
  BLEND_MODES,
  type BlendMode,
  effectSchema,
  type Effect,
  type EffectKind,
  type GlyphSet,
  type Mask,
  type Recipe,
} from '../ascii/recipe'
import type { Peer } from '../lib/useLiveRecipe'
import { cn } from '../lib/utils'

interface Props {
  recipe: Recipe
  canWrite: boolean
  peers: Peer[]
  onGlobal: <K extends keyof Recipe>(key: K, value: Recipe[K]) => void
  onEffect: (id: string, patch: Partial<Effect>) => void
  onReplace: (r: Recipe) => void
  onHold: (key: string | null) => void
  onHighlight: (effectId: string | null) => void
  onRefine: (instruction: string) => Promise<void>
}

/** Sensible starting masks for layers added by hand. */
const DEFAULT_MASKS: Record<EffectKind, Mask> = {
  glow: { lum: [0.6, 1] },
  rise: { lum: [0.65, 1], y: [0, 0.6] },
  sway: { y: [0.6, 1] },
  wind: { y: [0, 0.35], lum: [0.5, 1] },
  shimmer: { y: [0.65, 1] },
  sparkle: { lum: [0.55, 1] },
  cycle: {},
  breathe: {},
  bob: { subject: true },
  drift: { subject: true },
  phase: { subject: true },
  bloom: { subject: true },
}

export function Tweaks({ recipe, canWrite, peers, onGlobal, onEffect, onReplace, onHold, onHighlight, onRefine }: Props) {
  const [instruction, setInstruction] = useState('')
  const [refining, setRefining] = useState(false)

  async function refine() {
    const text = instruction.trim()
    if (!text || refining) return
    setRefining(true)
    try {
      await onRefine(text)
      setInstruction('')
    } finally {
      setRefining(false)
    }
  }

  function addEffect(kind: EffectKind) {
    const id = `${kind}-${Math.random().toString(36).slice(2, 6)}`
    const effect = effectSchema.parse({ id, kind, label: EFFECT_INFO[kind].label, mask: DEFAULT_MASKS[kind] })
    onReplace({ ...recipe, effects: [...recipe.effects, effect] })
  }

  return (
    <div className="flex flex-col gap-5 text-sm">
      {/* Refine with words */}
      <section>
        <SectionTitle>Refine with words</SectionTitle>
        <div className="flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && refine()}
            disabled={!canWrite || refining}
            maxLength={400}
            placeholder="slower lanterns, warmer orange…"
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-50"
          />
          <button
            onClick={refine}
            disabled={!canWrite || refining || !instruction.trim()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40"
            aria-label="Apply edit"
          >
            {refining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Edits the current settings in place. It never starts over.</p>
      </section>

      {/* Look */}
      <section>
        <SectionTitle>Look</SectionTitle>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(GLYPH_SETS) as GlyphSet[]).map((g) => (
            <Chip key={g} active={recipe.glyphs === g} disabled={!canWrite} onClick={() => onGlobal('glyphs', g)}>
              {GLYPH_LABELS[g]} <span className="ml-1 opacity-60">{GLYPH_SETS[g].trim().slice(0, 4)}</span>
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(['glyph', 'dots', 'tile'] as const).map((s) => (
            <Chip key={s} active={recipe.cellStyle === s} disabled={!canWrite} onClick={() => onGlobal('cellStyle', s)}>
              {s === 'glyph' ? 'Characters' : s === 'dots' ? 'Dots' : 'Mosaic'}
            </Chip>
          ))}
          <span className="mx-1 w-px bg-border" />
          {(['source', 'mono', 'duotone'] as const).map((m) => (
            <Chip key={m} active={recipe.colorMode === m} disabled={!canWrite} onClick={() => onGlobal('colorMode', m)}>
              {m === 'source' ? 'Original' : m === 'mono' ? 'Mono' : 'Duotone'}
            </Chip>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Chip active={recipe.invert} disabled={!canWrite} onClick={() => onGlobal('invert', !recipe.invert)}>
            Invert
          </Chip>
          <Chip active={recipe.transparent} disabled={!canWrite} onClick={() => onGlobal('transparent', !recipe.transparent)}>
            Transparent background
          </Chip>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
            Blend
            <select
              value={recipe.blend}
              disabled={!canWrite}
              onChange={(e) => onGlobal('blend', e.target.value as BlendMode)}
              className="h-7 rounded border border-input bg-background px-1.5 text-xs text-foreground disabled:opacity-50"
            >
              {(Object.keys(BLEND_MODES) as BlendMode[]).map((b) => (
                <option key={b} value={b}>
                  {b.replace('-', ' ')}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex gap-4">
          <ColorField label="Ink" value={recipe.ink} disabled={!canWrite} onChange={(v) => onGlobal('ink', v)} />
          <ColorField label="Background" value={recipe.background} disabled={!canWrite} onChange={(v) => onGlobal('background', v)} />
        </div>
        <div className="mt-3 flex flex-col gap-2.5">
          {GLOBAL_SLIDERS.map((s) => (
            <Slider
              key={s.key}
              holdKey={`g.${s.key}`}
              label={s.label}
              min={s.min}
              max={s.max}
              step={s.step}
              value={recipe[s.key] as number}
              defaultValue={DEFAULT_RECIPE[s.key] as number}
              disabled={!canWrite}
              peers={peers}
              onHold={onHold}
              onChange={(v) => onGlobal(s.key, v as never)}
            />
          ))}
        </div>
      </section>

      {/* Layers */}
      <section>
        <SectionTitle>Motion layers</SectionTitle>
        <div className="flex flex-col gap-2">
          {recipe.effects.length === 0 && <p className="text-xs text-muted-foreground">No motion yet. Add a layer below.</p>}
          {recipe.effects.map((e) => (
            <div
              key={e.id}
              className={cn('rounded-lg border border-border bg-background/60 p-3', !e.enabled && 'opacity-55')}
              onMouseEnter={() => onHighlight(e.id)}
              onMouseLeave={() => onHighlight(null)}
            >
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={e.enabled}
                  disabled={!canWrite}
                  onChange={(ev) => onEffect(e.id, { enabled: ev.target.checked })}
                  className="accent-[var(--color-primary)]"
                  aria-label={`Toggle ${e.label}`}
                />
                <span className="truncate font-medium text-foreground">{e.label || EFFECT_INFO[e.kind].label}</span>
                <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {e.kind}
                </span>
                <span className="flex-1" />
                <Eye className="h-3.5 w-3.5 text-muted-foreground" aria-label="Hover to highlight" />
                {canWrite && (
                  <button
                    onClick={() => onReplace({ ...recipe, effects: recipe.effects.filter((x) => x.id !== e.id) })}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label={`Remove ${e.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{EFFECT_INFO[e.kind].hint} · {describeMask(e.mask)}</p>
              <div className="mt-2 flex flex-col gap-2">
                {EFFECT_SLIDERS.map((s) => (
                  <Slider
                    key={s.key}
                    holdKey={`fx.${e.id}.${s.key}`}
                    label={s.label}
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={e[s.key] as number}
                    defaultValue={s.key === 'scale' || s.key === 'speed' ? 1 : 0.5}
                    disabled={!canWrite || !e.enabled}
                    peers={peers}
                    onHold={onHold}
                    onChange={(v) => onEffect(e.id, { [s.key]: v })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        {canWrite && recipe.effects.length < 8 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EFFECT_KINDS.map((k) => (
              <button
                key={k}
                onClick={() => addEffect(k)}
                title={EFFECT_INFO[k].hint}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground"
              >
                <Plus className="h-3 w-3" />
                {EFFECT_INFO[k].label}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function describeMask(m: Mask) {
  const parts: string[] = []
  if (m.hue) parts.push(`hue ${m.hue[0]}–${m.hue[1]}°`)
  if (m.lum) parts.push(`bright ${m.lum[0].toFixed(2)}–${m.lum[1].toFixed(2)}`)
  if (m.sat) parts.push(`sat ${m.sat[0].toFixed(2)}–${m.sat[1].toFixed(2)}`)
  if (m.subject) parts.push('subject only')
  if (m.y) parts.push(m.y[0] <= 0.02 ? `top ${Math.round(m.y[1] * 100)}%` : m.y[1] >= 0.98 ? `bottom ${Math.round((1 - m.y[0]) * 100)}%` : `band ${Math.round(m.y[0] * 100)}–${Math.round(m.y[1] * 100)}%`)
  return parts.length ? parts.join(', ') : 'whole image'
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{children}</h3>
}

function Chip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
        active ? 'border-primary bg-primary/15 text-foreground' : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

function ColorField({ label, value, disabled, onChange }: { label: string; value: string; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input
        type="color"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="h-6 w-6 cursor-pointer rounded border border-border bg-transparent p-0 disabled:opacity-50"
      />
      {label}
    </label>
  )
}

interface SliderProps {
  holdKey: string
  label: string
  min: number
  max: number
  step: number
  value: number
  defaultValue: number
  disabled?: boolean
  peers: Peer[]
  onHold: (key: string | null) => void
  onChange: (v: number) => void
}

function Slider({ holdKey, label, min, max, step, value, defaultValue, disabled, peers, onHold, onChange }: SliderProps) {
  const holders = peers.filter((p) => p.holding === holdKey)
  const fill = `${((value - min) / (max - min)) * 100}%`
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <button
          className="text-foreground/85 hover:text-foreground"
          onDoubleClick={() => !disabled && onChange(defaultValue)}
          title="Double-click to reset"
          type="button"
        >
          {label}
        </button>
        <span className="flex items-center gap-1.5">
          {holders.map((p) => (
            <span key={p.clientId} className="rounded px-1 text-[10px] font-medium text-black" style={{ background: p.color }}>
              {p.name.split(' ')[0]}
            </span>
          ))}
          <span className="font-mono text-muted-foreground">{Number.isInteger(step) ? value : value.toFixed(2)}</span>
        </span>
      </div>
      <input
        type="range"
        className="loom-range"
        style={{ ['--fill' as string]: fill, ...(holders[0] ? { boxShadow: `0 0 0 2px ${holders[0].color}55` } : {}) }}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onPointerDown={() => onHold(holdKey)}
        onPointerUp={() => onHold(null)}
        onBlur={() => onHold(null)}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
    </div>
  )
}
