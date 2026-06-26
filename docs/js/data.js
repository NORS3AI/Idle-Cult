/* ============================================================
   Idle Cult — game data / configuration
   All money values are stored internally in CENTS (integers).
   ============================================================ */

const SEEDS = [
  // unlockAt = lifetime cents earned required to reveal this seed
  { id: 'radish',     name: 'radish',     icon: '🌡️', cost: 2,        grow: 6,   sell: 24,        unlockAt: 0 },
  { id: 'carrot',     name: 'carrot',     icon: '🥕', cost: 20,       grow: 12,  sell: 140,       unlockAt: 250 },
  { id: 'corn',       name: 'corn',       icon: '🌽', cost: 160,      grow: 20,  sell: 1100,      unlockAt: 2000 },
  { id: 'pumpkin',    name: 'pumpkin',    icon: '🎃', cost: 1300,     grow: 32,  sell: 9000,      unlockAt: 18000 },
  { id: 'nightshade', name: 'nightshade', icon: '🍆', cost: 11000,    grow: 50,  sell: 78000,     unlockAt: 150000 },
  { id: 'bloodvine',  name: 'bloodvine',  icon: '🍇', cost: 95000,    grow: 80,  sell: 720000,    unlockAt: 1300000 },
  { id: 'moonflower', name: 'moonflower', icon: '🌼', cost: 850000,   grow: 130, sell: 7200000,   unlockAt: 12000000 },
  { id: 'wraithlily', name: 'wraithlily', icon: '🪷', cost: 8000000,  grow: 200, sell: 80000000,  unlockAt: 130000000 },
];

const SEEDS_BY_ID = Object.fromEntries(SEEDS.map(s => [s.id, s]));

/* Shop items.
   - "stock"  : restocks infinitely; price scales per purchase  (planter)
   - "capped" : limited total quantity                          (candle, max 4)
   - "once"   : one-time unlock that vanishes once bought       (map, notebook) */
const ITEMS = [
  {
    id: 'planter', name: 'planter', kind: 'stock',
    base: 222, priceMul: 1.7, stockSize: 5,
    desc: 'Adds a planter slot to grow more crops at once.',
  },
  {
    id: 'candle', name: 'candle', kind: 'capped',
    base: 667, priceMul: 1.9, cap: 4,
    desc: 'Set a candle on a corner of the Ritual slate. Four candles complete the circle.',
  },
  {
    id: 'map', name: 'map', kind: 'once', base: 5800,
    desc: 'Charts the hidden grove — unlocks the Ritual slate.',
  },
  {
    id: 'notebook', name: 'notebook', kind: 'once', base: 7600,
    desc: 'Forbidden notes reveal every rune pattern in the spellbook.',
  },
];

const ITEMS_BY_ID = Object.fromEntries(ITEMS.map(i => [i.id, i]));

/* The four runes a candle can show. */
const RUNES = [
  { id: 'fehu',   sym: 'ᚠ', name: 'Fehu',   mean: 'wealth' },
  { id: 'eihwaz', sym: 'ᛇ', name: 'Eihwaz', mean: 'growth' },
  { id: 'sowilo', sym: 'ᛋ', name: 'Sowilo', mean: 'the sun' },
  { id: 'othala', sym: 'ᛟ', name: 'Othala', mean: 'heritage' },
];
const RUNES_BY_ID = Object.fromEntries(RUNES.map(r => [r.id, r]));

/* Spells: a pattern is the rune in each of the four corners
   in order [top-left, top-right, bottom-left, bottom-right].
   Requires all four candles placed & lit on the matching rune.
   Casting costs MANA, which slowly regenerates (faster with candles). */
const SPELLS = [
  {
    id: 'quicken', name: 'Rite of Quickening',
    pattern: ['sowilo', 'sowilo', 'sowilo', 'sowilo'],
    type: 'buff', mana: 10, duration: 60,
    desc: 'Halve every planter\'s grow time for 60s.',
  },
  {
    id: 'bloom', name: 'Rite of Bloom',
    pattern: ['eihwaz', 'eihwaz', 'eihwaz', 'eihwaz'],
    type: 'instant', mana: 20,
    desc: 'Instantly ripen every planter.',
  },
  {
    id: 'plenty', name: 'Rite of Plenty',
    pattern: ['fehu', 'fehu', 'fehu', 'fehu'],
    type: 'instant', mana: 30,
    desc: 'Conjure a windfall of coin.',
  },
  {
    id: 'devotion', name: 'Rite of Devotion',
    pattern: ['fehu', 'eihwaz', 'sowilo', 'othala'],
    type: 'prestige', mana: 50,
    desc: 'Sacrifice all worldly coin for permanent +1 devotion (×).',
  },
];
const SPELLS_BY_ID = Object.fromEntries(SPELLS.map(s => [s.id, s]));

const CONFIG = {
  startCents: 10,
  baseSlots: 1,
  offlineCapSeconds: 8 * 3600,   // cap offline progress at 8 hours
  ritualUnlockItem: 'map',       // ritual slate unlocked by buying the map
  candleCount: 4,
  devotionBaseCost: 50000,       // $500 to perform first Rite of Devotion
  devotionCostMul: 12,           // each devotion costs 12x more
  quickenSpeedBonus: 1.0,        // +100% growth speed (halves time) while Quickening is active
  manaBase: 20,                  // max mana with the slate unlocked, no candles
  manaPerCandle: 10,             // each candle raises the mana ceiling
  manaRegenBase: 0.6,            // mana per second
  manaRegenPerCandle: 0.35,      // extra mana/sec per candle
  saveKey: 'idle-cult-save-v1',
};
