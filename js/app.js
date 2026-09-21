/* Maneki-Neko — personal finance app UI. */
(function () {
  'use strict';

  const S = Store, N = Neko, C = Charts, esc = Charts.esc;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  const MIT_THEME = {
    id: 'mit',
    name: 'Mit',
    builtin: true,
    species: 'cat', ears: 'pointy', pattern: 'tabby',
    colors: {
      fur: N.MIT.fur, furLight: N.MIT.furLight, stripe: N.MIT.stripe, eye: N.MIT.eye,
      nose: N.MIT.nose, earInner: N.MIT.earInner, collar: N.MIT.collar, gold: N.MIT.gold,
    },
    ui: { primary: '#F2B632', primaryDark: '#9A6412', primarySoft: '#FFEFC4', onPrimary: '#3A2A1E', bg: '#FFF8EB', accent: '#D7263D' },
    photo: 'ava/mit-sticker.jpg',
    cutout: window.MIT_REAL ? window.MIT_REAL.cutout : null,
    face: window.MIT_REAL ? window.MIT_REAL.face : null,
    collarOn: true,
  };

  const ui = { view: 'tx', offset: 0, group: 'date', q: '', searching: false };

  /* ================= theme & mascot ================= */
  function themes() { return [MIT_THEME].concat(S.state.themes); }
  function theme() { return themes().find((t) => t.id === S.state.settings.theme) || MIT_THEME; }

  function mascotOpts(t, extra) {
    return Object.assign({ name: t.name, species: t.species, ears: t.ears, pattern: t.pattern }, t.colors, extra || {});
  }
  // Cartoon SVG only knows six moods; the realistic avatars know nine.
  const CARTOON_MOOD = { rich: 'happy', love: 'happy', party: 'wink' };
  function realStyle() { return S.state.settings.mascotStyle !== 'cartoon'; }

  // Full-body mascot: realistic outlined photo sticker, or the cartoon maneki drawing.
  function mascot(extra, t) {
    t = t || theme();
    extra = extra || {};
    const mood = extra.mood || 'normal';
    if (realStyle() && extra.pose !== 'head') {
      const url = Avatar.get(t, mood, 'sticker');
      if (url) return `<img class="real-full av-${mood} ${extra.className || ''}" src="${url}" alt="${esc(t.name)} · ${Avatar.STATES[mood].label}">`;
    }
    return N.svg(mascotOpts(t, Object.assign({}, extra, { mood: CARTOON_MOOD[mood] || mood })));
  }
  // Round head avatar with an emoji mood badge.
  function avatar(mood, cls, t) {
    t = t || theme();
    mood = mood || 'normal';
    if (realStyle()) {
      const url = Avatar.get(t, mood, 'portrait');
      if (url) return `<img class="real-av av-${mood} ${cls || ''}" src="${url}" alt="${esc(t.name)} · ${Avatar.STATES[mood].label}">`;
    }
    return N.svg(mascotOpts(t, { pose: 'head', mood: CARTOON_MOOD[mood] || mood, className: cls || '' }));
  }

  function applyTheme() {
    const t = theme();
    const r = document.documentElement.style;
    const u = t.ui;
    r.setProperty('--primary', u.primary);
    r.setProperty('--primary-dark', u.primaryDark);
    r.setProperty('--primary-soft', u.primarySoft);
    r.setProperty('--on-primary', u.onPrimary);
    r.setProperty('--bg', u.bg);
    r.setProperty('--accent', u.accent);
    r.setProperty('--fur', t.colors.fur);
    r.setProperty('--fur-light', t.colors.furLight);
    const ink = u.onPrimary === '#FFFFFF' ? 'rgba(255,255,255,.12)' : 'rgba(58,42,30,.08)';
    const paw = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><g fill="${ink}"><ellipse cx="20" cy="24" rx="6" ry="5"/><circle cx="13" cy="16" r="2.4"/><circle cx="20" cy="13" r="2.4"/><circle cx="27" cy="16" r="2.4"/><ellipse cx="48" cy="52" rx="5" ry="7"/></g></svg>`;
    r.setProperty('--pattern', `url("${N.toDataURL(paw)}")`);
    document.title = `Maneki ${t.name} · Personal Finance`;
    const realFav = realStyle() && Avatar.get(t, 'normal', 'favicon');
    const fav = realFav || (t.builtin ? 'ava/favicon.svg' : N.toDataURL(N.svg(mascotOpts(t, { pose: 'head', bg: u.primary }))));
    if ($('#favicon').getAttribute('href') !== fav) $('#favicon').setAttribute('href', fav);
    const icon = realStyle() && Avatar.get(t, 'normal', 'icon');
    if (icon) $('link[rel="apple-touch-icon"]').setAttribute('href', icon);
    $('meta[name="theme-color"]').setAttribute('content', u.primary);
    const side = $('#side-mascot');
    const sideKey = t.id + JSON.stringify(t.colors) + t.pattern + t.ears + realStyle() + !!Avatar.ready(t);
    if (side.dataset.theme !== sideKey) {
      side.dataset.theme = sideKey;
      side.innerHTML = mascot({ pose: 'maneki', mood: 'normal', className: 'waving' });
    }
  }

  /* ================= helpers ================= */
  const fmt = (n, o) => S.fmt(n, o);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function periodLabel(o) {
    if (o === 'future') return 'FUTURE';
    if (o === 0) return 'THIS MONTH';
    if (o === -1) return 'LAST MONTH';
    const p = S.monthPeriod(o);
    return S.pad(p.date.getMonth() + 1) + '/' + p.date.getFullYear();
  }

  function monthTabs() {
    const tabs = [];
    for (let o = -12; o <= 0; o++) tabs.push(o);
    tabs.push('future');
    return `<div class="month-tabs" role="tablist">${tabs.map((o) => `<button role="tab" class="${o === ui.offset ? 'active' : ''}" data-action="period" data-offset="${o}">${periodLabel(o)}</button>`).join('')}</div>`;
  }

  function amountClass(t) { return S.isIn(t) ? 'in' : 'out'; }

  function catIcon(c, size) {
    return `<span class="cat-icon ${size || ''}" style="--c:${c.color}">${c.icon}</span>`;
  }

  function parseAmount(str) {
    let s = String(str || '').replace(/\s/g, '');
    const digits = S.CURRENCIES[S.state.settings.currency].digits;
    s = digits === 0 ? s.replace(/[.,](?=\d{3}(\D|$))/g, '') : s.replace(/,(?=\d{3}(\D|$))/g, '').replace(/,/g, '.');
    if (!/^[\d+\-*/().]+$/.test(s)) return NaN;
    try {
      const v = Function('"use strict";return (' + s + ')')();
      return typeof v === 'number' && isFinite(v) ? Math.round(v * 100) / 100 : NaN;
    } catch (e) {
      return NaN;
    }
  }

  function weekday(d) { return S.parse(d).toLocaleDateString('en-US', { weekday: 'long' }); }
  function monthYear(d) { return S.parse(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
  function niceDate(d) {
    if (d === S.today()) return 'Today';
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (d === S.ymd(y)) return 'Yesterday';
    return S.parse(d).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  }

  /* ================= toast / effects ================= */
  let toastTimer;
  function toast(msg, mood) {
    const el = $('#toast');
    el.innerHTML = `<span class="toast-av">${avatar(mood || 'happy')}</span><span>${esc(msg)}</span>`;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function coinRain() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const host = $('#app');
    for (let i = 0; i < 16; i++) {
      const c = document.createElement('span');
      c.className = 'coin-drop';
      c.innerHTML = N.coin();
      c.style.left = Math.random() * 92 + '%';
      c.style.animationDelay = Math.random() * 0.6 + 's';
      c.style.setProperty('--spin', (Math.random() * 720 - 360) + 'deg');
      host.appendChild(c);
      setTimeout(() => c.remove(), 2400);
    }
  }

  const SAYINGS = [
    'Nyan~ Every coin you save is a coin that beckons more! 🪙',
    'Maneki-neko tip: set a budget and I\'ll watch it for you 🐾',
    'I raise my paw to invite good fortune — you log the expenses!',
    'Small savings make a big koban. 千両!',
    'Did you log today\'s café? I saw that bạc xỉu 👀',
    'Purr… your wallet looks cozy today.',
  ];

  function speak(text) {
    const b = $('#bubble');
    b.textContent = text;
    b.classList.add('show');
    clearTimeout(speak.t);
    speak.t = setTimeout(() => b.classList.remove('show'), 3200);
  }

  /* ================= sheets (modals) ================= */
  function openSheet(html, opts) {
    opts = opts || {};
    const root = $('#sheets');
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet-backdrop" data-close></div><div class="sheet ${opts.className || ''}" role="dialog" aria-modal="true">${html}</div>`;
    root.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const close = () => {
      wrap.classList.remove('open');
      setTimeout(() => wrap.remove(), 250);
      if (opts.onClose) opts.onClose();
    };
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) close();
    });
    const sheet = $('.sheet', wrap);
    sheet._close = close;
    if (opts.onMount) opts.onMount(sheet, close);
    const first = sheet.querySelector('[autofocus]');
    if (first) setTimeout(() => first.focus(), 260);
    return close;
  }

  function sheetHeader(title, right) {
    return `<header class="sheet-hd"><button class="link" data-close>Cancel</button><h2>${esc(title)}</h2><span>${right || ''}</span></header>`;
  }

  function confirmSheet(title, text, okLabel, onOk, danger) {
    openSheet(`<div class="confirm">
      <div class="confirm-av">${avatar(danger ? 'worried' : 'surprised')}</div>
      <h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="btn-row"><button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(okLabel)}</button></div>
    </div>`, {
      className: 'small',
      onMount(sheet, close) { $('[data-ok]', sheet).onclick = () => { close(); onOk(); }; },
    });
  }

  /* ================= header ================= */
  function renderHeader() {
    const st = S.state;
    const w = st.settings.wallet;
    const wal = w === 'all' ? { icon: '🌐', name: 'Total' } : S.wallet(w) || { icon: '👛', name: '?' };
    let mood = 'normal';
    if (ui.view === 'tx' || ui.view === 'report') {
      const p = S.monthPeriod(0);
      const list = S.txs({ start: p.start, end: p.end });
      const sm = S.summary(list);
      mood = !list.length ? 'sleepy' : sm.net > sm.inflow * 0.3 ? 'rich' : sm.net > 0 ? 'happy' : sm.outflow > sm.inflow * 1.1 ? 'worried' : 'normal';
    } else if (ui.view === 'budget') {
      const tb = totalBudget();
      mood = !tb ? 'sleepy' : tb.ratio > 1 ? 'worried' : tb.ratio > 0.85 ? 'surprised' : 'happy';
    } else mood = 'love';

    const titles = { report: 'Report', budget: 'Budgets', account: 'Account' };
    const main = ui.view === 'tx'
      ? `<button class="wallet-pick" data-action="pick-wallet"><span>${wal.icon} ${esc(wal.name)}</span><svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg></button>
         <div class="hdr-balance">${fmt(S.balance(w))}</div>`
      : `<div class="hdr-kicker">Maneki ${esc(theme().name)}</div><h1 class="hdr-title">${titles[ui.view]}</h1>`;
    const actions = ui.view === 'tx'
      ? `<button class="icon-btn" data-action="search" aria-label="Search">${ICONS.search}</button>
         <button class="icon-btn" data-action="group" aria-label="Group by ${ui.group === 'date' ? 'category' : 'date'}" title="Group by ${ui.group === 'date' ? 'category' : 'date'}">${ui.group === 'date' ? ICONS.cats : ICONS.cal}</button>`
      : ui.view === 'budget' ? `<button class="icon-btn" data-action="new-budget" aria-label="New budget">${ICONS.plus}</button>` : '';

    $('#topbar').innerHTML = `
      <button class="hdr-mascot" data-action="poke" aria-label="Say hi to ${esc(theme().name)}">${avatar(mood)}</button>
      <div class="hdr-main">${main}</div>
      <div class="hdr-actions">${actions}</div>
      <div id="bubble" class="bubble" role="status"></div>`;
  }

  /* ================= transactions view ================= */
  function txRow(t, showDate) {
    const c = S.cat(t.cat);
    const w = S.wallet(t.wallet);
    const sub = [t.note, t.with ? 'with ' + t.with : '', S.state.settings.wallet === 'all' && w ? w.name : '', showDate ? niceDate(t.date) : ''].filter(Boolean);
    return `<button class="tx" data-action="edit-tx" data-id="${t.id}">
      ${catIcon(c)}
      <span class="tx-body"><span class="tx-cat">${esc(c.name)}</span><span class="tx-note">${esc(sub.join(' · '))}</span></span>
      <span class="amt ${amountClass(t)}">${fmt(t.amount)}</span>
    </button>`;
  }

  function emptyState(title, text, action) {
    return `<div class="empty">
      <div class="empty-av">${mascot({ mood: 'sleepy' })}</div>
      <h3>${esc(title)}</h3><p>${esc(text)}</p>
      ${action || ''}
    </div>`;
  }

  function viewTx() {
    const w = S.state.settings.wallet;
    let list, head = '';
    if (ui.q) {
      list = S.txs({ q: ui.q });
    } else {
      const p = S.period(ui.offset);
      list = S.txs({ start: p.start, end: p.end });
      const opening = S.balance(w, S.ymd(new Date(S.parse(p.start).getTime() - 86400000)));
      const ending = ui.offset === 'future' ? S.balance(w) : S.balance(w, p.end);
      const sm = S.summary(list);
      head = `<section class="card summary">
        <div class="row"><span>Opening balance</span><span>${fmt(opening)}</span></div>
        <div class="row"><span>Ending balance</span><span>${fmt(ending)}</span></div>
        <div class="row"><span>Inflow</span><span class="amt in">${fmt(sm.inflow)}</span></div>
        <div class="row"><span>Outflow</span><span class="amt out">${fmt(sm.outflow)}</span></div>
        <div class="row total"><span></span><span>${fmt(sm.net, { sign: true })}</span></div>
        <button class="link center" data-action="goto-report">View report for this period</button>
      </section>`;
    }
    const search = ui.searching ? `<div class="search-bar"><input id="q" type="search" placeholder="Search notes, categories, people…" value="${esc(ui.q)}" autocomplete="off"><button class="link" data-action="search-close">Done</button></div>` : '';

    if (!list.length) {
      return search + (ui.q ? '' : monthTabs()) + head + (ui.q
        ? emptyState('Nothing found', `No transactions match "${ui.q}".`)
        : emptyState('No transactions', 'Tap the + button to record your first one. I\'ll keep an eye on your coins!', '<button class="btn primary" data-action="add">Add transaction</button>'));
    }

    let body = '';
    if (ui.group === 'date' || ui.q) {
      const days = {};
      list.forEach((t) => (days[t.date] = days[t.date] || []).push(t));
      body = Object.keys(days).sort().reverse().map((d) => {
        const items = days[d].slice().reverse();
        const total = items.reduce((s, t) => s + S.signed(t), 0);
        return `<section class="card day">
          <header class="day-hd">
            <span class="day-num">${S.pad(S.parse(d).getDate())}</span>
            <span class="day-meta"><b>${d === S.today() ? 'Today' : weekday(d)}</b><small>${monthYear(d)}</small></span>
            <span class="day-total">${fmt(total, { sign: true })}</span>
          </header>
          ${items.map((t) => txRow(t)).join('')}
        </section>`;
      }).join('');
    } else {
      const groups = {};
      list.forEach((t) => (groups[t.cat] = groups[t.cat] || []).push(t));
      body = Object.entries(groups).map(([id, items]) => ({ c: S.cat(id), items, total: items.reduce((s, t) => s + t.amount, 0) }))
        .sort((a, b) => b.total - a.total)
        .map((g) => `<section class="card day">
          <header class="day-hd">${catIcon(g.c)}<span class="day-meta"><b>${esc(g.c.name)}</b><small>${g.items.length} transaction${g.items.length > 1 ? 's' : ''}</small></span>
          <span class="day-total amt ${S.isIn(g.items[0]) ? 'in' : 'out'}">${fmt(g.total)}</span></header>
          ${g.items.slice().sort((a, b) => b.date.localeCompare(a.date)).map((t) => txRow(t, true)).join('')}
        </section>`).join('');
    }
    return search + (ui.q ? `<p class="muted pad">${list.length} result${list.length > 1 ? 's' : ''} for “${esc(ui.q)}”</p>` : monthTabs()) + head + body;
  }

  /* ================= report view ================= */
  function legend(items, total) {
    return `<ul class="legend">${items.slice(0, 6).map((it) => `<li>${catIcon(it.cat, 'sm')}<span>${esc(it.cat.name)}</span><b>${fmt(it.total, { noCents: true })}</b><small>${total ? Math.round((it.total / total) * 100) : 0}%</small></li>`).join('')}
      ${items.length > 6 ? `<li class="muted">+ ${items.length - 6} more</li>` : ''}</ul>`;
  }

  function viewReport() {
    const w = S.state.settings.wallet;
    const p = S.period(ui.offset);
    const list = S.txs({ start: p.start, end: p.end });
    const sm = S.summary(list);
    const opening = S.balance(w, S.ymd(new Date(S.parse(p.start).getTime() - 86400000)));
    const ending = ui.offset === 'future' ? S.balance(w) : S.balance(w, p.end);
    const inc = S.byCategory(list, ['income']);
    const exp = S.byCategory(list, ['expense']);
    const incT = inc.reduce((s, x) => s + x.total, 0), expT = exp.reduce((s, x) => s + x.total, 0);
    const debts = S.byCategory(list, ['debt_in', 'debt_out']);

    let weekly = '';
    if (ui.offset !== 'future') {
      const last = S.parse(p.end).getDate();
      const buckets = [[1, 7], [8, 14], [15, 21], [22, 28], [29, last]].filter(([a]) => a <= last);
      const groups = buckets.map(([a, b]) => {
        const s = S.summary(list.filter((t) => { const d = S.parse(t.date).getDate(); return d >= a && d <= b; }));
        return { label: `${a}-${b}`, values: [{ value: s.inflow, color: 'var(--income)', title: 'Income ' + fmt(s.inflow) }, { value: s.outflow, color: 'var(--expense)', title: 'Expense ' + fmt(s.outflow) }] };
      });
      weekly = C.bars(groups, { short: S.short, label: 'Income and expense by week' });
    }

    const endO = ui.offset === 'future' ? 0 : ui.offset;
    const trend = [];
    for (let o = endO - 5; o <= endO; o++) {
      const mp = S.monthPeriod(o);
      const s = S.summary(S.txs({ start: mp.start, end: mp.end }));
      trend.push({ label: MONTHS[mp.date.getMonth()], values: [{ value: s.inflow, color: 'var(--income)', title: 'Income ' + fmt(s.inflow) }, { value: s.outflow, color: 'var(--expense)', title: 'Expense ' + fmt(s.outflow) }] });
    }

    const top = exp[0];
    const insight = !list.length
      ? `Nothing recorded for this period yet — ${theme().name} is napping.`
      : top
        ? `Biggest spend: ${top.cat.icon} ${top.cat.name} (${Math.round((top.total / (expT || 1)) * 100)}% of expenses). ${sm.net >= 0 ? 'You saved ' + fmt(sm.net) + '! 🎉' : 'You spent ' + fmt(-sm.net) + ' more than you earned.'}`
        : `Only income this period — lucky paws! 🐾`;

    return monthTabs() + `
      <section class="card insight">
        <div class="insight-av">${avatar(!list.length ? 'sleepy' : sm.net > 0 ? 'rich' : 'worried')}</div>
        <p>${esc(insight)}</p>
      </section>
      <section class="card">
        <div class="kv2">
          <div><small>Opening balance</small><b>${fmt(opening)}</b></div>
          <div><small>Ending balance</small><b>${fmt(ending)}</b></div>
        </div>
      </section>
      <section class="card">
        <h3 class="card-title">Net income</h3>
        <div class="big-num ${sm.net >= 0 ? 'in' : 'out'}">${fmt(sm.net, { sign: true })}</div>
        <div class="kv2 small"><div><small>Income</small><b class="amt in">${fmt(sm.inflow)}</b></div><div><small>Expense</small><b class="amt out">${fmt(sm.outflow)}</b></div></div>
        ${weekly}
      </section>
      <section class="card">
        <h3 class="card-title">Income</h3>
        <div class="donut-row">${C.donut(inc.map((x) => ({ value: x.total, color: x.cat.color, label: x.cat.name + ': ' + fmt(x.total) })), { center: S.short(incT), label: 'Income by category' })}${inc.length ? legend(inc, incT) : '<p class="muted small">No income yet</p>'}</div>
        <h3 class="card-title">Expense</h3>
        <div class="donut-row">${C.donut(exp.map((x) => ({ value: x.total, color: x.cat.color, label: x.cat.name + ': ' + fmt(x.total) })), { center: S.short(expT), label: 'Expense by category' })}${exp.length ? legend(exp, expT) : '<p class="muted small">No expenses yet</p>'}</div>
      </section>
      ${debts.length ? `<section class="card"><h3 class="card-title">Debts & loans</h3>${legend(debts, debts.reduce((s, x) => s + x.total, 0))}</section>` : ''}
      <section class="card">
        <h3 class="card-title">6-month trend</h3>
        ${C.bars(trend, { short: S.short, label: 'Six month trend' })}
        <div class="chart-key"><span><i style="background:var(--income)"></i>Income</span><span><i style="background:var(--expense)"></i>Expense</span></div>
      </section>`;
  }

  /* ================= budget view ================= */
  function totalBudget() {
    const bs = S.state.budgets;
    if (!bs.length) return null;
    const all = bs.find((b) => b.cat === 'all');
    if (all) return Object.assign({ amount: all.amount }, S.budgetStatus(all));
    const amount = bs.reduce((s, b) => s + b.amount, 0);
    const spent = bs.reduce((s, b) => s + S.budgetStatus(b).spent, 0);
    return { amount, spent, left: amount - spent, ratio: amount ? spent / amount : 0 };
  }

  function viewBudget() {
    const bs = S.state.budgets;
    if (!bs.length) {
      return emptyState('No budgets yet', 'Budgets help you keep spending in check. I\'ll warn you when a category gets close to its limit!', '<button class="btn primary" data-action="new-budget">Create budget</button>');
    }
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const daysLeft = end.getDate() - now.getDate();
    const elapsed = now.getDate() / end.getDate();
    const tb = totalBudget();
    const mood = tb.ratio > 1 ? 'worried' : tb.ratio > 0.85 ? 'surprised' : 'happy';

    const rows = bs.slice().sort((a, b) => (a.cat === 'all' ? -1 : b.cat === 'all' ? 1 : 0)).map((b) => {
      const st = S.budgetStatus(b);
      const c = b.cat === 'all' ? { name: 'All expenses', icon: '🧮', color: '#8D6E63' } : S.cat(b.cat);
      const pct = Math.min(100, st.ratio * 100);
      const over = st.left < 0;
      const warn = !over && st.ratio > elapsed + 0.1;
      return `<button class="card budget" data-action="edit-budget" data-id="${b.id}">
        <div class="budget-top">${catIcon(c)}<span class="budget-name">${esc(c.name)}${b.wallet && b.wallet !== 'all' ? `<small>${esc((S.wallet(b.wallet) || {}).name || '')}</small>` : ''}</span>
          <span class="budget-amt"><b>${fmt(b.amount, { noCents: true })}</b><small class="${over ? 'out' : ''}">${over ? 'Overspent ' + fmt(-st.left, { noCents: true }) : 'Left ' + fmt(st.left, { noCents: true })}</small></span></div>
        <div class="progress ${over ? 'over' : warn ? 'warn' : ''}"><i style="width:${pct}%"></i><em style="left:${elapsed * 100}%" title="Today"></em></div>
      </button>`;
    }).join('');

    return `<section class="card gauge-card">
        <div class="gauge-wrap">
          ${C.gauge(tb.ratio)}
          <div class="gauge-av">${avatar(mood)}</div>
        </div>
        <p class="gauge-label">Amount you can spend</p>
        <p class="gauge-amt ${tb.left < 0 ? 'out' : 'in'}">${fmt(tb.left)}</p>
        <div class="kv3">
          <div><b>${S.short(tb.amount)}</b><small>Total budgets</small></div>
          <div><b>${S.short(tb.spent)}</b><small>Total spent</small></div>
          <div><b>${daysLeft} day${daysLeft === 1 ? '' : 's'}</b><small>To end of month</small></div>
        </div>
        <button class="btn primary block" data-action="new-budget">Create budget</button>
      </section>
      <h3 class="section-title">This month · ${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
      ${rows}`;
  }

  /* ================= account view ================= */
  function viewAccount() {
    const st = S.state;
    const t = theme();
    const themeTiles = themes().map((th) => `
      <div class="theme-tile ${th.id === t.id ? 'active' : ''}">
        <button class="theme-pick" data-action="use-theme" data-id="${th.id}" style="--tp:${th.ui.primary};--tbg:${th.ui.bg}" aria-label="Use ${esc(th.name)} theme">
          <span class="theme-av">${mascot({ pose: 'maneki', mood: th.id === t.id ? 'happy' : 'normal' }, th)}</span>
          <span class="theme-name">${esc(th.name)}${th.id === t.id ? ' ✓' : ''}</span>
        </button>
        ${th.builtin ? '' : `<button class="theme-edit" data-action="edit-theme" data-id="${th.id}" aria-label="Edit ${esc(th.name)}">✎</button>`}
      </div>`).join('');

    return `
      <section class="card profile">
        <div class="profile-av">${avatar('love')}</div>
        <div>
          <h2>${esc(st.settings.userName || 'Friend')}</h2>
          <p class="muted">Lucky cat: <b>${esc(t.name)}</b> · ${st.transactions.length} transactions</p>
        </div>
      </section>

      <h3 class="section-title">Mascot & theme</h3>
      <section class="card">
        <p class="muted small">Upload a photo of your pet and I'll recognise it, cut it out, read its colours and redesign the whole app around it, just like Mit.</p>
        <div class="theme-grid">${themeTiles}
          <button class="theme-add" data-action="pet-studio"><span>＋</span>Add your pet</button>
        </div>
        <div class="seg" role="radiogroup" aria-label="Mascot style">
          <button class="${realStyle() ? 'on' : ''}" data-action="mascot-style" data-v="real">📷 Realistic</button>
          <button class="${!realStyle() ? 'on' : ''}" data-action="mascot-style" data-v="cartoon">🎨 Cartoon</button>
        </div>
        ${realStyle() && Avatar.ready(t) ? `<h4 class="moods-title">${esc(t.name)}'s moods</h4>
        <div class="moods">${Object.keys(Avatar.STATES).map((m) => `<button class="mood" data-action="mood" data-mood="${m}"><img src="${Avatar.get(t, m, 'portrait')}" alt=""><span>${Avatar.emojiFor(t, m)} ${Avatar.STATES[m].label}</span></button>`).join('')}</div>` : ''}
      </section>

      <h3 class="section-title">Wallets</h3>
      <section class="card list">
        ${st.wallets.map((w) => `<button class="list-row" data-action="edit-wallet" data-id="${w.id}"><span class="w-icon">${w.icon}</span><span class="grow">${esc(w.name)}</span><b>${fmt(S.balance(w.id))}</b></button>`).join('')}
        <div class="btn-row"><button class="btn ghost" data-action="new-wallet">＋ Add wallet</button><button class="btn ghost" data-action="transfer">🔁 Transfer</button></div>
      </section>

      <h3 class="section-title">Settings</h3>
      <section class="card list">
        <label class="list-row"><span class="grow">Your name</span><input id="set-name" value="${esc(st.settings.userName)}" placeholder="Friend"></label>
        <label class="list-row"><span class="grow">Currency</span><select id="set-cur">${Object.keys(S.CURRENCIES).map((c) => `<option ${c === st.settings.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <button class="list-row" data-action="categories"><span class="grow">Categories</span><span class="muted">${st.categories.filter((c) => !c.type.startsWith('xfer')).length} ›</span></button>
      </section>

      <h3 class="section-title">Data</h3>
      <section class="card list">
        <button class="list-row" data-action="export-json"><span class="grow">⬇️ Export backup (JSON)</span></button>
        <button class="list-row" data-action="export-csv"><span class="grow">📄 Export transactions (CSV)</span></button>
        <button class="list-row" data-action="import-json"><span class="grow">⬆️ Import backup</span></button>
        <button class="list-row" data-action="sample"><span class="grow">🧪 Add sample data</span></button>
        <button class="list-row danger" data-action="reset"><span class="grow">🗑️ Erase all transactions & budgets</span></button>
      </section>

      <section class="card about">
        <div class="about-art">${realStyle() && Avatar.get(t, 'normal', 'icon') ? `<img src="${Avatar.get(t, 'normal', 'icon')}" alt="App icon">` : N.icon(mascotOpts(t, { iconBg: t.builtin ? '#D7263D' : t.ui.primaryDark }))}</div>
        <p><b>Maneki ${esc(t.name)}</b> — a personal finance app inspired by Money Lover, guarded by a lucky cat. Everything is stored only in this browser.</p>
        <p class="muted small">招き猫 · the beckoning cat raises its paw to invite good fortune.</p>
      </section>`;
  }

  /* ================= main render ================= */
  function render() {
    applyTheme();
    renderHeader();
    const view = $('#view');
    const html = ui.view === 'tx' ? viewTx() : ui.view === 'report' ? viewReport() : ui.view === 'budget' ? viewBudget() : viewAccount();
    view.innerHTML = html;
    $$('#tabbar [data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === ui.view));
    const act = $('.month-tabs .active');
    if (act) act.scrollIntoView({ block: 'nearest', inline: 'center' });
    const q = $('#q');
    if (q) {
      q.oninput = () => {
        ui.q = q.value.trim();
        const pos = q.selectionStart;
        render();
        const nq = $('#q');
        nq.focus();
        nq.setSelectionRange(pos, pos);
      };
    }
    const nm = $('#set-name');
    if (nm) nm.onchange = () => { S.state.settings.userName = nm.value.trim(); S.save(); render(); };
    const cu = $('#set-cur');
    if (cu) cu.onchange = () => { S.state.settings.currency = cu.value; S.save(); render(); toast('Currency set to ' + cu.value); };
  }

  /* ================= editors ================= */
  function categoryPicker(currentType, onPick) {
    const tabs = [['expense', 'Expense'], ['income', 'Income'], ['debt', 'Debt / Loan']];
    let tab = currentType === 'income' ? 'income' : currentType && currentType.startsWith('debt') ? 'debt' : 'expense';
    const grid = () => S.state.categories
      .filter((c) => (tab === 'debt' ? c.type.startsWith('debt') : c.type === tab))
      .map((c) => `<button class="cat-cell" data-cat="${c.id}">${catIcon(c, 'lg')}<span>${esc(c.name)}</span></button>`).join('')
      + `<button class="cat-cell" data-newcat>${catIcon({ icon: '＋', color: '#999' }, 'lg')}<span>New category</span></button>`;
    openSheet(`${sheetHeader('Select category')}
      <div class="seg tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="cat-grid">${grid()}</div>`, {
      className: 'tall',
      onMount(sheet, close) {
        sheet.addEventListener('click', (e) => {
          const tb = e.target.closest('[data-tab]');
          if (tb) {
            tab = tb.dataset.tab;
            $$('[data-tab]', sheet).forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
            $('.cat-grid', sheet).innerHTML = grid();
            return;
          }
          const c = e.target.closest('[data-cat]');
          if (c) { close(); onPick(c.dataset.cat); return; }
          if (e.target.closest('[data-newcat]')) {
            close();
            categoryEditor(null, tab === 'debt' ? 'debt_out' : tab, (id) => onPick(id));
          }
        });
      },
    });
  }

  function txEditor(tx) {
    const st = S.state;
    const editing = !!tx;
    const isXfer = tx && S.isTransfer(tx);
    if (isXfer) return transferEditor(tx);
    const t = tx ? Object.assign({}, tx) : {
      id: S.uid(), cat: 'food', amount: '', date: S.today(), note: '',
      wallet: st.settings.wallet !== 'all' ? st.settings.wallet : (st.wallets[0] || {}).id,
    };
    const walletOpts = () => st.wallets.map((w) => `<option value="${w.id}" ${w.id === t.wallet ? 'selected' : ''}>${w.icon} ${esc(w.name)}</option>`).join('');

    openSheet(`<form class="tx-form" novalidate>
      ${sheetHeader(editing ? 'Edit transaction' : 'Add transaction', '<button class="link strong" type="submit">Save</button>')}
      <div class="amount-row">
        <span class="cur-chip">${st.settings.currency}</span>
        <input name="amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${t.amount === '' ? '' : t.amount}" autofocus aria-label="Amount">
      </div>
      <p class="amount-preview muted"></p>
      <button type="button" class="field" data-f="cat"><span class="f-ic"></span><span class="f-val"></span><span class="chev">›</span></button>
      <label class="field"><span class="f-ic">📝</span><input name="note" placeholder="Note" value="${esc(t.note || '')}"></label>
      <label class="field"><span class="f-ic">📅</span><input name="date" type="date" value="${t.date}" required></label>
      <label class="field"><span class="f-lab">Wallet</span><select name="wallet">${walletOpts()}</select></label>
      <label class="field with-row"><span class="f-ic">🧑</span><input name="with" placeholder="With (person)" value="${esc(t.with || '')}"></label>
      ${editing ? '<button type="button" class="btn danger block" data-del>Delete transaction</button>' : ''}
    </form>`, {
      className: 'tall',
      onMount(sheet, close) {
        const f = $('form', sheet);
        const paintCat = () => {
          const c = S.cat(t.cat);
          $('[data-f="cat"] .f-ic', sheet).innerHTML = catIcon(c);
          $('[data-f="cat"] .f-val', sheet).textContent = c.name;
          $('.with-row', sheet).style.display = c.type.startsWith('debt') ? '' : 'none';
          f.amount.classList.toggle('in', S.isIn(t));
        };
        const paintAmt = () => {
          const v = parseAmount(f.amount.value);
          $('.amount-preview', sheet).textContent = f.amount.value && !isNaN(v) ? '= ' + fmt(v) : f.amount.value ? 'Enter a number (you can use + − × ÷)' : ' ';
        };
        paintCat(); paintAmt();
        f.amount.oninput = paintAmt;
        $('[data-f="cat"]', sheet).onclick = () => categoryPicker(S.cat(t.cat).type, (id) => { t.cat = id; paintCat(); });
        const del = $('[data-del]', sheet);
        if (del) del.onclick = () => confirmSheet('Delete transaction?', 'This can\'t be undone.', 'Delete', () => { S.removeTx(t.id); close(); render(); toast('Deleted', 'worried'); }, true);
        f.onsubmit = (e) => {
          e.preventDefault();
          const amount = parseAmount(f.amount.value);
          if (!(amount > 0)) { f.amount.focus(); f.amount.classList.add('shake'); setTimeout(() => f.amount.classList.remove('shake'), 400); return; }
          if (!f.date.value) { f.date.focus(); return; }
          const rec = { id: t.id, cat: t.cat, amount, date: f.date.value, note: f.note.value.trim(), wallet: f.wallet.value };
          if (S.cat(t.cat).type.startsWith('debt') && f.with.value.trim()) rec.with = f.with.value.trim();
          S.upsert('transactions', rec);
          close();
          render();
          const inc = S.isIn(rec);
          if (inc && !editing) coinRain();
          toast(editing ? 'Updated!' : inc ? 'Lucky! Money beckoned in 🪙' : 'Saved — nyan! 🐾', inc ? 'rich' : 'happy');
          checkBudgets(rec);
        };
      },
    });
  }

  function checkBudgets(rec) {
    if (S.cat(rec.cat).type !== 'expense') return;
    const nowP = S.monthPeriod(0);
    if (rec.date < nowP.start || rec.date > nowP.end) return;
    for (const b of S.state.budgets) {
      if (b.cat !== 'all' && b.cat !== rec.cat) continue;
      if (b.wallet && b.wallet !== 'all' && b.wallet !== rec.wallet) continue;
      const st = S.budgetStatus(b);
      const name = b.cat === 'all' ? 'total' : S.cat(b.cat).name;
      if (st.ratio > 1) { setTimeout(() => toast(`Mrrow! ${name} budget overspent by ${fmt(-st.left)}`, 'worried'), 1500); return; }
      if (st.ratio > 0.85) { setTimeout(() => toast(`Careful — ${Math.round(st.ratio * 100)}% of ${name} budget used`, 'surprised'), 1500); return; }
    }
  }

  function transferEditor(tx) {
    const st = S.state;
    if (st.wallets.length < 2) { toast('Add a second wallet first', 'surprised'); return; }
    let from = st.wallets[0].id, to = st.wallets[1].id, amount = '', date = S.today(), note = '';
    if (tx) {
      const pair = st.transactions.filter((x) => x.link === tx.link);
      const o = pair.find((x) => x.cat === 'xfer_out'), i = pair.find((x) => x.cat === 'xfer_in');
      if (o) { from = o.wallet; amount = o.amount; date = o.date; note = o.note; }
      if (i) to = i.wallet;
    }
    const opts = (sel) => st.wallets.map((w) => `<option value="${w.id}" ${w.id === sel ? 'selected' : ''}>${w.icon} ${esc(w.name)}</option>`).join('');
    openSheet(`<form class="tx-form" novalidate>
      ${sheetHeader(tx ? 'Edit transfer' : 'Transfer money', '<button class="link strong" type="submit">Save</button>')}
      <div class="amount-row"><span class="cur-chip">${st.settings.currency}</span><input name="amount" inputmode="decimal" placeholder="0" value="${amount}" autofocus aria-label="Amount"></div>
      <label class="field"><span class="f-ic">⬆️</span><span class="f-lab">From</span><select name="from">${opts(from)}</select></label>
      <label class="field"><span class="f-ic">⬇️</span><span class="f-lab">To</span><select name="to">${opts(to)}</select></label>
      <label class="field"><span class="f-ic">📅</span><input name="date" type="date" value="${date}"></label>
      <label class="field"><span class="f-ic">📝</span><input name="note" placeholder="Note" value="${esc(note || '')}"></label>
      ${tx ? '<button type="button" class="btn danger block" data-del>Delete transfer</button>' : ''}
    </form>`, {
      className: 'tall',
      onMount(sheet, close) {
        const f = $('form', sheet);
        const del = $('[data-del]', sheet);
        if (del) del.onclick = () => { S.removeTx(tx.id); close(); render(); toast('Transfer deleted', 'worried'); };
        f.onsubmit = (e) => {
          e.preventDefault();
          const a = parseAmount(f.amount.value);
          if (!(a > 0)) { f.amount.focus(); return; }
          if (f.from.value === f.to.value) { toast('Pick two different wallets', 'surprised'); return; }
          if (tx) S.removeTx(tx.id);
          S.addTransfer(f.from.value, f.to.value, a, f.date.value || S.today(), f.note.value.trim());
          close(); render(); toast('Transferred 🔁');
        };
      },
    });
  }

  function budgetEditor(b) {
    const st = S.state;
    const editing = !!b;
    b = b ? Object.assign({}, b) : { id: S.uid(), cat: 'all', amount: '', wallet: 'all' };
    const cats = st.categories.filter((c) => c.type === 'expense');
    openSheet(`<form class="tx-form" novalidate>
      ${sheetHeader(editing ? 'Edit budget' : 'Create budget', '<button class="link strong" type="submit">Save</button>')}
      <div class="amount-row"><span class="cur-chip">${st.settings.currency}</span><input name="amount" inputmode="decimal" placeholder="0" value="${b.amount}" autofocus aria-label="Budget amount"></div>
      <label class="field"><span class="f-ic">🗂️</span><select name="cat"><option value="all">🧮 All expenses</option>${cats.map((c) => `<option value="${c.id}" ${c.id === b.cat ? 'selected' : ''}>${c.icon} ${esc(c.name)}</option>`).join('')}</select></label>
      <label class="field"><span class="f-lab">Wallet</span><select name="wallet"><option value="all">🌐 All wallets</option>${st.wallets.map((w) => `<option value="${w.id}" ${w.id === b.wallet ? 'selected' : ''}>${w.icon} ${esc(w.name)}</option>`).join('')}</select></label>
      <p class="muted small pad">Budgets repeat every month.</p>
      ${editing ? '<button type="button" class="btn danger block" data-del>Delete budget</button>' : ''}
    </form>`, {
      className: 'tall',
      onMount(sheet, close) {
        const f = $('form', sheet);
        if (b.cat === 'all') f.cat.value = 'all';
        const del = $('[data-del]', sheet);
        if (del) del.onclick = () => { S.remove('budgets', b.id); close(); render(); toast('Budget deleted', 'worried'); };
        f.onsubmit = (e) => {
          e.preventDefault();
          const a = parseAmount(f.amount.value);
          if (!(a > 0)) { f.amount.focus(); return; }
          S.upsert('budgets', { id: b.id, cat: f.cat.value, amount: a, wallet: f.wallet.value });
          close(); render(); toast('Budget saved — I\'ll keep watch 👀');
        };
      },
    });
  }

  const WALLET_ICONS = ['👛', '🏦', '💳', '💵', '🐷', '🪙', '📱', '💼', '🧧', '🏠'];
  function walletEditor(w) {
    const editing = !!w;
    w = w ? Object.assign({}, w) : { id: S.uid(), name: '', icon: '👛', initial: 0 };
    openSheet(`<form class="tx-form" novalidate>
      ${sheetHeader(editing ? 'Edit wallet' : 'Add wallet', '<button class="link strong" type="submit">Save</button>')}
      <div class="emoji-pick">${WALLET_ICONS.map((i) => `<button type="button" class="${i === w.icon ? 'on' : ''}" data-ic="${i}">${i}</button>`).join('')}</div>
      <label class="field"><span class="f-lab">Name</span><input name="name" value="${esc(w.name)}" placeholder="e.g. Savings" required autofocus></label>
      <label class="field"><span class="f-lab">Initial balance</span><input name="initial" inputmode="decimal" value="${w.initial}"></label>
      ${editing ? '<button type="button" class="btn danger block" data-del>Delete wallet</button>' : ''}
    </form>`, {
      className: 'tall',
      onMount(sheet, close) {
        const f = $('form', sheet);
        sheet.addEventListener('click', (e) => {
          const b = e.target.closest('[data-ic]');
          if (!b) return;
          w.icon = b.dataset.ic;
          $$('[data-ic]', sheet).forEach((x) => x.classList.toggle('on', x === b));
        });
        const del = $('[data-del]', sheet);
        if (del) del.onclick = () => {
          if (S.state.wallets.length <= 1) { toast('You need at least one wallet', 'surprised'); return; }
          const n = S.state.transactions.filter((t) => t.wallet === w.id).length;
          confirmSheet('Delete wallet?', n ? `This also deletes its ${n} transaction(s).` : 'This wallet has no transactions.', 'Delete', () => {
            S.state.transactions = S.state.transactions.filter((t) => t.wallet !== w.id);
            S.remove('wallets', w.id);
            if (S.state.settings.wallet === w.id) S.state.settings.wallet = 'all';
            S.save(); close(); render();
          }, true);
        };
        f.onsubmit = (e) => {
          e.preventDefault();
          if (!f.elements.name.value.trim()) { f.elements.name.focus(); return; }
          const init = f.initial.value.trim() === '' ? 0 : parseAmount(f.initial.value);
          if (isNaN(init)) { f.initial.focus(); return; }
          S.upsert('wallets', { id: w.id, name: f.elements.name.value.trim(), icon: w.icon, initial: init });
          close(); render(); toast('Wallet saved');
        };
      },
    });
  }

  function categoryEditor(c, type, after) {
    const editing = !!c;
    c = c ? Object.assign({}, c) : { id: 'c_' + S.uid(), name: '', icon: '🐟', type: type || 'expense', color: '#F39C12' };
    openSheet(`<form class="tx-form" novalidate>
      ${sheetHeader(editing ? 'Edit category' : 'New category', '<button class="link strong" type="submit">Save</button>')}
      <label class="field"><span class="f-lab">Icon</span><input name="icon" value="${c.icon}" maxlength="4" class="emoji-input"></label>
      <label class="field"><span class="f-lab">Name</span><input name="name" value="${esc(c.name)}" required autofocus></label>
      <label class="field"><span class="f-lab">Type</span><select name="type">
        ${[['expense', 'Expense'], ['income', 'Income'], ['debt_in', 'Debt (money in)'], ['debt_out', 'Loan (money out)']].map(([k, l]) => `<option value="${k}" ${k === c.type ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      <label class="field"><span class="f-lab">Colour</span><input name="color" type="color" value="${c.color}"></label>
      ${editing && !c.builtin ? '<button type="button" class="btn danger block" data-del>Delete category</button>' : ''}
    </form>`, {
      className: 'tall',
      onMount(sheet, close) {
        const f = $('form', sheet);
        const del = $('[data-del]', sheet);
        if (del) del.onclick = () => {
          if (S.state.transactions.some((t) => t.cat === c.id)) { toast('This category is used by transactions', 'surprised'); return; }
          S.remove('categories', c.id); close(); render();
        };
        f.onsubmit = (e) => {
          e.preventDefault();
          if (!f.elements.name.value.trim()) { f.elements.name.focus(); return; }
          S.upsert('categories', Object.assign(c, { name: f.elements.name.value.trim(), icon: f.icon.value.trim() || '❔', type: f.elements.type.value, color: f.color.value }));
          close(); render();
          if (after) after(c.id);
        };
      },
    });
  }

  function categoryList() {
    const groups = [['expense', 'Expense'], ['income', 'Income'], ['debt_in', 'Debt'], ['debt_out', 'Loan']];
    openSheet(`${sheetHeader('Categories', '<button class="link strong" data-new>New</button>')}
      ${groups.map(([k, l]) => `<h3 class="section-title">${l}</h3><div class="card list">${S.state.categories.filter((c) => c.type === k).map((c) => `<button class="list-row" data-id="${c.id}">${catIcon(c)}<span class="grow">${esc(c.name)}</span><span class="muted">${c.builtin ? '' : 'custom'} ›</span></button>`).join('')}</div>`).join('')}`, {
      className: 'tall',
      onMount(sheet, close) {
        sheet.addEventListener('click', (e) => {
          if (e.target.closest('[data-new]')) { close(); categoryEditor(null, 'expense'); return; }
          const r = e.target.closest('[data-id]');
          if (r) { close(); categoryEditor(S.cat(r.dataset.id)); }
        });
      },
    });
  }

  function walletPicker() {
    const st = S.state;
    const row = (id, icon, name) => `<button class="list-row ${st.settings.wallet === id ? 'on' : ''}" data-w="${id}"><span class="w-icon">${icon}</span><span class="grow">${esc(name)}</span><b>${fmt(S.balance(id))}</b>${st.settings.wallet === id ? '<span class="tick">✓</span>' : ''}</button>`;
    openSheet(`${sheetHeader('Select wallet')}
      <div class="card list">${row('all', '🌐', 'Total')}${st.wallets.map((w) => row(w.id, w.icon, w.name)).join('')}</div>
      <button class="btn ghost block" data-manage>Manage wallets</button>`, {
      onMount(sheet, close) {
        sheet.addEventListener('click', (e) => {
          const r = e.target.closest('[data-w]');
          if (r) { st.settings.wallet = r.dataset.w; S.save(); close(); render(); return; }
          if (e.target.closest('[data-manage]')) { close(); ui.view = 'account'; render(); }
        });
      },
    });
  }

  /* ================= Pet Studio ================= */
  function petStudio(existing) {
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : null;
    openSheet(`<div class="studio">
      ${sheetHeader(existing ? 'Edit ' + existing.name : 'Pet Studio', '')}
      <div class="studio-body"></div>
    </div>`, {
      className: 'full',
      onMount(sheet, close) {
        const body = $('.studio-body', sheet);
        if (draft) return editorStage(body, draft, close, true);
        introStage(body, close);
      },
    });
  }

  function introStage(body, close) {
    body.innerHTML = `
      <div class="studio-intro">
        <div class="studio-hero">${mascot({ pose: 'maneki', mood: 'happy', className: 'waving' }, MIT_THEME)}</div>
        <h2>Turn your pet into a lucky cat!</h2>
        <p class="muted">Upload a clear photo of your pet (or any character). I'll find it, cut it out, read its fur, stripes and eye colours, and redesign the app around it, just like I was made from Mit's photo.</p>
        <label class="drop" tabindex="0">
          <input type="file" accept="image/*" hidden>
          <span class="drop-ic">📷</span>
          <b>Choose a photo</b><small>or drop it here</small>
        </label>
        <p class="muted small">Uses an AI object detector (TensorFlow.js COCO-SSD) when you're online, with an offline fallback. Your photo never leaves this device.</p>
      </div>`;
    const drop = $('.drop', body);
    const input = $('input', body);
    input.onchange = () => input.files[0] && run(input.files[0]);
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      const f = e.dataTransfer.files[0];
      if (f && f.type.startsWith('image/')) run(f);
    };

    async function run(file) {
      const url = URL.createObjectURL(file);
      body.innerHTML = `<div class="studio-scan">
          <div class="scan-img"><img src="${url}" alt="Your photo"><i class="scan-line"></i></div>
          <ol class="steps"></ol>
        </div>`;
      const steps = $('.steps', body);
      let lastKey = null;
      const onStep = (key, text) => {
        if (key === lastKey && steps.lastElementChild) { steps.lastElementChild.textContent = text; return; }
        if (steps.lastElementChild) steps.lastElementChild.classList.add('ok');
        lastKey = key;
        const li = document.createElement('li');
        li.textContent = text;
        steps.appendChild(li);
      };
      try {
        const r = await PetStudio.analyze(file, onStep);
        const name = r.label === 'dog' ? 'Inu' : r.label === 'cat' ? 'Neko' : 'Buddy';
        const draft = {
          id: 'pet_' + S.uid(), name, species: r.species, ears: r.ears, pattern: r.pattern,
          colors: r.colors, ui: r.ui, cutout: r.cutout, face: r.face, collarOn: true, photo: r.photo,
          detector: r.detector, detected: r.label ? `${r.label} · ${Math.round(r.score * 100)}%` : 'main subject',
          swatches: r.swatches, overlay: r.overlay, quality: r.quality,
        };
        setTimeout(() => editorStage(body, draft, close, false), 350);
      } catch (e) {
        console.error(e);
        body.innerHTML = emptyState('Hmm, I couldn\'t read that photo', e.message || 'Try another image.', '<button class="btn primary" data-retry>Try again</button>');
        $('[data-retry]', body).onclick = () => introStage(body, close);
      }
    }
  }

  function editorStage(body, d, close, editing) {
    const sel = (name, opts, v) => `<select name="${name}">${opts.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const colourField = (k, label) => `<label class="swatch-field"><input type="color" name="c_${k}" value="${d.colors[k]}"><span>${label}</span></label>`;
    let mood = 'happy', placing = 0, newEyes = [];
    body.innerHTML = `
      <div class="studio-edit">
        <div class="detect-row">
          ${d.overlay ? `<figure><img src="${d.overlay}" alt="Detection"><figcaption>Detected: <b>${esc(d.detected)}</b><br><small>${esc(d.detector)}${d.quality === 'ellipse' ? ' · rough cut-out' : ''}</small></figcaption></figure>` : ''}
          <figure class="real-stage ${d.overlay ? '' : 'wide'}"><img class="big-real" alt="Realistic preview"><figcaption class="eye-hint"></figcaption></figure>
        </div>
        <div class="studio-tools">
          <button type="button" class="btn ghost" data-eyes>👀 Adjust eyes</button>
          <label class="toggle"><input type="checkbox" data-collar ${d.collarOn !== false ? 'checked' : ''}> 🔔 Maneki collar & bell</label>
        </div>
        <h4 class="moods-title">Moods</h4>
        <div class="moods studio-moods">${Object.keys(Avatar.STATES).map((m) => `<button type="button" class="mood ${m === mood ? 'on' : ''}" data-m="${m}"><img alt=""><span>${Avatar.emojiFor(d, m)} ${Avatar.STATES[m].label}</span></button>`).join('')}</div>
        <div class="preview-stage" style="--pp:${d.ui.primary};--pbg:${d.ui.bg};--pon:${d.ui.onPrimary};--pdk:${d.ui.primaryDark}">
          <div class="mini-app">
            <div class="mini-hdr"><span class="mini-av"></span><span><small>Maneki <b class="mini-name"></b></small><b>${fmt(S.balance('all'))}</b></span></div>
            <div class="mini-body"><div class="mini-card"><i></i><i></i><i></i></div><div class="mini-fab">＋</div></div>
          </div>
          <figure class="preview-neko waving"><div></div><figcaption>Cartoon version</figcaption></figure>
        </div>
        <form class="studio-form" novalidate>
          <label class="field"><span class="f-lab">Name</span><input name="name" value="${esc(d.name)}" maxlength="20" required></label>
          <label class="field"><span class="f-lab">Species</span>${sel('species', [['cat', '🐱 Cat'], ['dog', '🐶 Dog'], ['rabbit', '🐰 Rabbit'], ['hamster', '🐹 Hamster'], ['bear', '🧸 Bear'], ['other', '✨ Other']], d.species)}</label>
          <h4>App theme colour</h4>
          <div class="theme-color">
            <label class="swatch-field"><input type="color" name="primary" value="${d.ui.primary}"><span>Theme</span></label>
            ${(d.swatches || []).map((h) => `<button type="button" class="chip" data-sw="${h}" style="background:${h}" aria-label="Use ${h}"></button>`).join('')}
            <button type="button" class="chip gold" data-sw="#F0B429" aria-label="Maneki gold"></button>
          </div>
          <details class="cartoon-opts">
            <summary>🎨 Cartoon version & collar colour</summary>
            <div class="grid3">
              <label>Ears${sel('ears', [['pointy', 'Pointy'], ['floppy', 'Floppy'], ['long', 'Long'], ['round', 'Round']], d.ears)}</label>
              <label>Coat${sel('pattern', [['tabby', 'Tabby'], ['solid', 'Solid'], ['bicolor', 'Bicolour'], ['pointed', 'Pointed'], ['spotted', 'Spotted']], d.pattern)}</label>
            </div>
            <div class="swatches">
              ${colourField('fur', 'Fur')}${colourField('furLight', 'Light fur')}${colourField('stripe', 'Stripes')}
              ${colourField('eye', 'Eyes')}${colourField('nose', 'Nose')}${colourField('collar', 'Collar')}
            </div>
          </details>
          <div class="btn-row">
            ${editing ? '<button type="button" class="btn danger" data-del>Delete</button>' : '<button type="button" class="btn ghost" data-again>Another photo</button>'}
            <button type="submit" class="btn primary">${editing ? 'Save' : 'Use this theme'}</button>
          </div>
        </form>
      </div>`;

    const f = $('form', body);
    const stage = $('.preview-stage', body);
    const big = $('.big-real', body);
    const hint = $('.eye-hint', body);
    const draftTheme = () => ({
      id: 'draft-' + d.id, name: d.name, species: d.species, builtin: false,
      cutout: d.cutout, sticker: d.sticker, face: d.face, collarOn: d.collarOn !== false, colors: d.colors, ui: d.ui,
    });
    const setHint = () => {
      hint.innerHTML = placing
        ? `<b>Tap the ${placing === 1 ? 'left' : 'right'} eye</b> on the picture`
        : d.face && d.face.eyes ? '✓ Eyes found — moods can open, close & wink them' : '⚠️ Eyes not found — tap “Adjust eyes” for blinking moods';
    };
    let seq = 0;
    const paintReal = async () => {
      const my = ++seq;
      const t = draftTheme();
      await Avatar.prepare(t);
      if (my !== seq) return;
      const url = Avatar.get(t, placing ? 'normal' : mood, 'sticker');
      if (url) big.src = url;
      $$('.studio-moods [data-m]', body).forEach((b) => { const u = Avatar.get(t, b.dataset.m, 'portrait'); if (u) $('img', b).src = u; });
      $('.mini-av', body).innerHTML = Avatar.get(t, 'normal', 'portrait-plain') ? `<img src="${Avatar.get(t, 'normal', 'portrait-plain')}" alt="">` : '';
      setHint();
    };
    const paint = () => {
      d.name = f.elements.name.value.trim() || 'Buddy';
      d.species = f.species.value;
      d.ears = f.ears.value;
      d.pattern = f.pattern.value;
      ['fur', 'furLight', 'stripe', 'eye', 'nose', 'collar'].forEach((k) => (d.colors[k] = f['c_' + k].value));
      d.colors.earInner = N.util.mix(d.species === 'dog' ? d.colors.fur : d.colors.nose, '#FFE4E6', 0.55);
      const u = d.ui;
      stage.style.setProperty('--pp', u.primary);
      stage.style.setProperty('--pbg', u.bg);
      stage.style.setProperty('--pon', u.onPrimary);
      stage.style.setProperty('--pdk', u.primaryDark);
      $('.preview-neko div', body).innerHTML = N.svg(mascotOpts(d, { pose: 'maneki', mood: 'happy' }));
      $('.mini-name', body).textContent = d.name;
      paintReal();
    };
    paint();
    f.addEventListener('input', (e) => {
      if (e.target.name === 'primary') d.ui = PetStudio.deriveUI(e.target.value);
      if (e.target.name === 'species') f.ears.value = N.SPECIES_EARS[f.species.value] || 'pointy';
      paint();
    });
    $('[data-collar]', body).onchange = (e) => { d.collarOn = e.target.checked; paintReal(); };
    $('[data-eyes]', body).onclick = () => {
      placing = 1; newEyes = [];
      big.parentElement.classList.add('placing');
      paintReal();
    };
    big.addEventListener('click', (e) => {
      if (!placing) return;
      const r = big.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * Avatar.SIZE, y = ((e.clientY - r.top) / r.height) * Avatar.SIZE;
      newEyes.push({ x, y });
      if (placing === 1) { placing = 2; setHint(); return; }
      const dist = Math.hypot(newEyes[1].x - newEyes[0].x, newEyes[1].y - newEyes[0].y);
      const old = d.face && d.face.eyes ? (d.face.eyes[0].r + d.face.eyes[1].r) / 2 : 0;
      const rad = old && old < dist * 0.4 ? old : Math.max(4, dist * 0.2);
      d.face = { eyes: newEyes.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, r: Math.round(rad * 10) / 10 })) };
      placing = 0;
      big.parentElement.classList.remove('placing');
      paintReal();
    });
    body.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-sw]');
      if (sw) {
        d.ui = PetStudio.deriveUI(sw.dataset.sw);
        f.primary.value = d.ui.primary;
        paint();
      }
      const mb = e.target.closest('[data-m]');
      if (mb) {
        mood = mb.dataset.m;
        $$('.studio-moods [data-m]', body).forEach((b) => b.classList.toggle('on', b === mb));
        paintReal();
      }
    });
    const again = $('[data-again]', body);
    if (again) again.onclick = () => introStage(body, close);
    const del = $('[data-del]', body);
    if (del) del.onclick = () => confirmSheet(`Delete ${d.name}?`, 'The theme and its photo cut-out will be removed.', 'Delete', () => {
      S.remove('themes', d.id);
      if (S.state.settings.theme === d.id) S.state.settings.theme = 'mit';
      S.save(); close(); render(); toast('Back to Mit 🐾', 'love');
    }, true);
    f.onsubmit = async (e) => {
      e.preventDefault();
      paint();
      const saved = {
        id: d.id, name: d.name, species: d.species, ears: d.ears, pattern: d.pattern,
        colors: d.colors, ui: d.ui, cutout: d.cutout, face: d.face || null, collarOn: d.collarOn !== false, photo: d.photo,
        detector: d.detector, detected: d.detected, swatches: d.swatches, createdAt: d.createdAt || Date.now(),
      };
      if (!saved.cutout && d.sticker) saved.sticker = d.sticker; // themes made before realistic avatars
      S.upsert('themes', saved);
      S.state.settings.theme = saved.id;
      if (!S.save()) return;
      await Avatar.prepare(saved);
      close(); render();
      coinRain();
      toast(`Irasshaimase! ${saved.name} is your lucky ${saved.species === 'cat' ? 'cat' : 'charm'} now`, 'party');
    };
  }

  /* ================= onboarding ================= */
  function onboarding() {
    openSheet(`<div class="onboard">
        <div class="onboard-art">${mascot({ pose: 'maneki', mood: 'wink', className: 'waving' }, MIT_THEME)}</div>
        <h2>Irasshaimase! I'm Mit 🐾</h2>
        <p class="muted">Your lucky maneki-neko. I'll beckon good fortune while you track every coin, just like Money Lover. Later you can swap me for your own pet!</p>
        <label class="field"><span class="f-lab">Your name</span><input id="ob-name" placeholder="Friend" autofocus></label>
        <label class="field"><span class="f-lab">Currency</span><select id="ob-cur">${Object.keys(S.CURRENCIES).map((c) => `<option ${c === S.state.settings.currency ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        <div class="btn-row"><button class="btn ghost" data-go="fresh">Start fresh</button><button class="btn primary" data-go="sample">Try sample data</button></div>
      </div>`, {
      className: 'tall',
      onMount(sheet, close) {
        sheet.addEventListener('click', (e) => {
          const b = e.target.closest('[data-go]');
          if (!b) return;
          const st = S.state;
          st.settings.userName = $('#ob-name', sheet).value.trim();
          st.settings.currency = $('#ob-cur', sheet).value;
          st.settings.onboarded = true;
          S.save();
          if (b.dataset.go === 'sample') S.seed();
          close(); render();
          toast(b.dataset.go === 'sample' ? 'Sample data loaded — explore!' : 'Tap + to add your first transaction', 'happy');
        });
      },
      onClose() { if (!S.state.settings.onboarded) { S.state.settings.onboarded = true; S.save(); } },
    });
  }

  /* ================= files ================= */
  function download(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function importJSON() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      try {
        const data = JSON.parse(await input.files[0].text());
        confirmSheet('Replace all data?', 'Your current data will be replaced by the backup.', 'Import', () => {
          try { S.replace(data); render(); toast('Backup restored!'); } catch (err) { toast(err.message, 'worried'); }
        });
      } catch (e) {
        toast('That file is not valid JSON', 'worried');
      }
    };
    input.click();
  }

  /* ================= events ================= */
  const actions = {
    add: () => txEditor(null),
    'edit-tx': (el) => txEditor(S.state.transactions.find((t) => t.id === el.dataset.id)),
    period: (el) => { ui.offset = el.dataset.offset === 'future' ? 'future' : Number(el.dataset.offset); render(); },
    'goto-report': () => { ui.view = 'report'; render(); window.scrollTo(0, 0); },
    'pick-wallet': walletPicker,
    search: () => { ui.searching = true; render(); $('#q') && $('#q').focus(); },
    'search-close': () => { ui.searching = false; ui.q = ''; render(); },
    group: () => { ui.group = ui.group === 'date' ? 'category' : 'date'; render(); },
    poke: () => {
      const el = $('.hdr-mascot');
      el.classList.remove('bounce'); void el.offsetWidth; el.classList.add('bounce');
      const moods = ['happy', 'love', 'wink', 'rich', 'surprised', 'party'];
      const m = moods[Math.floor(Math.random() * moods.length)];
      el.innerHTML = avatar(m);
      clearTimeout(actions.poke.t);
      actions.poke.t = setTimeout(renderHeader, 3400);
      const p = S.monthPeriod(0);
      const sm = S.summary(S.txs({ start: p.start, end: p.end }));
      const tips = SAYINGS.concat(sm.outflow ? [`This month: ${fmt(sm.inflow)} in, ${fmt(sm.outflow)} out. ${sm.net >= 0 ? 'Purrfect!' : 'Let\'s save a little more?'}`] : []);
      speak(tips[Math.floor(Math.random() * tips.length)]);
    },
    'new-budget': () => budgetEditor(null),
    'edit-budget': (el) => budgetEditor(S.state.budgets.find((b) => b.id === el.dataset.id)),
    'use-theme': (el) => { S.state.settings.theme = el.dataset.id; S.save(); Avatar.prepare(theme()).then(() => { render(); toast(`${theme().name} is on duty now!`, 'party'); }); },
    'edit-theme': (el) => petStudio(S.state.themes.find((t) => t.id === el.dataset.id)),
    'pet-studio': () => petStudio(null),
    'mascot-style': (el) => { S.state.settings.mascotStyle = el.dataset.v; S.save(); render(); },
    mood: (el) => { const m = el.dataset.mood; toast(`${Avatar.emojiFor(theme(), m)} ${theme().name} is feeling ${Avatar.STATES[m].label.toLowerCase()}!`, m); },
    'new-wallet': () => walletEditor(null),
    'edit-wallet': (el) => walletEditor(S.wallet(el.dataset.id)),
    transfer: () => transferEditor(null),
    categories: categoryList,
    'export-json': () => download(`maneki-neko-backup-${S.today()}.json`, JSON.stringify(S.state, null, 2), 'application/json'),
    'export-csv': () => download(`maneki-neko-transactions-${S.today()}.csv`, S.toCSV(), 'text/csv'),
    'import-json': importJSON,
    sample: () => confirmSheet('Add sample data?', 'Adds about 3 months of example transactions and budgets.', 'Add', () => { S.seed(); render(); toast('Sample data added'); }),
    reset: () => confirmSheet('Erase everything?', 'All transactions and budgets will be deleted. Your pet themes are kept.', 'Erase', () => { S.reset(); S.state.settings.onboarded = true; S.save(); render(); toast('All clean', 'sleepy'); }, true),
  };

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('#tabbar [data-view]');
    if (tab) { ui.view = tab.dataset.view; ui.searching = false; ui.q = ''; render(); window.scrollTo(0, 0); return; }
    const el = e.target.closest('[data-action]');
    if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const sheets = $$('.sheet-wrap.open .sheet');
      if (sheets.length) sheets[sheets.length - 1]._close();
    }
  });

  window.addEventListener('store-error', (e) => toast(e.detail, 'worried'));

  const ICONS = {
    search: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    cats: '<svg viewBox="0 0 24 24" width="22" height="22"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></g></svg>',
    cal: '<svg viewBox="0 0 24 24" width="22" height="22"><g fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4" stroke-linecap="round"/></g></svg>',
    plus: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  };

  // boot (supports #tx, #report, #budget, #account deep links)
  const hashView = location.hash.slice(1);
  if (['tx', 'report', 'budget', 'account'].includes(hashView)) ui.view = hashView;
  if (S.state.settings.styleV !== 2) { // realistic avatars are the new default
    S.state.settings.mascotStyle = 'real';
    S.state.settings.styleV = 2;
    S.save();
  }
  Promise.race([Avatar.prepare(theme()), new Promise((r) => setTimeout(r, 2000))]).then(() => {
    render();
    Promise.all(themes().map((t) => Avatar.prepare(t))).then(() => { if (ui.view === 'account') render(); });
    if (!S.state.settings.onboarded) setTimeout(onboarding, 300);
  });
})();
