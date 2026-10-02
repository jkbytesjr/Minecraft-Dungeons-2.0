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
  // Level-up choices would pause the game mid-test; auto-pick except where tested.
  await page.evaluate(() => (window.__game.autoPerk = true));
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
  check((await state()).player.xp > 0, 'kills grant XP');

  // Dodge: player moves quickly and is flagged as dodging (i-frames).
  const d0 = await state();
  await page.keyboard.press('Space');
  // Wait for the next simulation tick to pick up the press (headless frames are slow).
  const dodged = await page
    .waitForFunction(() => window.__game.debugState().player.dodging, null, { polling: 'raf', timeout: 2000 })
    .then(() => true, () => false);
  check(dodged, 'space starts a dodge roll');
  await page.waitForTimeout(400);
  const d2 = await state();
  check(Math.hypot(d2.player.x - d0.player.x, d2.player.z - d0.player.z) > 1.5, 'dodge roll covers distance');

  // Grunt attacks: stand still next to one and check HP drops.
  await page.evaluate(() => window.__game.debugSpawn('grunt', 1.0, 0));
  await waitSim(2.5);
  const h = await state();
  check(h.player.hp < h.player.maxHp, `grunt damages the player (hp ${h.player.hp}/${h.player.maxHp})`);
  await page.screenshot({ path: `${outDir}/04-hurt.png` });

  // Death screen + restart.
  await page.evaluate(() => window.__game.world.player.applyDamage(9999, 0, 0));
  await page.waitForTimeout(600);
  check(await page.isVisible('.screen.death'), 'death screen shows at 0 HP');
  check((await page.textContent('.screen.death .summary')).includes('Reached floor 1'), 'death screen shows the floor reached');
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
  check(ex.player.hp < ex.player.maxHp && !ex.enemies.some((e) => e.kind === 'exploder' && e.alive), `exploder detonates (hp ${ex.player.hp})`);

  // Bosses: walk into each arena, let the boss fight a while, then kill it and use the portal.
  // Floors are endless; walk through enough to see two boss title upgrades.
  const floors = 9;
  const bossKinds = [];
  for (let depth = 0; depth < floors; depth++) {
    const boss = (await state()).enemies.find((e) => e.kind === 'boss');
    // Unkillable for this loop, so late bosses can't end the run early.
    await page.evaluate(() => {
      const p = window.__game.worldState.player;
      p.maxHp = p.hp = 100000;
    });
    await page.evaluate(({ x, z }) => window.__game.debugTeleport(x, z + 5), boss);
    await waitSim(2.5);
    const info = await extra();
    bossKinds.push(info.bossKind);
    check(info.bossEngaged, `floor ${depth + 1}: ${info.bossKind} engages`);
    if (depth === 0) check(await page.isVisible('.boss-bar'), 'boss health bar shows');
    const bossName = await page.textContent('.boss-name');
    if (depth === 4) check(bossName.endsWith('Reborn'), `floor 5 boss is Reborn (${bossName})`);
    if (depth === 8) check(bossName.endsWith('Ascendant'), `floor 9 boss is Ascendant (${bossName})`);
    if (depth < 4) await page.screenshot({ path: `${outDir}/09-boss-${depth + 1}-${info.bossKind}.png` });
    await page.evaluate(() => window.__game.debugKillBoss());
    await page.waitForTimeout(300);
    if (depth === 0) check((await extra()).portalActive, 'portal opens after the boss dies');
    const exit = await page.evaluate(() => window.__game.level.exit);
    await page.evaluate(({ x, z }) => window.__game.debugTeleport(x, z), exit);
    await page.waitForTimeout(300);
    check((await extra()).depth === depth + 1, `portal leads to floor ${depth + 2}`);
  }
  check(bossKinds[0] === 'colossus' && new Set(bossKinds.slice(0, 4)).size === 4, `floors 1-4 have four different bosses (${bossKinds.join(', ')})`);
  check(bossKinds.every((b, i) => i === 0 || b !== bossKinds[i - 1]), 'no boss repeats on back-to-back floors');
  check(await page.textContent('.floor-label').then((t) => t.startsWith('Floor 10 ·')), 'floors keep going past the old 6-floor limit');
  await page.screenshot({ path: `${outDir}/10-floor10.png` });

  // Death ends the run: summary, best floor, and New run rolls a new seed.
  const seedBefore = await page.evaluate(() => window.__game.seed);
  await page.evaluate(() => window.__game.worldState.player.applyDamage(1e9, 0, 0));
  await page.waitForTimeout(400);
  check((await page.textContent('.screen.death .summary')).includes('Reached floor 10'), 'death summary shows floor 10');
  check((await extra()).bestFloor >= 10, `best floor is recorded (${(await extra()).bestFloor})`);
  await page.click('.new-run');
  await page.waitForTimeout(200);
  check(
    (await extra()).depth === 0 && (await page.evaluate(() => window.__game.seed)) !== seedBefore && !(await page.isVisible('.screen.death')),
    'New run starts a fresh dungeon at floor 1',
  );

  // --- M5: loot, chests, inventory, weapons, abilities, potions ---
  await page.evaluate(() => window.__game.restart());
  await waitSim(0.2);
  const chests = await page.evaluate(() => window.__game.worldState.chests.map((c) => ({ x: c.x, z: c.z })));
  check(chests.length > 0, `level has chests (${chests.length})`);
  const chestStart = await state();
  const bag0 = chestStart.player.bag;
  await page.evaluate(({ x, z }) => window.__game.debugTeleport(x, z), chests[0]);
  // Loot becomes collectible after a short delay; grab the drop positions and
  // step back before the player (standing on the chest) auto-collects them.
  await page.waitForFunction(() => window.__game.worldState.pickups.length > 0, null, { polling: 'raf', timeout: 10000 }).catch(() => {});
  const drops = await page.evaluate(({ x, z }) => {
    const g = window.__game;
    const d = g.worldState.pickups.map((p) => ({ ...p.pos }));
    g.debugTeleport(x, z);
    return d;
  }, chestStart.player);
  check(await page.evaluate(() => window.__game.worldState.chests[0].opened), 'walking up to a chest opens it');
  await page.screenshot({ path: `${outDir}/11-chest.png` });
  await waitSim(0.5);
  check(drops.length > 0, `chest spills loot (${drops.length})`);
  for (const d of drops) {
    await page.evaluate(({ x, z }) => window.__game.debugTeleport(x, z), d);
    await waitSim(0.15);
  }
  const afterLoot = await state();
  check(afterLoot.player.bag > bag0 || afterLoot.player.potions > 1, 'walking over loot picks it up');

  // Inventory: equip a spear from the bag via the UI.
  await page.evaluate(() => {
    const inv = window.__game.worldState.player.inventory;
    inv.bag.length = 0;
  });
  await page.evaluate(() => window.__game.debugGive('weapon', 'unique'));
  await page.evaluate(() => window.__game.debugGive('armor', 'rare'));
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  check(await page.isVisible('.inventory'), 'Tab opens the inventory');
  const simBefore = await page.evaluate(() => window.__game.simTime);
  await page.waitForTimeout(300);
  check((await page.evaluate(() => window.__game.simTime)) === simBefore, 'game is paused while inventory is open');
  await page.hover('[data-bag="0"]');
  await page.waitForTimeout(100);
  await page.screenshot({ path: `${outDir}/12-inventory.png` });
  const weaponBefore = (await state()).player.weapon;
  const newKind = await page.evaluate(() => window.__game.worldState.player.inventory.bag[0].weapon);
  await page.click('[data-bag="0"]');
  check((await state()).player.weapon === newKind && newKind !== undefined, `clicking a bag weapon equips it (${weaponBefore} -> ${newKind})`);
  const armorIdx = await page.evaluate(() => window.__game.worldState.player.inventory.bag.findIndex((i) => i.kind === 'armor'));
  const hpMaxBefore = (await state()).player.maxHp;
  await page.click(`[data-bag="${armorIdx}"]`);
  check((await state()).player.maxHp > hpMaxBefore, 'equipping armor raises max HP');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(100);
  check(!(await page.isVisible('.inventory')), 'Tab closes the inventory');
  check(await page.evaluate(() => window.__game.worldState.player.armorParts.length > 0), 'equipped armor is shown on the character');
  check(
    (await page.locator('[data-gear="weapon"] svg').count()) === 1 && (await page.locator('[data-gear="armor"].empty').count()) === 0,
    'HUD shows equipped weapon and armor',
  );
  await page.screenshot({ path: `${outDir}/12b-armor.png` });

  // Bow fires arrows; Q slam and E volley.
  await page.evaluate(() => {
    const p = window.__game.worldState.player;
    p.inventory.weapon = { ...p.inventory.weapon, kind: 'weapon', weapon: 'bow', damage: 9, mods: [] };
    p.refreshEquipment();
  });
  await page.mouse.move(900, 300);
  const shots0 = (await extra()).shots;
  await page.mouse.down();
  await waitSim(0.6);
  await page.mouse.up();
  check((await extra()).shots > shots0, 'bow attack fires an arrow');
  // Let any bow draw already in progress release before counting the volley.
  await waitSim(0.8);
  const shots1 = (await extra()).shots;
  await page.keyboard.press('KeyE');
  await waitSim(0.05);
  check((await extra()).shots - shots1 === 7, 'E fires a 7-arrow volley');
  await page.screenshot({ path: `${outDir}/13-volley.png` });
  await page.evaluate(() => window.__game.debugSpawn('grunt', 1.5, 0));
  await waitSim(0.1);
  const slamHp = (await target()).hp;
  await page.keyboard.press('KeyQ');
  await waitSim(0.7);
  const afterSlam = await target();
  check(!afterSlam || afterSlam.hp < slamHp, 'Q ground slam damages nearby enemies');

  // Potion heals.
  await page.evaluate(() => window.__game.debugSpawn('archer', 30, 30));
  await page.evaluate(() => {
    const p = window.__game.worldState.player;
    p.hp = 20;
    p.inventory.potions = 2;
  });
  await page.keyboard.press('Digit1');
  await waitSim(0.1);
  const healed = await state();
  check(healed.player.hp > 20 && healed.player.potions === 1, `1 drinks a potion (hp ${healed.player.hp})`);

  // --- Weapon powers ---
  await page.evaluate(() => window.__game.restart());
  await waitSim(0.2);
  await page.evaluate(() => {
    const g = window.__game;
    window.__fx = { power: {}, burn: 0, status: {} };
    g.events.on('power', (e) => (window.__fx.power[e.id] = (window.__fx.power[e.id] ?? 0) + 1));
    g.events.on('burnTick', () => window.__fx.burn++);
    g.events.on('status', (e) => (window.__fx.status[e.kind] = (window.__fx.status[e.kind] ?? 0) + 1));
  });
  /** Equip a sword with the given powers, surround the player with grunts, and swing for a while. */
  const testPowers = async (powers, crit) => {
    await page.evaluate(
      ({ powers, crit }) => {
        const g = window.__game;
        const p = g.worldState.player;
        p.inventory.weapon = { ...p.inventory.weapon, id: Math.random(), rarity: 'mythic', weapon: 'sword', damage: 6, powers };
        p.refreshEquipment();
        p.maxHp = p.hp = 100000;
        if (crit) p.stats.critChance = 1;
        g.debugSpawn('grunt', 1.3, 0);
        for (const [dx, dz] of [[1.5, 0.8], [1.5, -0.8], [2.2, 0]]) g.worldState.spawn(g.debugCreateEnemy('grunt'), p.pos.x + dx, p.pos.z + dz);
      },
      { powers, crit },
    );
    await page.mouse.move(...Object.values(await page.evaluate(() => {
      const p = window.__game.worldState.player.pos;
      return window.__game.debugWorldToScreen(p.x + 1.5, p.z);
    })));
    await page.mouse.down();
    await waitSim(2.5);
    await page.mouse.up();
    return page.evaluate(() => window.__fx);
  };
  let fxc = await testPowers([{ id: 'ignite', tier: 2 }, { id: 'chain', tier: 2 }], false);
  check(fxc.burn > 0 && fxc.status.burn > 0, `Ignite burns enemies (${fxc.burn} burn ticks)`);
  check((fxc.power.chain ?? 0) > 0, `Chain Lightning arcs between enemies (${fxc.power.chain ?? 0})`);
  await page.screenshot({ path: `${outDir}/17-powers.png` });
  fxc = await testPowers([{ id: 'shockwave', tier: 2 }, { id: 'detonate', tier: 2 }], true);
  check((fxc.power.shockwave ?? 0) > 0, `Shockwave triggers (${fxc.power.shockwave ?? 0})`);
  check((fxc.power.detonate ?? 0) > 0, `Detonate triggers on crits (${fxc.power.detonate ?? 0})`);
  fxc = await testPowers([{ id: 'frost', tier: 2 }], false);
  check((fxc.status.chill ?? 0) + (fxc.status.freeze ?? 0) > 0, 'Frost chills enemies');
  await page.evaluate(() => {
    window.__game.debugGive('weapon', 'mythic');
    const inv = window.__game.worldState.player.inventory;
    const it = inv.bag[inv.bag.length - 1];
    window.__mythic = { rarity: it.rarity, powers: it.powers?.length ?? 0 };
  });
  const myth = await page.evaluate(() => window.__mythic);
  check(myth.rarity === 'mythic' && myth.powers === 2, 'mythic weapons roll with two powers');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(150);
  await page.hover(`[data-bag="${(await state()).player.bag - 1}"]`);
  await page.waitForTimeout(120);
  check((await page.locator('.tooltip .tt-power').count()) === 2, 'tooltip lists the weapon powers');
  await page.screenshot({ path: `${outDir}/18-mythic-tooltip.png` });
  await page.keyboard.press('Tab');
  await page.waitForTimeout(100);

  // --- Level-up attribute choice ---
  await page.evaluate(() => window.__game.restart());
  await waitSim(0.2);
  await page.evaluate(() => {
    const g = window.__game;
    g.autoPerk = false;
    const p = g.worldState.player;
    p.hp = 30;
    p.gainXp(1000);
  });
  await page.waitForTimeout(200);
  const lv = await state();
  check((await extra()).levelUpOpen && (await page.locator('.levelup .perk').count()) === 3, `level-up offers 3 attributes (level ${lv.player.level})`);
  const simL = await page.evaluate(() => window.__game.simTime);
  await page.waitForTimeout(300);
  check((await page.evaluate(() => window.__game.simTime)) === simL, 'game is paused while choosing');
  await page.screenshot({ path: `${outDir}/16-levelup.png` });
  const before = await page.evaluate(() => {
    const p = window.__game.worldState.player;
    return { picks: p.progress.pendingPicks, potions: p.inventory.potions };
  });
  await page.keyboard.press('Digit1');
  await page.waitForTimeout(150);
  const after = await page.evaluate(() => {
    const p = window.__game.worldState.player;
    return { picks: p.progress.pendingPicks, potions: p.inventory.potions, perks: Object.values(p.progress.perks).reduce((a, b) => a + b, 0) };
  });
  check(after.perks === 1 && after.picks === before.picks - 1, `pressing 1 picks an attribute (${after.picks} picks left)`);
  check(after.potions >= before.potions, 'picking with 1 does not also drink a potion');
  // Click through any remaining picks.
  for (let i = 0; i < 20 && (await extra()).levelUpOpen; i++) {
    await page.click('.levelup .perk >> nth=1');
    await page.waitForTimeout(80);
  }
  check(!(await extra()).levelUpOpen && (await state()).player.alive, 'clicking a card picks it and resumes');
  await page.evaluate(() => (window.__game.autoPerk = true));

  // --- M6: particles, damage numbers, minimap, audio, HUD ---
  const fx = () => page.evaluate(() => window.__game.debugFx());
  await page.evaluate(() => window.__game.restart());
  await waitSim(0.3);
  check((await fx()).explored > 20, `minimap reveals the start room (${(await fx()).explored} tiles)`);
  check(await page.evaluate(() => {
    const c = document.querySelector('.minimap canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
    return false;
  }), 'minimap canvas has drawn pixels');
  check((await fx()).audio === 'running', `audio unlocks after input (${(await fx()).audio})`);
  await page.evaluate(() => window.__game.debugSpawn('grunt', 1.4, 0));
  await waitSim(0.1);
  await page.mouse.move(900, 300);
  await page.mouse.down();
  await waitSim(0.5);
  const fxHit = await fx();
  await page.mouse.up();
  check(fxHit.particles > 0, `hits spawn particles (${fxHit.particles})`);
  check(fxHit.damageNumbers > 0 && (await page.locator('.dmg:not(.hidden)').count()) > 0, `hits show damage numbers (${fxHit.damageNumbers})`);
  await page.screenshot({ path: `${outDir}/14-effects.png` });
  await page.evaluate(() => (window.__game.worldState.player.hp = 10));
  await page.evaluate(() => window.__game.worldState.player.applyDamage(1, 0, 0));
  await page.waitForTimeout(150);
  check(await page.locator('.vignette.low').count() === 1, 'low HP shows the warning vignette');
  const muted0 = (await fx()).muted;
  await page.keyboard.press('KeyM');
  await page.waitForTimeout(100);
  check((await fx()).muted !== muted0 && (await page.textContent('.sound-hint')).includes(muted0 ? 'on' : 'off'), 'M toggles sound');
  await page.keyboard.press('KeyM');
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(100);
  const simH = await page.evaluate(() => window.__game.simTime);
  await page.waitForTimeout(300);
  check(await page.isVisible('.controls-panel') && (await page.evaluate(() => window.__game.simTime)) === simH, 'H shows controls and pauses');
  await page.screenshot({ path: `${outDir}/15-controls.png` });
  await page.keyboard.press('KeyH');
  await page.waitForTimeout(100);
  check(!(await page.isVisible('.controls-panel')), 'H hides controls');
  const t0 = await page.evaluate(() => window.__game.simTime);
  await page.waitForTimeout(1000);
  const simRate = (await page.evaluate(() => window.__game.simTime)) - t0;
  check(simRate > 0.2, `fixed-step simulation keeps running (${simRate.toFixed(2)} sim s per real s)`);

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
