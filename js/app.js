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
    templates: window.MIT_REAL ? [{ id: 'mit-1', cutout: window.MIT_REAL.cutout, face: window.MIT_REAL.face }] : [],
    mainId: 'mit-1',
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
  const MAX_PHOTOS = 6;

  // Themes made before multi-photo templates keep working.
  function normalizeTheme(t) {
    const c = JSON.parse(JSON.stringify(t));
    if (!c.templates || !c.templates.length) {
      const src = c.cutout || c.sticker;
      c.templates = src ? [{ id: 'main', cutout: src, face: c.face || null, photo: null, pal: null }] : [];
      c.mainId = 'main';
      if (c.colorsTouched === undefined) c.colorsTouched = true; // keep the colours read from the original photo
    }
    delete c.cutout; delete c.sticker; delete c.face;
    c.moodMap = c.moodMap || {};
    return c;
  }

  function petStudio(existing) {
    openSheet(`<div class="studio">
      ${sheetHeader(existing ? 'Edit ' + existing.name : 'Pet Studio', '')}
      <div class="studio-body"></div>
    </div>`, {
      className: 'full',
      onMount(sheet, close) {
        const body = $('.studio-body', sheet);
        if (existing) return editorStage(body, normalizeTheme(existing), close, true);
        introStage(body, close);
      },
    });
  }

  function introStage(body, close) {
    body.innerHTML = `
      <div class="studio-intro">
        <div class="studio-hero">${mascot({ pose: 'maneki', mood: 'happy', className: 'waving' }, MIT_THEME)}</div>
        <h2>Turn your pet into a lucky cat!</h2>
        <p class="muted">Add one or more photos of your pet (or any character). I'll find it, cut it out, find its eyes and read its colours, then redesign the app around it. More photos, in different poses, give better moods.</p>
        <label class="drop" tabindex="0">
          <input type="file" accept="image/*" multiple hidden>
          <span class="drop-ic">📷</span>
          <b>Choose photos</b><small>up to ${MAX_PHOTOS} · or drop them here</small>
        </label>
        <label class="toggle center"><input type="checkbox" data-hl> ✏️ Let me highlight my pet in each photo</label>
        <p class="muted small">Uses AI (COCO-SSD detector + MediaPipe segmenter) when you're online, with an offline fallback. Your photos never leave this device.</p>
      </div>`;
    const drop = $('.drop', body);
    const input = $('input[type=file]', body);
    const draft = {
      id: 'pet_' + S.uid(), name: 'Neko', species: 'cat', ears: 'pointy', pattern: 'tabby',
      colors: Object.assign({}, MIT_THEME.colors), ui: Object.assign({}, MIT_THEME.ui),
      templates: [], mainId: null, moodMap: {}, collarOn: true, swatches: [],
    };
    const start = (files) => {
      files = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, MAX_PHOTOS);
      if (!files.length) return;
      addPhotos(body, draft, files, $('[data-hl]', body).checked).then((n) => {
        if (n) editorStage(body, draft, close, false);
        else introStage(body, close);
      });
    };
    input.onchange = () => start(input.files);
    drop.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
    drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); start(e.dataTransfer.files); };
  }

  // Scanning progress panel inside the studio.
  function scanPanel(body, url, title) {
    body.innerHTML = `<div class="studio-scan">
        <h3>${esc(title)}</h3>
        <div class="scan-img"><img src="${url}" alt="Your photo"><i class="scan-line"></i></div>
        <ol class="steps"></ol>
      </div>`;
    const steps = $('.steps', body);
    let lastKey = null;
    return (key, text) => {
      if (key === lastKey && steps.lastElementChild) { steps.lastElementChild.textContent = text; return; }
      if (steps.lastElementChild) steps.lastElementChild.classList.add('ok');
      lastKey = key;
      const li = document.createElement('li');
      li.textContent = text;
      steps.appendChild(li);
    };
  }

  function templateFromResult(r, id) {
    return {
      id: id || 't' + S.uid(), cutout: r.cutout, face: r.face, photo: r.photo, pal: r.pal, region: r.region,
      detected: r.label ? `${r.label} · ${Math.round(r.score * 100)}%` : r.region ? 'your highlight' : 'main subject',
      detector: r.detector, segmenter: r.segmenter, quality: r.quality, overlay: r.overlay,
    };
  }

  // Recompute colours from all photos of the character (unless the user tuned them by hand).
  function refreshPalette(d) {
    const merged = PetStudio.mergePalettes(d.templates.map((t) => t.pal));
    if (!merged) return;
    d.swatches = merged.swatches;
    if (d.colorsTouched) return;
    const th = PetStudio.themeFrom(merged, d.species);
    d.colors = th.colors;
    d.pattern = merged.pattern || d.pattern;
    if (!d.uiTouched) d.ui = th.ui;
  }

  async function addPhotos(body, d, files, highlightFirst) {
    let added = 0;
    const room = MAX_PHOTOS - d.templates.length;
    files = Array.from(files).slice(0, Math.max(0, room));
    if (!files.length) { toast(`Up to ${MAX_PHOTOS} photos per character`, 'surprised'); return 0; }
    for (let i = 0; i < files.length; i++) {
      const url = URL.createObjectURL(files[i]);
      let region = null;
      if (highlightFirst) {
        region = await highlightTool(url, null, `Photo ${i + 1} of ${files.length}`);
        if (region === undefined) continue; // skipped
      }
      const step = scanPanel(body, url, `Scanning photo ${i + 1} of ${files.length}`);
      try {
        const r = await PetStudio.analyze(files[i], { onStep: step, region, known: d.templates.map((t) => t.pal) });
        const tpl = templateFromResult(r);
        if (!d.templates.length && r.species) { d.species = r.species; d.ears = r.ears; d.name = r.label === 'dog' ? 'Inu' : r.label === 'cat' ? 'Neko' : 'Buddy'; }
        d.templates.push(tpl);
        if (!d.mainId) d.mainId = tpl.id;
        d._sel = tpl.id;
        added++;
      } catch (e) {
        console.error(e);
        toast(`Couldn't read photo ${i + 1}: ${e.message || 'unknown error'}`, 'worried');
      }
    }
    if (added) refreshPalette(d);
    return added;
  }

  /* ---------- highlight tool: paint over (or box) the main character ---------- */
  function highlightTool(src, initial, subtitle) {
    return new Promise((resolve) => {
      let result; // undefined = cancelled
      openSheet(`${sheetHeader('Highlight the character', '<button class="link strong" data-scan>Scan</button>')}
        <p class="muted small pad">${subtitle ? `<b>${esc(subtitle)}</b> · ` : ''}Paint over your pet with your finger or mouse, or use <b>Box</b> and drag around it. The AI cuts out what you highlight.</p>
        <div class="seg hl-modes"><button class="on" data-mode="paint">🖌️ Paint</button><button data-mode="box">▭ Box</button><button data-mode="erase">🧽 Erase</button></div>
        <div class="hl-stage"><canvas class="hl-canvas"></canvas></div>
        <label class="hl-brush"><span>Brush</span><input type="range" min="1" max="12" value="5" data-brush></label>
        <div class="btn-row"><button class="btn ghost" data-clear>Clear</button><button class="btn ghost" data-auto>🤖 Auto-detect</button><button class="btn primary" data-scan>✨ Scan</button></div>`, {
        className: 'full',
        onClose: () => resolve(result),
        onMount(sheet, close) {
          const cv = $('.hl-canvas', sheet), ctx = cv.getContext('2d');
          const paint = document.createElement('canvas'); // highlight layer in image space
          let img, mode = 'paint', box = initial && initial.box ? Object.assign({}, initial.box) : null, drag = null, brush = 5;
          let paths = initial && initial.paths ? initial.paths.map((pp) => pp.slice()) : []; // ordered brush strokes (for the AI scribble)
          const dpr = window.devicePixelRatio || 1;
          let cw = 0, chh = 0;
          const layout = () => {
            const maxW = $('.hl-stage', sheet).clientWidth || 440;
            const maxH = Math.max(260, window.innerHeight * 0.55);
            const k = Math.min(maxW / img.width, maxH / img.height);
            cw = Math.round(img.width * k); chh = Math.round(img.height * k);
            cv.style.width = cw + 'px'; cv.style.height = chh + 'px';
            cv.width = Math.round(cw * dpr); cv.height = Math.round(chh * dpr);
            draw();
          };
          const draw = () => {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, cv.width, cv.height);
            ctx.drawImage(img, 0, 0, cv.width, cv.height);
            if (box) {
              const b = { x: box.x * cv.width, y: box.y * cv.height, w: box.w * cv.width, h: box.h * cv.height };
              ctx.fillStyle = 'rgba(0,0,0,.45)';
              ctx.fillRect(0, 0, cv.width, b.y); ctx.fillRect(0, b.y + b.h, cv.width, cv.height - b.y - b.h);
              ctx.fillRect(0, b.y, b.x, b.h); ctx.fillRect(b.x + b.w, b.y, cv.width - b.x - b.w, b.h);
              ctx.setLineDash([8 * dpr, 5 * dpr]); ctx.lineWidth = 2.5 * dpr; ctx.strokeStyle = '#FFD650';
              ctx.strokeRect(b.x, b.y, b.w, b.h); ctx.setLineDash([]);
            }
            ctx.globalAlpha = 0.5;
            ctx.drawImage(paint, 0, 0, cv.width, cv.height);
            ctx.globalAlpha = 1;
          };
          const pos = (e) => { const r = cv.getBoundingClientRect(); return { x: clamp01((e.clientX - r.left) / r.width), y: clamp01((e.clientY - r.top) / r.height) }; };
          const clamp01 = (v) => Math.max(0, Math.min(1, v));
          const brushPx = () => (brush / 100) * Math.max(paint.width, paint.height) * 0.6;
          const dab = (a, b) => {
            const pc = paint.getContext('2d');
            pc.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
            pc.strokeStyle = pc.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#F2B632';
            pc.lineWidth = brushPx() * 2; pc.lineCap = 'round'; pc.lineJoin = 'round';
            pc.beginPath(); pc.moveTo(a.x * paint.width, a.y * paint.height); pc.lineTo(b.x * paint.width, b.y * paint.height); pc.stroke();
          };
          cv.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released */ }
            const p = pos(e);
            drag = { start: p, last: p };
            if (mode === 'box') box = { x: p.x, y: p.y, w: 0, h: 0 };
            else { dab(p, p); if (mode === 'paint') paths.push([p]); }
            draw();
          });
          cv.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const p = pos(e);
            if (mode === 'box') box = { x: Math.min(p.x, drag.start.x), y: Math.min(p.y, drag.start.y), w: Math.abs(p.x - drag.start.x), h: Math.abs(p.y - drag.start.y) };
            else { dab(drag.last, p); if (mode === 'paint' && paths.length) paths[paths.length - 1].push(p); }
            drag.last = p;
            draw();
          });
          const end = () => { if (drag && mode === 'box' && box && (box.w < 0.03 || box.h < 0.03)) box = null; drag = null; draw(); };
          cv.addEventListener('pointerup', end);
          cv.addEventListener('pointercancel', end);
          sheet.addEventListener('click', (e) => {
            const m = e.target.closest('[data-mode]');
            if (m) { mode = m.dataset.mode; $$('[data-mode]', sheet).forEach((b) => b.classList.toggle('on', b === m)); return; }
            if (e.target.closest('[data-clear]')) { paint.getContext('2d').clearRect(0, 0, paint.width, paint.height); box = null; paths = []; draw(); return; }
            if (e.target.closest('[data-auto]')) { result = null; close(); return; }
            if (e.target.closest('[data-scan]')) {
              // sample the painted area into points (erasing is taken into account)
              const pc = paint.getContext('2d'), pd = pc.getImageData(0, 0, paint.width, paint.height).data;
              const pts = [];
              const step = Math.max(2, Math.round(Math.max(paint.width, paint.height) / 90));
              for (let y = 0; y < paint.height; y += step) for (let x = 0; x < paint.width; x += step) if (pd[(y * paint.width + x) * 4 + 3] > 40) pts.push({ x: x / paint.width, y: y / paint.height });
              if (!pts.length && !box) { toast('Paint over your pet first, or draw a box', 'surprised'); return; }
              // keep only brush paths that still lie on painted pixels (after erasing)
              const onPaint = (q) => pd[(Math.min(paint.height - 1, Math.round(q.y * paint.height)) * paint.width + Math.min(paint.width - 1, Math.round(q.x * paint.width))) * 4 + 3] > 40;
              const keptPaths = paths.map((pp) => pp.filter(onPaint)).filter((pp) => pp.length > 1);
              result = { strokes: pts.length ? pts : null, paths: keptPaths.length ? keptPaths : null, box: box || null, brush: brush / 100 * 0.6 };
              close();
            }
          });
          $('[data-brush]', sheet).oninput = (e) => { brush = +e.target.value; };
          const im = new Image();
          im.onload = () => {
            img = im;
            const k = Math.min(1, 900 / Math.max(im.width, im.height));
            paint.width = Math.round(im.width * k); paint.height = Math.round(im.height * k);
            if (initial && initial.strokes) {
              const pc = paint.getContext('2d');
              pc.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#F2B632';
              const r = (initial.brush || 0.03) * Math.max(paint.width, paint.height) * 0.7;
              initial.strokes.forEach((p) => { pc.beginPath(); pc.arc(p.x * paint.width, p.y * paint.height, r, 0, 7); pc.fill(); });
            }
            requestAnimationFrame(layout);
          };
          im.src = src;
          window.addEventListener('resize', () => img && layout(), { once: true });
        },
      });
    });
  }

  /* ---------- eye editor with zoom & pan ---------- */
  function eyeEditor(d, tpl) {
    return new Promise((resolve) => {
      let result; // undefined = cancelled
      let eyes = tpl.face && tpl.face.eyes ? tpl.face.eyes.map((e) => Object.assign({}, e)) : [];
      let one = eyes.length === 1, active = 0;
      openSheet(`${sheetHeader('Adjust eyes', '<button class="link strong" data-save>Save</button>')}
        <p class="muted small pad ez-hint"></p>
        <div class="ez-stage">
          <canvas class="ez-canvas"></canvas>
          <div class="ez-zoom"><button data-z="out" aria-label="Zoom out">−</button><span class="ez-level">1×</span><button data-z="in" aria-label="Zoom in">＋</button><button data-z="fit" aria-label="Fit">⤢</button></div>
        </div>
        <div class="seg ez-which"><button class="on" data-eye="0">👁 Left eye</button><button data-eye="1">👁 Right eye</button></div>
        <label class="hl-brush"><span>Eye size</span><input type="range" min="2" max="45" step="0.5" data-size></label>
        <label class="toggle"><input type="checkbox" data-one ${one ? 'checked' : ''}> Only one eye visible (side view)</label>
        <div class="ez-preview"><figure><img data-p="sleepy" alt=""><figcaption>😴</figcaption></figure><figure><img data-p="wink" alt=""><figcaption>😼</figcaption></figure><figure><img data-p="surprised" alt=""><figcaption>🙀</figcaption></figure><figure><img data-p="love" alt=""><figcaption>😻</figcaption></figure></div>
        <div class="btn-row"><button class="btn ghost" data-reset>Clear eyes</button><button class="btn primary" data-save>Save eyes</button></div>`, {
        className: 'full',
        onClose: () => resolve(result),
        onMount(sheet, close) {
          const cv = $('.ez-canvas', sheet), ctx = cv.getContext('2d');
          const N0 = Avatar.SIZE;
          const dpr = window.devicePixelRatio || 1;
          let img, css = 320, zoom = 1, vx = 0, vy = 0; // view: top-left image coord
          const k = () => (css / N0) * zoom; // css px per image px
          const clampView = () => {
            const vis = N0 / zoom;
            vx = Math.max(0, Math.min(N0 - vis, vx)); vy = Math.max(0, Math.min(N0 - vis, vy));
          };
          const toImg = (sx, sy) => ({ x: vx + sx / k(), y: vy + sy / k() });
          const toScr = (ix, iy) => ({ x: (ix - vx) * k(), y: (iy - vy) * k() });
          const zoomAt = (nz, sx, sy) => {
            const p = toImg(sx, sy);
            zoom = Math.max(1, Math.min(10, nz));
            vx = p.x - sx / k(); vy = p.y - sy / k();
            clampView(); draw();
          };
          const hint = () => {
            $('.ez-hint', sheet).innerHTML = `Pinch, scroll or use ＋ to zoom · drag to move · <b>tap the ${one ? 'eye' : active === 0 ? 'left eye' : 'right eye'}</b> to place it · drag a circle to fine-tune.`;
            $('.ez-which', sheet).style.display = one ? 'none' : '';
            $$('[data-eye]', sheet).forEach((b) => b.classList.toggle('on', +b.dataset.eye === active));
            const e = eyes[active];
            $('[data-size]', sheet).value = e ? e.r : 12;
            $('.ez-level', sheet).textContent = (Math.round(zoom * 10) / 10) + '×';
          };
          const draw = () => {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, css, css);
            const t = 16;
            for (let y = 0; y < css; y += t) for (let x = 0; x < css; x += t) { ctx.fillStyle = ((x + y) / t) % 2 ? '#F3EFEA' : '#FFFFFF'; ctx.fillRect(x, y, t, t); }
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, vx, vy, N0 / zoom, N0 / zoom, 0, 0, css, css);
            eyes.forEach((e, i) => {
              if (one && i > 0) return;
              const p = toScr(e.x, e.y), r = Math.max(6, e.r * k());
              ctx.lineWidth = i === active ? 3 : 2;
              ctx.strokeStyle = i === active ? '#4BE38A' : '#FFD650';
              ctx.fillStyle = 'rgba(75,227,138,.12)';
              ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
              ctx.beginPath(); ctx.moveTo(p.x - r * 0.4, p.y); ctx.lineTo(p.x + r * 0.4, p.y); ctx.moveTo(p.x, p.y - r * 0.4); ctx.lineTo(p.x, p.y + r * 0.4); ctx.stroke();
              ctx.font = '700 12px system-ui,sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3;
              const label = one ? 'eye' : i === 0 ? 'L' : 'R';
              ctx.strokeText(label, p.x + r + 4, p.y - r); ctx.fillText(label, p.x + r + 4, p.y - r);
            });
            hint();
          };
          let pvT;
          const preview = () => {
            clearTimeout(pvT);
            pvT = setTimeout(async () => {
              const face = currentFace();
              const t = { id: 'ez-' + d.id, species: d.species, templates: [{ id: tpl.id, cutout: tpl.cutout, face }], mainId: tpl.id, collarOn: d.collarOn !== false, colors: d.colors, ui: d.ui };
              await Avatar.prepare(t);
              $$('[data-p]', sheet).forEach((im) => { const u = Avatar.get(t, im.dataset.p, 'portrait-plain'); if (u) im.src = u; });
            }, 200);
          };
          const currentFace = () => {
            const list = (one ? eyes.slice(0, 1) : eyes.slice(0, 2)).filter(Boolean).map((e) => ({ x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10, r: Math.round(e.r * 10) / 10 }));
            return list.length ? { eyes: list } : null;
          };
          const defaultR = () => (eyes[0] && eyes[0].r) || (eyes[1] && eyes[1].r) || 12;

          // pointers: tap = place, drag circle = move it, drag elsewhere = pan, two fingers = pinch-zoom
          const ptrs = new Map();
          let gesture = null;
          const local = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
          cv.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            try { cv.setPointerCapture(e.pointerId); } catch (err) { /* synthetic or already released */ }
            const p = local(e);
            ptrs.set(e.pointerId, p);
            if (ptrs.size === 2) {
              const [a, b] = [...ptrs.values()];
              gesture = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
              return;
            }
            const hit = eyes.findIndex((ey, i) => { if (!ey || (one && i > 0)) return false; const s2 = toScr(ey.x, ey.y); return Math.hypot(s2.x - p.x, s2.y - p.y) < Math.max(16, ey.r * k()); });
            gesture = hit >= 0 ? { type: 'eye', i: hit, start: p, moved: false } : { type: 'maybe', start: p, vx, vy, moved: false };
            if (hit >= 0) { active = hit; draw(); }
          });
          cv.addEventListener('pointermove', (e) => {
            if (!ptrs.has(e.pointerId) || !gesture) return;
            const p = local(e);
            ptrs.set(e.pointerId, p);
            if (gesture.type === 'pinch' && ptrs.size === 2) {
              const [a, b] = [...ptrs.values()];
              zoomAt(gesture.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / gesture.dist), (a.x + b.x) / 2, (a.y + b.y) / 2);
              return;
            }
            const dx = p.x - gesture.start.x, dy = p.y - gesture.start.y;
            if (Math.hypot(dx, dy) > 6) gesture.moved = true;
            if (gesture.type === 'eye') {
              const ip = toImg(p.x, p.y);
              eyes[gesture.i].x = ip.x; eyes[gesture.i].y = ip.y;
              draw();
            } else if (gesture.moved) {
              vx = gesture.vx - dx / k(); vy = gesture.vy - dy / k();
              clampView(); draw();
            }
          });
          const up = (e) => {
            if (!ptrs.has(e.pointerId)) return;
            const p = ptrs.get(e.pointerId);
            ptrs.delete(e.pointerId);
            if (!gesture) return;
            if (gesture.type === 'maybe' && !gesture.moved && ptrs.size === 0) {
              const ip = toImg(p.x, p.y);
              eyes[active] = { x: ip.x, y: ip.y, r: (eyes[active] && eyes[active].r) || defaultR() };
              if (!one && active === 0 && !eyes[1]) active = 1;
              draw();
            }
            if (ptrs.size === 0) { gesture = null; preview(); }
          };
          cv.addEventListener('pointerup', up);
          cv.addEventListener('pointercancel', up);
          cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = local(e); zoomAt(zoom * Math.pow(1.0015, -e.deltaY), p.x, p.y); }, { passive: false });
          cv.addEventListener('dblclick', (e) => { const p = local(e); zoomAt(zoom * 2, p.x, p.y); });

          sheet.addEventListener('click', (e) => {
            const z = e.target.closest('[data-z]');
            if (z) {
              if (z.dataset.z === 'fit') { zoom = 1; vx = vy = 0; draw(); return; }
              const e0 = eyes[active];
              const c = e0 ? toScr(e0.x, e0.y) : { x: css / 2, y: css / 2 };
              zoomAt(zoom * (z.dataset.z === 'in' ? 1.6 : 1 / 1.6), Math.max(0, Math.min(css, c.x)), Math.max(0, Math.min(css, c.y)));
              return;
            }
            const w = e.target.closest('[data-eye]');
            if (w) { active = +w.dataset.eye; draw(); return; }
            if (e.target.closest('[data-reset]')) { eyes = []; active = 0; draw(); preview(); return; }
            if (e.target.closest('[data-save]')) { result = currentFace(); close(); }
          });
          $('[data-size]', sheet).oninput = (e) => { if (eyes[active]) { eyes[active].r = +e.target.value; draw(); preview(); } };
          $('[data-one]', sheet).onchange = (e) => { one = e.target.checked; active = 0; draw(); preview(); };

          const im = new Image();
          im.onload = () => {
            img = im;
            css = Math.min($('.ez-stage', sheet).clientWidth || 360, 520);
            cv.style.width = cv.style.height = css + 'px';
            cv.width = cv.height = Math.round(css * dpr);
            // start zoomed on the face if we know where the eyes are
            if (eyes.length) {
              const cx = eyes.reduce((a, e) => a + e.x, 0) / eyes.length, cy = eyes.reduce((a, e) => a + e.y, 0) / eyes.length;
              zoom = 2.2; vx = cx - N0 / zoom / 2; vy = cy - N0 / zoom / 2; clampView();
            }
            draw(); preview();
          };
          im.src = tpl.cutout;
        },
      });
    });
  }

  /* ---------- editor ---------- */
  function editorStage(body, d, close, editing) {
    const sel = (name, opts, v) => `<select name="${name}">${opts.map(([k, l]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    const colourField = (k, label) => `<label class="swatch-field"><input type="color" name="c_${k}" value="${d.colors[k]}"><span>${label}</span></label>`;
    d.moodMap = d.moodMap || {};
    const mood = () => d._mood || 'happy';
    const selTpl = () => d.templates.find((t) => t.id === d._sel) || d.templates.find((t) => t.id === d.mainId) || d.templates[0];
    const one = (tpl) => ({ id: 'draft-' + d.id + '-' + tpl.id, species: d.species, templates: [{ id: tpl.id, cutout: tpl.cutout, face: tpl.face }], mainId: tpl.id, collarOn: d.collarOn !== false, colors: d.colors, ui: d.ui });
    const draftTheme = () => ({
      id: 'draft-' + d.id, name: d.name, species: d.species, builtin: false,
      templates: d.templates.map((t) => ({ id: t.id, cutout: t.cutout, face: t.face })), mainId: d.mainId, moodMap: d.moodMap,
      collarOn: d.collarOn !== false, colors: d.colors, ui: d.ui,
    });
    const eyeText = (t) => (t.face && t.face.eyes ? (t.face.eyes.length === 2 ? '👀 2 eyes' : '👁 1 eye') : '⚠️ no eyes');
    const tplCards = () => d.templates.map((t, i) => `
      <div class="tpl-card ${t.id === (selTpl() || {}).id ? 'sel' : ''}" data-t="${t.id}">
        <button type="button" class="tpl-pic" data-t-sel="${t.id}"><img alt="Photo ${i + 1}"></button>
        <div class="tpl-meta"><b>Photo ${i + 1}${t.id === d.mainId ? ' ⭐' : ''}</b><small>${eyeText(t)}${t.quality === 'ellipse' ? ' · rough' : ''}</small></div>
        <div class="tpl-actions">
          <button type="button" data-t-hl="${t.id}" title="Highlight & rescan" ${t.photo ? '' : 'disabled'}>✏️</button>
          <button type="button" data-t-eyes="${t.id}" title="Adjust eyes">👀</button>
          <button type="button" data-t-main="${t.id}" title="Use as main photo">⭐</button>
          <button type="button" data-t-del="${t.id}" title="Remove" ${d.templates.length > 1 ? '' : 'disabled'}>🗑</button>
        </div>
      </div>`).join('');
    const st = selTpl();
    body.innerHTML = `
      <div class="studio-edit">
        <h4 class="moods-title">Photos of ${esc(d.name)} <small>(${d.templates.length}/${MAX_PHOTOS})</small></h4>
        <div class="tpl-strip">${tplCards()}
          ${d.templates.length < MAX_PHOTOS ? '<label class="tpl-add"><input type="file" accept="image/*" multiple hidden data-add><span>＋</span>Add photos</label>' : ''}
        </div>
        <div class="detect-row">
          ${st && st.overlay ? `<figure><img src="${st.overlay}" alt="Detection"><figcaption>Detected: <b>${esc(st.detected || '')}</b><br><small>${esc(st.detector || '')}${st.segmenter ? ' · ' + esc(st.segmenter) : ''}</small></figcaption></figure>` : ''}
          <figure class="real-stage ${st && st.overlay ? '' : 'wide'}"><img class="big-real" alt="Realistic preview"><figcaption class="eye-hint"></figcaption></figure>
        </div>
        <div class="studio-tools">
          <button type="button" class="btn ghost" data-t-hl="${st ? st.id : ''}" ${st && st.photo ? '' : 'disabled'}>✏️ Highlight pet</button>
          <button type="button" class="btn ghost" data-t-eyes="${st ? st.id : ''}">👀 Adjust eyes</button>
          <label class="toggle"><input type="checkbox" data-collar ${d.collarOn !== false ? 'checked' : ''}> 🔔 Collar & bell</label>
        </div>
        <h4 class="moods-title">Moods</h4>
        <div class="moods studio-moods">${Object.keys(Avatar.STATES).map((m) => `<button type="button" class="mood ${m === mood() ? 'on' : ''}" data-m="${m}"><img alt=""><span>${Avatar.emojiFor(d, m)} ${Avatar.STATES[m].label}</span></button>`).join('')}</div>
        ${d.templates.length > 1 ? `<div class="mood-photo"><span>Photo for <b class="mp-label"></b>:</span><div class="mp-chips"></div></div>` : ''}
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
            ${editing ? '<button type="button" class="btn danger" data-del>Delete</button>' : '<button type="button" class="btn ghost" data-again>Start over</button>'}
            <button type="submit" class="btn primary">${editing ? 'Save' : 'Use this theme'}</button>
          </div>
        </form>
      </div>`;

    const f = $('form', body);
    const stage = $('.preview-stage', body);
    const big = $('.big-real', body);
    const rerender = () => editorStage(body, d, close, editing);
    let seq = 0;
    const paintReal = async () => {
      const my = ++seq;
      const t = draftTheme();
      await Avatar.prepare(t);
      await Promise.all(d.templates.map((tp) => Avatar.prepare(one(tp))));
      if (my !== seq) return;
      const url = Avatar.get(t, mood(), 'sticker');
      if (url) big.src = url;
      $$('.studio-moods [data-m]', body).forEach((b) => { const u = Avatar.get(t, b.dataset.m, 'portrait'); if (u) $('img', b).src = u; });
      d.templates.forEach((tp) => { const im = $(`[data-t-sel="${tp.id}"] img`, body); const u = Avatar.get(one(tp), 'normal', 'sticker'); if (im && u) im.src = u; });
      const plain = Avatar.get(t, 'normal', 'portrait-plain');
      $('.mini-av', body).innerHTML = plain ? `<img src="${plain}" alt="">` : '';
      const used = Avatar.templateFor(t, mood());
      const idx = d.templates.findIndex((x) => used && x.id === used.id);
      $('.eye-hint', body).innerHTML = `${Avatar.emojiFor(d, mood())} ${Avatar.STATES[mood()].label} · photo ${idx + 1} · ${used && used.face && used.face.eyes ? '✓ eyes found' : '⚠️ no eyes, tap “Adjust eyes”'}`;
      const mp = $('.mp-chips', body);
      if (mp) {
        $('.mp-label', body).textContent = `${Avatar.emojiFor(d, mood())} ${Avatar.STATES[mood()].label}`;
        const cur = d.moodMap[mood()] || '';
        mp.innerHTML = `<button type="button" class="chip-btn ${cur ? '' : 'on'}" data-mp="">Auto</button>` + d.templates.map((tp, i) => `<button type="button" class="chip-btn ${cur === tp.id ? 'on' : ''}" data-mp="${tp.id}"><img src="${Avatar.get(one(tp), 'normal', 'portrait-plain') || ''}" alt="">${i + 1}</button>`).join('');
      }
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
      if (e.target.name === 'primary') { d.ui = PetStudio.deriveUI(e.target.value); d.uiTouched = true; }
      if (e.target.name && e.target.name.startsWith('c_')) d.colorsTouched = true;
      if (e.target.name === 'species') f.ears.value = N.SPECIES_EARS[f.species.value] || 'pointy';
      paint();
    });
    $('[data-collar]', body).onchange = (e) => { d.collarOn = e.target.checked; paintReal(); };
    const addInput = $('[data-add]', body);
    if (addInput) addInput.onchange = async () => {
      const files = Array.from(addInput.files);
      if (!files.length) return;
      await addPhotos(body, d, files, false);
      rerender();
    };

    body.addEventListener('click', async (e) => {
      const q = (a) => e.target.closest(`[${a}]`);
      let b;
      if ((b = q('data-sw'))) { d.ui = PetStudio.deriveUI(b.dataset.sw); d.uiTouched = true; f.primary.value = d.ui.primary; paint(); return; }
      if ((b = q('data-m'))) { d._mood = b.dataset.m; $$('.studio-moods [data-m]', body).forEach((x) => x.classList.toggle('on', x === b)); paintReal(); return; }
      if ((b = q('data-mp'))) { if (b.dataset.mp) d.moodMap[mood()] = b.dataset.mp; else delete d.moodMap[mood()]; paintReal(); return; }
      if ((b = q('data-t-sel'))) { d._sel = b.dataset.tSel; rerender(); return; }
      if ((b = q('data-t-main'))) { d.mainId = b.dataset.tMain; toast('Main photo set — used for the icon & favicon', 'happy'); rerender(); return; }
      if ((b = q('data-t-del'))) {
        const id = b.dataset.tDel;
        if (d.templates.length < 2) return;
        d.templates = d.templates.filter((t) => t.id !== id);
        if (d.mainId === id) d.mainId = d.templates[0].id;
        Object.keys(d.moodMap).forEach((m) => { if (d.moodMap[m] === id) delete d.moodMap[m]; });
        refreshPalette(d);
        rerender();
        return;
      }
      if ((b = q('data-t-eyes'))) {
        const tpl = d.templates.find((t) => t.id === b.dataset.tEyes);
        if (!tpl) return;
        const face = await eyeEditor(d, tpl);
        if (face !== undefined) { tpl.face = face; d._sel = tpl.id; rerender(); }
        return;
      }
      if ((b = q('data-t-hl'))) {
        const tpl = d.templates.find((t) => t.id === b.dataset.tHl);
        if (!tpl || !tpl.photo) return;
        const region = await highlightTool(tpl.photo, tpl.region);
        if (region === undefined) return;
        const step = scanPanel(body, tpl.photo, 'Rescanning photo');
        try {
          const r = await PetStudio.analyze(tpl.photo, { onStep: step, region, known: d.templates.filter((t) => t !== tpl).map((t) => t.pal) });
          Object.assign(tpl, templateFromResult(r, tpl.id));
          refreshPalette(d);
        } catch (err) {
          toast('Rescan failed: ' + (err.message || err), 'worried');
        }
        d._sel = tpl.id;
        rerender();
      }
    });
    const again = $('[data-again]', body);
    if (again) again.onclick = () => introStage(body, close);
    const del = $('[data-del]', body);
    if (del) del.onclick = () => confirmSheet(`Delete ${d.name}?`, 'The theme and its photos will be removed.', 'Delete', () => {
      S.remove('themes', d.id);
      if (S.state.settings.theme === d.id) S.state.settings.theme = 'mit';
      S.save(); close(); render(); toast('Back to Mit 🐾', 'love');
    }, true);
    f.onsubmit = async (e) => {
      e.preventDefault();
      paint();
      const saved = {
        id: d.id, name: d.name, species: d.species, ears: d.ears, pattern: d.pattern,
        colors: d.colors, ui: d.ui, collarOn: d.collarOn !== false, swatches: d.swatches,
        templates: d.templates.map((t) => ({ id: t.id, cutout: t.cutout, face: t.face || null, photo: t.photo || null, pal: t.pal || null, region: t.region || null, detected: t.detected || '', quality: t.quality || '' })),
        mainId: d.mainId, moodMap: d.moodMap, colorsTouched: !!d.colorsTouched, uiTouched: !!d.uiTouched,
        createdAt: d.createdAt || Date.now(),
      };
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
