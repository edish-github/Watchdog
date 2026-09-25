import type { Page } from '@playwright/test';

export async function fresh(page: Page) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}
export async function loginAs(page: Page, name = 'Sofia Silva') {
  await page.goto('/login');
  await page.getByRole('button', { name: new RegExp(name) }).first().click();
  await page.waitForURL('**/app/overview');
}
export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  return errors;
}
export async function jumpTo(page: Page, preset: RegExp) {
  await page.goto('/app/settings');
  await page.getByRole('button', { name: preset }).first().click();
}
export async function advanceReplay(page: Page, steps: ('+15 min' | '+1 h' | '+6 h' | '+1 day')[]) {
  await page.locator('header button[aria-haspopup="dialog"]').first().click();
  for (const s of steps) await page.getByRole('button', { name: s, exact: true }).click();
  await page.keyboard.press('Escape');
}
