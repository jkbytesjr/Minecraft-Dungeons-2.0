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
/** Wait for `seconds` of simulated game time (headless rendering runs slower than real time). */
const waitSim = async (seconds) => {
  const start = await page.evaluate(() => window.__game.simTime);
  await page.waitForFunction((t) => window.__game.simTime >= t, start + seconds, { timeout: 60000 });
};

try {
  await page.goto('http://localhost:5199/?seed=777');
  await page.waitForFunction(() => window.__game && window.__stats, null, { timeout: 20000 });
  await page.mouse.move(900, 300);
  await page.screenshot({ path: `${outDir}/01-start.png` });

  const boot = await state();
  check(boot.enemies.length > 8, `dungeon spawns enemies (${boot.enemies.length})`);
  const kinds = new Set(boot.enemies.map((e) => e.kind));
  check(['grunt', 'archer', 'exploder', 'boss'].every((k) => kinds.has(k)), `all enemy kinds present (${[...kinds]})`);
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
  await page.evaluate(() => window.__game.debugSpawn('grunt', 1.2, 0));
  await page.waitForTimeout(100);
  const target = async () => (await state()).enemies.find((e) => e.alive && e.kind === 'grunt');
  const aimAtGrunt = async () => {
    const g = await target();
    if (!g) return false;
    const sp = await page.evaluate(({ x, z }) => window.__game.debugWorldToScreen(x, z), g);
    await page.mouse.move(sp.x, sp.y);
    return true;
  };
  await aimAtGrunt();
  const hp0 = (await target()).hp;
  await page.mouse.down();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}/03-combat.png` });
  for (let i = 0; i < 60 && (await aimAtGrunt()); i++) await waitSim(0.15);
  await page.mouse.up();
  const g3 = await target();
  check(!g3 || g3.hp < hp0, 'attacks damage the grunt');
  check(!g3, 'grunt can be killed');

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
  await page.evaluate(() => window.__game.debugSpawn('grunt', 1.0, 0));
  await waitSim(2.5);
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

  // --- M4: archer, exploder, boss, portal, victory ---
  const extra = () => page.evaluate(() => window.__game.debugExtra());
  await page.evaluate(() => window.__game.restart());
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__game.debugSpawn('archer', 0, 5.5));
  let sawArrow = false;
  for (let i = 0; i < 40 && !sawArrow; i++) {
    await waitSim(0.1);
    sawArrow = (await extra()).projectiles > 0;
  }
  check(sawArrow, 'archer fires arrows');
  await page.screenshot({ path: `${outDir}/07-archer.png` });

  await page.evaluate(() => window.__game.restart());
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__game.debugSpawn('exploder', 3, 0));
  await waitSim(0.6);
  await page.screenshot({ path: `${outDir}/08-exploder-fuse.png` });
  await waitSim(2);
  const ex = await state();
  check(ex.player.hp < 100 && !ex.enemies.some((e) => e.kind === 'exploder' && e.alive), `exploder detonates (hp ${ex.player.hp})`);

  // Boss: walk into its arena, let it engage, then kill it and use the portal.
  for (let depth = 0; depth < 3; depth++) {
    const boss = (await state()).enemies.find((e) => e.kind === 'boss');
    await page.evaluate(({ x, z }) => window.__game.debugTeleport(x, z + 5), boss);
    await waitSim(1.2);
    if (depth === 0) {
      check((await extra()).bossEngaged, 'boss engages when the player enters its arena');
      check(await page.isVisible('.boss-bar'), 'boss health bar shows');
      await page.screenshot({ path: `${outDir}/09-boss.png` });
    }
    await page.evaluate(() => window.__game.debugKillBoss());
    await page.waitForTimeout(300);
    if (depth === 0) check((await extra()).portalActive, 'portal opens after the boss dies');
    const exit = await page.evaluate(() => window.__game.level.exit);
    await page.evaluate(({ x, z }) => window.__game.debugTeleport(x, z), exit);
    await page.waitForTimeout(300);
    if (depth < 2) check((await extra()).depth === depth + 1, `portal leads to floor ${depth + 2}`);
  }
  check(await page.isVisible('.screen.victory'), 'victory screen after the final boss');
  await page.screenshot({ path: `${outDir}/10-victory.png` });
  await page.click('.new-run');
  await page.waitForTimeout(200);
  check((await extra()).depth === 0 && !(await page.isVisible('.screen.victory')), 'new run starts at floor 1');

  // --- M3: floors render with their own theme ---
  for (const depth of [1, 2]) {
    await page.evaluate((d) => window.__game.loadFloor(d), depth);
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${outDir}/06-floor${depth + 1}.png` });
  }
  await page.evaluate(() => window.__game.loadFloor(0));

  const stats = await page.evaluate(() => window.__stats);
  console.log(`stats (headless software GL, not representative): ${JSON.stringify(stats)}`);
} catch (e) {
  check(false, String(e));
}
check(problems.length === 0, `no console errors/warnings${problems.length ? ':\n  ' + problems.join('\n  ') : ''}`);
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
