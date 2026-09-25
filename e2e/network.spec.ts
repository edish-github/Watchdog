import { expect, test } from '@playwright/test';
import { fresh, jumpTo, loginAs } from './helpers';

test('@network a synthetic One Health bundle is accepted by the HAPI R4 sandbox', async ({ page }) => {
  await fresh(page);
  await loginAs(page);
  await jumpTo(page, /Day 2 · 15:40/);                      // autopilot: COI-03 advisory published, bundle queued
  await page.goto('/app/fhir');
  await page.getByRole('row', { name: /COI-03/ }).first().click();
  await page.getByRole('button', { name: /Send to sandbox/ }).click();
  await expect(page.getByText(/HTTP 20[01]/).first()).toBeVisible({ timeout: 60_000 });
});
