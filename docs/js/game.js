/* ============================================================
   Idle Cult — core game logic, state, save/load, simulation
   ============================================================ */

const Game = (() => {
  let state = null;

  /* ---------- formatting helpers ---------- */
  // suffix scale: every 1000×  (k, m, b, t, Qa, Qi, No, De, …)
  const SUFFIXES = ['', 'k', 'm', 'b', 't', 'Qa', 'Qi', 'No', 'De', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'SxD', 'SpD', 'OcD', 'NoD', 'Vg'];
  function fmtMoney(cents) {
    cents = Math.floor(cents);
    if (cents < 100) return cents + '¢';
    const d = cents / 100;
    if (d < 1e6) return '$' + d.toLocaleString('en-US', { maximumFractionDigits: 2 });  // commas below a million
    let i = Math.floor(Math.log10(d) / 3);
    if (i >= SUFFIXES.length) i = SUFFIXES.length - 1;
    const val = (d / Math.pow(1000, i)).toFixed(2).replace(/\.?0+$/, '');
    return '$' + val + SUFFIXES[i];
  }
  function fmtNum(n) {                                   // counts (mana, blood, scrolls)
    n = Math.floor(n);
    if (n < 1e6) return n.toLocaleString('en-US');
    let i = Math.floor(Math.log10(n) / 3);
    if (i >= SUFFIXES.length) i = SUFFIXES.length - 1;
    return (n / Math.pow(1000, i)).toFixed(2).replace(/\.?0+$/, '') + SUFFIXES[i];
  }
  function fmtTime(s) {
    s = Math.max(0, Math.ceil(s));
    if (s < 60) return s + 's';
    if (s < 3600) { const m = Math.floor(s / 60), r = s % 60; return r ? m + 'm ' + r + 's' : m + 'm'; }
    if (s < 172800) { const h = Math.floor(s / 3600), rm = Math.floor((s % 3600) / 60); return rm ? h + 'h ' + rm + 'm' : h + 'h'; } // < 48h
    if (s < 31536000) { const d = Math.floor(s / 86400), rh = Math.floor((s % 86400) / 3600); return rh ? d + 'd ' + rh + 'h' : d + 'd'; }
    const y = Math.floor(s / 31536000), rd = Math.floor((s % 31536000) / 86400);
    return rd ? y + 'y ' + rd + 'd' : y + 'y';
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
  // rune i (RUNES[i]) is revealed & tappable while its candle is lit
  function runeShown(i) { return i < candleCount() && state.candles[i] && state.candles[i].lit; }
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
    const i = RUNES.findIndex(r => r.id === letter);
    if (i < 0 || !runeShown(i)) return null;      // only tappable while its candle is lit
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
      notes: {},
      hpBought: 0, cashLootBought: 0, manaLootBought: 0,
      combat: null,
      blood: 0,
      trinkets: {},          // trinketId → value%
      activeTrinket: {},     // areaId → trinketId
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

  /* ---- trinkets: bonus from the active trinket of a location, if its stat matches ---- */
  function trinketBonus(areaId, stat) {
    const id = (state.activeTrinket || {})[areaId];
    if (!id) return 0;
    const tr = TRINKETS_BY_ID[id];
    if (!tr || tr.stat !== stat) return 0;
    return (state.trinkets || {})[id] || 0;   // percent
  }
  function ownedTrinkets(areaId) {
    return (TRINKETS_BY_LOC[areaId] || []).filter(t => (state.trinkets || {})[t.id] > 0);
  }
  function activateTrinket(areaId, id) {
    if (!(state.trinkets || {})[id]) return;
    state.activeTrinket = state.activeTrinket || {};
    state.activeTrinket[areaId] = (state.activeTrinket[areaId] === id) ? null : id;  // toggle
  }

  function startExpedition(areaId) {
    if (state.combat && state.combat.status === 'running') return false;
    const area = AREAS_BY_ID[areaId]; if (!area) return false;
    if (state.cents < area.visitCost) return { noCash: true };
    state.cents -= area.visitCost;
    const vigor = trinketBonus(areaId, 'vigor');
    state.combat = {
      areaId, elapsed: 0, duration: area.duration,
      hp: Math.round(maxHp() * (1 + vigor / 100)), runCash: 0, runMana: 0, runBlood: 0, log: [],
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
    let name = ev.name;
    if (name === '@boss' && area.bosses) name = area.bosses[irnd(0, area.bosses.length - 1)];
    let dmg = (ev.d || 0) * area.dmg;
    if (dmg && c.shieldRemaining > 0) {
      const block = Math.min(0.95, shieldTier().block + trinketBonus(area.id, 'ward') / 100);
      dmg = Math.round(dmg * (1 - block));
    }
    // loot accrues each event, scaled to the location; totals clamp to the reward range on completion
    const cash = Math.floor(Math.random() * area.cashMax / 8);
    const mana = Math.floor(Math.random() * area.manaMax / 8);
    c.hp -= dmg; c.runCash += cash; c.runMana += mana;
    c.log.push({ t: Math.round(c.elapsed), name, dmg, cash, mana });
    if (c.log.length > 40) c.log.shift();
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
      c.reward = {
        cash: clamp(c.runCash, area.cashMin, area.cashMax),
        mana: clamp(c.runMana, area.manaMin, area.manaMax),
        blood: irnd(area.bloodMin, area.bloodMax),
      };
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

  // Take the loot and end the run. 'complete' → full/balanced reward; else flee → what you gathered.
  function collectLoot() {
    const c = state.combat; if (!c || c.status === 'dead') return null;   // death = lose all loot
    const area = AREAS_BY_ID[c.areaId];
    const complete = c.status === 'complete';
    let cash, mana, blood;
    if (complete && c.reward) { cash = c.reward.cash; mana = c.reward.mana; blood = c.reward.blood; }
    else { cash = Math.min(c.runCash, area.cashMax); mana = Math.min(c.runMana, area.manaMax); blood = irnd(area.bloodMin, area.bloodMax); }
    // bonuses: field-upgrade loot % + active trinket for this location
    cash = Math.round(cash * (1 + cashLootPct() + trinketBonus(area.id, 'cash') / 100));
    mana = Math.round(mana * (1 + manaLootPct() + trinketBonus(area.id, 'mana') / 100));
    blood = Math.round(blood * (1 + trinketBonus(area.id, 'blood') / 100));
    earn(cash); state.mana += mana; state.blood = (state.blood || 0) + blood;

    // trinket drop (complete only) — chance boosted by the active "luck" trinket
    let trinket = null;
    if (complete) {
      const chance = area.trinketChance + trinketBonus(area.id, 'luck') / 100;
      const pool = TRINKETS_BY_LOC[area.id] || [];
      if (chance > 0 && pool.length && Math.random() < chance) {
        const tr = pool[irnd(0, pool.length - 1)];
        state.trinkets = state.trinkets || {};
        const dup = state.trinkets[tr.id] > 0;
        state.trinkets[tr.id] = dup ? state.trinkets[tr.id] + 1 : tr.base;   // dup → +1%
        trinket = { name: tr.name, dup, value: state.trinkets[tr.id] };
      }
    }
    state.combat = null;
    return { cash, mana, blood, trinket };
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
  // Defensively rebuild a valid state from any (possibly old-format) parsed save.
  // This must never throw, so a refresh can always restore progress.
  function sanitize(parsed) {
    const s = Object.assign(freshState(), parsed || {});
    s.items = Object.assign({ planter: 0, candle: 0, map: 0, notebook: 0 }, s.items || {});
    if (typeof s.mana !== 'number') s.mana = 0;
    s.discovered = (Array.isArray(s.discovered) ? s.discovered : []).filter(id => SPELLS_BY_ID[id]);
    if (!s.discovered.includes('rite_fdsa')) s.discovered.unshift('rite_fdsa');
    if (!Array.isArray(s.runeSeq)) s.runeSeq = [];
    if (!s.notes || typeof s.notes !== 'object') s.notes = {};
    if (!s.trinkets || typeof s.trinkets !== 'object' || Array.isArray(s.trinkets)) s.trinkets = {};
    if (!s.activeTrinket || typeof s.activeTrinket !== 'object') s.activeTrinket = {};
    ['hasteStacks', 'runeSeqAt', 'hpBought', 'cashLootBought', 'manaLootBought', 'prestigePoints', 'hpBonus', 'scrolls', 'dailyHarvests', 'dailyResetAt', 'blood']
      .forEach(k => { if (typeof s[k] !== 'number') s[k] = 0; });
    ['prestigeUnlocked', 'devMode', 'hasPrestiged'].forEach(k => { if (typeof s[k] !== 'boolean') s[k] = false; });
    if (!Array.isArray(s.questClaimed) || s.questClaimed.length !== DAILY_QUESTS.length) s.questClaimed = DAILY_QUESTS.map(() => false);
    if (s.combat === undefined) s.combat = null;
    if (!(s.gameSpeed >= 1 && s.gameSpeed <= CONFIG.maxSpeed)) s.gameSpeed = 1;
    if (!Array.isArray(s.planters) || !s.planters.length) s.planters = [makePlanter()];
    s.planters = s.planters.map(p => { const np = Object.assign(makePlanter(), p); if (typeof np.prog !== 'number') np.prog = 0; delete np.start; return np; });
    if (!Array.isArray(s.candles) || s.candles.length !== 4) s.candles = [makeCandle(), makeCandle(), makeCandle(), makeCandle()];
    s.candles = s.candles.map(c => ({ lit: !!(c && c.lit) }));
    if (!Array.isArray(s.unlockedSeeds) || !s.unlockedSeeds.length) s.unlockedSeeds = ['radish'];
    if (typeof s.lastTick !== 'number') s.lastTick = now();
    return s;
  }
  function load() {
    let raw = null;
    try { raw = localStorage.getItem(CONFIG.saveKey); } catch (e) {}
    if (!raw) { state = freshState(); return false; }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {                              // truly corrupt JSON — keep a copy, start fresh
      try { localStorage.setItem(CONFIG.saveKey + '-corrupt', raw); } catch (e2) {}
      state = freshState(); return false;
    }
    try { state = sanitize(parsed); }
    catch (e) { state = Object.assign(freshState(), parsed); }  // last resort: keep raw fields
    try { checkDailyReset(); syncSlots(); checkUnlocks(); } catch (e) {}
    return true;
  }
  function reset() { state = freshState(); save(); }
  function wipe() {                          // hard delete the save file
    try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {}
    state = freshState(); save();
  }
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
    fmtMoney, fmtNum, fmtTime, now,
    multiplier, growthSpeed, effGrow, slotCount, speed, speedFactor, cycleSpeed,
    setDevMode, devMode, devGive,
    manaRegenPerSec, ritualManaCost, has, tabUnlocked, avgPlantedSell, ledgerPerSec, autoHarvest,
    maxHp, hpAdded, cashLootPct, manaLootPct, fieldCost, fieldNextAmount,
    itemPrice, itemStockLeft, itemSoldOut, nextLockedSeed,
    ritualUnlocked, candleCount, toggleCandle,
    allCandlesLit, runeShown, runeSeqStr, tapRune, clearRuneSeq, castSpellById,
    combat, startExpedition, togglePause, buyField, collectLoot, dismissDeath, shieldTier,
    trinketBonus, ownedTrinkets, activateTrinket,
    prestigeUnlocked, pendingPrestige, prestigePoints, doPrestige,
    dailyActive, dailyTimeLeft, questProgress, questClaimable, claimQuest, allQuestsClaimed,
    plant, sell, replantSpot, toggleRepeat, buyItem, setNote,
    isGrown, progress, timeLeft,
    tick, applyOffline, save, load, reset, wipe,
    SEEDS, ITEMS, TABS, RUNES, SPELLS, AREAS, FIELD_UPGRADES, AREAS_BY_ID, PATCH_NOTES, DAILY_QUESTS,
    TRINKETS, TRINKETS_BY_ID, TRINKETS_BY_LOC,
    SEEDS_BY_ID, ITEMS_BY_ID, RUNES_BY_ID, SPELLS_BY_ID, CONFIG,
  };
})();
