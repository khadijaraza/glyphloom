/** Gallery/inbox card: a still frame that animates on hover. */

import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useR2Files } from 'deepspace'
import { AsciiCanvas } from './AsciiCanvas'
import { loadImage } from '../ascii/image'
import { safeRecipe, DEFAULT_RECIPE, type Recipe } from '../ascii/recipe'

export function PieceCard({ id, title, sourceKey, recipe, footer }: { id: string; title: string; sourceKey: string; recipe: Recipe | unknown; footer?: React.ReactNode }) {
  const { getUrl } = useR2Files({ scope: 'app' })
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [hover, setHover] = useState(false)
  const r = safeRecipe(recipe) ?? DEFAULT_RECIPE

  useEffect(() => {
    let alive = true
    loadImage(getUrl(sourceKey)).then((img) => alive && setImage(img)).catch(() => {})
    return () => {
      alive = false
    }
  }, [sourceKey])

  return (
    <Link
      to={`/p/${id}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="group block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/50"
    >
      <div style={{ background: r.background }} className="aspect-[3/2] overflow-hidden">
        {image && <AsciiCanvas image={image} recipe={{ ...r, cols: Math.min(r.cols, 90) }} still={!hover} />}
      </div>
      <div className="px-3 py-2.5">
        <p className="truncate text-sm font-medium text-foreground">{title || 'Untitled'}</p>
        {footer && <div className="mt-0.5 text-xs text-muted-foreground">{footer}</div>}
      </div>
    </Link>
  )
}
