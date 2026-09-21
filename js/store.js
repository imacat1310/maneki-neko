/* Data layer: persisted in localStorage. */
(function (root) {
  'use strict';

  const KEY = 'maneki-neko-v1';

  // [id, name, icon, type, colour]; type: expense | income | debt_in | debt_out | xfer_in | xfer_out
  const DEFAULT_CATEGORIES = [
    ['food', 'Food & Beverage', '🍜', 'expense', '#F39C12'],
    ['cafe', 'Café', '☕', 'expense', '#A1673F'],
    ['transport', 'Transportation', '🚕', 'expense', '#3498DB'],
    ['rent', 'Rentals', '🏠', 'expense', '#8E44AD'],
    ['bills', 'Bills & Utilities', '💡', 'expense', '#E6B800'],
    ['phone', 'Phone & Internet', '📱', 'expense', '#16A085'],
    ['shopping', 'Shopping', '🛍️', 'expense', '#E91E63'],
    ['pet', 'Pets', '🐾', 'expense', '#FF8A65'],
    ['health', 'Health & Fitness', '💊', 'expense', '#2ECC71'],
    ['edu', 'Education', '📚', 'expense', '#5C6BC0'],
    ['ent', 'Entertainment', '🎬', 'expense', '#9C27B0'],
    ['gifts', 'Gifts & Donations', '🎁', 'expense', '#E74C3C'],
    ['travel', 'Travel', '✈️', 'expense', '#00ACC1'],
    ['family', 'Family', '👨‍👩‍👧', 'expense', '#FF7043'],
    ['insurance', 'Insurances', '🛡️', 'expense', '#607D8B'],
    ['invest', 'Investment', '📈', 'expense', '#43A047'],
    ['other_exp', 'Other Expense', '📦', 'expense', '#95A5A6'],
    ['salary', 'Salary', '💼', 'income', '#27AE60'],
    ['bonus', 'Bonus', '🧧', 'income', '#E53935'],
    ['interest', 'Collect Interest', '🏦', 'income', '#00897B'],
    ['selling', 'Selling', '🏷️', 'income', '#FB8C00'],
    ['award', 'Award', '🏆', 'income', '#F9A825'],
    ['gift_in', 'Gifts Received', '🎀', 'income', '#EC407A'],
    ['other_inc', 'Other Income', '💰', 'income', '#7CB342'],
    ['debt', 'Debt (borrowed)', '🤝', 'debt_in', '#6D4C41'],
    ['debt_collect', 'Debt Collection', '📥', 'debt_in', '#26A69A'],
    ['loan', 'Loan (lent)', '💸', 'debt_out', '#8D6E63'],
    ['repay', 'Repayment', '📤', 'debt_out', '#78909C'],
    ['xfer_in', 'Transfer In', '🔁', 'xfer_in', '#90A4AE'],
    ['xfer_out', 'Transfer Out', '🔁', 'xfer_out', '#90A4AE'],
  ];

  const CURRENCIES = {
    VND: { locale: 'vi-VN', digits: 0, factor: 25000 },
    USD: { locale: 'en-US', digits: 2, factor: 1 },
    EUR: { locale: 'de-DE', digits: 2, factor: 0.92 },
    JPY: { locale: 'ja-JP', digits: 0, factor: 150 },
    GBP: { locale: 'en-GB', digits: 2, factor: 0.78 },
    AUD: { locale: 'en-AU', digits: 2, factor: 1.5 },
    SGD: { locale: 'en-SG', digits: 2, factor: 1.3 },
    KRW: { locale: 'ko-KR', digits: 0, factor: 1350 },
    THB: { locale: 'th-TH', digits: 2, factor: 35 },
  };

  const IN_TYPES = ['income', 'debt_in', 'xfer_in'];

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function blank() {
    return {
      version: 1,
      settings: { currency: 'VND', wallet: 'all', theme: 'mit', mascotStyle: 'drawing', userName: '', onboarded: false },
      wallets: [
        { id: 'cash', name: 'Cash', icon: '👛', initial: 0 },
        { id: 'bank', name: 'Bank Account', icon: '🏦', initial: 0 },
      ],
      categories: DEFAULT_CATEGORIES.map(([id, name, icon, type, color]) => ({ id, name, icon, type, color, builtin: true })),
      transactions: [],
      budgets: [],
      themes: [],
    };
  }

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const b = blank();
        s.settings = Object.assign(b.settings, s.settings);
        // make sure newer built-in categories exist
        for (const c of b.categories) if (!s.categories.find((x) => x.id === c.id)) s.categories.push(c);
        s.themes = s.themes || [];
        s.budgets = s.budgets || [];
        return s;
      }
    } catch (e) {
      console.warn('Could not load saved data', e);
    }
    return blank();
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error(e);
      root.dispatchEvent && root.dispatchEvent(new CustomEvent('store-error', { detail: 'Storage is full — try removing a pet theme or exporting your data.' }));
      return false;
    }
  }

  /* ---------- dates ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function today() { return ymd(new Date()); }
  function parse(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function monthPeriod(offset) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
    return { start: ymd(start), end: ymd(end), offset, date: start };
  }
  function futurePeriod() {
    const p = monthPeriod(1);
    return { start: p.start, end: '9999-12-31', offset: 'future' };
  }
  function period(offset) { return offset === 'future' ? futurePeriod() : monthPeriod(offset); }

  /* ---------- money ---------- */
  function cur() { return CURRENCIES[state.settings.currency] || CURRENCIES.VND; }
  function fmt(n, opts) {
    const c = cur();
    opts = opts || {};
    try {
      return new Intl.NumberFormat(c.locale, {
        style: 'currency', currency: state.settings.currency,
        minimumFractionDigits: opts.noCents ? 0 : c.digits, maximumFractionDigits: opts.noCents ? 0 : c.digits,
        signDisplay: opts.sign ? 'exceptZero' : 'auto',
      }).format(n);
    } catch (e) {
      return (opts.sign && n > 0 ? '+' : '') + n.toFixed(c.digits) + ' ' + state.settings.currency;
    }
  }
  function short(n) {
    const a = Math.abs(n), s = n < 0 ? '-' : '';
    if (a >= 1e9) return s + +(a / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return s + +(a / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return s + +(a / 1e3).toFixed(1) + 'K';
    return s + Math.round(a);
  }

  /* ---------- queries ---------- */
  function cat(id) {
    return state.categories.find((c) => c.id === id) || { id, name: 'Unknown', icon: '❔', type: 'expense', color: '#999' };
  }
  function wallet(id) { return state.wallets.find((w) => w.id === id); }
  function isIn(t) { return IN_TYPES.includes(cat(t.cat).type); }
  function signed(t) { return isIn(t) ? t.amount : -t.amount; }
  function isTransfer(t) { const ty = cat(t.cat).type; return ty === 'xfer_in' || ty === 'xfer_out'; }

  function txs(filter) {
    filter = filter || {};
    const w = filter.wallet || state.settings.wallet;
    return state.transactions.filter((t) => {
      if (w !== 'all' && t.wallet !== w) return false;
      if (filter.start && t.date < filter.start) return false;
      if (filter.end && t.date > filter.end) return false;
      if (w === 'all' && filter.skipTransfers !== false && isTransfer(t)) return false;
      if (filter.q) {
        const q = filter.q.toLowerCase();
        const c = cat(t.cat);
        if (!((t.note || '').toLowerCase().includes(q) || c.name.toLowerCase().includes(q) || (t.with || '').toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }

  function balance(walletId, until) {
    const ids = walletId === 'all' ? state.wallets.map((w) => w.id) : [walletId];
    let total = 0;
    for (const id of ids) {
      const w = wallet(id);
      if (w) total += Number(w.initial) || 0;
    }
    for (const t of state.transactions) {
      if (!ids.includes(t.wallet)) continue;
      if (until && t.date > until) continue;
      total += signed(t);
    }
    return total;
  }

  function summary(list) {
    let inflow = 0, outflow = 0;
    for (const t of list) {
      if (isIn(t)) inflow += t.amount; else outflow += t.amount;
    }
    return { inflow, outflow, net: inflow - outflow };
  }

  function byCategory(list, types) {
    const map = {};
    for (const t of list) {
      const c = cat(t.cat);
      if (!types.includes(c.type)) continue;
      map[c.id] = (map[c.id] || 0) + t.amount;
    }
    return Object.entries(map).map(([id, total]) => ({ cat: cat(id), total })).sort((a, b) => b.total - a.total);
  }

  function budgetStatus(b, offset) {
    const p = monthPeriod(offset || 0);
    const list = txs({ start: p.start, end: p.end, wallet: b.wallet || 'all' });
    const spent = list.filter((t) => (b.cat === 'all' ? cat(t.cat).type === 'expense' : t.cat === b.cat)).reduce((s, t) => s + t.amount, 0);
    return { spent, left: b.amount - spent, ratio: b.amount ? spent / b.amount : 0 };
  }

  /* ---------- mutations ---------- */
  function upsert(list, item) {
    const i = state[list].findIndex((x) => x.id === item.id);
    if (i >= 0) state[list][i] = item; else state[list].push(item);
    save();
    return item;
  }
  function remove(list, id) {
    state[list] = state[list].filter((x) => x.id !== id);
    save();
  }

  function addTransfer(from, to, amount, date, note) {
    const link = uid();
    state.transactions.push({ id: uid(), wallet: from, cat: 'xfer_out', amount, date, note: note || 'To ' + (wallet(to) || {}).name, link });
    state.transactions.push({ id: uid(), wallet: to, cat: 'xfer_in', amount, date, note: note || 'From ' + (wallet(from) || {}).name, link });
    save();
  }
  function removeTx(id) {
    const t = state.transactions.find((x) => x.id === id);
    state.transactions = state.transactions.filter((x) => x.id !== id && !(t && t.link && x.link === t.link));
    save();
  }

  /* ---------- sample data ---------- */
  function seed() {
    const f = cur().factor;
    const round = (usd) => {
      const v = usd * f;
      const step = v >= 100000 ? 1000 : v >= 1000 ? 100 : cur().digits ? 0.01 : 1;
      return Math.round(v / step) * step;
    };
    const rnd = (a, b) => a + Math.random() * (b - a);
    const T = [];
    const add = (d, catId, usd, note, walletId) => T.push({ id: uid(), wallet: walletId || 'cash', cat: catId, amount: round(usd), date: ymd(d), note: note || '' });
    const now = new Date();
    state.wallets.find((w) => w.id === 'cash').initial = round(120);
    state.wallets.find((w) => w.id === 'bank').initial = round(1500);
    for (let m = -3; m <= 0; m++) {
      const base = new Date(now.getFullYear(), now.getMonth() + m, 1);
      const days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
      const lastDay = m === 0 ? now.getDate() : days;
      const day = (n) => new Date(base.getFullYear(), base.getMonth(), n);
      if (lastDay >= 1) add(day(1), 'rent', 420, 'Apartment rent', 'bank');
      if (lastDay >= 5) add(day(5), 'salary', 1600, 'Monthly salary', 'bank');
      if (lastDay >= 6) {
        const link = uid();
        T.push({ id: uid(), wallet: 'bank', cat: 'xfer_out', amount: round(240), date: ymd(day(6)), note: 'ATM withdrawal', link });
        T.push({ id: uid(), wallet: 'cash', cat: 'xfer_in', amount: round(240), date: ymd(day(6)), note: 'ATM withdrawal', link });
      }
      if (lastDay >= 8) add(day(8), 'bills', rnd(38, 60), 'Electricity & water', 'bank');
      if (lastDay >= 10) add(day(10), 'phone', 12, 'Mobile plan', 'bank');
      if (lastDay >= 12) add(day(12), 'pet', rnd(25, 40), "Mit's premium kibble 🐟");
      if (lastDay >= 20 && m % 2 === 0) add(day(20), 'pet', rnd(8, 15), 'Toys & catnip for Mit');
      if (lastDay >= 15 && m === -1) add(day(15), 'bonus', 250, 'Mid-Autumn bonus 🥮', 'bank');
      if (lastDay >= 18 && m === -2) add(day(18), 'gifts', 45, 'Mooncakes for family');
      if (lastDay >= 25) add(day(25), 'invest', 100, 'Monthly savings', 'bank');
      for (let d = 1; d <= lastDay; d++) {
        if (Math.random() < 0.75) add(day(d), 'food', rnd(2, 9), ['Phở bò', 'Bánh mì', 'Cơm tấm', 'Bún chả', 'Groceries', 'Sushi'][Math.floor(rnd(0, 6))]);
        if (Math.random() < 0.35) add(day(d), 'cafe', rnd(1.5, 4), ['Cà phê sữa đá', 'Matcha latte', 'Bạc xỉu'][Math.floor(rnd(0, 3))]);
        if (Math.random() < 0.3) add(day(d), 'transport', rnd(1, 6), 'Grab ride');
        if (Math.random() < 0.08) add(day(d), 'shopping', rnd(15, 60), 'Shopping', 'bank');
        if (Math.random() < 0.06) add(day(d), 'ent', rnd(6, 20), 'Movie night', 'bank');
      }
    }
    state.transactions = state.transactions.concat(T);
    if (!state.budgets.length) {
      state.budgets.push({ id: uid(), cat: 'all', amount: round(900), wallet: 'all' });
      state.budgets.push({ id: uid(), cat: 'food', amount: round(170), wallet: 'all' });
      state.budgets.push({ id: uid(), cat: 'cafe', amount: round(40), wallet: 'all' });
      state.budgets.push({ id: uid(), cat: 'pet', amount: round(60), wallet: 'all' });
    }
    save();
  }

  function reset() {
    const themes = state.themes;
    state = blank();
    state.themes = themes;
    save();
  }

  function replace(data) {
    const b = blank();
    if (!data || !Array.isArray(data.transactions) || !Array.isArray(data.wallets)) throw new Error('Not a Maneki-Neko backup file');
    state = Object.assign(b, data, { settings: Object.assign(b.settings, data.settings || {}) });
    save();
  }

  function toCSV() {
    const rows = [['Date', 'Wallet', 'Category', 'Type', 'Amount', 'Note', 'With']];
    for (const t of state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date))) {
      const c = cat(t.cat);
      rows.push([t.date, (wallet(t.wallet) || {}).name || t.wallet, c.name, c.type, signed(t), t.note || '', t.with || '']);
    }
    return rows.map((r) => r.map((v) => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  }

  root.Store = {
    get state() { return state; },
    CURRENCIES, uid, save, today, ymd, parse, pad, monthPeriod, period,
    fmt, short, cat, wallet, isIn, signed, isTransfer, txs, balance, summary, byCategory, budgetStatus,
    upsert, remove, addTransfer, removeTx, seed, reset, replace, toCSV,
  };
})(window);
