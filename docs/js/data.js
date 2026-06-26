/* ============================================================
   Idle Cult — game data / configuration
   All money values are stored internally in CENTS (integers).
   ============================================================ */

const SEEDS = [
  // grow = seconds, sell/cost = cents, unlockAt = lifetime cents earned to reveal
  { id: 'radish',   name: 'radish',   icon: '🥬', cost: 2,       grow: 6,     sell: 24,       unlockAt: 0 },
  { id: 'carrot',   name: 'carrot',   icon: '🥕', cost: 17,      grow: 30,    sell: 170,      unlockAt: 270 },       // $2.70
  { id: 'cabbage',  name: 'cabbage',  icon: '🥦', cost: 86,      grow: 240,   sell: 856,      unlockAt: 1890 },      // $18.90 (4 min)
  { id: 'pumpkin',  name: 'pumpkin',  icon: '🎃', cost: 886,     grow: 2160,  sell: 8862,     unlockAt: 3323 },      // $33.23 (36 min)
  { id: 'eggplant', name: 'eggplant', icon: '🍆', cost: 2762,    grow: 5400,  sell: 27623,    unlockAt: 12000 },     // (90 min)
  { id: 'corn',     name: 'corn',     icon: '🌽', cost: 8787,    grow: 18840, sell: 87867,    unlockAt: 80000 },     // (314 min)
  { id: 'cucumber', name: 'cucumber', icon: '🥒', cost: 278316,  grow: 42720, sell: 2783164,  unlockAt: 600000 },    // (712 min)
  { id: 'melon',    name: 'melon',    icon: '🍈', cost: 4937219, grow: 62640, sell: 49372188, unlockAt: 5000000 },   // (1044 min)
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
    id: 'auto-harvester', name: 'auto-harvester', kind: 'once', base: 250000,
    desc: 'Automatically harvests and replants every planter, hands-free.',
  },
  {
    id: 'thurible', name: 'thurible', kind: 'once', base: 750000, info: true,
    desc: 'A swinging censer of sacred smoke. (Effect coming soon.)',
  },
  {
    id: 'poultice', name: 'poultice', kind: 'once', base: 100000000, info: true,
    desc: 'A healing salve for the wounded faithful. (Effect coming soon.)',
  },
  {
    id: 'compass', name: 'compass', kind: 'once', base: 400000000, info: true,
    desc: 'Points beyond the known map. (Effect coming soon.)',
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

/* Rites (spells).
   A rite is performed by lighting all four candles with ONE OF EACH rune.
   Casting costs mana. The EFFECT IS DELIBERATELY HIDDEN from the player —
   they discover what a rite does by casting it and writing notes in the
   Notebook. More rites are earned as the game goes on; for now there is
   one: it halves the remaining grow time of every plant in a planter. */
const SPELLS = [
  {
    id: 'rite_halftime',
    runes: ['fehu', 'eihwaz', 'sowilo', 'othala'], // "one of each"
    mana: 10,
    effect: 'halveRemaining',
    // no name / desc shown in-game — the player figures it out
  },
];
const SPELLS_BY_ID = Object.fromEntries(SPELLS.map(s => [s.id, s]));

/* Top navigation tabs. Each (except home) unlocks when its item is owned. */
const TABS = [
  { id: 'home',     icon: '⌂', label: 'Grove',    needs: null },
  { id: 'notebook', icon: '✒', label: 'Notebook', needs: 'notebook' },
  { id: 'combat',   icon: '⚔', label: 'Combat',   needs: 'map' },
  { id: 'research', icon: '⚗', label: 'Research', needs: 'research' },
];

const CONFIG = {
  startCents: 10,
  ledgerRate: 0.04,              // 4% of average planted crop value per second

  baseSlots: 1,
  offlineCapSeconds: 24 * 3600,  // cap offline progress at 24 hours
  ritualUnlockItem: 'map',       // ritual slate unlocked by buying the map
  candleCount: 4,
  ritualHalve: 0.5,              // a rite halves the remaining grow time
  manaMax: 100,                  // mana ceiling (raised later via Research)
  manaRegenPerHour: 5,           // mana recharge rate
  candleFreeMana: 100,           // free mana granted when the 4th candle is set
  buyPageSize: 4,                // shop shows four upgrades at a time
  maxSpeed: 5,                   // game-speed selector cycles ×1 … ×5
  saveKey: 'idle-cult-save-v1',
};
