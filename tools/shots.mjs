// Visual check helper: starts a practice match and takes screenshots of scripted views.
// usage: node tools/shots.mjs <mode> <map> <outdir> [quality]
import { chromium } from 'playwright-core';
import { startServer } from '../server/index.js';
import fs from 'node:fs';

const [mode = 'tag', mapId = 'forest', out = 'tests/output/shots', quality = 'low'] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const srv = await startServer({ port: 0, dbFile: `${out}/db-${Date.now()}.db`, quiet: true, noSignals: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
await page.addInitScript((q) => { window.__YOINK_TEST__ = true; localStorage.setItem('yoink_settings_v1', JSON.stringify({ quality: q, showFps: true })); }, quality);
await page.goto(`http://localhost:${srv.port}`);
await page.click('text=Create account');
await page.fill('#auth-user', 'shot' + Math.floor(Math.random() * 99999));
await page.fill('#auth-pass', 'secret123');
await page.fill('#auth-pass2', 'secret123');
await page.click('#auth-submit');
await page.waitForSelector('#btn-practice');
await page.click(`.mode-card[data-mode="${mode}"]`);
await page.click('#btn-practice');
await page.waitForSelector('.map-card');
await page.click(`.map-card[data-map="${mapId}"]`);
await page.waitForFunction(() => window.__yoink.game && window.__yoink.game.state === 'playing', null, { timeout: 40000 });
await page.waitForTimeout(800);
const shot = async (name) => { await page.screenshot({ path: `${out}/${mode}-${mapId}-${name}.png` }); };
await shot('start');
// scripted views: teleport the local player (client side only, for screenshots)
const views = JSON.parse(process.env.VIEWS || '[]');
for (const v of views) {
  await page.evaluate((v) => {
    const g = window.__yoink.game;
    g.body.x = v.x; g.body.y = v.y; g.body.z = v.z; g.yaw = v.yaw || 0; g.pitch = v.pitch || 0;
    if (v.inv) g.setInv(v.inv);
    if (v.eval) eval(v.eval);
  }, v);
  await page.waitForTimeout(v.wait || 600);
  if (v.click) { await page.mouse.click(640, 360); await page.waitForTimeout(v.clickWait || 120); }
  await shot(v.name);
}
const stats = await page.evaluate(() => { const g = window.__yoink.game; const r = g.renderer; return { geoms: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs.length }; });
console.log(JSON.stringify(stats));
console.log('errors:', errors.slice(0, 10).join('\n'));
await browser.close();
await srv.close();
process.exit(0);
