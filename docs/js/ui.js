/* ============================================================
   Idle Cult — UI rendering
   Rebuilds DOM on structural change; updates smooth values per frame.
   ============================================================ */

const UI = (() => {
  let buyCollapsed = false;
  let selectedCandle = null;   // which candle's rune picker is open
  let lastSig = '';

  const el = id => document.getElementById(id);
  const G = () => Game.state;

  function init() {
    el('buyToggle').addEventListener('click', () => { buyCollapsed = !buyCollapsed; forceRebuild(); render(); });
    el('menuBtn').addEventListener('click', e => { e.stopPropagation(); el('menu').classList.toggle('open'); });
    el('homeBtn').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.addEventListener('click', e => {
      if (!el('menu').contains(e.target) && e.target !== el('menuBtn')) el('menu').classList.remove('open');
    });
    el('menuReset').addEventListener('click', () => {
      if (confirm('Abandon the cult and start over? All progress will be lost.')) { Game.reset(); forceRebuild(); render(); }
      el('menu').classList.remove('open');
    });
  }
  function forceRebuild() { lastSig = ''; }

  function bar(pct, cls) {
    return `<div class="bar ${cls || ''}"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, pct * 100))}%"></div></div>`;
  }

  /* ---------- structural signature ---------- */
  function structuralSig() {
    const s = G();
    return [
      buyCollapsed, selectedCandle,
      s.planters.length,
      s.unlockedSeeds.join(','),
      JSON.stringify(s.items),
      Game.ritualUnlocked(),
      s.candles.map(c => (c.lit ? 'L' : 'd') + c.rune[0]).join(''),
      (Game.matchedSpell() || {}).id || '',
      s.planters.map(p => (p.seed || '_') + (p.repeat ? 'R' : '')).join('|'),
    ].join(';');
  }

  /* ---------- top bar ---------- */
  function renderTop() {
    el('money').textContent = Game.fmtMoney(G().cents);
    el('mult').textContent = '×' + Game.multiplier();
  }

  /* ---------- BUY ---------- */
  function renderBuy() {
    const wrap = el('buyList');
    wrap.style.display = buyCollapsed ? 'none' : 'block';
    el('buyChevron').classList.toggle('flipped', buyCollapsed);
    if (buyCollapsed) { wrap.innerHTML = ''; return; }
    let html = '';
    for (const item of Game.ITEMS) {
      if (Game.itemSoldOut(item)) continue;
      const price = Game.itemPrice(item);
      const stockLabel = item.kind !== 'once' ? ` <span class="muted">(${Game.itemStockLeft(item)} left)</span>` : '';
      html += `
        <div class="row">
          <div class="row-main"><div class="row-title">${item.name}${stockLabel}</div></div>
          <div class="row-price">${Game.fmtMoney(price)}</div>
          <button class="btn" data-buy="${item.id}" data-cost="${price}">Buy</button>
        </div>`;
    }
    wrap.innerHTML = html || '<div class="empty-note">Nothing left to buy here.</div>';
    wrap.querySelectorAll('[data-buy]').forEach(b =>
      b.addEventListener('click', () => { if (Game.buyItem(b.dataset.buy)) { forceRebuild(); render(); } }));
  }

  /* ---------- SEEDS ---------- */
  function renderSeeds() {
    const wrap = el('seedList');
    let html = '';
    for (const seed of Game.SEEDS) {
      if (!G().unlockedSeeds.includes(seed.id)) continue;
      html += `
        <div class="row">
          <div class="icon-box">${seed.icon}</div>
          <div class="row-main">
            <div class="row-title">${seed.name}</div>
            <div class="row-sub">${Game.fmtTime(Game.effGrow(seed))} → <span class="sell-${seed.id}">${Game.fmtMoney(seed.sell * Game.multiplier())}</span></div>
          </div>
          <div class="row-price">${Game.fmtMoney(seed.cost)}</div>
          <button class="btn primary" data-plant="${seed.id}" data-cost="${seed.cost}" data-needslot="1">Plant</button>
        </div>`;
    }
    const locked = Game.nextLockedSeed();
    if (locked) {
      const pct = G().totalEarned / locked.unlockAt;
      html += `
        <div class="row">
          <div class="icon-box locked-icon">⬤</div>
          <div class="row-main"><div class="row-title muted">???</div>${bar(pct, 'thin')}</div>
          <button class="btn icon-btn disabled">🔒</button>
        </div>`;
    }
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-plant]').forEach(b =>
      b.addEventListener('click', () => { if (Game.plant(b.dataset.plant)) { forceRebuild(); render(); } }));
  }

  /* ---------- PLANTERS ---------- */
  function renderPlanters() {
    const wrap = el('planterList');
    let html = '';
    G().planters.forEach((p, i) => {
      if (p.seed) {
        const seed = Game.SEEDS_BY_ID[p.seed];
        const grown = Game.isGrown(p, Game.now());
        html += `
          <div class="row planter" data-i="${i}">
            <div class="icon-box">${seed.icon}</div>
            <div class="row-main">
              <div class="row-title">${seed.name}</div>
              ${bar(grown ? 1 : Game.progress(p, Game.now()), grown ? 'done' : '')}
            </div>
            <div class="row-price small time-${i}">${grown ? 'ready' : Game.fmtTime(Game.timeLeft(p, Game.now()))}</div>
            <button class="btn ${grown ? '' : 'disabled'}" data-sell="${i}">Sell</button>
          </div>`;
      } else {
        html += `
          <div class="row planter empty" data-i="${i}">
            <div class="icon-box ghost"></div>
            <div class="row-main">${bar(0, '')}</div>
            <button class="btn icon-btn repeat ${p.repeat ? 'on' : ''}" data-repeat="${i}" title="Auto-replant">⟳</button>
          </div>`;
      }
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-sell]').forEach(b =>
      b.addEventListener('click', () => { if (Game.sell(+b.dataset.sell)) { forceRebuild(); render(); } }));
    wrap.querySelectorAll('[data-repeat]').forEach(b =>
      b.addEventListener('click', () => { Game.toggleRepeat(+b.dataset.repeat); forceRebuild(); render(); }));
  }

  /* ---------- RITUAL SLATE ---------- */
  function renderRitual() {
    const card = el('ritualCard');
    const body = el('ritualBody');
    if (!Game.ritualUnlocked()) {
      card.classList.add('locked');
      body.innerHTML = `<div class="locked-veil">Sealed — chart the grove with a <b>map</b> to begin.</div>`;
      return;
    }
    card.classList.remove('locked');

    const count = Game.candleCount();
    const corners = ['tl', 'tr', 'bl', 'br'];
    let cornersHtml = '';
    G().candles.forEach((c, i) => {
      const placed = i < count;
      if (!placed) {
        cornersHtml += `<div class="corner ${corners[i]} holder"><span class="holder-dot">·</span></div>`;
      } else {
        const rune = Game.RUNES_BY_ID[c.rune];
        cornersHtml += `
          <div class="corner ${corners[i]} candle ${c.lit ? 'lit' : ''} ${selectedCandle === i ? 'sel' : ''}" data-candle="${i}">
            <div class="flame"></div>
            <div class="candle-body"></div>
            <div class="rune ${c.lit ? '' : 'dim'}">${rune.sym}</div>
          </div>`;
      }
    });

    const matched = Game.matchedSpell();
    let center;
    if (count < Game.CONFIG.candleCount) {
      center = `<div class="slate-center hint">Set ${Game.CONFIG.candleCount - count} more candle${Game.CONFIG.candleCount - count > 1 ? 's' : ''} from the shop.</div>`;
    } else if (matched) {
      const ok = Game.canCast(matched);
      let extra = '';
      if (matched.id === 'devotion') extra = `<div class="cast-sub">needs ${Game.fmtMoney(Game.devotionCost())}</div>`;
      center = `
        <div class="slate-center matched">
          <div class="cast-name">${matched.name}</div>
          <button class="btn primary cast-btn ${ok ? '' : 'disabled'}" id="castBtn">Cast · ${matched.mana}✦</button>
          ${extra}
        </div>`;
    } else {
      center = `<div class="slate-center hint">Light the candles &amp; align the runes.</div>`;
    }

    // rune picker for the selected candle
    let picker = '';
    if (selectedCandle != null && selectedCandle < count) {
      const cur = G().candles[selectedCandle];
      picker = `<div class="rune-picker">
        ${Game.RUNES.map(r => `<button class="rune-opt ${cur.rune === r.id && cur.lit ? 'active' : ''}" data-setrune="${r.id}" title="${r.name} · ${r.mean}">${r.sym}</button>`).join('')}
        <button class="rune-opt snuff" data-snuff="1" title="Snuff candle">✕</button>
      </div>`;
    }

    const mana = Math.floor(G().mana), mmax = Game.manaMax();
    const manaBar = `
      <div class="mana-row">
        <span class="mana-label">✦ mana</span>
        <div class="bar mana"><div class="bar-fill" id="manaFill" style="width:${(mana / mmax) * 100}%"></div></div>
        <span class="mana-num" id="manaNum">${mana}/${mmax}</span>
      </div>`;

    body.innerHTML = `
      ${manaBar}
      <div class="slate">
        ${cornersHtml}
        ${center}
      </div>
      ${picker}
      ${renderSpellbook()}
    `;

    body.querySelectorAll('[data-candle]').forEach(c =>
      c.addEventListener('click', () => {
        const i = +c.dataset.candle;
        selectedCandle = (selectedCandle === i) ? null : i;
        forceRebuild(); render();
      }));
    body.querySelectorAll('[data-setrune]').forEach(b =>
      b.addEventListener('click', () => { Game.setRune(selectedCandle, b.dataset.setrune); forceRebuild(); render(); }));
    const snuff = body.querySelector('[data-snuff]');
    if (snuff) snuff.addEventListener('click', () => { Game.toggleCandle(selectedCandle); selectedCandle = null; forceRebuild(); render(); });
    const castBtn = el('castBtn');
    if (castBtn) castBtn.addEventListener('click', doCast);
  }

  function renderSpellbook() {
    const reveal = G().items.notebook > 0;
    let rows = SPELLS.map(sp => {
      const pat = reveal
        ? sp.pattern.map(rid => `<span class="mini-rune">${Game.RUNES_BY_ID[rid].sym}</span>`).join('')
        : `<span class="mini-rune q">?</span><span class="mini-rune q">?</span><span class="mini-rune q">?</span><span class="mini-rune q">?</span>`;
      return `<div class="spell-row">
          <div class="spell-pat">${pat}</div>
          <div class="spell-info"><div class="spell-name">${sp.name} <span class="spell-mana">${sp.mana}✦</span></div><div class="spell-desc">${sp.desc}</div></div>
        </div>`;
    }).join('');
    const note = reveal ? '' : `<div class="spell-hint">Buy the <b>notebook</b> to reveal these patterns.</div>`;
    return `<div class="spellbook"><div class="spellbook-title">Spellbook</div>${rows}${note}</div>`;
  }

  function doCast() {
    const res = Game.castSpell();
    if (!res || res.blocked) { flashCenter(); return; }
    if (res.prestige && typeof confetti === 'function') confetti();
    if (res.gain) toast(`The Rite of Plenty conjures <b>${Game.fmtMoney(res.gain)}</b>.`);
    if (res.id === 'bloom') toast('Every planter ripens at once.');
    if (res.id === 'quicken') toast('The grove quickens — grow times <b>halved</b> for 60s.');
    if (res.prestige) toast(`Devotion accepted. The cult grows stronger: <b>×${Game.multiplier()}</b>.`);
    selectedCandle = null;
    forceRebuild(); render();
  }
  function flashCenter() {
    const c = document.querySelector('.slate-center');
    if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  }

  /* ---------- master render ---------- */
  function render() {
    renderTop();
    const sig = structuralSig();
    if (sig !== lastSig) {
      renderBuy(); renderSeeds(); renderPlanters(); renderRitual();
      lastSig = sig;
    }
    updateLive();
  }

  /* smooth per-frame updates without rebuilding listeners */
  function updateLive() {
    const cents = G().cents;
    // planter bars & timers
    G().planters.forEach((p, i) => {
      const fill = document.querySelector(`.row.planter[data-i="${i}"] .bar-fill`);
      if (p.seed && fill) {
        const grown = Game.isGrown(p, Game.now());
        fill.style.width = (grown ? 100 : Game.progress(p, Game.now()) * 100) + '%';
        const tm = document.querySelector(`.time-${i}`);
        if (tm) tm.textContent = grown ? 'ready' : Game.fmtTime(Game.timeLeft(p, Game.now()));
        const sb = document.querySelector(`[data-sell="${i}"]`);
        if (sb) sb.classList.toggle('disabled', !grown);
        const fillDone = document.querySelector(`.row.planter[data-i="${i}"] .bar`);
        if (fillDone) fillDone.classList.toggle('done', grown);
      }
    });
    // affordability for cost buttons
    document.querySelectorAll('[data-cost]').forEach(b => {
      let ok = cents >= +b.dataset.cost;
      if (b.dataset.needslot) ok = ok && G().planters.some(p => !p.seed);
      b.classList.toggle('disabled', !ok);
    });
    // mana bar
    if (Game.ritualUnlocked()) {
      const mana = Math.floor(G().mana), mmax = Game.manaMax();
      const mf = el('manaFill'); if (mf) mf.style.width = (mana / mmax * 100) + '%';
      const mn = el('manaNum'); if (mn) mn.textContent = mana + '/' + mmax;
    }
    // cast button affordability (mana / gold)
    const matched = Game.matchedSpell();
    const castBtn = el('castBtn');
    if (matched && castBtn) castBtn.classList.toggle('disabled', !Game.canCast(matched));
    // haste (quickening) indicator
    const hb = el('hasteBadge');
    if (hb) {
      if (Game.hasteActive()) { hb.style.display = 'inline-flex'; hb.textContent = '⚡ ' + Game.fmtTime((G().hasteUntil - Game.now()) / 1000); }
      else hb.style.display = 'none';
    }
  }

  function toast(html) {
    const t = el('toast');
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove('show'), 5000);
  }
  function showOfflineToast(info) {
    if (!info) return;
    toast(`While you were away (${Game.fmtTime(info.seconds)}) the cult gathered <b>${Game.fmtMoney(info.gained)}</b>.`);
  }

  return { init, render, showOfflineToast, forceRebuild };
})();
