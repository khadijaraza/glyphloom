/**
 * The core multi-user path, end to end, with no paid integrations:
 *   Ada makes a piece from the demo scene → sends it to Bo →
 *   Bo sees it in their inbox live and can co-tweak →
 *   Cy (not involved) sees no send and only a read-only view.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'
import type { Page } from '@playwright/test'

test.skip(loadAllTestAccounts().length < 3, 'Needs 3 test accounts (Ada, Bo, Cy).')

/** React listens to `input` on range inputs; set the value the way a drag would. */
async function setSlider(page: Page, label: string, value: number) {
  await page.getByRole('slider', { name: label, exact: true }).evaluate((el, v) => {
    const input = el as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, String(v))
    input.dispatchEvent(new Event('input', { bubbles: true }))
  }, value)
}

test('send → live inbox → co-tweak, and outsiders stay out', async ({ users }) => {
  test.setTimeout(120_000)
  const [ada, bo, cy] = await users(['Ada', 'Bo', 'Cy'])

  // Ada creates a piece from the free demo scene.
  await ada.page.goto('/create')
  await ada.page.getByRole('button', { name: 'Try the demo scene' }).click()
  await ada.page.getByRole('button', { name: 'Bring it to life' }).click()
  await ada.page.waitForURL(/\/p\/[\w-]+/, { timeout: 30_000 })
  const pieceUrl = new URL(ada.page.url()).pathname
  await expect(ada.page.getByRole('slider', { name: 'Tempo', exact: true })).toBeEnabled({ timeout: 20_000 })

  // A unique title so the assertions don't depend on data from earlier runs.
  const title = `Lanterns ${Date.now()}`
  const titleBox = ada.page.getByRole('textbox', { name: 'Title' })
  await titleBox.fill(title)
  await titleBox.press('Enter')

  // Bo and Cy are open on their inboxes before anything is sent.
  await Promise.all([bo.page.goto('/inbox'), cy.page.goto('/inbox')])
  await expect(bo.page.getByRole('heading', { name: 'Sent to you' })).toBeVisible({ timeout: 15_000 })

  // Ada sends to Bo.
  await ada.page.getByRole('button', { name: 'Send', exact: true }).click()
  const dialog = ada.page.getByRole('dialog')
  await dialog.getByPlaceholder('Search people…').fill('Bo')
  await dialog.getByRole('button', { name: /^Bo$/ }).click()
  await dialog.getByPlaceholder('made this thinking of you').fill('for you')
  await dialog.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })

  // Bo's open inbox updates without a reload; Cy's does not.
  await expect(bo.page.getByText(title)).toBeVisible({ timeout: 15_000 })
  await expect(bo.page.getByText('“for you”').first()).toBeVisible()
  await expect(cy.page.getByText(title)).toHaveCount(0)

  // Bo opens it and can write; Ada moves a slider and Bo sees the value change live.
  await bo.page.goto(pieceUrl)
  const boTempo = bo.page.getByRole('slider', { name: 'Tempo', exact: true })
  await expect(boTempo).toBeEnabled({ timeout: 20_000 })
  await setSlider(ada.page, 'Tempo', 2.25)
  await expect(boTempo).toHaveValue('2.25', { timeout: 10_000 })

  // …and the other direction.
  await setSlider(bo.page, 'Contrast', 1.7)
  await expect(ada.page.getByRole('slider', { name: 'Contrast', exact: true })).toHaveValue('1.7', { timeout: 10_000 })

  // Cy can watch the link-shared piece but not change it.
  await cy.page.goto(pieceUrl)
  await expect(cy.page.getByText('You’re watching.')).toBeVisible({ timeout: 20_000 })
  await expect(cy.page.getByRole('slider', { name: 'Tempo', exact: true })).toBeDisabled()
  await expect(cy.page.getByRole('button', { name: 'Send', exact: true })).toHaveCount(0)
})

test('publish renders a GIF and lists the piece in the public gallery', async ({ users, browser }) => {
  test.setTimeout(120_000)
  const [ada] = await users(['Ada'])

  // Object mode: the free koi demo (background removed, drifting).
  await ada.page.goto('/create')
  await ada.page.getByRole('tab', { name: 'Object, no background' }).click()
  await ada.page.getByRole('button', { name: 'Try the demo koi' }).click()
  await ada.page.getByRole('button', { name: 'Bring it to life' }).click()
  await ada.page.waitForURL(/\/p\/[\w-]+/, { timeout: 30_000 })
  await expect(ada.page.getByRole('slider', { name: 'Remove background', exact: true })).toHaveValue('0.35', { timeout: 20_000 })

  const title = `Koi ${Date.now()}`
  const titleBox = ada.page.getByRole('textbox', { name: 'Title' })
  await titleBox.fill(title)
  await titleBox.press('Enter')

  await ada.page.waitForTimeout(1500)
  await ada.page.screenshot({ path: '.deepspace/test-results/koi-editor.png' })
  await ada.page.waitForTimeout(2500)
  await ada.page.screenshot({ path: '.deepspace/test-results/koi-editor-2.png' })
  await ada.page.getByRole('button', { name: 'Publish' }).click()
  await expect(ada.page.getByRole('button', { name: 'In gallery' })).toBeVisible({ timeout: 60_000 })

  // A signed-out visitor sees it in the gallery as an animated GIF.
  const anon = await browser.newContext()
  const page = await anon.newPage()
  await page.goto('/gallery')
  const img = page.getByRole('img', { name: `${title}, animated ASCII` })
  await expect(img).toBeVisible({ timeout: 20_000 })
  const src = await img.getAttribute('src')
  const res = await page.request.get(src!)
  expect(res.ok()).toBe(true)
  expect(res.headers()['content-type']).toContain('image/gif')
  await anon.close()
})

test('an uploaded GIF plays as the source (frames change), no paid calls', async ({ users }) => {
  test.setTimeout(60_000)
  const [ada] = await users(['Ada'])
  await ada.page.goto('/create')
  await ada.page.locator('input[type=file]').setInputFiles('tests/fixtures/pulse.gif')
  const canvas = ada.page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 20_000 })
  // The fixture pulses symmetrically, so any two moments can show mirror-image
  // frames; sample several and require more than one distinct picture.
  const seen = new Set<string>()
  for (let i = 0; i < 6; i++) {
    seen.add(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
    await ada.page.waitForTimeout(170)
  }
  expect(seen.size).toBeGreaterThan(1)
})

test('exports: SVG has vector dots, 4× PNG is 4× the pixels, HTML carries colors', async ({ users }) => {
  test.setTimeout(90_000)
  const [ada] = await users(['Ada'])
  await ada.page.goto('/create')
  await ada.page.getByRole('tab', { name: 'Object, no background' }).click()
  await ada.page.getByRole('button', { name: 'Try the demo koi' }).click()
  await ada.page.getByRole('button', { name: 'Bring it to life' }).click()
  await ada.page.waitForURL(/\/p\/[\w-]+/, { timeout: 30_000 })
  await expect(ada.page.getByRole('slider', { name: 'Gamma', exact: true })).toBeEnabled({ timeout: 20_000 })
  await ada.page.waitForTimeout(800)

  const grab = async (item: string) => {
    await ada.page.getByRole('button', { name: 'Export' }).click()
    const [dl] = await Promise.all([ada.page.waitForEvent('download'), ada.page.getByRole('menuitem', { name: item }).click()])
    const path = await dl.path()
    const { readFileSync } = await import('node:fs')
    return readFileSync(path!)
  }
  const svg = (await grab('SVG (vector)')).toString()
  expect(svg).toContain('<svg')
  expect((svg.match(/<circle /g) ?? []).length).toBeGreaterThan(200)

  const png4 = await grab('PNG 4×')
  const png1 = await grab('PNG 1×')
  const width = (b: Buffer) => b.readUInt32BE(16) // IHDR width
  expect(width(png4)).toBeGreaterThanOrEqual(width(png1) * 4 - 4)

  const html = (await grab('HTML (color)')).toString()
  expect(html).toMatch(/<span style="color:#[0-9a-f]{6}">/)
})
