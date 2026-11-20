/** Shows today's owner-covered allowance and the "use my own credits" switch. */

import { useEffect, useState } from 'react'
import { api, ownCreditsPref, type Allowance } from '../lib/actions'

export function AllowanceBar({ refreshKey }: { refreshKey: number }) {
  const [a, setA] = useState<Allowance | null>(null)
  const [own, setOwn] = useState(ownCreditsPref.get())

  useEffect(() => {
    let alive = true
    api.allowance().then((r) => alive && setA(r)).catch(() => {})
    return () => {
      alive = false
    }
  }, [refreshKey])

  const imagesLeft = a ? Math.max(0, a.image.free - a.image.usedFree) : null
  const animLeft = a ? Math.max(0, a.recipe.free - a.recipe.usedFree) : null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {own ? (
        <span>Using your own DeepSpace credits.</span>
      ) : a ? (
        <span>
          Free today: <span className="text-foreground">{imagesLeft}</span> of {a.image.free} images ·{' '}
          <span className="text-foreground">{animLeft}</span> of {a.recipe.free} animations. After that, your own DeepSpace credits are used.
        </span>
      ) : (
        <span>Checking today’s free allowance…</span>
      )}
      <label className="ml-auto inline-flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={own}
          onChange={(e) => {
            ownCreditsPref.set(e.target.checked)
            setOwn(e.target.checked)
          }}
          className="accent-[var(--color-primary)]"
        />
        Always use my own credits
      </label>
    </div>
  )
}
