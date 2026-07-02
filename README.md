# Idle Cult

A tiny dark idle game in the spirit of *Idle Pact* — grow crops, sell them, build
your cult, and invoke runic rituals.

## ▶ Play

**https://nors3ai.github.io/Idle-Cult/**

Runs entirely in the browser (GitHub Pages, served from `main` → `/docs`).
Progress auto-saves to your device and continues while you're away.

## How to play

- **Seeds** — tap **Plant** to sow a seed into an empty planter (radish: `2¢`,
  grows in `6s`, sells for `24¢`). Planting is always manual.
- **Planters** — when a crop is ripe, tap **Sell** to collect. The **⟳** button
  *saves the spot*: it keeps the planter assigned to that crop so you can replant
  it with one tap. (It does **not** auto-plant; the **auto-harvester** upgrade is
  what auto-sells ripe crops.)
- **Game speed** — the chip in the top bar (`×1`) cycles **×1…×10**; each step
  **halves** grow time (radish: 6s → 3s → 1.5s → … at ×10 ~0.01s).
- **Settings** (⚙) — patch notes and an optional **Dev Panel** (resource cheats).
- **Auto-harvester** ($2,500) auto-harvests **and** replants every planter for
  **1 mana per crop** (both actions); with no mana it waits.
- **Prestige** (opens once you've earned $2,000): bank **+1 point per $50** earned,
  reset everything but your points, and gain **+1% plant speed per point**.
- **Buy** — spend earnings on upgrades (the shop scrolls; collapse it with the ⌃ bar):
  - **planter** — adds another planter slot.
  - **candle** — set one on a corner of the Ritual slate (four complete the circle).
  - **map** — unlocks the **Ritual slate** and the **Combat** tab.
  - **notebook** — opens the **Notebook** tab (your known rites + personal notes).
  - **research** — opens the **Research** tab.
  - **ledger** — passive income: `+4%`/sec of the average crop value in your planters.
  - **auto-harvester** — automatically harvests and replants every planter.
  - …plus grafting kit, thurible, poultice and compass (effects coming soon).
- New, more valuable seeds unlock as your lifetime earnings grow.

## Tabs

Icons at the top switch between areas, unlocking as you buy the matching item:

- **Grove** (home) — planters, seeds, shop and the Ritual slate.
- **Notebook** — every rite you know, with an editable notes box for each.
- **Combat** — opened by the **map**. Send an expedition into **The Wald** (a
  scary ancient forest): a progress bar fills over ~1 min (faster at higher game
  speed) while a themed **Event Log** ticks every 2–3s. Events can cost hearts or
  grant `$`/mana. Spend on **Field upgrades** mid-run — a 3-min ward (50% block,
  10 mana), `+HP`, `+1% $ loot`, `+1% mana loot`. **Flee with loot** anytime with
  no penalty; if your hearts hit 0 you **die and lose the run's loot**. Each run
  pays out within the location's reward range. (Trinket drops from the 2nd area
  are wired up, pending its art/stats.)
- **Research** — opened by **research / the alembic** (research nodes in progress).

Progress **auto-saves to the browser** and keeps running while the tab/app is
in the background or the device is asleep (offline progress is credited on return).

## The Ritual slate

Once you own the **map** and place all **four candles** in the corners, light
each candle and set it to one of four **runes**. A rite is performed when all four
candles show **one of each rune**; casting costs **mana**.

What a rite *does* is intentionally a mystery — cast it, watch what happens, and
record your findings in the **Notebook** tab. Setting the fourth candle grants
**100 free mana**; mana recharges slowly (`5`/hour, raised later via Research).

## Project layout

```
docs/
  index.html        # markup + phone shell
  css/style.css     # dark mobile styling
  js/
    data.js         # seeds, items, tabs, runes, spells, config
    game.js         # state, logic, save/load, offline progress
    ui.js           # rendering & interaction
    main.js         # bootstrap & game loop
```

It's all vanilla HTML/CSS/JS — no build step. Open `docs/index.html` to run locally.
