# Idle Cult

A tiny dark idle game in the spirit of *Idle Pact* — grow crops, sell them, build
your cult, and invoke runic rituals.

## ▶ Play

**https://nors3ai.github.io/idle-cult/**

Runs entirely in the browser (GitHub Pages, served from `main` → `/docs`).
Progress auto-saves to your device and continues while you're away.

## How to play

- **Seeds** — tap **Plant** to sow a seed into an empty planter (radish: `2¢`,
  grows in `6s`, sells for `24¢`).
- **Planters** — when a crop is ripe, tap **Sell** to collect. The **⟳** repeat
  button on an empty planter auto-replants the same crop so it farms itself.
- **Buy** — spend earnings on upgrades:
  - **planter** — adds another planter slot.
  - **candle** — set one on a corner of the Ritual slate (four complete the circle).
  - **map** — unlocks the **Ritual slate**.
  - **notebook** — reveals every rune pattern in the spellbook (and `+1` multiplier).
- New, more valuable seeds unlock as your lifetime earnings grow.

## The Ritual slate

Once you own the **map** and place all **four candles** in the corners, tap a
candle to light it and choose one of four **runes**. The four chosen runes form a
pattern that spells a **rite**:

| Rite | Pattern | Effect |
|------|---------|--------|
| Rite of Plenty | `ᚠ ᚠ ᚠ ᚠ` | Conjure a windfall of coin |
| Rite of Bloom | `ᛇ ᛇ ᛇ ᛇ` | Instantly ripen every planter |
| Rite of Haste | `ᛋ ᛋ ᛋ ᛋ` | Double growth speed for 90s |
| Rite of Devotion | `ᚠ ᛇ ᛋ ᛟ` | Sacrifice all coin for a permanent `×` multiplier |

Buy the **notebook** to reveal these patterns in the in-game spellbook.

## Project layout

```
docs/
  index.html        # markup + phone shell
  css/style.css     # dark mobile styling
  js/
    data.js         # seeds, items, runes, spells, config
    game.js         # state, logic, save/load, offline progress
    ui.js           # rendering & interaction
    main.js         # bootstrap & game loop
```

It's all vanilla HTML/CSS/JS — no build step. Open `docs/index.html` to run locally.
