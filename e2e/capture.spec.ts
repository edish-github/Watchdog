import { test } from '@playwright/test';
import { fresh, loginAs, jumpTo } from './helpers';

test.describe('Screenshot capture suite', () => {
  test('@capture capture all required review screenshots', async ({ page }) => {
    // 1. Landing page (1440 x 960)
    await page.setViewportSize({ width: 1440, height: 960 });
    await fresh(page);
    await page.goto('/');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'docs/screenshots/01-landing.png', fullPage: false });

    // 2. Login page (1440 x 960)
    await page.goto('/login');
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'docs/screenshots/02-login.png' });

    // 3. Public app: /observe (EN) (390 x 844)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/observe');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'docs/screenshots/03-observe-en.png' });

    // 4. Public app: /observe (PT) (390 x 844)
    await page.getByRole('button', { name: 'PT', exact: true }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'docs/screenshots/04-observe-pt.png' });
    await page.getByRole('button', { name: 'EN', exact: true }).click(); // switch back

    // 5. Public app: /observe/sites/COI-03 (390 x 844)
    await page.goto('/observe/sites/COI-03');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'docs/screenshots/05-observe-site-coi03.png' });

    // 6. Report Step 1
    await page.goto('/observe/sites/COI-03/report');
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: /Dark mats on stones/ }).click();
    await page.getByRole('button', { name: /My dog seems unwell/ }).click();
    await page.screenshot({ path: 'docs/screenshots/06-report-step1.png' });

    // 7. Report Step 2
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'Under 2 hours' }).click();
    await page.screenshot({ path: 'docs/screenshots/07-report-step2.png' });

    // 8. Report Step 3
    await page.getByRole('button', { name: 'Submit report' }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'docs/screenshots/08-report-step3.png' });

    // Switch to desktop for console screens (1440 x 960)
    await page.setViewportSize({ width: 1440, height: 960 });
    await fresh(page);
    await loginAs(page);

    // 9. /app/overview with replay clock popover open
    await page.goto('/app/overview');
    await page.waitForTimeout(600);
    await page.locator('header button[aria-haspopup="dialog"]').first().click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: 'docs/screenshots/09-overview-replay-clock.png' });
    await page.keyboard.press('Escape');

    // 10. /app/signals/<SIG> with Why drawer open
    await jumpTo(page, /Day 2 · 14:00/);
    await page.goto('/observe/sites/COI-03/report');
    await page.getByRole('button', { name: /Dark mats on stones/ }).click();
    await page.getByRole('button', { name: /My dog seems unwell/ }).click();
    await page.getByRole('button', { name: /^Next/ }).click();
    await page.getByRole('button', { name: 'Under 2 hours' }).click();
    await page.getByRole('button', { name: 'Submit report' }).click();
    await page.waitForTimeout(600);

    await page.goto('/app/signals');
    await page.getByRole('row', { name: /COI-03/ }).first().click();
    await page.waitForURL(/\/app\/signals\/SIG-/);
    await page.getByRole('button', { name: /Open Why drawer/ }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'docs/screenshots/10-signals-why-drawer.png' });
    await page.keyboard.press('Escape');

    // 11. Advisory editor with guardrails visible
    await page.getByRole('button', { name: /Draft precaution advisory/ }).click();
    await page.waitForURL(/\/app\/advisories\/ADV-/);
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'docs/screenshots/11-advisory-editor-guardrails.png' });

    // 12. Advisory live view
    await page.getByRole('button', { name: 'Approve and publish' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: 'Approve and publish' }).click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'docs/screenshots/12-advisory-live-view.png' });

    // 13. /app/fhir/<FHIR> with the receipt
    await page.goto('/app/fhir');
    await page.waitForTimeout(600);
    await page.getByRole('row', { name: /COI-03/ }).first().click();
    await page.waitForURL(/\/app\/fhir\/FHIR-/);
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'docs/screenshots/13-fhir-receipt.png' });

    // 14. /app/ledger/summer-2026?site=COI-03
    await page.goto('/app/ledger/summer-2026?site=COI-03');
    await page.waitForTimeout(800);
    await page.screenshot({ path: 'docs/screenshots/14-ledger-summer-2026.png' });

    // 15. /app/rules after running self-tests
    await page.goto('/app/rules');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: /Run self-test suite/ }).click();
    await page.getByText(/17\/17 passing/).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'docs/screenshots/15-rules-self-tests.png' });
  });
});
