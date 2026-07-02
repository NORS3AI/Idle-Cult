/* ============================================================
   Idle Cult — UI rendering
   Tabs (Grove / Notebook / Combat / Research). Paginated shop,
   manual planting with "saved spots", hidden-effect rites.
   ============================================================ */

const UI = (() => {
  let buyPage = 0;
  let activeTab = 'home';
  let buyMult = 1;                 // field-upgrade buy quantity (× stepper)
  const MULTS = [1, 5, 10, 25];
  let lastSig = '';
  const flashState = {};           // planter index → last flashAt handled
  const openInfo = {};             // shop item id → info tip expanded
  function riteVal(n) { return n === 1 ? '1' : (1 + (n - 1) / 10).toFixed(1); }  // 1, 1.1, 1.2, …

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
      activeTab = b.dataset.tab; Game.save(); forceRebuild(); render();
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
      activeTab, buyPage,
      s.planters.length,
      s.unlockedSeeds.join(','),
      JSON.stringify(s.items),
      Game.ritualUnlocked(),
      s.candles.slice(0, 4).map(c => c.lit ? 'L' : 'd').join(''),
      Game.runeSeqStr(),
      (s.discovered || []).join(','),
      s.planters.map(p => (p.seed || ('_' + (p.lastSeed || ''))) + (p.repeat ? 'R' : '') + (p.riteCount || 0)).join('|'),
      Game.autoHarvestOn(),
      // combat
      s.combat ? s.combat.status + s.combat.log.length : 'nocombat',
      s.hpBought + '/' + s.cashLootBought + '/' + s.manaLootBought,
      buyMult, Object.keys(s.trinkets || {}).length, JSON.stringify(s.activeTrinket || {}),
      // prestige / notebook cards (pending count is updated live, not here)
      Game.prestigeUnlocked(), Game.prestigePoints(), Game.has('notebook'),
      // daily quests
      Game.dailyActive(), (s.questClaimed || []).join(''), s.hasPrestiged,
    ].join(';');
  }

  /* ---------- top bar + tabs ---------- */
  function renderTop() {
    el('money').textContent = Game.fmtMoney(G().cents);
    el('mult').textContent = Game.speed();
    el('speedBtn').classList.toggle('fast', Game.speed() > 1);
    const mt = el('manaTop');
    mt.innerHTML = '✦&nbsp;' + Game.fmtNum(G().mana);
    mt.style.display = (Game.ritualUnlocked() || Game.has('auto-harvester') || G().mana > 0) ? 'inline-flex' : 'none';
    const sc = el('scrollsTop');
    sc.innerHTML = '📜&nbsp;' + Game.fmtNum(G().scrolls || 0);
    sc.style.display = (G().hasPrestiged || (G().scrolls || 0) > 0) ? 'inline-flex' : 'none';
    const bl = el('bloodTop');
    bl.innerHTML = '🩸&nbsp;' + Game.fmtNum(G().blood || 0);
    bl.style.display = (G().blood || 0) > 0 ? 'inline-flex' : 'none';
  }
  function renderTabs() {
    if (!Game.tabUnlocked(activeTab)) activeTab = 'home';
    el('tabbar').innerHTML = Game.TABS.filter(t => Game.tabUnlocked(t.id)).map(t =>
      `<button class="tab ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}" title="${t.label}" aria-label="${t.label}">
         <span class="tab-icon">${t.icon}</span>
       </button>`).join('');
  }
  function showView() {
    ['home', 'combat', 'research'].forEach(v =>
      el('view-' + v).style.display = (v === activeTab ? 'block' : 'none'));
  }

  /* ---------- DAILY QUESTS ---------- */
  function renderDaily() {
    const card = el('dailyCard'), body = el('dailyBody');
    if (!Game.dailyActive()) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    const rows = Game.DAILY_QUESTS.map((q, i) => {
      const prog = Game.questProgress(i), claimed = G().questClaimed[i];
      const btn = claimed
        ? `<button class="btn q-done" disabled>✓</button>`
        : `<button class="btn ${Game.questClaimable(i) ? 'primary' : 'disabled'}" data-claim="${i}">Claim</button>`;
      return `<div class="q-row">
          <div class="q-reward">📜 ${q.reward}</div>
          <div class="q-main">
            <div class="q-count time-q${i}">${prog} / ${q.target}</div>
            ${bar(prog / q.target, 'q qbar-' + i)}
          </div>
          ${btn}
        </div>`;
    }).join('');
    body.innerHTML = `<div class="q-sub">Harvest plants to earn 📜 · <span id="qtimer">Resets in ${Game.fmtTime(Game.dailyTimeLeft())}</span></div>${rows}`;
    body.querySelectorAll('[data-claim]').forEach(b => b.addEventListener('click', () => {
      if (Game.claimQuest(+b.dataset.claim)) { toast('Claimed <b>📜 1</b>.'); act(true); }
    }));
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
      // every item gets an info button; tapping it expands the description inline
      const info = ` <button class="info-btn ${openInfo[item.id] ? 'on' : ''}" data-info="${item.id}" aria-label="info" title="${item.desc}">ⓘ</button>`;
      const tip = openInfo[item.id] ? `<div class="info-tip">${item.desc}</div>` : '';
      return `<div class="row">
          <div class="row-main"><div class="row-title">${item.name}${info}${stockLabel}</div>${tip}</div>
          <div class="row-price">${Game.fmtMoney(price)}</div>
          <button class="btn" data-buy="${item.id}" data-cost="${price}">Buy</button>
        </div>`;
    }).join('') || '<div class="empty-note">Nothing left to buy.</div>';

    wrap.querySelectorAll('[data-buy]').forEach(b => b.addEventListener('click', () => act(Game.buyItem(b.dataset.buy))));
    wrap.querySelectorAll('[data-info]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); e.preventDefault();
      const id = b.dataset.info; openInfo[id] = !openInfo[id];
      forceRebuild(); render();
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
    if (Game.has('auto-harvester')) {
      const on = Game.autoHarvestOn();
      html += `<label class="auto-toggle"><input type="checkbox" id="autoHarvChk" ${on ? 'checked' : ''}/>
          <span class="ah-icons">⟳ ✦</span><span class="ah-label">Auto-harvest</span></label>`;
    }
    G().planters.forEach((p, i) => {
      const rep = `<button class="btn icon-btn repeat ${p.repeat ? 'on' : ''}" data-repeat="${i}" title="Save this spot — keep replanting this crop">⟳</button>`;
      if (p.seed) {
        const seed = Game.SEEDS_BY_ID[p.seed];
        const grown = Game.isGrown(p);
        const badge = p.riteCount > 0 ? ` <span class="rite-badge">⏱ ${riteVal(p.riteCount)}</span>` : '';
        html += `<div class="row planter" data-i="${i}">
            <div class="icon-box">${seed.icon}</div>
            <div class="row-main"><div class="row-title">${seed.name}${badge}</div>${bar(grown ? 1 : Game.progress(p), grown ? 'done' : '')}</div>
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
    const ah = el('autoHarvChk'); if (ah) ah.addEventListener('change', () => { Game.toggleAutoHarvest(); act(true); });
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
    let cornersHtml = '', runesHtml = '';
    for (let i = 0; i < Game.CONFIG.candleCount; i++) {
      if (i >= count) { cornersHtml += `<div class="corner ${corners[i]} holder"><span class="holder-dot">·</span></div>`; continue; }
      const c = G().candles[i], r = Game.RUNES[i];
      cornersHtml += `<div class="corner ${corners[i]} candle ${c.lit ? 'lit' : ''}" data-candle="${i}">
          <div class="flame"></div><div class="candle-body"></div></div>`;
      // decorative rune on the slate (fades with the candle) — NOT the tap target
      runesHtml += `<span class="slate-rune pos-${r.pos} ${c.lit ? 'shown' : ''}">${r.sym}</span>`;
    }

    const seq = Game.runeSeqStr();
    const seqHtml = seq.length
      ? `<div class="rune-seq">${seq.split('').map(l => `<span class="seq-rune">${Game.RUNES_BY_ID[l].sym}</span>`).join('')}<button class="seq-x" data-seqx="1">✕</button></div>`
      : '';

    let hint = '';
    if (count < Game.CONFIG.candleCount) { const n = Game.CONFIG.candleCount - count; hint = `<div class="slate-hint">Set ${n} more candle${n > 1 ? 's' : ''} from the shop.</div>`; }
    else if (!Game.allCandlesLit()) hint = `<div class="slate-hint">Tap each candle to light its rune.</div>`;

    // Big, reliable rune buttons below the slate (enabled once their candle is lit).
    const runeBar = `<div class="rune-bar">${Game.RUNES.map((r, i) => {
      const lit = i < count && G().candles[i].lit;
      return `<button class="rune-btn ${lit ? '' : 'off'}" data-rune="${r.id}" ${lit ? '' : 'disabled'}>
          <span class="rb-sym">${r.sym}</span><span class="rb-let">${r.letter}</span></button>`;
    }).join('')}</div>`;

    body.innerHTML = `<div class="slate">${seqHtml}${cornersHtml}${runesHtml}${hint}</div>
      ${runeBar}
      <div class="rite-hint">Tap runes to spell a rite — record what it does in your <b>Notebook</b>.</div>`;

    body.querySelectorAll('[data-candle]').forEach(b => b.addEventListener('click', () => { Game.toggleCandle(+b.dataset.candle); act(true); }));
    body.querySelectorAll('[data-rune]').forEach(b => b.addEventListener('click', () => {
      const res = Game.tapRune(b.dataset.rune);
      if (res && res.cast) toast('The runes flare, then the circle goes dark.');
      else if (res && res.blocked === 'mana') toast('Not enough mana.');
      act(true);
    }));
    const sx = body.querySelector('[data-seqx]');
    if (sx) sx.addEventListener('click', () => { Game.clearRuneSeq(); act(true); });
  }

  /* ---------- NOTEBOOK (home card) ---------- */
  function renderNotebook() {
    const card = el('notebookCard'), body = el('notebookBody');
    if (!Game.has('notebook')) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    const auto = Game.has('auto-ritual');
    const disc = (G().discovered || []);
    let html = `<p class="nb-intro">Personal notes on ritual sequences</p>`;
    html += disc.map(id => {
      const sp = Game.SPELLS_BY_ID[id];
      const pat = sp.seq.map(l => `<span class="mini-rune">${Game.RUNES_BY_ID[l].sym}</span>`).join('');
      const note = (G().notes && G().notes[id]) ? G().notes[id] : '';
      const castBtn = auto ? `<button class="btn primary nb-cast" data-cast="${id}">Cast</button>` : '';
      return `<div class="nb-spell">
          <div class="nb-head">${castBtn}<div class="spell-pat">${pat}</div><div class="nb-mana">✦ ${sp.mana}</div></div>
          <textarea class="nb-notes" maxlength="255" data-note="${id}" placeholder="Your notes…">${escapeHtml(note)}</textarea>
        </div>`;
    }).join('');
    body.innerHTML = html;
    body.querySelectorAll('[data-note]').forEach(t => t.addEventListener('input', () => { Game.setNote(t.dataset.note, t.value.slice(0, 255)); Game.save(); }));
    body.querySelectorAll('[data-cast]').forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.cast, sp = Game.SPELLS_BY_ID[id];
      if (Game.castSpellById(id)) toast(`Cast — <b>✦${sp.mana}</b> spent.`);
      else toast('Not enough mana.');
      Game.save(); renderTop();
    }));
  }

  /* ---------- COMBAT ---------- */
  function heartRow(n) { return `<span class="hp-badge">❤ ${Game.fmtNum(n)}</span>`; }

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
      if (e.dmg) bits.push(`<span class="ev-hp">❤ -${Game.fmtNum(e.dmg)}</span>`);
      if (e.cash) bits.push(`<span class="ev-cash">${Game.fmtMoney(e.cash)}</span>`);
      if (e.mana) bits.push(`<span class="ev-mana">✦ ${Game.fmtNum(e.mana)}</span>`);
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
          <div class="loot-now"><span class="l-cash">${Game.fmtMoney(c.runCash)}</span> · <span class="l-mana"><span class="mi">✦</span> ${Game.fmtNum(c.runMana)}</span></div>
          <button class="btn" id="fleeBtn">Flee with loot</button>
        </div>`;
    } else if (c.status === 'complete') {
      footer = `<div class="run-foot done">
          <div class="foot-msg">✔ Expedition complete!</div>
          <div class="loot-now"><span class="l-cash">${Game.fmtMoney(c.reward.cash)}</span> · <span class="l-mana"><span class="mi">✦</span> ${Game.fmtNum(c.reward.mana)}</span>${c.reward.blood ? ' · <span class="l-blood">🩸 ' + Game.fmtNum(c.reward.blood) + '</span>' : ''}</div>
          <button class="btn primary" id="collectBtn">Collect loot</button>
        </div>`;
    } else { // dead
      footer = `<div class="run-foot dead">
          <div class="foot-msg">💀 You died — loot lost.</div>
          <button class="btn" id="dieBtn">Back to the grove</button>
        </div>`;
    }

    const rewardLine = `Reward: ${Game.fmtMoney(area.cashMin)}–${Game.fmtMoney(area.cashMax)} · <span class="mi">✦</span> ${Game.fmtNum(area.manaMin)}–${Game.fmtNum(area.manaMax)}`
      + (area.bloodMax ? ` · 🩸 ${area.bloodMin}–${area.bloodMax}` : '')
      + (area.trinketChance ? ` · 💎 ${Math.round(area.trinketChance * 100)}%` : '');
    body.innerHTML = `
      <div class="loc-head">
        <div class="loc-title">${area.icon} ${area.name}</div>
        <div class="loc-flavor">${area.flavor}</div>
        <div class="loc-sub">Risk: ❤ ${Game.fmtNum(area.riskMin)}–${Game.fmtNum(area.riskMax)}</div>
        <div class="loc-sub">${rewardLine}</div>
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
    on('fleeBtn', () => { const r = Game.collectLoot(); toast(lootMsg('Fled with', r)); act(true); });
    on('collectBtn', () => { const r = Game.collectLoot(); toast(lootMsg('Collected', r)); act(true); });
    on('dieBtn', () => { Game.dismissDeath(); act(true); });
    body.querySelectorAll('[data-field]').forEach(b => b.addEventListener('click', () => act(Game.buyField(b.dataset.field, buyMult))));
    body.querySelectorAll('[data-mult]').forEach(b => b.addEventListener('click', () => {
      const i = MULTS.indexOf(buyMult);
      buyMult = b.dataset.mult === '+' ? MULTS[Math.min(MULTS.length - 1, i + 1)] : MULTS[Math.max(0, i - 1)];
      forceRebuild(); render();
    }));
  }

  function lootMsg(verb, r) {
    if (!r) return '';
    let s = `${verb} <b class="l-cash">${Game.fmtMoney(r.cash)}</b> · <b class="l-mana"><span class="mi">✦</span>${Game.fmtNum(r.mana)}</b>`;
    if (r.blood) s += ` · <b class="l-blood">🩸${Game.fmtNum(r.blood)}</b>`;
    if (r.trinket) s += ` — <b>${r.trinket.name}</b> ${r.trinket.dup ? '+1% (now ' + r.trinket.value + '%)' : 'found!'}`;
    return s;
  }

  function renderAreaPicker() {
    const cards = Game.AREAS.map(a => {
      const rewardLine = `${Game.fmtMoney(a.cashMin)}–${Game.fmtMoney(a.cashMax)} · <span class="mi">✦</span>${Game.fmtNum(a.manaMin)}–${Game.fmtNum(a.manaMax)}`
        + (a.bloodMax ? ` · 🩸${a.bloodMin}–${a.bloodMax}` : '')
        + (a.trinketChance ? ` · 💎${Math.round(a.trinketChance * 100)}%` : '');
      // owned trinkets for this location → activate one
      const owned = Game.ownedTrinkets(a.id);
      let trinketRow = '';
      if (owned.length) {
        trinketRow = `<div class="tr-row">${owned.map(t => {
          const on = (G().activeTrinket || {})[a.id] === t.id;
          const val = G().trinkets[t.id];
          return `<button class="tr-chip ${on ? 'on' : ''}" data-trin="${a.id}::${t.id}" title="+${val}% ${Game.fmtMoney ? '' : ''}${t.stat}">${t.name} <span class="tr-val">+${val}%</span></button>`;
        }).join('')}</div>`;
      }
      return `<div class="area-card">
          <div class="loc-title">${a.icon} ${a.name}</div>
          <div class="loc-flavor">${a.flavor}</div>
          <div class="loc-sub">Risk: ❤ ${Game.fmtNum(a.riskMin)}–${Game.fmtNum(a.riskMax)}</div>
          <div class="loc-sub">Reward: ${rewardLine}</div>
          ${trinketRow}
          <div class="area-foot">
            <span class="visit-cost">Visit: ${Game.fmtMoney(a.visitCost)}</span>
            <button class="btn primary area-start" data-area="${a.id}" data-cost="${a.visitCost}">Enter</button>
          </div>
        </div>`;
    }).join('');
    return `<div class="you-hp">You have ${heartRow(Game.maxHp())}</div>${cards}`;
  }
  function bindAreaPicker(body) {
    body.querySelectorAll('[data-area]').forEach(b => b.addEventListener('click', () => {
      const r = Game.startExpedition(b.dataset.area);
      if (r && r.noCash) { toast('Not enough $ to visit.'); return; }
      act(true);
    }));
    body.querySelectorAll('[data-trin]').forEach(b => b.addEventListener('click', () => {
      const [loc, id] = b.dataset.trin.split('::');
      Game.activateTrinket(loc, id); act(true);
    }));
  }
  function renderResearch() {
    el('researchBody').innerHTML = `<div class="tab-placeholder"><div class="tp-icon">⚗</div>
        <p>The alembic bubbles. Here you'll unlock alchemical upgrades — including deeper mana reserves.</p>
        <p class="muted">Research nodes are being prepared — check back soon.</p></div>`;
  }

  /* ---------- PRESTIGE (home card) ---------- */
  function renderPrestige() {
    const card = el('prestigeCard'), body = el('prestigeBody');
    if (!Game.prestigeUnlocked()) { card.style.display = 'none'; return; }
    card.style.display = 'block';
    const pts = Game.prestigePoints();
    const speed = Math.round(pts * Game.CONFIG.prestigeSpeedPer * 100);
    body.innerHTML = `
      <div class="prestige-stat"><span>Points</span><b>${pts}</b></div>
      <div class="prestige-stat"><span>Plant speed</span><b>+${speed}%</b></div>
      <div class="prestige-stat"><span>Ready to claim</span><b id="pPend" class="good">+${Game.pendingPrestige()}</b></div>
      <div class="prestige-stat"><span>Next point costs</span><b id="pNext">${Game.fmtMoney(Game.prestigeNextCost())}</b></div>
      <div class="prestige-note">Points start at $50 and cost 10% more each. Prestiging resets everything but points; each point = +1% plant speed.</div>
      <button class="btn primary prestige-btn" id="prestigeBtn">Prestige</button>`;
    const b = el('prestigeBtn');
    if (b) b.addEventListener('click', () => {
      if (Game.pendingPrestige() < 1) return;
      if (!confirm(`Prestige now for +${Game.pendingPrestige()} points? You will lose everything except prestige points.`)) return;
      const r = Game.doPrestige();
      if (r) { if (typeof confetti === 'function') confetti(); toast(`Reborn with <b>${r.total}</b> prestige points — +${Math.round(r.total * Game.CONFIG.prestigeSpeedPer * 100)}% plant speed.`); forceRebuild(); render(); }
    });
  }

  /* ---------- master render ---------- */
  function render() {
    renderTop();
    const sig = structuralSig();
    if (sig !== lastSig) {
      renderTabs(); showView();
      if (activeTab === 'home') {
        renderBuy(); renderPlanters(); renderPrestige(); renderDaily();
        renderSeeds(); renderRitual(); renderNotebook();
      }
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

    if (activeTab === 'combat') { updateCombatLive(); return; }
    if (activeTab !== 'home') return;
    // prestige card live pending + button
    if (Game.prestigeUnlocked()) {
      const pend = Game.pendingPrestige();
      const pp = el('pPend'); if (pp) pp.textContent = '+' + pend;
      const pb = el('prestigeBtn'); if (pb) pb.classList.toggle('disabled', pend < 1);
    }
    // daily quest live bits
    if (Game.dailyActive()) {
      const qt = el('qtimer'); if (qt) qt.textContent = 'Resets in ' + Game.fmtTime(Game.dailyTimeLeft());
      Game.DAILY_QUESTS.forEach((q, i) => {
        const prog = Game.questProgress(i);
        const cnt = document.querySelector('.time-q' + i); if (cnt) cnt.textContent = prog + ' / ' + q.target;
        const bf = document.querySelector('.qbar-' + i + ' .bar-fill'); if (bf) bf.style.width = Math.min(100, prog / q.target * 100) + '%';
        const cb = document.querySelector('[data-claim="' + i + '"]'); if (cb && !G().questClaimed[i]) cb.classList.toggle('disabled', !Game.questClaimable(i));
      });
    }
    G().planters.forEach((p, i) => {
      const fill = document.querySelector(`.row.planter[data-i="${i}"] .bar-fill`);
      if (p.seed && fill) {
        const grown = Game.isGrown(p);
        fill.style.width = (grown ? 100 : Game.progress(p) * 100) + '%';
        const tm = document.querySelector(`.time-${i}`); if (tm) tm.textContent = grown ? 'ready' : Game.fmtTime(Game.timeLeft(p));
        const sb = document.querySelector(`[data-sell="${i}"]`); if (sb) sb.classList.toggle('disabled', !grown);
        const bo = document.querySelector(`.row.planter[data-i="${i}"] .bar`); if (bo) bo.classList.toggle('done', grown);
      }
      // ritual flash: replay the green pulse whenever a rite was just applied to this plant
      if (p.flashAt && flashState[i] !== p.flashAt) {
        const barEl = document.querySelector(`.row.planter[data-i="${i}"] .bar`);
        if (barEl) { barEl.classList.remove('flash3'); void barEl.offsetWidth; barEl.classList.add('flash3'); }
        flashState[i] = p.flashAt;
      }
    });
    document.querySelectorAll('[data-cost]').forEach(b => {
      let ok = cents >= +b.dataset.cost;
      if (b.dataset.needslot) ok = ok && G().planters.some(p => !p.seed);
      b.classList.toggle('disabled', !ok);
      if (b.hasAttribute('data-buy')) b.classList.toggle('ready', ok);   // gold pulse when affordable
    });
  }

  function updateCombatLive() {
    const c = Game.combat();
    if (!c) {   // area picker — grey out locations you can't afford to visit
      document.querySelectorAll('[data-area]').forEach(b => b.classList.toggle('disabled', G().cents < +b.dataset.cost));
      return;
    }
    const fill = document.querySelector('.bar.combat .bar-fill');
    if (fill) fill.style.width = Math.min(100, c.elapsed / c.duration * 100) + '%';
    if (c.status === 'running') {
      const pt = el('progTime'); if (pt) pt.textContent = Game.fmtTime((c.duration - c.elapsed) / Game.speedFactor());
      const hn = el('hpNow'); if (hn) hn.innerHTML = `<span class="hp-badge">❤ ${Game.fmtNum(c.hp)}</span>`;
      const ln = document.querySelector('.run-foot .loot-now'); if (ln) ln.innerHTML = `<span class="l-cash">${Game.fmtMoney(c.runCash)}</span> · <span class="l-mana"><span class="mi">✦</span> ${Game.fmtNum(c.runMana)}</span>`;
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
    { kind: 'scrolls',  label: '📜 scrolls',   amts: [1, 10, 100, 1000] },
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
        <button class="btn danger" id="wipeBtn">Wipe Save</button>
        <div id="wipeConfirm" class="wipe-confirm" style="display:none">
          <span>Are you sure :(</span>
          <button class="btn danger" id="wipeYes">Yes</button>
          <button class="btn" id="wipeNo">No</button>
        </div>
      </div>
      <div class="set-section">
        <div class="set-title">Patch notes</div>
        ${notes}
      </div>
      <div class="set-foot">Idle Cult · progress auto-saves to this browser</div>`;

    el('devChk').addEventListener('change', e => { Game.setDevMode(e.target.checked); renderSettings(); });
    el('wipeBtn').addEventListener('click', () => {
      el('wipeBtn').style.display = 'none';
      el('wipeConfirm').style.display = 'flex';
    });
    el('wipeNo').addEventListener('click', () => {          // cancel
      el('wipeConfirm').style.display = 'none';
      el('wipeBtn').style.display = 'block';
    });
    el('wipeYes').addEventListener('click', () => {         // hard delete the save
      Game.wipe(); activeTab = 'home'; buyPage = 0; el('settings').style.display = 'none'; forceRebuild(); render();
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
