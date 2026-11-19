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

  // Bo and Cy are open on their inboxes before anything is sent.
  await Promise.all([bo.page.goto('/inbox'), cy.page.goto('/inbox')])
  await expect(bo.page.getByText('Nothing yet.')).toBeVisible({ timeout: 15_000 })

  // Ada sends to Bo.
  await ada.page.getByRole('button', { name: 'Send', exact: true }).click()
  const dialog = ada.page.getByRole('dialog')
  await dialog.getByPlaceholder('Search people…').fill('Bo')
  await dialog.getByRole('button', { name: /^Bo$/ }).click()
  await dialog.getByPlaceholder('made this thinking of you').fill('for you')
  await dialog.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(dialog).toBeHidden({ timeout: 15_000 })

  // Bo's open inbox updates without a reload; Cy's does not.
  await expect(bo.page.getByText('Lanterns over the lake')).toBeVisible({ timeout: 15_000 })
  await expect(bo.page.getByText('“for you”')).toBeVisible()
  await expect(cy.page.getByText('Lanterns over the lake')).toHaveCount(0)

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
