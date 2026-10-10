// Browser end-to-end: register, practice match (shortened), play, results, back to lobby.
// usage: node tools/e2e.mjs [mode] [outdir]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { startServer } from '../server/index.js';

const mode = process.argv[2] || 'grab';
const out = process.argv[3] || 'tests/output/e2e';
fs.mkdirSync(out, { recursive: true });
const srv = await startServer({ port: 0, dbFile: ':memory:', quiet: true, noSignals: true, matchConfig: { voteSeconds: 3, countdownSeconds: 2, durations: { tag: 15, hotpotato: 40, grab: 15, guns: 20, craft: 20 } } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.addInitScript(() => { window.__YOINK_TEST__ = true; });
await page.goto(`http://localhost:${srv.port}`);
await page.click('text=Create account');
await page.fill('#auth-user', 'e2e' + Math.floor(Math.random() * 9999));
await page.fill('#auth-pass', 'secret123');
await page.fill('#auth-pass2', 'secret123');
await page.click('#auth-submit');
await page.waitForSelector('#btn-practice');
await page.click(`.mode-card[data-mode="${mode}"]`);
await page.click('#btn-practice');
await page.waitForSelector('.map-card');
await page.click('.map-card[data-map="industrial"]');
await page.waitForFunction(() => window.__yoink.game && window.__yoink.game.state === 'playing', null, { timeout: 30000 });
// play: run around, punch, interact
const t0 = Date.now();
let i = 0;
while (Date.now() - t0 < 6000) {
  await page.keyboard.down('KeyW'); await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(400);
  await page.evaluate(() => { window.__yoink.game.yaw += 0.6; });
  await page.mouse.click(640, 360);
  await page.keyboard.press('KeyE');
  if (i++ === 3) await page.screenshot({ path: `${out}/${mode}-playing.png` });
}
await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
await page.keyboard.down('Tab');
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/${mode}-scoreboard.png` });
await page.keyboard.up('Tab');
// wait for the match to finish
await page.waitForSelector('#btn-to-lobby', { timeout: 90000 });
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/${mode}-results.png` });
const coins = await page.evaluate(() => window.__yoink.user.coins);
await page.click('#btn-to-lobby');
await page.waitForSelector('#btn-practice');
console.log(JSON.stringify({ mode, coinsAfter: coins, errors }));
await browser.close();
await srv.close();
process.exit(errors.length ? 1 : 0);
