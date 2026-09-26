/** Creates one sandbox per preset in DATABASE_URL, checks the round trip and the audit chain, then removes them. */
import { getDb } from '../lib/server/db';
import { createSandbox, deleteWorkspace } from '../lib/server/workspaces';
import { loadDomain, stripTransient, verifyAuditChain } from '../lib/server/repo';
import { PRESETS, buildScenario } from '../lib/sim';
import { sha256 } from '../lib/utils';
import { syntheticWeather, withWeather } from '../lib/weather';

async function main() {
  const c = await getDb();
  console.log(`database  ${process.env.DATABASE_URL || 'file:.data/watchdog.db'}\n`);
  for (const p of PRESETS) {
    const t0 = performance.now();
    const { meta } = await createSandbox(c, p.id);
    const ms = performance.now() - t0;
    const loaded = await loadDomain(c, meta.id);
    const expected = sha256(JSON.stringify(stripTransient(withWeather(syntheticWeather, () => buildScenario(p.id)))));
    const same = !!loaded && sha256(JSON.stringify(stripTransient(loaded.d))) === expected;
    const chain = await verifyAuditChain(c, meta.id);
    console.log(`${p.id.padEnd(6)} code ${meta.joinCode}  ${ms.toFixed(0).padStart(5)} ms  v${meta.version}  round trip ${same ? 'OK ' : 'MISMATCH'}  audit ${chain.ok ? 'OK' : `BROKEN at ${chain.brokenAt}`} (${chain.count} events)`);
    if (!same || !chain.ok) process.exitCode = 1;
    await deleteWorkspace(c, meta.id);
  }
  c.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
