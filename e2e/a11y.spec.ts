import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fresh, loginAs } from './helpers';

const DEMO = ['/observe', '/observe/sites/COI-03', '/observe/sites/COI-03/report', '/app/overview', '/app/signals', '/app/advisories', '/app/fhir'];

test('demo screens have no serious or critical WCAG 2.1 AA violations', async ({ page }) => {
  await fresh(page);
  await loginAs(page);
  for (const r of DEMO) {
    await page.goto(r);
    await page.locator('h1').first().waitFor();
    await page.waitForTimeout(600);
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const bad = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(bad.map((v) => `${r} · ${v.id}: ${v.help} (${v.nodes.length})`), r).toEqual([]);
  }
});
