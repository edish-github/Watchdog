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

