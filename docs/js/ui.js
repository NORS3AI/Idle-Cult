/* ============================================================
   Idle Cult — UI rendering
   Tabs (Grove / Notebook / Combat / Research). Paginated shop,
   manual planting with "saved spots", hidden-effect rites.
   ============================================================ */

const UI = (() => {
  let buyPage = 0;
  let selectedCandle = null;
  let activeTab = 'home';
  let buyMult = 1;                 // field-upgrade buy quantity (× stepper)
  const MULTS = [1, 5, 10, 25];
  let lastSig = '';

  const el = id => document.getElementById(id);
  const G = () => Game.state;

  function init() {
    el('buyUp').addEventListener('click', () => { buyPage = Math.max(0, buyPage - 1); forceRebuild(); render(); });
    el('buyDown').addEventListener('click', () => { buyPage = Math.min(maxBuyPage(), buyPage + 1); forceRebuild(); render(); });
    el('speedBtn').addEventListener('click', () => { Game.cycleSpeed(); Game.save(); forceRebuild(); render(); });
    el('menuBtn').addEventListener('click', openSettings);
    el('settingsClose').addEventListener('click', () => el('settings').style.display = 'none');
    el('settings').addEventListener('click', e => { if (e.target === el('settings')) el('settings').style.display = 'none'; });
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
      // combat
      s.combat ? s.combat.status + s.combat.log.length : 'nocombat',
      s.hpBought + '/' + s.cashLootBought + '/' + s.manaLootBought,
      buyMult, (s.trinkets || []).length,
      // prestige (pending only forces rebuilds while its tab is open)
      Game.prestigeUnlocked(), Game.prestigePoints(),
      activeTab === 'prestige' ? Game.pendingPrestige() : 0,
    ].join(';');
  }

  /* ---------- top bar + tabs ---------- */
  function renderTop() {
    el('money').textContent = Game.fmtMoney(G().cents);
    el('mult').textContent = Game.speed();
    el('speedBtn').classList.toggle('fast', Game.speed() > 1);
    const mt = el('manaTop');
    mt.innerHTML = '✦&nbsp;' + Math.floor(G().mana);
    mt.style.display = (Game.ritualUnlocked() || Game.has('auto-harvester') || G().mana > 0) ? 'inline-flex' : 'none';
  }
  function renderTabs() {
    if (!Game.tabUnlocked(activeTab)) activeTab = 'home';
    el('tabbar').innerHTML = Game.TABS.filter(t => Game.tabUnlocked(t.id)).map(t =>
      `<button class="tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}" title="${t.label}">
         <span class="tab-icon">${t.icon}</span><span class="tab-label">${t.label}</span>
       </button>`).join('');
  }
  function showView() {
    ['home', 'notebook', 'combat', 'research', 'prestige'].forEach(v =>
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

    let picker = '';
    if (selectedCandle != null && selectedCandle < count) {
      const cur = G().candles[selectedCandle];
      picker = `<div class="rune-picker">
        ${Game.RUNES.map(r => `<button class="rune-opt ${cur.rune === r.id && cur.lit ? 'active' : ''}" data-setrune="${r.id}" title="${r.name}">${r.sym}</button>`).join('')}
        <button class="rune-opt snuff" data-snuff="1" title="Snuff candle">✕</button>
      </div>`;
    }

    const note = `<div class="rite-hint">What a rite does is for you to discover — record it in your <b>Notebook</b>.</div>`;
    body.innerHTML = `<div class="slate">${cornersHtml}${center}</div>${picker}${note}`;

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

  /* ---------- COMBAT ---------- */
  function heartRow(n) { return `<span class="hp-badge">❤ ${n}</span>`; }

  function renderCombat() {
    const body = el('combatBody');
    const c = Game.combat();
    if (!c) { body.innerHTML = renderAreaPicker(); bindAreaPicker(body); return; }

    const area = Game.AREAS_BY_ID[c.areaId];
    const pct = Math.min(1, c.elapsed / c.duration);
    const running = c.status === 'running';

    // event log (newest at the bottom)
    const logHtml = c.log.slice(-9).map(e => {
      const bits = [];
      if (e.dmg) bits.push(`<span class="ev-hp">❤ -${e.dmg}</span>`);
      if (e.cash) bits.push(`<span class="ev-cash">${Game.fmtMoney(e.cash)}</span>`);
      if (e.mana) bits.push(`<span class="ev-mana">✦ ${e.mana}</span>`);
      return `<div class="ev-row"><span class="ev-t">${Game.fmtTime(e.t)}</span><span class="ev-name">${e.name}</span><span class="ev-eff">${bits.join(', ')}</span></div>`;
    }).join('') || '<div class="ev-row muted"><span class="ev-name">The expedition begins…</span></div>';

    // field upgrades
    const upg = Game.FIELD_UPGRADES.map(f => {
      const cost = Game.fieldCost(f.id);
      const costHtml = cost.mana != null ? `✦ ${cost.mana}` : Game.fmtMoney(cost.cash);
      let head, small;
      if (f.id === 'shield') { const st = Game.shieldTier(); head = `🛡 +${st.minutes}m`; small = `${Game.fmtTime(c.shieldRemaining)} · ${Math.round(st.block * 100)}%`; }
      else if (f.id === 'hp') { head = `❤ +${Game.fieldNextAmount('hp')}`; small = `+${Game.hpAdded()} total`; }
      else if (f.id === 'cashloot') { head = `$ +1% loot`; small = `+${G().cashLootBought}%`; }
      else { head = `✦ +1% loot`; small = `+${G().manaLootBought}%`; }
      return `<button class="upg" data-field="${f.id}" ${running ? '' : 'disabled'}>
          <div class="upg-head">${head}</div>
          <div class="upg-cost">${costHtml}</div>
          <div class="upg-small">${small}</div>
        </button>`;
    }).join('');

    let footer;
    if (running) {
      footer = `<div class="run-foot">
          <div class="loot-now">${Game.fmtMoney(c.runCash)}, ✦ ${c.runMana}</div>
          <button class="btn" id="fleeBtn">Flee with loot</button>
        </div>`;
    } else if (c.status === 'complete') {
      footer = `<div class="run-foot done">
          <div class="foot-msg">✔ Expedition complete!</div>
          <div class="loot-now">${Game.fmtMoney(c.reward.cash)}, ✦ ${c.reward.mana}</div>
          <button class="btn primary" id="collectBtn">Collect loot</button>
        </div>`;
    } else { // dead
      footer = `<div class="run-foot dead">
          <div class="foot-msg">💀 You died — loot lost.</div>
          <button class="btn" id="dieBtn">Back to the grove</button>
        </div>`;
    }

    body.innerHTML = `
      <div class="loc-head">
        <div class="loc-title">${area.icon} ${area.name}</div>
        <div class="loc-sub">Risk: ❤ ${area.riskMin}–${area.riskMax}</div>
        <div class="loc-sub">Reward: ${Game.fmtMoney(area.cashMin)}–${Game.fmtMoney(area.cashMax)}, ✦ ${area.manaMin}–${area.manaMax}</div>
      </div>
      <div class="prog-head"><span>Progress</span>
        <span class="prog-right"><span id="progTime">${running ? Game.fmtTime((c.duration - c.elapsed) / Game.speed()) : ''}</span>
        ${running ? `<button class="pause-btn ${c.paused ? 'paused' : ''}" id="pauseBtn">${c.paused ? '▶' : '⏸'}</button>` : ''}</span></div>
      ${bar(pct, 'combat')}
      <div class="combat-cols">
        <div class="log-col">
          <div class="col-title">Event Log <span class="hp-inline" id="hpNow">${heartRow(c.hp)}</span></div>
          <div class="event-log" id="eventLog">${logHtml}</div>
        </div>
        <div class="upg-col">
          <div class="col-title">Field upgrades <span class="mult-step"><button data-mult="-">−</button><b id="multN">×${buyMult}</b><button data-mult="+">+</button></span></div>
          <div class="upg-grid">${upg}</div>
        </div>
      </div>
      ${footer}`;

    // handlers
    const on = (id, fn) => { const e = el(id); if (e) e.addEventListener('click', fn); };
    on('pauseBtn', () => { Game.togglePause(); act(true); });
    on('fleeBtn', () => { const r = Game.collectLoot(); toast(`Fled with <b>${Game.fmtMoney(r.cash)}</b> &amp; <b>✦${r.mana}</b>.`); act(true); });
    on('collectBtn', () => { const r = Game.collectLoot(); toast(`Collected <b>${Game.fmtMoney(r.cash)}</b> &amp; <b>✦${r.mana}</b>.${r.trinket ? ' A trinket dropped!' : ''}`); act(true); });
    on('dieBtn', () => { Game.dismissDeath(); act(true); });
    body.querySelectorAll('[data-field]').forEach(b => b.addEventListener('click', () => act(Game.buyField(b.dataset.field, buyMult))));
    body.querySelectorAll('[data-mult]').forEach(b => b.addEventListener('click', () => {
      const i = MULTS.indexOf(buyMult);
      buyMult = b.dataset.mult === '+' ? MULTS[Math.min(MULTS.length - 1, i + 1)] : MULTS[Math.max(0, i - 1)];
      forceRebuild(); render();
    }));
  }

  function renderAreaPicker() {
    let cards = Game.AREAS.map(a => `
      <div class="area-card">
        <div class="loc-title">${a.icon} ${a.name}</div>
        <div class="loc-sub">Risk: ❤ ${a.riskMin}–${a.riskMax}</div>
        <div class="loc-sub">Reward: ${Game.fmtMoney(a.cashMin)}–${Game.fmtMoney(a.cashMax)}, ✦ ${a.manaMin}–${a.manaMax}</div>
        <button class="btn primary area-start" data-area="${a.id}">Start expedition</button>
      </div>`).join('');
    const trinkets = (G().trinkets || []).length
      ? `<div class="trinket-box"><div class="col-title">Trinkets</div><div>${G().trinkets.map(() => '🔮').join(' ')}</div></div>`
      : '';
    return `<div class="you-hp">You have ${heartRow(Game.maxHp())}</div>${cards}${trinkets}`;
  }
  function bindAreaPicker(body) {
    body.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => act(Game.startExpedition(b.dataset.area))));
  }
  function renderResearch() {
    el('researchBody').innerHTML = `<div class="tab-placeholder"><div class="tp-icon">⚗</div>
        <p>The alembic bubbles. Here you'll unlock alchemical upgrades — including deeper mana reserves.</p>
        <p class="muted">Research nodes are being prepared — check back soon.</p></div>`;
  }

  /* ---------- PRESTIGE ---------- */
  function renderPrestige() {
    const body = el('prestigeBody');
    const pts = Game.prestigePoints();
    const pending = Game.pendingPrestige();
    const speed = Math.round(pts * Game.CONFIG.prestigeSpeedPer * 100);
    body.innerHTML = `
      <p class="tab-intro">Offer everything to the cult and begin anew. You keep only your devotion.</p>
      <div class="prestige-stat"><span>Prestige points</span><b>${pts}</b></div>
      <div class="prestige-stat"><span>Plant speed bonus</span><b>+${speed}%</b></div>
      <div class="prestige-stat"><span>Ready to claim now</span><b class="${pending > 0 ? 'good' : 'muted'}">+${pending}</b></div>
      <div class="prestige-note">You earn <b>+1 point per $50</b> earned this run. Prestiging resets your money,
      plants, upgrades, candles, mana and combat progress — but each point permanently adds
      <b>+1% plant speed</b>.</div>
      <button class="btn primary prestige-btn ${pending > 0 ? '' : 'disabled'}" id="prestigeBtn">
        Prestige for +${pending} point${pending === 1 ? '' : 's'}</button>`;
    const b = el('prestigeBtn');
    if (b) b.addEventListener('click', () => {
      if (Game.pendingPrestige() < 1) return;
      if (!confirm(`Prestige now for +${Game.pendingPrestige()} points? You will lose everything except prestige points.`)) return;
      const r = Game.doPrestige();
      if (r) { activeTab = 'home'; if (typeof confetti === 'function') confetti(); toast(`Reborn with <b>${r.total}</b> prestige points — +${Math.round(r.total * Game.CONFIG.prestigeSpeedPer * 100)}% plant speed.`); forceRebuild(); render(); }
    });
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
      else if (activeTab === 'prestige') renderPrestige();
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

    if (activeTab === 'combat') { updateCombatLive(); return; }
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
    const cb = el('castBtn'); if (cb) cb.classList.toggle('disabled', !Game.canCastRitual());
  }

  function updateCombatLive() {
    const c = Game.combat(); if (!c) return;
    const fill = document.querySelector('.bar.combat .bar-fill');
    if (fill) fill.style.width = Math.min(100, c.elapsed / c.duration * 100) + '%';
    if (c.status === 'running') {
      const pt = el('progTime'); if (pt) pt.textContent = Game.fmtTime((c.duration - c.elapsed) / Game.speed());
      const hn = el('hpNow'); if (hn) hn.innerHTML = `<span class="hp-badge">❤ ${c.hp}</span>`;
      const ln = document.querySelector('.run-foot .loot-now'); if (ln) ln.textContent = `${Game.fmtMoney(c.runCash)}, ✦ ${c.runMana}`;
      // field-upgrade affordability
      const pool = G().cents + c.runCash, mpool = G().mana + c.runMana;
      document.querySelectorAll('[data-field]').forEach(b => {
        const cost = Game.fieldCost(b.dataset.field);
        const ok = cost.mana != null ? mpool >= cost.mana : pool >= cost.cash;
        b.classList.toggle('cant', !ok);
      });
    }
  }

  /* ---------- SETTINGS ---------- */
  function openSettings() { renderSettings(); el('settings').style.display = 'flex'; }

  const DEV_ROWS = [
    { kind: 'cash',     label: '$',            amts: [10, 100, 1000, 1000000], money: true },
    { kind: 'mana',     label: '✦ mana',       amts: [10, 100, 1000, 1000000] },
    { kind: 'prestige', label: 'Prestige pts', amts: [10, 100, 1000, 1000000] },
    { kind: 'cashloot', label: '$ loot %',     amts: [10, 50, 100, 1000] },
    { kind: 'manaloot', label: '✦ loot %',     amts: [10, 50, 100, 1000] },
    { kind: 'hp',       label: 'HP',           amts: [1, 10, 50, 100, 1000] },
  ];

  function renderSettings() {
    const dev = Game.devMode();
    let devCheats = '';
    if (dev) {
      devCheats = DEV_ROWS.map(r => `
        <div class="dev-row"><span class="dev-label">${r.label}</span>
          <span class="dev-btns">${r.amts.map(a => `<button class="dev-b" data-dev="${r.kind}" data-amt="${a}" data-money="${r.money ? 1 : 0}">+${a >= 1000000 ? (a / 1000000) + 'M' : a}</button>`).join('')}</span>
        </div>`).join('');
      devCheats = `<div class="dev-panel">${devCheats}</div>`;
    }

    const notes = Game.PATCH_NOTES.map(p => `
      <div class="patch">
        <div class="patch-head"><b>v${p.v}</b> — ${p.title}</div>
        <ul class="patch-list">${p.items.map(i => `<li>${i}</li>`).join('')}</ul>
      </div>`).join('');

    el('settingsBody').innerHTML = `
      <div class="set-section">
        <label class="dev-toggle"><input type="checkbox" id="devChk" ${dev ? 'checked' : ''}/> Dev Panel</label>
        ${devCheats}
      </div>
      <div class="set-section">
        <button class="btn danger" id="resetBtn">Abandon &amp; reset everything</button>
      </div>
      <div class="set-section">
        <div class="set-title">Patch notes</div>
        ${notes}
      </div>
      <div class="set-foot">Idle Cult · progress auto-saves to this browser</div>`;

    el('devChk').addEventListener('change', e => { Game.setDevMode(e.target.checked); renderSettings(); });
    el('resetBtn').addEventListener('click', () => {
      if (confirm('Abandon the cult and start over? All progress will be lost.')) {
        Game.reset(); activeTab = 'home'; buyPage = 0; el('settings').style.display = 'none'; forceRebuild(); render();
      }
    });
    el('settingsBody').querySelectorAll('[data-dev]').forEach(b => b.addEventListener('click', () => {
      let amt = +b.dataset.amt;
      if (b.dataset.money === '1') amt *= 100;   // dollars → cents
      Game.devGive(b.dataset.dev, amt); forceRebuild(); render();
    }));
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
