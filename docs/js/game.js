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
    return !tab || !tab.needs || has(tab.needs);
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

  /* ---------- rituals (one of each rune) ---------- */
  function ritualReady() {
    if (candleCount() < CONFIG.candleCount) return false;
    const lit = state.candles.filter(c => c.lit);
    if (lit.length < CONFIG.candleCount) return false;
    return new Set(lit.map(c => c.rune)).size === CONFIG.candleCount; // one of each
  }
  function activeRite() {
    // future: pick by exact rune arrangement. For now, the one known rite.
    return SPELLS[0];
  }
  function canCastRitual() {
    return ritualReady() && state.mana >= ritualManaCost();
  }
  function growthSpeed() { return 1; }                 // base; Research may raise this later
  function effGrow(seed) { return seed.grow / growthSpeed(); }
  function speed() { return state.gameSpeed || 1; }    // game-speed multiplier ×1…×5
  function cycleSpeed() { state.gameSpeed = (speed() % CONFIG.maxSpeed) + 1; return state.gameSpeed; }
  function manaMax() { return CONFIG.manaMax; }
  function manaRegenPerSec() { return CONFIG.manaRegenPerHour / 3600; }
  function ritualManaCost() { return SPELLS[0].mana; }
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

  /* ---------- state setup ---------- */
  function makePlanter() { return { seed: null, prog: 0, repeat: false, lastSeed: null }; }
  function makeCandle() { return { lit: false, rune: RUNES[0].id }; }
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
      discovered: [],
      notes: {},
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
    return Math.max(0, (effGrow(SEEDS_BY_ID[p.seed]) - p.prog) / speed());
  }
  function sell(planterIndex) {
    const p = state.planters[planterIndex];
    if (!p || !p.seed || !isGrown(p)) return false;
    earn(SEEDS_BY_ID[p.seed].sell * multiplier());
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

  function castRitual() {
    if (!ritualReady()) return null;
    const rite = activeRite();
    if (state.mana < rite.mana) return { blocked: true, reason: 'mana', need: rite.mana };
    state.mana -= rite.mana;

    if (rite.effect === 'halveRemaining') {
      state.planters.forEach(p => {
        if (p.seed && !isGrown(p)) {
          const g = effGrow(SEEDS_BY_ID[p.seed]);
          p.prog += (g - p.prog) * CONFIG.ritualHalve;   // advance halfway to ripe
        }
      });
    }
    // remember that this rite was performed (for the Notebook), effect still hidden
    if (!state.discovered.includes(rite.id)) state.discovered.push(rite.id);
    return { cast: true, id: rite.id };
  }

  /* ---------- live simulation tick ---------- */
  function tick(t) {
    const dt = (t - state.lastTick) / 1000;
    if (dt <= 0) { state.lastTick = t; return; }
    if (dt > 10) { applyOffline(); return; } // a real gap (sleep/close) → real-time offline path
    state.lastTick = t;
    const sdt = dt * speed();             // sped-up game seconds this frame
    state.mana = Math.min(manaMax(), state.mana + manaRegenPerSec() * sdt);
    const inc = ledgerPerSec(false) * sdt; if (inc > 0) earn(inc);
    for (const p of state.planters) {
      if (!p.seed) continue;
      if (!isGrown(p)) p.prog += sdt;
      if (isGrown(p) && autoHarvest()) {   // auto-harvester only auto-SELLS (planting is manual)
        earn(SEEDS_BY_ID[p.seed].sell * multiplier()); p.seed = null; p.prog = 0;
      }
    }
  }

  /* ---------- offline progress (closed-form) ---------- */
  function applyOffline() {
    const t = now();
    let dt = (t - state.lastTick) / 1000;
    if (dt <= 1) { state.lastTick = t; return null; }
    dt = Math.min(dt, CONFIG.offlineCapSeconds);
    const mult = multiplier();
    let gained = 0;
    // ledger passive income (based on what is/was planted)
    gained += ledgerPerSec(true) * dt;
    // planters: nothing is auto-planted while away. A crop matures and waits;
    // the auto-harvester sells it once when ripe.
    // offline advances at real time (game-speed only applies to active play)
    for (const p of state.planters) {
      if (!p.seed) continue;
      const seed = SEEDS_BY_ID[p.seed];
      const g = effGrow(seed);
      p.prog += dt;
      if (p.prog < g) continue;                    // still growing
      if (autoHarvest()) { gained += seed.sell * mult; p.seed = null; p.prog = 0; }
      else { p.prog = g; }                          // ripe, waiting for a manual sell
    }
    if (gained > 0) earn(gained);
    state.mana = Math.min(manaMax(), state.mana + manaRegenPerSec() * dt);
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
        if (!Array.isArray(state.discovered)) state.discovered = [];
        if (!state.notes || typeof state.notes !== 'object') state.notes = {};
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

  /* ---------- public API ---------- */
  return {
    get state() { return state; },
    fmtMoney, fmtTime, now,
    multiplier, growthSpeed, effGrow, slotCount, speed, cycleSpeed,
    manaMax, manaRegenPerSec, ritualManaCost, has, tabUnlocked, avgPlantedSell, ledgerPerSec, autoHarvest,
    itemPrice, itemStockLeft, itemSoldOut, nextLockedSeed,
    ritualUnlocked, candleCount,
    ritualReady, canCastRitual, activeRite, castRitual,
    plant, sell, replantSpot, toggleRepeat, buyItem,
    toggleCandle, setRune, cycleRune, setNote,
    isGrown, progress, timeLeft,
    tick, applyOffline, save, load, reset,
    SEEDS, ITEMS, TABS, RUNES, SPELLS, SEEDS_BY_ID, ITEMS_BY_ID, RUNES_BY_ID, SPELLS_BY_ID, CONFIG,
  };
})();
