import { expect, test } from '@playwright/test';

// Guards every run: a remote-mode run against a local build (or the reverse) proves nothing, so fail loudly.
test('the server under test was built for the requested transport', async ({ request }) => {
  const want = process.env.NEXT_PUBLIC_BACKEND === 'remote' ? 'remote' : 'local';
  const res = await request.get('/api/health');
  const body = (await res.json()) as { build?: { transport?: string } };
  expect(body.build?.transport, `The server is a "${body.build?.transport}" build but this run expects "${want}". Stop it (lsof -ti:3000 | xargs kill -9), build the right mode, start it, run again.`).toBe(want);
});
