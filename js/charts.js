/* Tiny SVG charts: donut, grouped bars, semicircle gauge. */
(function (root) {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function arc(cx, cy, r, a0, a1) {
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
  }

  // items: [{value, color, label}]
  function donut(items, opts) {
    opts = opts || {};
    const total = items.reduce((s, i) => s + i.value, 0);
    const size = 200, cx = 100, cy = 100, r = 74, w = 26;
    let parts = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--line)" stroke-width="${w}"/>`;
    if (total > 0) {
      let a = -Math.PI / 2;
      const gap = items.length > 1 ? 0.015 : 0;
      items.forEach((it) => {
        const span = (it.value / total) * Math.PI * 2;
        if (span <= 0) return;
        if (span >= Math.PI * 2 - 0.0001) {
          parts += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${it.color}" stroke-width="${w}"><title>${esc(it.label)}</title></circle>`;
        } else {
          parts += `<path d="${arc(cx, cy, r, a + gap, a + span - gap)}" fill="none" stroke="${it.color}" stroke-width="${w}"><title>${esc(it.label)}</title></path>`;
        }
        a += span;
      });
    }
    const center = opts.center || '';
    const sub = opts.sub || '';
    return `<svg viewBox="0 0 ${size} ${size}" class="chart donut" role="img" aria-label="${esc(opts.label || 'Donut chart')}">
      ${parts}
      ${opts.image ? `<image href="${opts.image}" x="${cx - 38}" y="${cy - 46}" width="76" height="76"/>` : ''}
      <text x="${cx}" y="${opts.image ? cy + 44 : cy + 2}" text-anchor="middle" class="donut-center">${esc(center)}</text>
      ${sub ? `<text x="${cx}" y="${cy + 20}" text-anchor="middle" class="donut-sub">${esc(sub)}</text>` : ''}
    </svg>`;
  }

  // groups: [{label, values:[{value,color,title}]}]
  function bars(groups, opts) {
    opts = opts || {};
    const W = 340, H = 180, padL = 40, padB = 24, padT = 12;
    const max = Math.max(1, ...groups.flatMap((g) => g.values.map((v) => Math.abs(v.value))));
    const nice = niceMax(max);
    const plotW = W - padL - 8, plotH = H - padB - padT;
    const gw = plotW / Math.max(1, groups.length);
    const per = groups[0] ? groups[0].values.length : 1;
    const bw = Math.min(22, (gw * 0.7) / per);
    let out = '';
    for (let i = 0; i <= 4; i++) {
      const y = padT + plotH - (plotH * i) / 4;
      out += `<line x1="${padL}" x2="${W - 8}" y1="${y}" y2="${y}" class="grid"/>`;
      out += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" class="axis">${opts.short ? opts.short((nice * i) / 4) : (nice * i) / 4}</text>`;
    }
    groups.forEach((g, gi) => {
      const gx = padL + gi * gw + (gw - bw * per) / 2;
      g.values.forEach((v, vi) => {
        const h = (Math.abs(v.value) / nice) * plotH;
        const x = gx + vi * bw, y = padT + plotH - h;
        if (h > 0) out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${v.color}"><title>${esc(v.title || '')}</title></rect>`;
      });
      out += `<text x="${(padL + gi * gw + gw / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="axis">${esc(g.label)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="chart bars" role="img" aria-label="${esc(opts.label || 'Bar chart')}">${out}</svg>`;
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    const m = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
    return m * p;
  }

  // Semicircle gauge (MoneyLover-style budget arc)
  function gauge(ratio, opts) {
    opts = opts || {};
    const cx = 120, cy = 118, r = 96, w = 16;
    const clamped = Math.max(0, Math.min(1, ratio));
    const color = ratio > 1 ? 'var(--expense)' : ratio > 0.85 ? '#F39C12' : 'var(--primary)';
    const a0 = Math.PI, a1 = Math.PI + Math.PI * clamped;
    return `<svg viewBox="0 0 240 132" class="chart gauge" role="img" aria-label="Budget used ${Math.round(ratio * 100)}%">
      <path d="${arc(cx, cy, r, Math.PI, 2 * Math.PI - 0.0001)}" stroke="var(--line)" stroke-width="${w}" fill="none" stroke-linecap="round"/>
      ${clamped > 0 ? `<path d="${arc(cx, cy, r, a0, Math.max(a0 + 0.02, a1))}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>` : ''}
    </svg>`;
  }

  root.Charts = { donut, bars, gauge, esc };
})(window);
