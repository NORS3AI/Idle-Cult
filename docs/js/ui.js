/* ============================================================
   Idle Cult — UI rendering
   Tabs (Grove / Notebook / Combat / Research), rebuilds on
   structural change, updates smooth values per frame.
   ============================================================ */

const UI = (() => {
  let buyCollapsed = false;
  let selectedCandle = null;
  let activeTab = 'home';
  let lastSig = '';

  const el = id => document.getElementById(id);
  const G = () => Game.state;

  function init() {
    el('buyToggle').addEventListener('click', () => { buyCollapsed = !buyCollapsed; forceRebuild(); render(); });
    el('menuBtn').addEventListener('click', e => { e.stopPropagation(); el('menu').classList.toggle('open'); });
    document.addEventListener('click', e => {
      if (!el('menu').contains(e.target) && e.target !== el('menuBtn')) el('menu').classList.remove('open');
    });
    el('menuReset').addEventListener('click', () => {
      if (confirm('Abandon the cult and start over? All progress will be lost.')) {
        Game.reset(); activeTab = 'home'; forceRebuild(); render();
      }
      el('menu').classList.remove('open');
    });
    el('tabbar').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]');
      if (!b) return;
      const id = b.dataset.tab;
      if (!Game.tabUnlocked(id)) return;
      activeTab = id; selectedCandle = null; Game.save(); forceRebuild(); render();
      window.scrollTo({ top: 0 });
    });
  }
  function forceRebuild() { lastSig = ''; }
  function act(changed) { if (changed) { Game.save(); forceRebuild(); render(); } }

  function bar(pct, cls) {
    return `<div class="bar ${cls || ''}"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, pct * 100))}%"></div></div>`;
  }

  /* ---------- structural signature ---------- */
  function structuralSig() {
    const s = G();
    return [
      activeTab, buyCollapsed, selectedCandle,
      s.planters.length,
      s.unlockedSeeds.join(','),
      JSON.stringify(s.items),
      Game.ritualUnlocked(),
      s.candles.map(c => (c.lit ? 'L' : 'd') + c.rune[0]).join(''),
      (Game.matchedSpell() || {}).id || '',
      s.planters.map(p => (p.seed || '_') + (p.repeat ? 'R' : '')).join('|'),
    ].join(';');
  }

  /* ---------- top bar + tabs ---------- */
  function renderTop() {
    el('money').textContent = Game.fmtMoney(G().cents);
    el('mult').textContent = '×' + Game.multiplier();
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
      const info = item.info ? ` <button class="info-btn" data-info="${item.id}" aria-label="info">ⓘ</button>` : '';
      html += `
        <div class="row">
          <div class="row-main"><div class="row-title">${item.name}${info}${stockLabel}</div></div>
          <div class="row-price">${Game.fmtMoney(price)}</div>
          <button class="btn" data-buy="${item.id}" data-cost="${price}">Buy</button>
        </div>`;
    }
    wrap.innerHTML = html || '<div class="empty-note">Nothing left to buy here.</div>';
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
      html += `
        <div class="row">
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
      html += `
        <div class="row">
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
    wrap.querySelectorAll('[data-sell]').forEach(b => b.addEventListener('click', () => act(Game.sell(+b.dataset.sell))));
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
      cornersHtml += `
        <div class="corner ${corners[i]} candle ${c.lit ? 'lit' : ''} ${selectedCandle === i ? 'sel' : ''}" data-candle="${i}">
          <div class="flame"></div><div class="candle-body"></div>
          <div class="rune ${c.lit ? '' : 'dim'}">${rune.sym}</div>
        </div>`;
    });

    const matched = Game.matchedSpell();
    let center;
    if (count < Game.CONFIG.candleCount) {
      const n = Game.CONFIG.candleCount - count;
      center = `<div class="slate-center hint">Set ${n} more candle${n > 1 ? 's' : ''} from the shop.</div>`;
    } else if (matched) {
      const ok = Game.canCast(matched);
      const extra = matched.id === 'devotion' ? `<div class="cast-sub">needs ${Game.fmtMoney(Game.devotionCost())}</div>` : '';
      center = `<div class="slate-center matched">
          <div class="cast-name">${matched.name}</div>
          <button class="btn primary cast-btn ${ok ? '' : 'disabled'}" id="castBtn">Cast · ${matched.mana}✦</button>${extra}
        </div>`;
    } else {
      center = `<div class="slate-center hint">Light the candles &amp; align the runes.</div>`;
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
        ${Game.RUNES.map(r => `<button class="rune-opt ${cur.rune === r.id && cur.lit ? 'active' : ''}" data-setrune="${r.id}" title="${r.name} · ${r.mean}">${r.sym}</button>`).join('')}
        <button class="rune-opt snuff" data-snuff="1" title="Snuff candle">✕</button>
      </div>`;
    }

    body.innerHTML = `${manaBar}<div class="slate">${cornersHtml}${center}</div>${picker}${renderSpellbook(false)}`;

    body.querySelectorAll('[data-candle]').forEach(c => c.addEventListener('click', () => {
      const i = +c.dataset.candle; selectedCandle = (selectedCandle === i) ? null : i; forceRebuild(); render();
    }));
    body.querySelectorAll('[data-setrune]').forEach(b => b.addEventListener('click', () => { Game.setRune(selectedCandle, b.dataset.setrune); act(true); }));
    const snuff = body.querySelector('[data-snuff]');
    if (snuff) snuff.addEventListener('click', () => { Game.toggleCandle(selectedCandle); selectedCandle = null; act(true); });
    const castBtn = el('castBtn');
    if (castBtn) castBtn.addEventListener('click', doCast);
  }

  function renderSpellbook(reveal) {
    reveal = reveal || Game.has('notebook');
    const rows = SPELLS.map(sp => {
      const pat = reveal
        ? sp.pattern.map(rid => `<span class="mini-rune">${Game.RUNES_BY_ID[rid].sym}</span>`).join('')
        : '<span class="mini-rune q">?</span>'.repeat(4);
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
    selectedCandle = null; act(true);
  }
  function flashCenter() {
    const c = document.querySelector('.slate-center');
    if (c) { c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  }

  /* ---------- NOTEBOOK tab ---------- */
  function renderNotebook() {
    const body = el('notebookBody');
    let html = `<p class="tab-intro">The rites you know. Jot down what each one does for you.</p>`;
    html += SPELLS.map(sp => {
      const pat = sp.pattern.map(rid => `<span class="mini-rune">${Game.RUNES_BY_ID[rid].sym}</span>`).join('');
      const note = (G().notes && G().notes[sp.id]) ? G().notes[sp.id] : '';
      return `<div class="nb-spell">
          <div class="nb-head"><div class="spell-pat">${pat}</div>
            <div class="spell-info"><div class="spell-name">${sp.name} <span class="spell-mana">${sp.mana}✦</span></div><div class="spell-desc">${sp.desc}</div></div></div>
          <textarea class="nb-notes" data-note="${sp.id}" placeholder="Your notes…">${escapeHtml(note)}</textarea>
        </div>`;
    }).join('');
    body.innerHTML = html;
    body.querySelectorAll('[data-note]').forEach(t => t.addEventListener('input', () => { Game.setNote(t.dataset.note, t.value); Game.save(); }));
  }

  /* ---------- COMBAT tab ---------- */
  function renderCombat() {
    el('combatBody').innerHTML = `
      <div class="tab-placeholder">
        <div class="tp-icon">⚔</div>
        <p>The map reveals roads out of the grove. Skirmishes, raids and rival covens await here.</p>
        <p class="muted">Combat is being prepared — check back soon.</p>
      </div>`;
  }

  /* ---------- RESEARCH tab ---------- */
  function renderResearch() {
    el('researchBody').innerHTML = `
      <div class="tab-placeholder">
        <div class="tp-icon">⚗</div>
        <p>The alembic bubbles. Here you'll unlock alchemical upgrades that reshape the whole cult.</p>
        <p class="muted">Research nodes are being prepared — check back soon.</p>
      </div>`;
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
    // income rate (ledger)
    const rate = Game.ledgerPerSec(false);
    const re = el('rate');
    if (re) { if (rate >= 1) { re.style.display = 'block'; re.textContent = '+' + Game.fmtMoney(rate) + '/s'; } else re.style.display = 'none'; }

    if (activeTab !== 'home') return; // only home has the live widgets below
    G().planters.forEach((p, i) => {
      const fill = document.querySelector(`.row.planter[data-i="${i}"] .bar-fill`);
      if (p.seed && fill) {
        const grown = Game.isGrown(p, Game.now());
        fill.style.width = (grown ? 100 : Game.progress(p, Game.now()) * 100) + '%';
        const tm = document.querySelector(`.time-${i}`); if (tm) tm.textContent = grown ? 'ready' : Game.fmtTime(Game.timeLeft(p, Game.now()));
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
      const matched = Game.matchedSpell(); const cb = el('castBtn');
      if (matched && cb) cb.classList.toggle('disabled', !Game.canCast(matched));
    }
    const hb = el('hasteBadge');
    if (hb) {
      if (Game.hasteActive()) { hb.style.display = 'inline-flex'; hb.textContent = '⚡ ' + Game.fmtTime((G().hasteUntil - Game.now()) / 1000); }
      else hb.style.display = 'none';
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
