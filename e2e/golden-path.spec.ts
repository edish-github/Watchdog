import { expect, test } from '@playwright/test';
import { advanceReplay, fresh, jumpTo, loginAs } from './helpers';

test('golden path: report → signal → look → advisory → FHIR → resolved', async ({ page }) => {
  await fresh(page);
  await loginAs(page);
  await jumpTo(page, /Day 2 · 14:00/);                       // presenter mode

  // 1 · Ana reports in the public app
  await page.goto('/observe/sites/COI-03/report');
  await page.getByRole('button', { name: /Dark mats on stones/ }).click();
  await page.getByRole('button', { name: /My dog seems unwell/ }).click();
  await page.getByRole('button', { name: /^Next/ }).click();
  await page.getByRole('button', { name: 'Under 2 hours' }).click();
  await page.getByRole('button', { name: 'Submit report' }).click();
  await expect(page.getByText('Contact a vet now')).toBeVisible();
  await expect(page.getByText(/started a check|joined a check/)).toBeVisible();

  // 2 · Coordinator opens the signal and requests a look
  await page.goto('/app/signals');
  await page.getByRole('row', { name: /COI-03/ }).first().click();
  await page.waitForURL(/\/app\/signals\/SIG-/);
  const signalUrl = page.url();
  await page.getByRole('button', { name: /Dispatch look request to verify/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: /Dispatch look request/ }).click();

  // 3 · Tiago verifies in the field
  await page.goto('/observe/requests');
  await page.getByRole('button', { name: 'Accept mission' }).first().click();
  await page.getByLabel(/Dark or gelatinous mats on stones/).check();
  await page.getByLabel(/Dead fish in the shallows/).check();
  await page.getByRole('button', { name: /Send: signs present/ }).click();

  // 4 · Draft, pass guardrails, approve and publish (escalation on by default)
  await page.goto(signalUrl);
  await page.getByRole('button', { name: /Draft precaution advisory/ }).click();
  await page.waitForURL(/\/app\/advisories\/ADV-/);
  const advisoryUrl = page.url();
  await expect(page.getByText('Ready to approve')).toBeVisible();
  await page.getByRole('button', { name: 'Approve and publish' }).first().click();
  await page.getByRole('dialog').getByRole('button', { name: 'Approve and publish' }).click();
  await expect(page.getByText('Published text')).toBeVisible();

  // 5 · A valid FHIR bundle is queued
  await page.goto('/app/fhir');
  await expect(page.getByRole('row', { name: /COI-03.*R4 valid/ }).first()).toBeVisible();

  // 6 · 25 h later, two independent clear checks resolve the advisory
  await advanceReplay(page, ['+1 day', '+1 h']);
  await page.goto(advisoryUrl);
  for (const volunteer of ['Tiago Almeida', 'Marta Costa']) {
    await page.getByRole('button', { name: /Send a resolution check/ }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByRole('button', { name: new RegExp('^' + volunteer) }).click();
    await dlg.getByRole('button', { name: /Dispatch look request/ }).click();
  }
  for (const v of ['tiago', 'marta']) {
    await page.goto('/observe/requests');
    await page.getByLabel('Demo volunteer').selectOption(v);
    await page.getByRole('button', { name: 'Accept mission' }).first().click();
    await page.getByRole('button', { name: /I looked — no signs/ }).first().click();
  }
  await page.goto(advisoryUrl);
  await expect(page.getByText('Resolved', { exact: true }).first()).toBeVisible();
});

test('in-browser self-test suite is all green', async ({ page }) => {
  await fresh(page);
  await loginAs(page);
  await page.goto('/app/rules');
  await page.getByRole('button', { name: /Run self-test suite/ }).click();
  await expect(page.getByText(/17\/17 passing/)).toBeVisible({ timeout: 60_000 });
});
