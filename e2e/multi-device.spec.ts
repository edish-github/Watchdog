import { expect, test } from '@playwright/test';

// Runs only against a build made with NEXT_PUBLIC_BACKEND=remote (the flag is inlined at build time).
test.skip(process.env.NEXT_PUBLIC_BACKEND !== 'remote', 'Needs the remote transport (build and run with NEXT_PUBLIC_BACKEND=remote).');

const storedDomain = () => {
  try { return JSON.parse(localStorage.getItem('watchdog-state') ?? '{}')?.state?.d ?? null; } catch { return null; }
};

test('a report filed on a phone reaches the laptop within seconds', async ({ browser }) => {
  const laptop = await browser.newContext();
  const lp = await laptop.newPage();
  const made = await lp.request.post('/api/workspaces', { data: { preset: 'day2' } });
  expect(made.status()).toBe(201);
  const { joinCode } = (await made.json()) as { joinCode: string };
  await lp.goto('/observe');
  await expect.poll(async () => (await lp.evaluate(storedDomain))?.preset ?? null, { timeout: 10_000 }).toBe('day2');

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const pp = await phone.newPage();
  await pp.goto(`/join/${joinCode}`);
  await expect(pp).toHaveURL(/\/observe/);
  const res = await pp.request.post('/api/commands', {
    data: {
      requestId: `e2e-phone-${Date.now()}`, baseVersion: null,
      action: { type: 'observation/submit', input: { siteId: 'COI-03', deviceId: 'anon-e2e1', displayName: 'Phone walker', role: 'walker', signs: ['floating_scum'], source: 'pwa' } },
    },
  });
  expect(res.ok()).toBeTruthy();
  const { created } = (await res.json()) as { created: string };
  expect(created).toMatch(/^OB-/);

  const t0 = Date.now();
  await expect.poll(async () => lp.evaluate((id) => {
    try { return !!JSON.parse(localStorage.getItem('watchdog-state') ?? '{}')?.state?.d?.observations?.some((o: { id: string }) => o.id === id); } catch { return false; }
  }, created), { timeout: 6_000, intervals: [250] }).toBe(true);
  expect(Date.now() - t0).toBeLessThan(6_000);

  await phone.close();
  await laptop.close();
});
