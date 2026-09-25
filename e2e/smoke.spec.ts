import { expect, test } from '@playwright/test';
import { collectErrors, fresh, loginAs } from './helpers';

const PUBLIC = ['/', '/login', '/signup', '/observe', '/observe/sites/COI-03', '/observe/sites/COI-03/report', '/observe/observations', '/observe/requests', '/observe/about'];
const CONSOLE = ['/app/overview', '/app/sites', '/app/sites/COI-03', '/app/watches', '/app/observations', '/app/signals', '/app/verification', '/app/advisories', '/app/advisories/new', '/app/fhir', '/app/ledger', '/app/ledger/summer-2026', '/app/rules', '/app/rules/RULE-01', '/app/sources', '/app/settings'];

test('every public route renders without runtime errors', async ({ page }) => {
  const errors = collectErrors(page);
  await fresh(page);
  for (const r of PUBLIC) { await page.goto(r); await expect(page.locator('h1').first(), r).toBeVisible(); }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('every console route renders without runtime errors', async ({ page }) => {
  const errors = collectErrors(page);
  await fresh(page);
  await loginAs(page);
  for (const r of CONSOLE) { await page.goto(r); await expect(page.locator('main h1').first(), r).toBeVisible(); }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('console redirects to sign-in when signed out', async ({ page }) => {
  await fresh(page);
  await page.goto('/app/signals');
  await page.waitForURL(/\/login\?next=/);
});
