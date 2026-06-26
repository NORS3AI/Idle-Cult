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
    const suf = [[1e15, 'Q'], [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']];
    for (const [v, s] of suf) if (d >= v) return '$' + (d / v).toFixed(2) + s;
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
    return 1 + state.ritualLevel + (state.items.notebook > 0 ? 1 : 0);
  }
  function hasteActive() { return now() < (state.hasteUntil || 0); }
  function growthSpeed() {
    return 1 + (hasteActive() ? CONFIG.quickenSpeedBonus : 0);
  }
  function manaMax() { return CONFIG.manaBase + CONFIG.manaPerCandle * candleCount(); }
  function manaRegen() { return CONFIG.manaRegenBase + CONFIG.manaRegenPerCandle * candleCount(); }
  function effGrow(seed) { return seed.grow / growthSpeed(); }
  function slotCount() { return CONFIG.baseSlots + (state.items.planter || 0); }

  function itemPrice(item) {
    if (item.kind === 'once') return item.base;
    const n = state.items[item.id] || 0;
    return Math.ceil(item.base * Math.pow(item.priceMul, n));
  }
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
  function devotionCost() {
    return Math.ceil(CONFIG.devotionBaseCost * Math.pow(CONFIG.devotionCostMul, state.ritualLevel));
  }
  function spellPattern() {                       // current lit runes, null where unlit/empty
    return state.candles.map(c => (c.lit ? c.rune : null));
  }
  function matchedSpell() {
    if (candleCount() < CONFIG.candleCount) return null;
    const cur = spellPattern();
    if (cur.some(r => r == null)) return null;
    return SPELLS.find(sp => sp.pattern.every((r, i) => r === cur[i])) || null;
  }
  function canCast(sp) {
    if (!sp) return false;
    if (state.mana < sp.mana) return false;
    if (sp.type === 'prestige' && state.cents < devotionCost()) return false;
    return true;
  }

  /* ---------- state setup ---------- */
  function makePlanter() { return { seed: null, start: null, repeat: false, lastSeed: null }; }
  function makeCandle() { return { lit: false, rune: RUNES[0].id }; }
  function freshState() {
    return {
      cents: CONFIG.startCents,
      totalEarned: CONFIG.startCents,
      ritualLevel: 0,
      ritualsPerformed: 0,
      unlockedSeeds: ['radish'],
      items: { planter: 0, candle: 0, map: 0, notebook: 0 },
      planters: [makePlanter()],
      candles: [makeCandle(), makeCandle(), makeCandle(), makeCandle()],
      mana: 0,
      hasteUntil: 0,
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
    p.seed = seedId; p.lastSeed = seedId; p.start = now();
    return true;
  }
  function isGrown(p, t) {
    if (!p.seed) return false;
    return (t - p.start) / 1000 >= effGrow(SEEDS_BY_ID[p.seed]);
  }
  function progress(p, t) {
    if (!p.seed) return 0;
    return Math.min(1, ((t - p.start) / 1000) / effGrow(SEEDS_BY_ID[p.seed]));
  }
  function timeLeft(p, t) {
    if (!p.seed) return 0;
    return Math.max(0, effGrow(SEEDS_BY_ID[p.seed]) - (t - p.start) / 1000);
  }
  function sell(planterIndex) {
    const p = state.planters[planterIndex];
    if (!p || !p.seed || !isGrown(p, now())) return false;
    earn(SEEDS_BY_ID[p.seed].sell * multiplier());
    p.seed = null; p.start = null;
    return true;
  }
  function toggleRepeat(planterIndex) {
    const p = state.planters[planterIndex];
    if (p) p.repeat = !p.repeat;
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
    return true;
  }

  /* ---------- ritual: candles, runes, spells ---------- */
  function toggleCandle(i) {
    const c = state.candles[i];
    if (!c || i >= candleCount()) return;
    c.lit = !c.lit;
  }
  function setRune(i, runeId) {
    const c = state.candles[i];
    if (!c || i >= candleCount() || !RUNES_BY_ID[runeId]) return;
    c.rune = runeId;
    c.lit = true;            // choosing a rune lights the candle
  }
  function cycleRune(i) {
    const c = state.candles[i];
    if (!c || i >= candleCount()) return;
    const idx = RUNES.findIndex(r => r.id === c.rune);
    c.rune = RUNES[(idx + 1) % RUNES.length].id;
    c.lit = true;
  }

  function castSpell() {
    const sp = matchedSpell();
    if (!sp) return null;
    if (state.mana < sp.mana) return { id: sp.id, name: sp.name, blocked: true, reason: 'mana', need: sp.mana };
    if (sp.type === 'prestige' && state.cents < devotionCost())
      return { id: sp.id, name: sp.name, blocked: true, reason: 'gold', need: devotionCost() };

    state.mana -= sp.mana;
    let result = { id: sp.id, name: sp.name };

    if (sp.id === 'quicken') {
      state.hasteUntil = now() + sp.duration * 1000;
    } else if (sp.id === 'bloom') {
      const t = now();
      state.planters.forEach(p => { if (p.seed) p.start = t - effGrow(SEEDS_BY_ID[p.seed]) * 1000 - 50; });
    } else if (sp.id === 'plenty') {
      const best = state.unlockedSeeds.map(id => SEEDS_BY_ID[id]).sort((a, b) => b.sell - a.sell)[0];
      const gain = best.sell * multiplier() * 10;
      earn(gain);
      result.gain = gain;
    } else if (sp.id === 'devotion') {
      state.ritualLevel += 1;
      state.ritualsPerformed += 1;
      state.cents = CONFIG.startCents;
      state.items.planter = 0;
      state.items.candle = 0;
      state.planters = [makePlanter()];
      state.candles = [makeCandle(), makeCandle(), makeCandle(), makeCandle()];
      state.mana = 0;
      result.prestige = true;
    }
    // snuff candles after a successful cast
    state.candles.forEach(c => { c.lit = false; });
    return result;
  }

  /* ---------- live simulation tick ---------- */
  function tick(t) {
    const dt = Math.max(0, (t - state.lastTick) / 1000);
    state.mana = Math.min(manaMax(), state.mana + manaRegen() * dt);
    for (const p of state.planters) {
      if (p.seed) {
        if (isGrown(p, t) && p.repeat) {
          earn(SEEDS_BY_ID[p.seed].sell * multiplier());
          const seed = SEEDS_BY_ID[p.lastSeed];
          if (p.lastSeed && state.cents >= seed.cost) { state.cents -= seed.cost; p.seed = p.lastSeed; p.start = t; }
          else { p.seed = null; p.start = null; }
        }
      } else if (p.repeat && p.lastSeed) {
        const seed = SEEDS_BY_ID[p.lastSeed];
        if (state.cents >= seed.cost) { state.cents -= seed.cost; p.seed = p.lastSeed; p.start = t; }
      }
    }
    state.lastTick = t;
  }

  /* ---------- offline progress (closed-form) ---------- */
  function applyOffline() {
    const t = now();
    let dt = (t - state.lastTick) / 1000;
    if (dt <= 1) { state.lastTick = t; return null; }
    dt = Math.min(dt, CONFIG.offlineCapSeconds);
    const mult = multiplier();
    // offline assumes no haste (buff would have expired) → base grow time
    let gained = 0;
    for (const p of state.planters) {
      if (p.seed) {
        const seed = SEEDS_BY_ID[p.seed];
        const g = seed.grow;
        const already = (state.lastTick - p.start) / 1000;
        const left = Math.max(0, g - already);
        if (dt < left) continue;
        if (!p.repeat) { p.start = t - g * 1000; continue; }
        const cycles = 1 + Math.floor((dt - left) / g);
        gained += cycles * (seed.sell * mult - seed.cost);
        p.start = t - ((dt - left) % g) * 1000;
      } else if (p.repeat && p.lastSeed) {
        const seed = SEEDS_BY_ID[p.lastSeed];
        const g = seed.grow;
        const cycles = Math.floor(dt / g);
        if (cycles > 0) {
          gained += cycles * (seed.sell * mult - seed.cost);
          p.seed = p.lastSeed; p.start = t - (dt % g) * 1000;
        }
      }
    }
    if (gained > 0) earn(gained);
    state.mana = Math.min(manaMax(), state.mana + manaRegen() * dt);
    state.hasteUntil = 0;
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
        if (!Array.isArray(state.planters) || !state.planters.length) state.planters = [makePlanter()];
        state.planters = state.planters.map(p => Object.assign(makePlanter(), p));
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

  /* ---------- public API ---------- */
  return {
    get state() { return state; },
    fmtMoney, fmtTime, now,
    multiplier, growthSpeed, hasteActive, effGrow, slotCount,
    manaMax, manaRegen,
    itemPrice, itemStockLeft, itemSoldOut, nextLockedSeed,
    ritualUnlocked, candleCount, devotionCost,
    spellPattern, matchedSpell, canCast,
    plant, sell, toggleRepeat, buyItem,
    toggleCandle, setRune, cycleRune, castSpell,
    isGrown, progress, timeLeft,
    tick, applyOffline, save, load, reset,
    SEEDS, ITEMS, RUNES, SPELLS, SEEDS_BY_ID, ITEMS_BY_ID, RUNES_BY_ID, SPELLS_BY_ID, CONFIG,
  };
})();
