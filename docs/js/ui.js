/* ============================================================
   Idle Cult — UI rendering
   Tabs (Grove / Notebook / Combat / Research). Paginated shop,
   manual planting with "saved spots", hidden-effect rites.
   ============================================================ */

const UI = (() => {
  let buyPage = 0;
  let selectedCandle = null;
  let activeTab = 'home';
  let lastSig = '';

  const el = id => document.getElementById(id);
  const G = () => Game.state;

  function init() {
    el('buyUp').addEventListener('click', () => { buyPage = Math.max(0, buyPage - 1); forceRebuild(); render(); });
    el('buyDown').addEventListener('click', () => { buyPage = Math.min(maxBuyPage(), buyPage + 1); forceRebuild(); render(); });
    el('speedBtn').addEventListener('click', () => { Game.cycleSpeed(); Game.save(); forceRebuild(); render(); });
    el('menuBtn').addEventListener('click', e => { e.stopPropagation(); el('menu').classList.toggle('open'); });
    document.addEventListener('click', e => {
      if (!el('menu').contains(e.target) && e.target !== el('menuBtn')) el('menu').classList.remove('open');
    });
    el('menuReset').addEventListener('click', () => {
      if (confirm('Abandon the cult and start over? All progress will be lost.')) {
        Game.reset(); activeTab = 'home'; buyPage = 0; forceRebuild(); render();
      }
      el('menu').classList.remove('open');
    });
    el('tabbar').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (!b || !Game.tabUnlocked(b.dataset.tab)) return;
      activeTab = b.dataset.tab; selectedCandle = null; Game.save(); forceRebuild(); render();
      window.scrollTo({ top: 0 });
    });
  }
  function forceRebuild() { lastSig = ''; }
  function act(changed) { if (changed) { Game.save(); forceRebuild(); render(); } }

  function shopItems() { return Game.ITEMS.filter(i => !Game.itemSoldOut(i)); }
  function maxBuyPage() { return Math.max(0, Math.ceil(shopItems().length / Game.CONFIG.buyPageSize) - 1); }

  function bar(pct, cls) {
    return `<div class="bar ${cls || ''}"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, pct * 100))}%"></div></div>`;
  }

  /* ---------- structural signature ---------- */
  function structuralSig() {
    const s = G();
    return [
      activeTab, buyPage, selectedCandle,
      s.planters.length,
      s.unlockedSeeds.join(','),
      JSON.stringify(s.items),
      Game.ritualUnlocked(),
      s.candles.map(c => (c.lit ? 'L' : 'd') + c.rune[0]).join(''),
      Game.ritualReady(),
      (s.discovered || []).join(','),
      s.planters.map(p => (p.seed || ('_' + (p.lastSeed || ''))) + (p.repeat ? 'R' : '')).join('|'),
    ].join(';');
  }

  /* ---------- top bar + tabs ---------- */
  function renderTop() {
    el('money').textContent = Game.fmtMoney(G().cents);
    el('mult').textContent = Game.speed();
    el('speedBtn').classList.toggle('fast', Game.speed() > 1);
  }
  function renderTabs() {
    if (!Game.tabUnlocked(activeTab)) activeTab = 'home';
    el('tabbar').innerHTML = Game.TABS.filter(t => Game.tabUnlocked(t.id)).map(t =>
      `<button class="tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}" title="${t.label}">
         <span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span>
       </button>`).join('');
  }
  function showView() {
    ['home', 'notebook', 'combat', 'research'].forEach(v =>
      el('view-' + v).style.display = (v === activeTab ? 'block' : 'none'));
  }

  /* ---------- BUY (paginated, four at a time) ---------- */
  function renderBuy() {
    const items = shopItems();
    const max = maxBuyPage();
    if (buyPage > max) buyPage = max;
    const size = Game.CONFIG.buyPageSize;
    const page = items.slice(buyPage * size, buyPage * size + size);

    el('buyUp').classList.toggle('disabled', buyPage <= 0);
    el('buyDown').classList.toggle('disabled', buyPage >= max);

    const wrap = el('buyList');
    wrap.innerHTML = page.map(item => {
      const price = Game.itemPrice(item);
      const stockLabel = item.kind !== 'once' ? ` <span class="muted">(${Game.itemStockLeft(item)} left)</span>` : '';
      const info = item.info ? ` <button class="info-btn" data-info="${item.id}" aria-label="info">ⓘ</button>` : '';
      return `<div class="row">
          <div class="row-main"><div class="row-title">${item.name}${info}${stockLabel}</div></div>
          <div class="row-price">${Game.fmtMoney(price)}</div>
          <button class="btn" data-buy="${item.id}" data-cost="${price}">Buy</button>
        </div>`;
    }).join('') || '<div class="empty-note">Nothing left to buy.</div>';

    wrap.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => act(Game.buyItem(b.dataset.buy))));
    wrap.querySelectorAll('[data-info]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); const it = Game.ITEMS_BY_ID[b.dataset.info]; toast(`<b>${it.name}</b> — ${it.desc}`);
    }));
  }

  /* ---------- SEEDS ---------- */
  function renderSeeds() {
    const wrap = el('seedList');
    let html = '';
    for (const seed of Game.SEEDS) {
      if (!G().unlockedSeeds.includes(seed.id)) continue;
      html += `<div class="row">
          <div class="icon-box">${seed.icon}</div>
          <div class="row-main">
            <div class="row-title">${seed.name}</div>
            <div class="row-sub">${Game.fmtTime(Game.effGrow(seed))} → ${Game.fmtMoney(seed.sell * Game.multiplier())}</div>
          </div>
          <div class="row-price">${Game.fmtMoney(seed.cost)}</div>
          <button class="btn primary" data-plant="${seed.id}" data-cost="${seed.cost}" data-needslot="1">Plant</button>
        </div>`;
    }
    const locked = Game.nextLockedSeed();
    if (locked) {
      const pct = G().totalEarned / locked.unlockAt;
      html += `<div class="row">
          <div class="icon-box locked-icon">⬤</div>
          <div class="row-main"><div class="row-title muted">???</div>${bar(pct, 'thin')}</div>
          <button class="btn icon-btn disabled">🔒</button>
        </div>`;
    }
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-plant]').forEach(b => b.addEventListener('click', () => act(Game.plant(b.dataset.plant))));
  }

  /* ---------- PLANTERS ---------- */
  function renderPlanters() {
    const wrap = el('planterList');
    let html = '';
    G().planters.forEach((p, i) => {
      const rep = `<button class="btn icon-btn repeat ${p.repeat ? 'on' : ''}" data-repeat="${i}" title="Save this spot — keep replanting this crop">⟳</button>`;
      if (p.seed) {
        const seed = Game.SEEDS_BY_ID[p.seed];
        const grown = Game.isGrown(p);
        html += `<div class="row planter" data-i="${i}">
            <div class="icon-box">${seed.icon}</div>
            <div class="row-main"><div class="row-title">${seed.name}</div>${bar(grown ? 1 : Game.progress(p), grown ? 'done' : '')}</div>
            <div class="row-price small time-${i}">${grown ? 'ready' : Game.fmtTime(Game.timeLeft(p))}</div>
            ${rep}
            <button class="btn ${grown ? '' : 'disabled'}" data-sell="${i}">Sell</button>
          </div>`;
      } else if (p.repeat && p.lastSeed) {
        const seed = Game.SEEDS_BY_ID[p.lastSeed];
        html += `<div class="row planter empty saved" data-i="${i}">
            <div class="icon-box faded">${seed.icon}</div>
            <div class="row-main"><div class="row-title muted">${seed.name}</div>${bar(0, '')}</div>
            ${rep}
            <button class="btn primary" data-replant="${i}" data-cost="${seed.cost}">Plant</button>
          </div>`;
      } else {
        html += `<div class="row planter empty" data-i="${i}">
            <div class="icon-box ghost"></div>
            <div class="row-main">${bar(0, '')}</div>
            ${rep}
          </div>`;
      }
    });
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => act(Game.sell(+b.dataset.sell))));
    wrap.querySelectorAll('[data-replant]').forEach(b => b.addEventListener('click', () => act(Game.replantSpot(+b.dataset.replant))));
    wrap.querySelectorAll('[data-repeat]').forEach(b => b.addEventListener('click', () => { Game.toggleRepeat(+b.dataset.repeat); act(true); }));
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
      if (i >= count) { cornersHtml += `<div class="corner ${corners[i]} holder"><span class="holder-dot">·</span></div>`; return; }
      const rune = Game.RUNES_BY_ID[c.rune];
      cornersHtml += `<div class="corner ${corners[i]} candle ${c.lit ? 'lit' : ''} ${selectedCandle === i ? 'sel' : ''}" data-candle="${i}">
          <div class="flame"></div><div class="candle-body"></div>
          <div class="rune ${c.lit ? '' : 'dim'}">${rune.sym}</div>
        </div>`;
    });

    let center;
    if (count < Game.CONFIG.candleCount) {
      const n = Game.CONFIG.candleCount - count;
      center = `<div class="slate-center hint">Set ${n} more candle${n > 1 ? 's' : ''} from the shop.</div>`;
    } else if (Game.ritualReady()) {
      const ok = Game.canCastRitual();
      center = `<div class="slate-center matched">
          <div class="cast-name">a rite stirs…</div>
          <button class="btn primary cast-btn ${ok ? '' : 'disabled'}" id="castBtn">Cast · ${Game.ritualManaCost()}✦</button>
        </div>`;
    } else {
      center = `<div class="slate-center hint">Light all four candles — <b>one of each rune</b>.</div>`;
    }

    const mana = Math.floor(G().mana), mmax = Game.manaMax();
    const manaBar = `<div class="mana-row">
        <span class="mana-label">✦ mana</span>
        <div class="bar mana"><div class="bar-fill" id="manaFill" style="width:${(mana / mmax) * 100}%"></div></div>
        <span class="mana-num" id="manaNum">${mana}/${mmax}</span>
      </div>`;

    let picker = '';
    if (selectedCandle != null && selectedCandle < count) {
      const cur = G().candles[selectedCandle];
      picker = `<div class="rune-picker">
        ${Game.RUNES.map(r => `<button class="rune-opt ${cur.rune === r.id && cur.lit ? 'active' : ''}" data-setrune="${r.id}" title="${r.name}">${r.sym}</button>`).join('')}
        <button class="rune-opt snuff" data-snuff="1" title="Snuff candle">✕</button>
      </div>`;
    }

    const note = `<div class="rite-hint">What a rite does is for you to discover — record it in your <b>Notebook</b>.</div>`;
    body.innerHTML = `${manaBar}<div class="slate">${cornersHtml}${center}</div>${picker}${note}`;

    body.querySelectorAll('[data-candle]').forEach(c => c.addEventListener('click', () => {
      const i = +c.dataset.candle; selectedCandle = (selectedCandle === i) ? null : i; forceRebuild(); render();
    }));
    body.querySelectorAll('[data-setrune]').forEach(b => b.addEventListener('click', () => { Game.setRune(selectedCandle, b.dataset.setrune); act(true); }));
    const snuff = body.querySelector('[data-snuff]');
    if (snuff) snuff.addEventListener('click', () => { Game.toggleCandle(selectedCandle); selectedCandle = null; act(true); });
    const castBtn = el('castBtn');
    if (castBtn) castBtn.addEventListener('click', doCast);
  }

  function doCast() {
    const res = Game.castRitual();
    if (!res || res.blocked) { flashCenter(); if (res && res.reason === 'mana') toast('Not enough mana.'); return; }
    toast('The runes flare, then the circle goes dark.');   // effect deliberately unspoken
    act(true);
  }
  function flashCenter() {
    const c = document.querySelector('.slate-center');
    if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  }

  /* ---------- NOTEBOOK tab ---------- */
  function renderNotebook() {
    const body = el('notebookBody');
    const disc = (G().discovered || []);
    if (!disc.length) {
      body.innerHTML = `<p class="tab-intro">Perform a rite at the Ritual slate and it will be recorded here — then jot down what you think it does.</p>`;
      return;
    }
    let html = `<p class="tab-intro">Rites you have performed. Write your own notes on what each one does.</p>`;
    html += disc.map(id => {
      const sp = Game.SPELLS_BY_ID[id];
      const pat = sp.runes.map(rid => `<span class="mini-rune">${Game.RUNES_BY_ID[rid].sym}</span>`).join('');
      const note = (G().notes && G().notes[id]) ? G().notes[id] : '';
      return `<div class="nb-spell">
          <div class="nb-head"><div class="spell-pat">${pat}</div>
            <div class="spell-info"><div class="spell-name">Unnamed rite</div><div class="spell-desc muted">one of each rune · ${sp.mana}✦</div></div></div>
          <textarea class="nb-notes" data-note="${id}" placeholder="What does it do?">${escapeHtml(note)}</textarea>
        </div>`;
    }).join('');
    body.innerHTML = html;
    body.querySelectorAll('[data-note]').forEach(t => t.addEventListener('input', () => { Game.setNote(t.dataset.note, t.value); Game.save(); }));
  }

  /* ---------- COMBAT / RESEARCH placeholders ---------- */
  function renderCombat() {
    el('combatBody').innerHTML = `<div class="tab-placeholder"><div class="tp-icon">⚔</div>
        <p>The map reveals roads out of the grove — skirmishes and rival covens await.</p>
        <p class="muted">Combat is being prepared — check back soon.</p></div>`;
  }
  function renderResearch() {
    el('researchBody').innerHTML = `<div class="tab-placeholder"><div class="tp-icon">⚗</div>
        <p>The alembic bubbles. Here you'll unlock alchemical upgrades — including deeper mana reserves.</p>
        <p class="muted">Research nodes are being prepared — check back soon.</p></div>`;
  }

  /* ---------- master render ---------- */
  function render() {
    renderTop();
    const sig = structuralSig();
    if (sig !== lastSig) {
      renderTabs(); showView();
      if (activeTab === 'home') { renderBuy(); renderSeeds(); renderPlanters(); renderRitual(); }
      else if (activeTab === 'notebook') renderNotebook();
      else if (activeTab === 'combat') renderCombat();
      else if (activeTab === 'research') renderResearch();
      lastSig = sig;
    }
    updateLive();
  }

  /* smooth per-frame updates without rebuilding listeners */
  function updateLive() {
    const cents = G().cents;
    const rate = Game.ledgerPerSec(false);
    const re = el('rate');
    if (re) { if (rate >= 1) { re.style.display = 'block'; re.textContent = '+' + Game.fmtMoney(rate) + '/s'; } else re.style.display = 'none'; }

    if (activeTab !== 'home') return;
    G().planters.forEach((p, i) => {
      const fill = document.querySelector(`.row.planter[data-i="${i}"] .bar-fill`);
      if (p.seed && fill) {
        const grown = Game.isGrown(p);
        fill.style.width = (grown ? 100 : Game.progress(p) * 100) + '%';
        const tm = document.querySelector(`.time-${i}`); if (tm) tm.textContent = grown ? 'ready' : Game.fmtTime(Game.timeLeft(p));
        const sb = document.querySelector(`[data-sell="${i}"]`); if (sb) sb.classList.toggle('disabled', !grown);
        const bo = document.querySelector(`.row.planter[data-i="${i}"] .bar`); if (bo) bo.classList.toggle('done', grown);
      }
    });
    document.querySelectorAll('[data-cost]').forEach(b => {
      let ok = cents >= +b.dataset.cost;
      if (b.dataset.needslot) ok = ok && G().planters.some(p => !p.seed);
      b.classList.toggle('disabled', !ok);
    });
    if (Game.ritualUnlocked()) {
      const mana = Math.floor(G().mana), mmax = Game.manaMax();
      const mf = el('manaFill'); if (mf) mf.style.width = (mana / mmax * 100) + '%';
      const mn = el('manaNum'); if (mn) mn.textContent = mana + '/' + mmax;
      const cb = el('castBtn'); if (cb) cb.classList.toggle('disabled', !Game.canCastRitual());
    }
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function toast(html) {
    const t = el('toast'); t.innerHTML = html; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 5000);
  }
  function showOfflineToast(info) {
    if (!info) return;
    toast(`While you were away (${Game.fmtTime(info.seconds)}) the cult gathered <b>${Game.fmtMoney(info.gained)}</b>.`);
  }

  return { init, render, showOfflineToast, forceRebuild };
})();
