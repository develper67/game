// Renders a JPEG thumbnail of every map for the map vote screen.
// usage: npm run previews
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { MAP_IDS } from '../shared/maps/index.js';

const outDir = path.resolve('client/assets/previews');
fs.mkdirSync(outDir, { recursive: true });
const srv = await startServer({ port: 0, dbFile: ':memory:', quiet: true, noSignals: true });
const exe = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const browser = await chromium.launch({ executablePath: exe, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : MAP_IDS;
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`http://localhost:${srv.port}/?preview=${id}`);
  await page.waitForFunction(() => window.__previewReady === true, null, { timeout: 60000 });
  await page.waitForTimeout(300);
  const file = path.join(outDir, `${id}.jpg`);
  await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
  console.log('wrote', file);
  await page.close();
}
await browser.close();
await srv.close();
process.exit(0);
