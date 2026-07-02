/* ============================================================
   Idle Cult — core game logic, state, save/load, simulation
   ============================================================ */

const Game = (() => {
  let state = null;

  /* ---------- formatting helpers ---------- */
  function fmtMoney(cents) {
    cents = Math.floor(cents);
    if (cents < 100) return cents + '¢';
    const d = cents / 100;
    const trim = n => n.toFixed(2).replace(/\.?0+$/, '');
    const suf = [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [v, s] of suf) if (d >= v) return '$' + trim(d / v) + s;
    return Number.isInteger(d) ? '$' + d : '$' + d.toFixed(2);
  }
  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60), r = s % 60;
    if (m < 60) return r ? m + 'm ' + r + 's' : m + 'm';
    const h = Math.floor(m / 60), rm = m % 60;
    return rm ? h + 'h ' + rm + 'm' : h + 'h';
  }
  function now() { return Date.now(); }

  /* ---------- derived stats ---------- */
  function multiplier() {
    return 1 + state.ritualLevel;
  }
  function has(itemId) { return (state.items[itemId] || 0) > 0; }
  function tabUnlocked(tabId) {
    const tab = TABS.find(t => t.id === tabId);
    if (!tab || !tab.needs) return true;
    if (tab.needs === '@prestige') return prestigeUnlocked();
    return has(tab.needs);
  }

  /* ---------- prestige ---------- */
  function prestigeUnlocked() { return !!state.prestigeUnlocked; }
  function pendingPrestige() { return Math.floor(state.totalEarned / CONFIG.prestigePer); }
  function prestigePoints() { return state.prestigePoints || 0; }
  function doPrestige() {
    const gain = pendingPrestige();
    if (gain < 1) return false;
    const kept = (state.prestigePoints || 0) + gain;
    state = freshState();
    state.prestigePoints = kept;
    state.prestigeUnlocked = true;
    state.hasPrestiged = true;
    startDaily();
    save();
    return { gained: gain, total: kept };
  }

  /* ---------- daily quests & scrolls ---------- */
  function startDaily() {
    state.dailyHarvests = 0;
    state.questClaimed = DAILY_QUESTS.map(() => false);
    state.dailyResetAt = now() + CONFIG.dailyResetSeconds * 1000;
  }
  function checkDailyReset() {
    if (!state.hasPrestiged) return;
    if (!state.dailyResetAt) { startDaily(); return; }
    if (now() >= state.dailyResetAt) startDaily();
  }
  function countHarvest(n) { if (state.hasPrestiged) state.dailyHarvests += (n || 1); }
  function dailyTimeLeft() { return Math.max(0, (state.dailyResetAt - now()) / 1000); }
  function questProgress(i) { return Math.min(state.dailyHarvests, DAILY_QUESTS[i].target); }
  function questClaimable(i) { return state.dailyHarvests >= DAILY_QUESTS[i].target && !state.questClaimed[i]; }
  function allQuestsClaimed() { return state.questClaimed.every(Boolean); }
  function dailyActive() { return state.hasPrestiged && !allQuestsClaimed(); }  // window open?
  function claimQuest(i) {
    if (!questClaimable(i)) return false;
    state.scrolls += DAILY_QUESTS[i].reward;
    state.questClaimed[i] = true;
    return true;
  }
  function avgPlantedSell(includeLast) {
    const vals = state.planters
      .map(p => p.seed || (includeLast ? p.lastSeed : null))
      .filter(Boolean)
      .map(id => SEEDS_BY_ID[id].sell);
    if (!vals.length) return 0;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  function ledgerPerSec(includeLast) {
    if (!has('ledger')) return 0;
    return CONFIG.ledgerRate * avgPlantedSell(includeLast) * multiplier();
  }
  function autoHarvest() { return has('auto-harvester'); }

  /* ---------- combat stats ---------- */
  function incHp(i) { return i < 2 ? 1 : i; }              // +1,+1,+2,+3,+4,+5,+6,…
  function hpAdded() { let s = 0; for (let i = 0; i < (state.hpBought || 0); i++) s += incHp(i); return s; }
  function maxHp() { return CONFIG.baseHp + hpAdded() + (state.hpBonus || 0); }
  function cashLootPct() { return (state.cashLootBought || 0) * 0.01; }
  function manaLootPct() { return (state.manaLootBought || 0) * 0.01; }
  function stepDollars(bought) {
    if (bought < COST_STEPS.length) return COST_STEPS[bought];
    let c = COST_STEPS[COST_STEPS.length - 1];
    for (let k = COST_STEPS.length; k <= bought; k++) c = Math.ceil(c * 1.3);
    return c;
  }
  function fieldCost(id) {                                  // returns {cash?, mana?}
    if (id === 'shield') return { mana: 10 };
    const bought = id === 'hp' ? (state.hpBought || 0) : id === 'cashloot' ? (state.cashLootBought || 0) : (state.manaLootBought || 0);
    return { cash: stepDollars(bought) * 100 };
  }
  function shieldTier() {
    if (has('ironwood')) return CONFIG.shieldTiers.ironwood;
    if (has('brazier')) return CONFIG.shieldTiers.brazier;
    return CONFIG.shieldTiers.base;
  }
  function fieldNextAmount(id) {                            // the increment the NEXT purchase grants
    if (id === 'hp') return incHp(state.hpBought || 0);
    if (id === 'shield') return shieldTier().minutes;
    return 1;                                               // +1%
  }

  /* ---------- rituals (tap a rune sequence) ---------- */
  function allCandlesLit() {
    return candleCount() >= CONFIG.candleCount && state.candles.slice(0, CONFIG.candleCount).every(c => c.lit);
  }
  function runeSeqStr() { return (state.runeSeq || []).join(''); }
  function applyRite(effect) {
    if (effect === 'halveRemaining') {
      state.planters.forEach(p => {
        if (p.seed && !isGrown(p)) {
          const g = effGrow(SEEDS_BY_ID[p.seed]);
          p.prog += (g - p.prog) * CONFIG.ritualHalve;
        }
      });
    } else if (effect === 'haste5') {
      state.hasteStacks = (state.hasteStacks || 0) + 1;   // +5% permanent plant speed
    }
  }
  function castSpellById(id) {
    const sp = SPELLS_BY_ID[id];
    if (!sp || state.mana < sp.mana) return false;
    state.mana -= sp.mana;
    applyRite(sp.effect);
    if (!state.discovered.includes(id)) state.discovered.push(id);
    return true;
  }
  // tap a rune letter → append to the sequence; cast when it exactly matches a spell
  function tapRune(letter) {
    if (!allCandlesLit()) return null;
    state.runeSeq = state.runeSeq || [];
    state.runeSeq.push(letter);
    state.runeSeqAt = now();
    const cur = runeSeqStr();
    const sp = SPELLS.find(s => s.seq.join('') === cur);
    if (sp) {
      if (state.mana < sp.mana) return { blocked: 'mana' };
      castSpellById(sp.id);
      state.runeSeq = [];
      return { cast: true, id: sp.id };
    }
    return null;
  }
  function clearRuneSeq() { state.runeSeq = []; }
  function toggleAutoCast(id) {
    if (!has('auto-ritual')) return;
    state.autoCast = state.autoCast || {};
    state.autoCast[id] = !state.autoCast[id];
    if (state.autoCast[id]) castSpellById(id);   // cast once immediately
  }
  function growthSpeed() {
    return 1 + (state.prestigePoints || 0) * CONFIG.prestigeSpeedPer
      + (has('thurible') ? CONFIG.thuribleHaste : 0)
      + (state.hasteStacks || 0) * CONFIG.hasteStackPct;
  }
  function effGrow(seed) { return seed.grow / growthSpeed(); }
  function speed() { return state.gameSpeed || 1; }        // selector level ×1…×10
  function speedFactor() { return Math.pow(2, speed() - 1); } // each level halves time (×1→1, ×5→16, ×10→512)
  function cycleSpeed() { state.gameSpeed = (speed() % CONFIG.maxSpeed) + 1; return state.gameSpeed; }
  function manaMax() { return CONFIG.manaMax; }
  function manaRegenPerSec() { return CONFIG.manaRegenPerHour / 3600; }
  function ritualManaCost() { return SPELLS[0].mana; }
  function slotCount() { return CONFIG.baseSlots + (state.items.planter || 0); }

  function itemPrice(item) { return item.base; }   // flat price
  function itemStockLeft(item) {
    const n = state.items[item.id] || 0;
    if (item.kind === 'once') return n > 0 ? 0 : 1;
    if (item.kind === 'capped') return Math.max(0, item.cap - n);
    return item.stockSize - (n % item.stockSize);
  }
  function itemSoldOut(item) {
    const n = state.items[item.id] || 0;
    if (item.kind === 'once') return n > 0;
    if (item.kind === 'capped') return n >= item.cap;
    return false;
  }
  function nextLockedSeed() {
    for (const s of SEEDS) if (!state.unlockedSeeds.includes(s.id)) return s;
    return null;
  }
  function ritualUnlocked() { return state.items[CONFIG.ritualUnlockItem] > 0; }
  function candleCount() { return state.items.candle || 0; }

  /* ---------- state setup ---------- */
  function makePlanter() { return { seed: null, prog: 0, repeat: false, lastSeed: null }; }
  function makeCandle() { return { lit: false }; }
  function freshState() {
    return {
      cents: CONFIG.startCents,
      totalEarned: CONFIG.startCents,
      gameSpeed: 1,
      ritualLevel: 0,
      ritualsPerformed: 0,
      unlockedSeeds: ['radish'],
      items: { planter: 0, candle: 0, map: 0, notebook: 0 },
      planters: [makePlanter()],
      candles: [makeCandle(), makeCandle(), makeCandle(), makeCandle()],
      mana: 0,
      discovered: ['rite_fdsa'],       // the first rite is given for free
      hasteStacks: 0,
      runeSeq: [], runeSeqAt: 0,
      autoCast: {},
      notes: {},
      hpBought: 0, cashLootBought: 0, manaLootBought: 0,
      combat: null,
      trinkets: [],
      prestigePoints: 0,
      prestigeUnlocked: false,
      hpBonus: 0,
      devMode: false,
      scrolls: 0,
      hasPrestiged: false,
      dailyHarvests: 0,
      questClaimed: [false, false, false, false],
      dailyResetAt: 0,
      lastTick: now(),
    };
  }
  function syncSlots() {
    while (state.planters.length < slotCount()) state.planters.push(makePlanter());
  }

  /* ---------- earning / unlocks ---------- */
  function earn(cents) { state.cents += cents; state.totalEarned += cents; checkUnlocks(); }
  function checkUnlocks() {
    for (const s of SEEDS)
      if (!state.unlockedSeeds.includes(s.id) && state.totalEarned >= s.unlockAt)
        state.unlockedSeeds.push(s.id);
    if (!state.prestigeUnlocked && state.totalEarned >= CONFIG.prestigeUnlockEarned) state.prestigeUnlocked = true;
  }

  /* ---------- planter actions ---------- */
  function plant(seedId, planterIndex) {
    const seed = SEEDS_BY_ID[seedId];
    if (!seed || !state.unlockedSeeds.includes(seedId)) return false;
    if (state.cents < seed.cost) return false;
    let p;
    if (planterIndex != null) { p = state.planters[planterIndex]; if (!p || p.seed) return false; }
    else { p = state.planters.find(pl => !pl.seed); if (!p) return false; }
    state.cents -= seed.cost;
    p.seed = seedId; p.lastSeed = seedId; p.prog = 0;
    return true;
  }
  function isGrown(p) {
    if (!p.seed) return false;
    return p.prog >= effGrow(SEEDS_BY_ID[p.seed]);
  }
  function progress(p) {
    if (!p.seed) return 0;
    return Math.min(1, p.prog / effGrow(SEEDS_BY_ID[p.seed]));
  }
  function timeLeft(p) {                                // real seconds left at current speed
    if (!p.seed) return 0;
    return Math.max(0, (effGrow(SEEDS_BY_ID[p.seed]) - p.prog) / speedFactor());
  }
  function sell(planterIndex) {
    const p = state.planters[planterIndex];
    if (!p || !p.seed || !isGrown(p)) return false;
    earn(SEEDS_BY_ID[p.seed].sell * multiplier());
    countHarvest(1);
    p.seed = null; p.prog = 0;          // keep lastSeed so the spot can be replanted
    return true;
  }
  // "save the spot": quick MANUAL replant of the seed this planter last held
  function replantSpot(planterIndex) {
    const p = state.planters[planterIndex];
    if (!p || p.seed || !p.lastSeed) return false;
    return plant(p.lastSeed, planterIndex);
  }
  function toggleRepeat(planterIndex) {
    const p = state.planters[planterIndex];
    if (p) p.repeat = !p.repeat;       // whether the slot keeps its plant for quick replant
  }

  /* ---------- shop ---------- */
  function buyItem(itemId) {
    const item = ITEMS_BY_ID[itemId];
    if (!item || itemSoldOut(item)) return false;
    const price = itemPrice(item);
    if (state.cents < price) return false;
    state.cents -= price;
    state.items[itemId] = (state.items[itemId] || 0) + 1;
    if (item.id === 'planter') syncSlots();
    // setting the fourth candle gifts a pool of free mana
    if (item.id === 'candle' && state.items.candle === CONFIG.candleCount) {
      state.mana = Math.min(manaMax(), state.mana + CONFIG.candleFreeMana);
    }
    return true;
  }

  /* ---------- candles (tap to light) ---------- */
  function toggleCandle(i) {
    const c = state.candles[i];
    if (!c || i >= candleCount()) return;
    c.lit = !c.lit;
  }

  /* ---------- combat / expeditions ---------- */
  function combat() { return state.combat; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function irnd(a, b) { return Math.floor(rnd(a, b + 1)); }

  function startExpedition(areaId) {
    if (state.combat && state.combat.status === 'running') return false;
    const area = AREAS_BY_ID[areaId]; if (!area) return false;
    state.combat = {
      areaId, elapsed: 0, duration: area.duration,
      hp: maxHp(), runCash: 0, runMana: 0, log: [],
      nextEventAt: rnd(CONFIG.eventMin, CONFIG.eventMax),
      shieldRemaining: 0, status: 'running', paused: false,
    };
    return true;
  }
  function togglePause() { const c = state.combat; if (c && c.status === 'running') c.paused = !c.paused; }

  function fireEvent(c, area) {
    const total = area.events.reduce((s, e) => s + e.w, 0);
    let r = Math.random() * total, ev = area.events[0];
    for (const e of area.events) { if ((r -= e.w) <= 0) { ev = e; break; } }
    let dmg = ev.dmg || 0;
    if (dmg && c.shieldRemaining > 0) {
      const block = shieldTier().block;
      let blocked = 0; for (let i = 0; i < dmg; i++) if (Math.random() < block) blocked++; dmg -= blocked;
    }
    const cash = ev.cash ? irnd(ev.cash[0], ev.cash[1]) : 0;
    const mana = ev.mana ? irnd(ev.mana[0], ev.mana[1]) : 0;
    c.hp -= dmg; c.runCash += cash; c.runMana += mana;
    c.log.push({ t: Math.round(c.elapsed), name: ev.name, dmg, cash, mana });
    if (c.log.length > 60) c.log.shift();
    if (c.hp <= 0) { c.hp = 0; c.status = 'dead'; }
  }

  function tickCombat(sdt) {
    const c = state.combat;
    if (!c || c.status !== 'running' || c.paused) return;
    const area = AREAS_BY_ID[c.areaId];
    sdt *= (has('compass') ? CONFIG.compassSpeed : 1);   // compass: faster expeditions
    c.elapsed += sdt;
    if (c.shieldRemaining > 0) c.shieldRemaining = Math.max(0, c.shieldRemaining - sdt);
    // poultice: passive healing (+1 heart every N seconds), never above max
    if (has('poultice')) {
      c.healAcc = (c.healAcc || 0) + sdt;
      while (c.healAcc >= CONFIG.poulticeHealEvery) { c.healAcc -= CONFIG.poulticeHealEvery; if (c.hp < maxHp()) c.hp++; }
    }
    let guard = 0;
    while (c.status === 'running' && c.elapsed >= c.nextEventAt && c.nextEventAt < c.duration && guard++ < 50) {
      fireEvent(c, area);
      c.nextEventAt += rnd(CONFIG.eventMin, CONFIG.eventMax);
    }
    if (c.status === 'running' && c.elapsed >= c.duration) {
      c.elapsed = c.duration; c.status = 'complete';
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      c.reward = { cash: clamp(c.runCash, area.cashMin, area.cashMax), mana: clamp(c.runMana, area.manaMin, area.manaMax) };
    }
  }

  function buyField(id, qty) {
    const c = state.combat; if (!c || c.status !== 'running') return false;
    qty = qty || 1; let bought = 0;
    for (let n = 0; n < qty; n++) {
      const cost = fieldCost(id);
      if (cost.mana != null) { if (!spendMana(cost.mana)) break; }
      else if (cost.cash != null) { if (!spendCash(cost.cash)) break; }
      if (id === 'shield') { c.shieldRemaining += shieldTier().minutes * 60; }
      else if (id === 'hp') { const inc = incHp(state.hpBought || 0); state.hpBought = (state.hpBought || 0) + 1; c.hp += inc; }
      else if (id === 'cashloot') { state.cashLootBought = (state.cashLootBought || 0) + 1; }
      else if (id === 'manaloot') { state.manaLootBought = (state.manaLootBought || 0) + 1; }
      bought++;
    }
    return bought > 0;
  }
  // spend from banked resources first, then from this run's uncollected loot
  function spendCash(amt) {
    const c = state.combat;
    const pool = state.cents + (c ? c.runCash : 0);
    if (pool < amt) return false;
    if (state.cents >= amt) state.cents -= amt;
    else { const rem = amt - state.cents; state.cents = 0; c.runCash -= rem; }
    return true;
  }
  function spendMana(amt) {
    const c = state.combat;
    const pool = state.mana + (c ? c.runMana : 0);
    if (pool < amt) return false;
    if (state.mana >= amt) state.mana -= amt;
    else { const rem = amt - state.mana; state.mana = 0; c.runMana -= rem; }
    return true;
  }

  // Take the loot and end the run. mode: 'complete' (balanced reward) or 'flee' (what you have).
  function collectLoot() {
    const c = state.combat; if (!c || c.status === 'dead') return null;   // death = lose all loot
    const area = AREAS_BY_ID[c.areaId];
    let cash, mana, complete = c.status === 'complete';
    if (complete && c.reward) { cash = c.reward.cash; mana = c.reward.mana; }
    else { cash = Math.min(c.runCash, area.cashMax); mana = Math.min(c.runMana, area.manaMax); }
    cash = Math.round(cash * (1 + cashLootPct()));
    mana = Math.round(mana * (1 + manaLootPct()));
    earn(cash); state.mana += mana;
    let trinket = null;
    if (complete && area.trinketChance > 0 && Math.random() < area.trinketChance) {
      trinket = { id: 't' + (state.trinkets.length + 1), area: area.id };
      state.trinkets.push(trinket);
    }
    state.combat = null;
    return { cash, mana, trinket };
  }
  function dismissDeath() { if (state.combat && state.combat.status === 'dead') state.combat = null; }

  /* ---------- live simulation tick ---------- */
  function tick(t) {
    const dt = (t - state.lastTick) / 1000;
    if (dt <= 0) { state.lastTick = t; return; }
    if (dt > 10) { applyOffline(); return; } // a real gap (sleep/close) → real-time offline path
    state.lastTick = t;
    checkDailyReset();
    // rune sequence auto-clears after a while of no taps
    if (state.runeSeq && state.runeSeq.length && (t - (state.runeSeqAt || 0)) / 1000 > CONFIG.runeSeqTimeout) state.runeSeq = [];
    // auto-ritual: auto-cast enabled rites while mana allows
    if (has('auto-ritual') && state.autoCast) {
      for (const id in state.autoCast) if (state.autoCast[id]) castSpellById(id);
    }
    const sdt = dt * speedFactor();       // sped-up game seconds this frame
    state.mana += manaRegenPerSec() * sdt;
    const inc = ledgerPerSec(false) * sdt; if (inc > 0) earn(inc);
    const auto = autoHarvest();
    for (const p of state.planters) {
      if (p.seed) {
        if (!isGrown(p)) p.prog += sdt;
        // auto-harvester: harvest ripe + replant same crop, 1 mana per crop
        if (isGrown(p) && auto && state.mana >= CONFIG.autoHarvestMana) {
          state.mana -= CONFIG.autoHarvestMana;
          earn(SEEDS_BY_ID[p.seed].sell * multiplier());
          countHarvest(1);
          const s2 = SEEDS_BY_ID[p.lastSeed];
          if (p.lastSeed && state.cents >= s2.cost) { state.cents -= s2.cost; p.prog = 0; }
          else { p.seed = null; p.prog = 0; }
        }
      } else if (auto && p.repeat && p.lastSeed) {
        // auto-plant a saved empty spot (also 1 mana)
        const s2 = SEEDS_BY_ID[p.lastSeed];
        if (state.mana >= CONFIG.autoHarvestMana && state.cents >= s2.cost) {
          state.mana -= CONFIG.autoHarvestMana; state.cents -= s2.cost; p.seed = p.lastSeed; p.prog = 0;
        }
      }
    }
    tickCombat(sdt);
  }

  /* ---------- offline progress (closed-form) ---------- */
  function applyOffline() {
    const t = now();
    checkDailyReset();                          // daily quests can roll over while away
    state.runeSeq = [];                          // an in-progress rune tap resets after a gap
    let dt = (t - state.lastTick) / 1000;
    if (dt <= 1) { state.lastTick = t; return null; }
    dt = Math.min(dt, CONFIG.offlineCapSeconds);
    const mult = multiplier();
    let gained = 0;
    // ledger passive income (based on what is/was planted)
    gained += ledgerPerSec(true) * dt;
    // offline advances at real time (game-speed only applies to active play).
    // Auto-harvester cycles are limited by the mana that accrues while away.
    const auto = autoHarvest();
    let manaAvail = state.mana + manaRegenPerSec() * dt;
    for (const p of state.planters) {
      if (!p.seed) continue;
      const seed = SEEDS_BY_ID[p.seed];
      const g = effGrow(seed);
      p.prog += dt;
      if (p.prog < g) continue;                    // still growing
      if (!auto) { p.prog = g; continue; }         // ripe, waits for a manual sell
      let cycles = 1 + Math.floor((p.prog - g) / g);
      cycles = Math.min(cycles, Math.floor(manaAvail / CONFIG.autoHarvestMana));
      if (cycles <= 0) { p.prog = g; continue; }   // ripe but no mana → wait
      manaAvail -= cycles * CONFIG.autoHarvestMana;
      gained += cycles * (seed.sell * mult - seed.cost);
      countHarvest(cycles);
      p.prog = (p.prog - g) % g;                    // carry remainder into the next crop
    }
    if (gained > 0) earn(gained);
    state.mana = manaAvail;                          // leftover (includes accrued regen)
    state.lastTick = t;
    return gained > 0 ? { seconds: dt, gained } : null;
  }

  /* ---------- save / load ---------- */
  function save() {
    try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(state)); } catch (e) {}
  }
  function load() {
    try {
      const raw = localStorage.getItem(CONFIG.saveKey);
      if (raw) {
        state = Object.assign(freshState(), JSON.parse(raw));
        state.items = Object.assign({ planter: 0, candle: 0, map: 0, notebook: 0 }, state.items || {});
        if (typeof state.mana !== 'number') state.mana = 0;
        // migrate rituals to the sequence system
        state.discovered = (Array.isArray(state.discovered) ? state.discovered : []).filter(id => SPELLS_BY_ID[id]);
        if (!state.discovered.includes('rite_fdsa')) state.discovered.unshift('rite_fdsa');
        if (typeof state.hasteStacks !== 'number') state.hasteStacks = 0;
        if (!Array.isArray(state.runeSeq)) state.runeSeq = [];
        if (typeof state.runeSeqAt !== 'number') state.runeSeqAt = 0;
        if (!state.autoCast || typeof state.autoCast !== 'object') state.autoCast = {};
        if (!state.notes || typeof state.notes !== 'object') state.notes = {};
        if (!Array.isArray(state.trinkets)) state.trinkets = [];
        ['hpBought', 'cashLootBought', 'manaLootBought', 'prestigePoints', 'hpBonus', 'scrolls', 'dailyHarvests', 'dailyResetAt'].forEach(k => { if (typeof state[k] !== 'number') state[k] = 0; });
        if (typeof state.prestigeUnlocked !== 'boolean') state.prestigeUnlocked = false;
        if (typeof state.devMode !== 'boolean') state.devMode = false;
        if (typeof state.hasPrestiged !== 'boolean') state.hasPrestiged = false;
        if (!Array.isArray(state.questClaimed) || state.questClaimed.length !== DAILY_QUESTS.length) state.questClaimed = DAILY_QUESTS.map(() => false);
        checkDailyReset();
        if (state.combat === undefined) state.combat = null;
        if (!(state.gameSpeed >= 1 && state.gameSpeed <= CONFIG.maxSpeed)) state.gameSpeed = 1;
        if (!Array.isArray(state.planters) || !state.planters.length) state.planters = [makePlanter()];
        state.planters = state.planters.map(p => {
          const np = Object.assign(makePlanter(), p);
          if (typeof np.prog !== 'number') np.prog = 0;   // migrate old timestamp saves
          delete np.start;
          return np;
        });
        if (!Array.isArray(state.candles) || state.candles.length !== 4)
          state.candles = [makeCandle(), makeCandle(), makeCandle(), makeCandle()];
        state.candles = state.candles.map(c => Object.assign(makeCandle(), c));
        if (!Array.isArray(state.unlockedSeeds) || !state.unlockedSeeds.length) state.unlockedSeeds = ['radish'];
        syncSlots(); checkUnlocks();
        return true;
      }
    } catch (e) {}
    state = freshState();
    return false;
  }
  function reset() { state = freshState(); save(); }
  function setNote(spellId, text) { state.notes[spellId] = text; }

  /* ---------- dev panel ---------- */
  function setDevMode(on) { state.devMode = !!on; save(); }
  function devMode() { return !!state.devMode; }
  function devGive(kind, amount) {
    if (kind === 'cash') { state.cents += amount; state.totalEarned += amount; checkUnlocks(); }
    else if (kind === 'mana') state.mana += amount;
    else if (kind === 'prestige') { state.prestigePoints = (state.prestigePoints || 0) + amount; state.prestigeUnlocked = true; }
    else if (kind === 'cashloot') state.cashLootBought = (state.cashLootBought || 0) + amount;
    else if (kind === 'manaloot') state.manaLootBought = (state.manaLootBought || 0) + amount;
    else if (kind === 'hp') state.hpBonus = (state.hpBonus || 0) + amount;
    else if (kind === 'scrolls') state.scrolls = (state.scrolls || 0) + amount;
    save();
  }

  /* ---------- public API ---------- */
  return {
    get state() { return state; },
    fmtMoney, fmtTime, now,
    multiplier, growthSpeed, effGrow, slotCount, speed, speedFactor, cycleSpeed,
    setDevMode, devMode, devGive,
    manaRegenPerSec, ritualManaCost, has, tabUnlocked, avgPlantedSell, ledgerPerSec, autoHarvest,
    maxHp, hpAdded, cashLootPct, manaLootPct, fieldCost, fieldNextAmount,
    itemPrice, itemStockLeft, itemSoldOut, nextLockedSeed,
    ritualUnlocked, candleCount, toggleCandle,
    allCandlesLit, runeSeqStr, tapRune, clearRuneSeq, castSpellById, toggleAutoCast,
    combat, startExpedition, togglePause, buyField, collectLoot, dismissDeath, shieldTier,
    prestigeUnlocked, pendingPrestige, prestigePoints, doPrestige,
    dailyActive, dailyTimeLeft, questProgress, questClaimable, claimQuest, allQuestsClaimed,
    plant, sell, replantSpot, toggleRepeat, buyItem, setNote,
    isGrown, progress, timeLeft,
    tick, applyOffline, save, load, reset,
    SEEDS, ITEMS, TABS, RUNES, SPELLS, AREAS, FIELD_UPGRADES, AREAS_BY_ID, PATCH_NOTES, DAILY_QUESTS,
    SEEDS_BY_ID, ITEMS_BY_ID, RUNES_BY_ID, SPELLS_BY_ID, CONFIG,
  };
})();
