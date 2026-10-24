// Headless browser smoke test: opens the built game, walks through key screens,
// starts battles, takes screenshots (desktop + tablet) and reports console errors.
// Usage: npm run build && npx vite preview --port 4173 &  then  node tools/smoke-test.js [outDir]
import { createRequire } from 'module';
import { execSync } from 'child_process';

// Playwright is pre-installed globally in CI/dev containers; fall back to the global npm root.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  const root = execSync('npm root -g').toString().trim();
  ({ chromium } = require(root + '/playwright'));
}
import fs from 'fs';

const URL = process.env.URL || 'http://localhost:4173/';
const OUT = process.argv[2] || 'screenshots';
fs.mkdirSync(OUT, { recursive: true });

const sizes = [
  { name: 'desktop', width: 1366, height: 768, touch: false },
  { name: 'tablet', width: 1180, height: 820, touch: true },
];
const errors = [];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;

async function run(size) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch, isMobile: false, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${size.name}] console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${size.name}] pageerror: ${e.message}\n${e.stack}`));
  await page.goto(URL);
  await page.waitForTimeout(1500);
  const shot = async (n) => page.screenshot({ path: `${OUT}/${size.name}-${n}.png` });
  const step = async (n, fn) => { if (only && !only.includes(n)) return; await fn(); };
  await shot('01-title');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await shot('02-menu');
  await step('select', async () => {
    await page.evaluate(() => window.__game.screens.show('select', { mode: 'versus', step: 0 }));
    await page.waitForTimeout(800);
    await shot('03-select');
  });
  await step('arena', async () => {
    await page.evaluate(() => window.__game.screens.show('arena', { mode: 'versus', p1: { id: 'korvak', skin: 'default' }, p2: { id: 'oruvex', skin: 'default' }, p2control: 'ai' }));
    await page.waitForTimeout(500);
    await shot('04-arena');
  });
  await step('controls', async () => {
    await page.evaluate(() => window.__game.screens.show('controls', {}));
    await page.waitForTimeout(400);
    await shot('05-controls');
  });
  const battles = (process.env.BATTLES || 'korvak:velumora:volcanic,oruvex:canopyx:harbor,prismor:velumora:saltflats,canopyx:korvak:valley,velumora:oruvex:stormsea').split(',');
  let i = 0;
  for (const b of battles) {
    const [p1, p2, arena] = b.split(':');
    await page.evaluate(([p1, p2, arena]) => window.__game.startBattle({ mode: 'versus', p1: { id: p1, control: 'ai', difficulty: 'hard' }, p2: { id: p2, control: 'ai', difficulty: 'hard' }, arena, intro: true }), [p1, p2, arena]);
    await page.waitForTimeout(1200);
    if (i === 0) await shot('06-intro');
    await page.evaluate(() => window.__game.skipIntro());
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__game.skipIntro());
    await page.waitForTimeout(5000);
    await shot(`07-battle-${arena}-a`);
    await page.waitForTimeout(6000);
    await shot(`07-battle-${arena}-b`);
    const fps = await page.evaluate(() => Math.round(window.__game.fps));
    console.log(size.name, b, 'fps(headless, software GL):', fps);
    i++;
  }
  await step('pause', async () => {
    await page.evaluate(() => window.__game.togglePause());
    await page.waitForTimeout(300);
    await shot('08-pause');
    await page.evaluate(() => window.__game.togglePause());
  });
  await page.evaluate(() => { window.__game.quitBattle(); window.__game.screens.show('records', {}); });
  await page.waitForTimeout(300);
  await shot('09-records');
  if (size.touch) {
    await page.evaluate(() => { window.__game.isTouch = true; window.__game.startBattle({ mode: 'versus', p1: { id: 'korvak', control: 'human' }, p2: { id: 'prismor', control: 'human' }, arena: 'valley', intro: false }); });
    await page.waitForTimeout(2500);
    await shot('10-touch-versus');
  }
  await browser.close();
}

for (const s of sizes) {
  if (process.env.SIZE && process.env.SIZE !== s.name) continue;
  await run(s);
}
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'No console errors.');
process.exit(errors.length ? 1 : 0);
