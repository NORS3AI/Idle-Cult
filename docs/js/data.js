/* ============================================================
   Idle Cult — game data / configuration
   All money values are stored internally in CENTS (integers).
   ============================================================ */

const _H = 3600;                       // seconds per hour
const _c = d => Math.round(d * 100);   // dollars → cents (money is stored in cents)

const SEEDS = [
  // grow = seconds, sell/cost/unlockAt = cents (via _c dollars). Times shown are at ×1 speed.
  { id: 'radish',     name: 'radish',     icon: '🥬', cost: _c(0.02),  grow: 6,          sell: _c(0.24),  unlockAt: _c(0) },
  { id: 'cabbage',    name: 'cabbage',    icon: '🥦', cost: _c(0.10),  grow: 30,         sell: _c(1.20),  unlockAt: _c(2.22) },
  { id: 'garlic',     name: 'garlic',     icon: '🧄', cost: _c(0.70),  grow: 120,        sell: _c(8.64),  unlockAt: _c(27) },
  { id: 'ginger',     name: 'ginger',     icon: '🫚', cost: _c(7),     grow: 2340,       sell: _c(88.72), unlockAt: _c(140) },
  { id: 'yarrow',     name: 'yarrow',     icon: '🌿', cost: _c(333),   grow: 4 * _H,     sell: _c(1300),  unlockAt: _c(2000) },
  { id: 'mandrake',   name: 'mandrake',   icon: '🌱', cost: _c(961),   grow: 9 * _H,     sell: _c(4700),  unlockAt: _c(25000) },
  { id: 'wormwood',   name: 'wormwood',   icon: '🍂', cost: _c(1677),  grow: 20 * _H,    sell: _c(14482), unlockAt: _c(112000) },
  { id: 'belladonna', name: 'belladonna', icon: '🫐', cost: _c(5900),  grow: 36 * _H,    sell: _c(29907), unlockAt: _c(347440) },
  { id: 'pumpkin',    name: 'pumpkin',    icon: '🎃', cost: _c(12000), grow: 56 * _H,    sell: _c(78000), unlockAt: _c(743000) },
  { id: 'wheat',      name: 'wheat',      icon: '🌾', cost: _c(72000), grow: 115 * _H,   sell: _c(256000),unlockAt: _c(4e6) },
  { id: 'rye',        name: 'rye',        icon: '🥖', cost: _c(345000),grow: 290 * _H,   sell: _c(1e6),   unlockAt: _c(12.5e6) },
  { id: 'carrot',     name: 'carrot',     icon: '🥕', cost: _c(1.2e6), grow: 559 * _H,   sell: _c(7.5e6), unlockAt: _c(65e6) },
  { id: 'plum',       name: 'plum',       icon: '🍑', cost: _c(4e6),   grow: 1270 * _H,  sell: _c(22e6),  unlockAt: _c(390e6) },
  { id: 'mango',      name: 'mango',      icon: '🥭', cost: _c(12e6),  grow: 1700 * _H,  sell: _c(109e6), unlockAt: _c(1.1e9) },
  { id: 'tomato',     name: 'tomato',     icon: '🍅', cost: _c(77e6),  grow: 5200 * _H,  sell: _c(888e6), unlockAt: _c(119e9) },
  { id: 'coconut',    name: 'coconut',    icon: '🥥', cost: _c(412e6), grow: 8489 * _H,  sell: _c(4e9),   unlockAt: _c(910e9) },
  { id: 'banana',     name: 'banana',     icon: '🍌', cost: _c(1.7e12),grow: 14000 * _H, sell: _c(36e9),  unlockAt: _c(7e12) },
  { id: 'apple',      name: 'apple',      icon: '🍎', cost: _c(16e12), grow: 29000 * _H, sell: _c(344e9), unlockAt: _c(199e12) },
  { id: 'pear',       name: 'pear',       icon: '🍐', cost: _c(119e12),grow: 54000 * _H, sell: _c(4.4e12),unlockAt: _c(933e12) },
  { id: 'raisin',     name: 'raisin',     icon: '🍇', cost: _c(1.1e15),grow: 119000 * _H,sell: _c(649e12),unlockAt: _c(500e15) },
  { id: 'voidleaf',   name: 'void leaf',  icon: '🍃', cost: _c(833e15),grow: 777777 * _H,sell: _c(314e15),unlockAt: _c(999e18) },
  { id: 'voidbloom',  name: 'void bloom', icon: '🌺', cost: _c(999e18),grow: 9e6 * _H,   sell: _c(999e24),unlockAt: _c(999e21) },
];

const SEEDS_BY_ID = Object.fromEntries(SEEDS.map(s => [s.id, s]));

/* Shop items.
   - "stock"  : restocks infinitely; price scales per purchase  (planter)
   - "capped" : limited total quantity                          (candle, max 4)
   - "once"   : one-time unlock that vanishes once bought       (map, notebook) */
// Prices are FLAT (no scaling). "capped" items sell a limited quantity.
const ITEMS = [
  {
    id: 'planter', name: 'planter', kind: 'capped', cap: 5, base: 222,
    desc: 'Adds a planter slot to grow more crops at once.',
  },
  {
    id: 'candle', name: 'candle', kind: 'capped', cap: 4, base: 667,
    desc: 'Set a candle on a corner of the Ritual slate. Four candles complete the circle.',
  },
  {
    id: 'map', name: 'map', kind: 'once', base: 5800,
    desc: 'Charts the hidden grove — unlocks the Ritual slate and the Combat map.',
  },
  {
    id: 'notebook', name: 'notebook', kind: 'once', base: 7600,
    desc: 'A grimoire — opens the Notebook tab to record every rite you know.',
  },
  {
    id: 'research', name: 'research', kind: 'once', base: 10000,   // the "alembic" — opens Research
    desc: 'An alembic for alchemical study — opens the Research tab.',
  },
  {
    id: 'ledger', name: 'ledger', kind: 'once', base: 33300, info: true,
    desc: 'Generates cash every second equal to 4% of the average crop value across your planters.',
  },
  {
    id: 'grafting-kit', name: 'grafting kit', kind: 'once', base: 80000,
    desc: 'Tools for splicing strains. (More uses coming soon.)',
  },
  {
    id: 'auto-harvester', name: 'auto-harvester', kind: 'once', base: 250000, info: true,
    desc: 'Automatically harvests and replants every planter for 1 mana per crop (harvest + replant). No mana, no action.',
  },
  {
    id: 'auto-ritual', name: 'auto-ritual', kind: 'once', base: 2000000, info: true,   // $20k
    desc: 'Adds an auto-cast button beside each rite you know in the Notebook.',
  },
  {
    id: 'thurible', name: 'thurible', kind: 'once', base: 750000, info: true,
    desc: 'Sacred smoke quickens the grove: +5% plant growth speed.',
  },
  {
    id: 'brazier', name: 'brazier', kind: 'once', base: 8500000, info: true,   // $85k
    desc: 'Upgrades the combat ward to +15 minutes and a 65% block chance.',
  },
  {
    id: 'poultice', name: 'poultice', kind: 'once', base: 100000000, info: true,  // $1m
    desc: 'Passive expedition healing: +1 heart every 6 seconds.',
  },
  {
    id: 'compass', name: 'compass', kind: 'once', base: 400000000, info: true,    // $4m
    desc: 'Expeditions progress 50% faster.',
  },
  {
    id: 'ironwood', name: 'ironwood', kind: 'once', base: 8000000000, info: true, // $80m
    desc: 'Upgrades the combat ward to +1 hour and an 85% block chance.',
  },
];

const ITEMS_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

/* The four runes on the Ritual slate — Norse runes for F, D, S, A,
   arranged N/E/S/W. Tapping them builds a sequence that spells a rite. */
const RUNES = [
  { id: 'F', letter: 'F', sym: 'ᚠ', pos: 'top' },     // Fehu
  { id: 'D', letter: 'D', sym: 'ᛞ', pos: 'right' },   // Dagaz
  { id: 'S', letter: 'S', sym: 'ᛋ', pos: 'bottom' },  // Sowilo
  { id: 'A', letter: 'A', sym: 'ᚨ', pos: 'left' },    // Ansuz
];
const RUNES_BY_ID = Object.fromEntries(RUNES.map(r => [r.id, r]));

/* Rites (spells) are cast by tapping a rune SEQUENCE. The effect is hidden —
   the player figures it out and writes notes in the Notebook.
   - rite_fdsa: given for free once the candles are lit (halves grow time).
   - rite_thurible: hidden (A F S D) — each cast adds +5% permanent haste. */
const SPELLS = [
  { id: 'rite_fdsa',     seq: ['F', 'D', 'S', 'A'], mana: 10, effect: 'halveRemaining', given: true },
  { id: 'rite_thurible', seq: ['A', 'F', 'S', 'D'], mana: 10, effect: 'haste5' },
];
const SPELLS_BY_ID = Object.fromEntries(SPELLS.map(s => [s.id, s]));

/* Top navigation tabs. Each (except home) unlocks when its item is owned. */
// Top tabs are only Grove / Combat / Research. Notebook, Prestige and Daily
// Quests live as cards on the Grove dashboard.
const TABS = [
  { id: 'home',     icon: '⌂', label: 'Grove',    needs: null },
  { id: 'combat',   icon: '⚔', label: 'Combat',   needs: 'map' },
  { id: 'research', icon: '⚗', label: 'Research', needs: 'research' },
];

/* ----- Combat / expeditions ----- */
// Escalating cost sequence (in $, i.e. cents×100 handled where used).
const COST_STEPS = [1, 1, 4, 5, 9, 11, 15];   // then continues ×~1.3

// Field upgrades bought during a run.
const FIELD_UPGRADES = [
  { id: 'shield',   icon: '🛡', kind: 'shield', costMana: 10, minutes: 3, block: 0.5,
    desc: '3-minute ward that blocks 50% of damage.' },
  { id: 'hp',       icon: '❤', kind: 'hp',
    desc: 'Permanently raises your maximum hearts.' },
  { id: 'cashloot', icon: '$', kind: 'pct', stat: 'cash',
    desc: 'Permanently increases cash loot by +1% each.' },
  { id: 'manaloot', icon: '✦', kind: 'pct', stat: 'mana',
    desc: 'Permanently increases mana loot by +1% each.' },
];

// Locations. cash values are in CENTS.
const AREAS = [
  {
    id: 'wald', name: 'The Wald', icon: '🗺️',
    riskMin: 5, riskMax: 14,
    cashMin: 2300, cashMax: 5600,      // $23 – $56
    manaMin: 10, manaMax: 25,
    duration: 60,                       // game-seconds at ×1 (30s at ×2, …)
    trinketChance: 0,                   // trinkets drop from the SECOND area (10%)
    // A scary, ancient forest. dmg = hearts lost; cash in cents; mana points.
    // Weights are tuned so ~1/3 of events wound — survivable near the low end
    // of the risk range, comfortable once you upgrade hearts / raise a ward.
    events: [
      // — calm / boons (no damage) —
      { name: 'quiet glade',    w: 12, dmg: 0 },
      { name: 'birdsong',       w: 10, dmg: 0, mana: [0, 1] },
      { name: 'ancient oak',    w:  9, dmg: 0, cash: [100, 300] },
      { name: 'badger',         w:  9, dmg: 0, cash: [100, 300] },
      { name: 'mushroom ring',  w:  8, dmg: 0, mana: [1, 2] },
      { name: 'gamekeeper',     w:  7, dmg: 0, cash: [100, 400] },
      { name: 'lost pilgrim',   w:  7, dmg: 0, cash: [100, 400] },
      { name: 'old shrine',     w:  5, dmg: 0, cash: [200, 600] },
      { name: 'will-o-wisp',    w:  5, dmg: 0, mana: [1, 2] },
      // — wounds (−1 heart) —
      { name: 'wolves',         w:  4, dmg: 1, cash: [100, 300] },
      { name: 'raven',          w:  3, dmg: 1, cash: [200, 500] },
      { name: 'stag',           w:  3, dmg: 1, mana: [0, 1] },
      { name: 'spider web',     w:  3, dmg: 1, mana: [0, 1] },
      { name: 'asp',            w:  3, dmg: 1 },
      { name: 'hornet nest',    w:  3, dmg: 1 },
      { name: 'bees',           w:  2, dmg: 1 },
      { name: 'falling branch', w:  2, dmg: 1 },
      { name: 'mudslide',       w:  2, dmg: 1 },
      { name: 'deserter',       w:  2, dmg: 1, cash: [0, 200] },
      { name: 'fugitive',       w:  2, dmg: 1, cash: [100, 300], mana: [0, 1] },
      { name: 'cave dweller',   w:  2, dmg: 1, mana: [0, 1] },
      // — rare —
      { name: 'naiad',          w:  2, dmg: 1, cash: [1000, 2000], mana: [5, 10] }, // rare boon
      { name: 'the horned one', w:  1, dmg: 2, cash: [500, 1200], mana: [2, 5] },   // rare, dangerous
    ],
  },
];
const AREAS_BY_ID = Object.fromEntries(AREAS.map(a => [a.id, a]));

/* Daily quests — unlocked after the first prestige, reset every hour.
   Harvest plants to hit each tier, then Claim its scroll reward. */
const DAILY_QUESTS = [
  { target: 6,   reward: 1 },
  { target: 30,  reward: 1 },
  { target: 120, reward: 1 },
  { target: 360, reward: 1 },
];

const CONFIG = {
  startCents: 10,
  ledgerRate: 0.04,              // 4% of average planted crop value per second
  baseHp: 10,                   // starting maximum hearts
  eventMin: 2, eventMax: 3,     // seconds between expedition events
  autoHarvestMana: 1,           // mana per crop (harvest + replant) for the auto-harvester
  thuribleHaste: 0.05,          // +5% plant growth speed
  compassSpeed: 1.5,            // expeditions run 50% faster
  poulticeHealEvery: 6,         // seconds between +1 heart in combat
  prestigeUnlockEarned: 200000, // $2,000 lifetime opens Prestige
  prestigePer: 5000,            // +1 prestige point per $50 earned
  prestigeSpeedPer: 0.01,       // +1% plant speed per prestige point
  // combat ward tiers: base → brazier → ironwood
  shieldTiers: {
    base:     { minutes: 3,  block: 0.50 },
    brazier:  { minutes: 15, block: 0.65 },
    ironwood: { minutes: 60, block: 0.85 },
  },

  baseSlots: 1,
  offlineCapSeconds: 24 * 3600,  // cap offline progress at 24 hours
  ritualUnlockItem: 'map',       // ritual slate unlocked by buying the map
  candleCount: 4,
  ritualHalve: 0.5,              // a rite halves the remaining grow time
  manaMax: 100,                  // mana ceiling (raised later via Research)
  manaRegenPerHour: 5,           // mana recharge rate
  candleFreeMana: 100,           // free mana granted when the 4th candle is set
  buyPageSize: 4,                // shop shows four upgrades at a time
  maxSpeed: 10,                  // game-speed selector cycles ×1 … ×10 (each step halves time)
  dailyResetSeconds: 3600,       // daily quests refresh every hour
  runeSeqTimeout: 20,            // seconds before a tapped rune sequence auto-clears
  hasteStackPct: 0.05,           // +5% plant speed per Thurible-rite cast
  saveKey: 'idle-cult-save-v1',
};

/* Patch notes — newest first. Shown in Settings. */
const PATCH_NOTES = [
  { v: '1.3', title: '22 crops & big-number scale', items: [
    'Full crop line from radish to Void Bloom (22 crops), scaling into the quadrillions and beyond.',
    'Numbers now use a k/m/b/t/Qa/Qi/No/De suffix scale; long grow times show in days and years.',
  ] },
  { v: '1.2', title: 'Save fixes, rune tapping, Wipe Save', items: [
    'Refreshing no longer resets progress — saves (even old ones) always restore; corrupt saves are backed up, not lost.',
    'Fixed runes not being tappable (the ritual circle was intercepting taps).',
    'Each candle now fades its rune in when lit and out when snuffed.',
    'Notebook Cast casts once per tap — tap as many times as you like.',
    'Settings has a "Wipe Save" button with an "Are you sure :(" confirm — the only way to erase your save.',
  ] },
  { v: '1.1', title: 'Dashboard layout & Notebook', items: [
    'Grove is now a two-column dashboard: Upgrades / Planters / Prestige / Daily quests on the left; Seeds / Ritual slate / Notebook on the right.',
    'Top tabs are just Grove / Combat / Research; the clock sits top-left with speed and settings top-right.',
    '"Buy" renamed to "Upgrades".',
    'Notebook shows each discovered rite with its mana cost and a 255-character note field; with Auto-Ritual, a Cast button auto-performs it.',
  ] },
  { v: '1.0', title: 'Rune rites & Auto-Ritual', items: [
    'Ritual slate remade: light the four candles, then tap Norse runes (F/D/S/A) to spell a rite.',
    'The sequence shows at the top with an ✕ to clear; it also auto-clears after 20s.',
    'First rite is free (F-D-S-A); discover the Thurible rite (A-F-S-D, +5% haste per cast) by experimenting.',
    'Auto-Ritual upgrade ($20k) adds an auto-cast button beside each rite in the Notebook.',
    'Affordable shop upgrades now glow gold and pulse.',
  ] },
  { v: '0.9', title: 'Daily quests & scrolls', items: [
    'Daily quests appear after your first prestige — harvest plants to claim 📜 scrolls; they reset every hour.',
    'New Scrolls resource shown in the top bar next to cash and mana.',
    'Top bar remade: location tabs, cash, mana and scrolls all in one row.',
  ] },
  { v: '0.8', title: 'Speed x10, prestige & Settings', items: [
    'Game speed now goes up to ×10 — each step halves grow time (×1 radish 6s → ×5 ~0.4s → ×10 ~0.01s).',
    'Prestige points give +1% plant speed each (100 pts = +100%).',
    'New Settings panel with patch notes and an optional Dev Panel.',
  ] },
  { v: '0.7', title: 'Flat prices, new crops, item effects', items: [
    'Planters ($2.22) and candles ($6.67) are flat-priced; up to 6 planters total.',
    'New crop line: radish → cabbage → garlic → ginger → yarrow → mandrake → wormwood → belladonna.',
    'Thurible +5% growth · brazier & ironwood upgrade the ward · poultice heals in combat · compass +50% expedition speed.',
    'Prestige unlocks at $2,000 earned; auto-harvester now harvests & replants for 1 mana per crop.',
  ] },
  { v: '0.6', title: 'Combat expeditions', items: [
    'Send expeditions into The Wald — a themed event log, hearts, loot and field upgrades.',
    'Flee with loot anytime; dying loses the run. Mana moved to the top bar.',
  ] },
  { v: '0.5', title: 'Manual planting & rituals', items: [
    'Planting is manual; the ⟳ button saves a spot for one-tap replanting.',
    'Ritual slate: light four candles with one of each rune to cast a mana-fuelled rite (effect is yours to discover).',
  ] },
  { v: '0.4', title: 'Tabs & the shop', items: [
    'Top tabs: Grove, Notebook, Combat, Research (each unlocked by its item).',
    'Ledger passive income; shop paginates four at a time.',
  ] },
  { v: '0.1', title: 'The grove', items: [
    'Grow crops, sell them, and buy your first upgrades. Auto-saves to your browser.',
  ] },
];
