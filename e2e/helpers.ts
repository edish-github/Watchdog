import type { Page } from '@playwright/test';

async function waitForPending(page: Page) {
  try {
    await page.waitForFunction(() => {
      const w = window as unknown as { __wdSync?: { getState: () => { pending: number } } };
      if (!w.__wdSync) return true;
      return w.__wdSync.getState().pending === 0;
    }, null, { timeout: 10_000 });
  } catch {
    // ignore
  }
}

async function waitForAdopted(page: Page) {
  try {
    await page.waitForFunction(() => {
      const w = window as unknown as { __wdSync?: { getState: () => { pending: number; status: string } } };
      if (!w.__wdSync) return false;
      const s = w.__wdSync.getState();
      return s.status === 'local' || (s.pending === 0 && s.status !== 'connecting');
    }, null, { timeout: 10_000 });
  } catch {
    // ignore
  }
}

export function setupSyncWait(page: Page) {
  if ((page as unknown as { __syncHooked?: boolean }).__syncHooked) return;
  (page as unknown as { __syncHooked?: boolean }).__syncHooked = true;

  const rawGoto = page.goto.bind(page);
  page.goto = async (url: string, options?: Parameters<Page['goto']>[1]) => {
    await waitForPending(page);
    const res = await rawGoto(url, options);
    await waitForAdopted(page);
    return res;
  };
}

export async function fresh(page: Page, preset = 'day2') {
  setupSyncWait(page);
  try {
    const res = await page.request.post('/api/workspaces', { data: { preset } });
    if (res.ok()) {
      await page.goto('/');
      await page.evaluate(() => localStorage.clear());
      await page.reload();
      await waitForAdopted(page);
      return;
    }
  } catch {
    // fallback for local mode
  }
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
  page.on('console', (m) => {
    if (m.type() === 'error') {
      const text = m.text();
      // Ignore initial probe 401 when no sandbox cookie is present yet
      if (text.includes('/api/workspaces/current') || text.includes('401 (Unauthorized)')) return;
      errors.push(`console: ${text}`);
    }
  });
  return errors;
}
export async function jumpTo(page: Page, preset: RegExp) {
  await page.goto('/app/settings');
  const res = page.waitForResponse((r) => r.url().includes('/api/workspaces/current/reset'), { timeout: 4000 }).catch(() => null);
  await page.getByRole('button', { name: preset }).first().click();
  await res;
  await page.waitForTimeout(200);
}
export async function advanceReplay(page: Page, steps: ('+15 min' | '+1 h' | '+6 h' | '+1 day')[]) {
  await page.locator('header button[aria-haspopup="dialog"]').filter({ hasText: /·/ }).first().click();
  for (const s of steps) await page.getByRole('button', { name: s, exact: true }).click();
  await page.keyboard.press('Escape');
}
