// Two browser windows (two accounts) queue online into the same match and see each other.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { startServer } from '../server/index.js';

const out = 'tests/output/multi';
fs.mkdirSync(out, { recursive: true });
const srv = await startServer({ port: 0, dbFile: ':memory:', quiet: true, noSignals: true, matchConfig: { voteSeconds: 3, countdownSeconds: 2, durations: { guns: 90 } } });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function user(name) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 650 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}`));
  await page.addInitScript(() => { window.__YOINK_TEST__ = true; });
  await page.goto(`http://localhost:${srv.port}`);
  await page.click('text=Create account');
  await page.fill('#auth-user', name);
  await page.fill('#auth-pass', 'secret123');
  await page.fill('#auth-pass2', 'secret123');
  await page.click('#auth-submit');
  await page.waitForSelector('#btn-find');
  await page.click('.mode-card[data-mode="guns"]');
  return page;
}
const a = await user('Ann');
const b = await user('Ben');
await a.click('#btn-find');
await b.click('#btn-find');
await a.waitForSelector('#queue-box');
await a.screenshot({ path: `${out}/01-queue.png` });
await a.waitForSelector('.map-card', { timeout: 20000 });
await b.waitForSelector('.map-card', { timeout: 20000 });
await a.click('.map-card[data-map="snow"]');
await b.click('.map-card[data-map="snow"]');
await a.waitForTimeout(400);
await a.screenshot({ path: `${out}/02-vote.png` });
for (const p of [a, b]) await p.waitForFunction(() => window.__yoink.game && window.__yoink.game.state === 'playing', null, { timeout: 30000 });
const match = [...srv.services.matchmaking.matches.values()][0];
const [pa, pb] = match.humans();
console.log('same match humans:', match.humans().map((p) => p.name).join(', '), 'map', match.mapId);
// test harness: put Ann 6m in front of Ben and give her a rifle
match.placePlayer(pb, 0, 0.05, 0, 0);
match.placePlayer(pa, 0, 0.05, -8, Math.PI); // facing +z towards Ben... yaw PI looks +Z
pa.inv.slots[0] = { t: 'rifle', mag: 30 }; pa.inv.held = 1; pa.inv.ammo.rifle = 60;
match.sendInv(pa);
match.ev({ k: 'held', n: pa.num, w: 'rifle' });
await a.waitForTimeout(1200);
await b.evaluate(() => { const g = window.__yoink.game; g.yaw = 0; g.pitch = -0.05; });
await b.waitForTimeout(500);
await b.screenshot({ path: `${out}/03-ben-sees-ann.png` });
// Ann aims at Ben's chest and fires a few shots
await a.evaluate(() => { const g = window.__yoink.game; g.yaw = Math.PI; g.pitch = Math.atan2(1.2 - 1.62, 8); });
await a.waitForTimeout(300);
const dbg = await a.evaluate(() => { const g = window.__yoink.game; return { body: [g.body.x, g.body.y, g.body.z], yaw: g.yaw, pitch: g.pitch, tpSeq: g.tpSeq }; });
console.log('Ann client', JSON.stringify(dbg), 'Ann server', pa.x.toFixed(2), pa.y.toFixed(2), pa.z.toFixed(2), pa.yaw.toFixed(2), 'tpSeq', pa.tpSeq, 'Ben server', pb.x.toFixed(2), pb.z.toFixed(2));
{ const e = match.eye(pa); const L = Math.hypot(0, -0.42, 8); const r = match.hitscan(pa, e, 0, -0.42 / L, 8 / L, 120, Date.now()); console.log('direct hitscan', r.target ? r.target.name : 'none', r.dist.toFixed(2), JSON.stringify(match.world.raycast(e.x, e.y, e.z, 0, -0.42 / L, 8 / L, 120, (bb) => !bb.glass)?.box || null)); }
const shotsBefore = match.killfeed.length;
const origShoot = match.shoot.bind(match);
match.shoot = (p, d) => { console.log('server shoot from', p.name, JSON.stringify(d.d), 'yaw', p.yaw.toFixed(2), 'pitch', p.pitch.toFixed(3), 'mag', p.inv.slots[0] && p.inv.slots[0].mag, 'cd', Date.now() - p.cd.shoot); return origShoot(p, d); };
for (let i = 0; i < 4; i++) { await a.mouse.click(550, 325); await a.waitForTimeout(160); }
await a.waitForTimeout(500);
await a.screenshot({ path: `${out}/04-ann-shoots.png` });
await b.screenshot({ path: `${out}/05-ben-hurt.png` });
const benHp = pb.hp;
console.log('Ben HP on server after Ann fired:', Math.round(benHp), 'Ann damage dealt:', Math.round(pa.stats.damage));
// Ann walks: Ben should see her move
const before = await b.evaluate((n) => { const p = window.__yoink.game.players.get(n); return [p.x, p.z]; }, pa.num);
await a.keyboard.down('KeyD'); await a.waitForTimeout(1200); await a.keyboard.up('KeyD');
await b.waitForTimeout(400);
const after = await b.evaluate((n) => { const p = window.__yoink.game.players.get(n); return [p.x, p.z]; }, pa.num);
console.log('Ann as seen by Ben moved from', before.map((v) => v.toFixed(1)), 'to', after.map((v) => v.toFixed(1)));
console.log('errors', errors);
await browser.close();
await srv.close();
process.exit(0);
