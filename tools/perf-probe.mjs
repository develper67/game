// Measures draw calls / triangles of the main scene for every map.
import { chromium } from 'playwright-core';
import { startServer } from '../server/index.js';
import { MAP_IDS } from '../shared/maps/index.js';

const quality = process.argv[2] || 'low';
const srv = await startServer({ port: 0, dbFile: ':memory:', quiet: true, noSignals: true, matchConfig: { voteSeconds: 1, countdownSeconds: 1 } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript((q) => { window.__YOINK_TEST__ = true; localStorage.setItem('yoink_settings_v1', JSON.stringify({ quality: q })); }, quality);
await page.goto(`http://localhost:${srv.port}`);
await page.click('text=Create account');
await page.fill('#auth-user', 'perf' + Math.floor(Math.random() * 999));
await page.fill('#auth-pass', 'secret123'); await page.fill('#auth-pass2', 'secret123');
await page.click('#auth-submit');
await page.waitForSelector('#btn-practice');
for (const id of MAP_IDS) {
  await page.click('#nav-play');
  await page.click('.mode-card[data-mode="guns"]');
  await page.click('#btn-practice');
  await page.waitForSelector('.map-card');
  await page.click(`.map-card[data-map="${id}"]`);
  await page.waitForFunction(() => window.__yoink.game && window.__yoink.game.state === 'playing', null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const g = window.__yoink.game; const ri = g.renderer.info;
    let worst = { calls: 0, tris: 0 };
    ri.autoReset = false;
    for (let k = 0; k < 8; k++) {
      g.yaw = k * Math.PI / 4;
      ri.reset();
      g.renderer.render(g.scene, g.camera);
      if (ri.render.calls > worst.calls) worst = { calls: ri.render.calls, tris: ri.render.triangles };
    }
    ri.autoReset = true;
    return { ...worst, geoms: ri.memory.geometries, tex: ri.memory.textures };
  });
  console.log(id.padEnd(11), JSON.stringify(r));
  await page.evaluate(() => window.__yoink.net.emit('match:leave'));
  await page.evaluate(() => { window.__yoink.disposeGame(); window.__yoink.showMenu('play'); });
  await page.waitForTimeout(300);
}
await browser.close(); await srv.close(); process.exit(0);
