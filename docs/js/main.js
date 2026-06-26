/* ============================================================
   Idle Cult — bootstrap & main loop
   ============================================================ */

(function () {
  // ---- live status-bar clock ----
  function clock() {
    const d = new Date();
    let h = d.getHours();
    const m = d.getMinutes().toString().padStart(2, '0');
    const ampm = h >= 12 ? '' : '';        // iOS uses 24h-ish; keep it simple
    if (h === 0) h = 12; else if (h > 12) h -= 12;
    const t = h + ':' + m;
    const sbar = document.getElementById('statusTime');
    if (sbar) sbar.textContent = t;
  }

  // ---- tiny confetti for rituals (no deps) ----
  window.confetti = function () {
    const root = document.getElementById('fx');
    if (!root) return;
    const colors = ['#e7c46b', '#b5485d', '#6ba368', '#8a7fbf', '#d98c40'];
    for (let i = 0; i < 40; i++) {
      const s = document.createElement('span');
      s.className = 'confetti';
      s.style.left = (Math.floor((i / 40) * 100)) + '%';
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = (i % 10) * 0.04 + 's';
      root.appendChild(s);
      setTimeout(() => s.remove(), 1600);
    }
  };

  function boot() {
    Game.load();
    const offline = Game.applyOffline();
    UI.init();
    UI.forceRebuild();
    UI.render();
    UI.showOfflineToast(offline);

    clock();
    setInterval(clock, 10000);

    // game tick (logic) — 5x/sec is plenty for an idle game
    setInterval(() => { Game.tick(Game.now()); }, 200);
    // render loop — smooth bars
    function frame() { UI.render(); requestAnimationFrame(frame); }
    requestAnimationFrame(frame);

    // autosave
    setInterval(Game.save, 5000);
    window.addEventListener('beforeunload', Game.save);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) Game.save();
      else { const o = Game.applyOffline(); UI.forceRebuild(); UI.render(); UI.showOfflineToast(o); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
