// Two-user UI tour: friends, party invite popup, chat, crates, armory, profile.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import { startServer } from '../server/index.js';

const out = process.argv[2] || 'tests/output/ui';
fs.mkdirSync(out, { recursive: true });
const srv = await startServer({ port: 0, dbFile: ':memory:', quiet: true, noSignals: true });
const url = `http://localhost:${srv.port}`;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
async function user(name) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 760 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] ${e.message}\n${e.stack}`));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`[${name}] ${m.text()}`); });
  await page.goto(url);
  await page.click('text=Create account');
  await page.fill('#auth-user', name);
  await page.fill('#auth-pass', 'secret123');
  await page.fill('#auth-pass2', 'secret123');
  await page.click('#auth-submit');
  await page.waitForSelector('#btn-practice');
  return page;
}
const shot = (p, n) => p.screenshot({ path: `${out}/${n}.png` });
const a = await user('Alice');
const b = await user('Bobby');
// Alice sends a friend request to Bobby
await a.click('#nav-friends');
await a.fill('#friend-search', 'Bob');
await a.click('text=Search');
await a.waitForSelector('[data-add="Bobby"]');
await shot(a, '01-friend-search');
await a.click('[data-add="Bobby"]');
await b.waitForTimeout(400);
await b.click('#nav-friends');
await b.waitForSelector('[data-accept="Alice"]');
await shot(b, '02-friend-request');
await b.click('[data-accept="Alice"]');
await a.waitForSelector('[data-friend="Bobby"]');
await shot(a, '03-friends-list');
// Alice invites Bobby to a party
await a.click('[data-invite="Bobby"]');
await b.waitForSelector('.invite');
await shot(b, '04-invite-popup');
await b.click('.invite .btn.green');
await b.waitForSelector('#party-slots');
await a.click('#nav-party');
await a.waitForSelector('[data-member="Bobby"]');
// party chat
await b.click('.chat-tab:has-text("Party")');
await b.fill('#chat-input', 'hello party!');
await b.click('#chat-send');
await a.click('.chat-tab:has-text("Party")');
await a.waitForSelector('.chat-line:has-text("hello party!")');
await b.click('#btn-ready');
await a.waitForTimeout(400);
await shot(a, '05-party');
// lobby chat
await a.click('.chat-tab:has-text("Lobby")');
await a.fill('#chat-input', 'hi lobby <script>alert(1)</script>');
await a.click('#chat-send');
await b.click('.chat-tab:has-text("Lobby")');
await b.waitForSelector('.chat-line:has-text("hi lobby")');
// crates
await a.click('#nav-crates');
await a.waitForSelector('[data-open="basic"]');
await shot(a, '06-crates');
await a.click('[data-open="basic"]');
await a.waitForTimeout(1800);
await shot(a, '07-crate-rolling');
await a.waitForSelector('.reveal', { timeout: 10000 });
await a.waitForTimeout(800);
await shot(a, '08-crate-reveal');
await a.click('.reveal .btn.green');
await a.waitForTimeout(300);
await a.click('.reveal .btn.gray:has-text("View in Armory")');
await a.waitForSelector('.skin-grid');
await a.waitForTimeout(800);
await shot(a, '09-armory');
await a.click('#nav-profile');
await a.waitForSelector('#btn-save-avatar');
await a.click('.swatch >> nth=4');
await a.click('.opt-btn:has-text("crown")');
await a.click('#btn-save-avatar');
await a.waitForTimeout(400);
await shot(a, '10-profile');
await a.click('#nav-settings');
await shot(a, '11-settings');
const coins = await a.evaluate(() => window.__yoink.user.coins);
console.log('alice coins after crate', coins);
console.log('ERRORS:\n' + errors.join('\n'));
await browser.close();
await srv.close();
process.exit(0);
