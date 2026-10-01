// Headless browser smoke test: boots the dev server, loads the game, drives
// input, fails on any console error/warning, and saves screenshots.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const outDir = process.env.SMOKE_OUT ?? 'smoke-out';
mkdirSync(outDir, { recursive: true });

const server = await createServer({ logLevel: 'error', server: { port: 5199, strictPort: true } });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const problems = [];
// Chromium's software GL reports a stall when Playwright reads pixels for a
// screenshot. That is the harness, not the game, so it is ignored.
const harnessNoise = /GL Driver Message .*GPU stall due to ReadPixels/;
page.on('console', (m) => {
  if ((m.type() === 'error' || m.type() === 'warning') && !harnessNoise.test(m.text()))
    problems.push(`${m.type()}: ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));

let failed = false;
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
  if (!cond) failed = true;
};
const state = () => page.evaluate(() => window.__game.debugState());

try {
  await page.goto('http://localhost:5199/');
  await page.waitForFunction(() => window.__game && window.__stats, null, { timeout: 20000 });
  await page.mouse.move(900, 300);
  await page.screenshot({ path: `${outDir}/01-start.png` });

  const s0 = await state();
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(800);
  await page.keyboard.up('KeyW');
  const s1 = await state();
  check(Math.hypot(s1.player.x - s0.player.x, s1.player.z - s0.player.z) > 1, 'W moves the player');

  // Walk into a wall for a long time; the player must stay on walkable ground.
  await page.keyboard.down('KeyA');
  await page.waitForTimeout(3000);
  await page.keyboard.up('KeyA');
  const s2 = await state();
  const inside = await page.evaluate(({ x, z }) => window.__game.level.grid.isWalkableAt(x, z), s2.player);
  check(inside, `player stays inside walls (at ${s2.player.x.toFixed(2)}, ${s2.player.z.toFixed(2)})`);
  await page.screenshot({ path: `${outDir}/02-after-move.png` });

  await page.screenshot({ path: `${outDir}/02b-wall.png` });

  // --- M2: combat ---
  await page.evaluate(() => window.__game.restart());
  await page.waitForTimeout(200);
  // Grunt 1.2 tiles away; aim at it and attack until it dies.
  await page.evaluate(() => window.__game.debugSpawnGrunt(1.2, 0));
  await page.waitForTimeout(100);
  const aimAtGrunt = async () => {
    const st = await state();
    const g = st.enemies.find((e) => e.alive);
    if (!g) return false;
    const sp = await page.evaluate(({ x, z }) => window.__game.debugWorldToScreen(x, z), g);
    await page.mouse.move(sp.x, sp.y);
    return true;
  };
  await aimAtGrunt();
  const hp0 = (await state()).enemies.find((e) => e.alive).hp;
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/03-combat.png` });
  for (let i = 0; i < 20 && (await aimAtGrunt()); i++) await page.waitForTimeout(150);
  await page.mouse.up();
  const s3 = await state();
  check(s3.enemies.every((e) => !e.alive || e.hp < hp0), 'attacks damage the grunt');
  check(s3.enemies.some((e) => !e.alive) || s3.enemies.length === 0, 'grunt can be killed');

  // Dodge: player moves quickly and is flagged as dodging (i-frames).
  const d0 = await state();
  await page.keyboard.press('Space');
  await page.waitForTimeout(60);
  const d1 = await state();
  check(d1.player.dodging, 'space starts a dodge roll');
  await page.waitForTimeout(400);
  const d2 = await state();
  check(Math.hypot(d2.player.x - d0.player.x, d2.player.z - d0.player.z) > 1.5, 'dodge roll covers distance');

  // Grunt attacks: stand still next to one and check HP drops.
  await page.evaluate(() => window.__game.debugSpawnGrunt(1.0, 0));
  await page.waitForTimeout(2500);
  const h = await state();
  check(h.player.hp < 100, `grunt damages the player (hp ${h.player.hp})`);
  await page.screenshot({ path: `${outDir}/04-hurt.png` });

  // Death screen + restart.
  await page.evaluate(() => window.__game.world.player.applyDamage(9999, 0, 0));
  await page.waitForTimeout(600);
  check(await page.isVisible('.screen.death'), 'death screen shows at 0 HP');
  await page.screenshot({ path: `${outDir}/05-death.png` });
  await page.click('.restart');
  await page.waitForTimeout(200);
  const r = await state();
  check(r.player.alive && r.player.hp === 100 && !(await page.isVisible('.screen.death')), 'restart restores the player');

  const stats = await page.evaluate(() => window.__stats);
  console.log(`stats (headless software GL, not representative): ${JSON.stringify(stats)}`);
} catch (e) {
  check(false, String(e));
}
check(problems.length === 0, `no console errors/warnings${problems.length ? ':\n  ' + problems.join('\n  ') : ''}`);
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
