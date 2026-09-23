/*
 * Realistic avatars: the pet's real photo cut-out, dressed as a maneki-neko
 * (red collar + gold bell, koban coin) with emoji moods.
 *
 * Moods change the real face: closed eyes (sleepy), smiling squint (happy),
 * wink, wide eyes (surprised), heart / gold catch-lights (love / rich),
 * worried brows. Plus colour grading, floating emoji and an emoji badge.
 *
 * Kinds:  portrait (round avatar + badge) · sticker (full body, outlined)
 *         icon (512 app icon) · favicon
 */
(function (root) {
  'use strict';

  const S = 400; // cut-out canvas size (matches PetStudio CUT)
  const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

  const STATES = {
    normal: { label: 'Calm', cat: '😺', any: '🐾', bg: null },
    happy: { label: 'Happy', cat: '😸', any: '😄', bg: ['#FFF3CC', '#FFB547'] },
    rich: { label: 'Lucky', cat: '🤑', any: '🤑', bg: ['#FFF7C2', '#E6A817'] },
    love: { label: 'Love', cat: '😻', any: '🥰', bg: ['#FFE6EE', '#F58BA8'] },
    wink: { label: 'Wink', cat: '😼', any: '😉', bg: ['#FFF0DA', '#F7A74B'] },
    surprised: { label: 'Surprised', cat: '🙀', any: '😲', bg: ['#FFFBE0', '#FFD23F'] },
    worried: { label: 'Worried', cat: '😿', any: '😟', bg: ['#E8F1FA', '#86AAD3'] },
    sleepy: { label: 'Sleepy', cat: '😴', any: '😴', bg: ['#46558A', '#141B38'] },
    party: { label: 'Party', cat: '🥳', any: '🥳', bg: ['#F3E8FF', '#B58BF5'] },
  };

  function emojiFor(theme, state) {
    const st = STATES[state] || STATES.normal;
    return (theme.species || 'cat') === 'cat' ? st.cat : st.any;
  }

  /* ---------- small helpers ---------- */
  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h || w;
    return c;
  }
  function loadImg(src) {
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Could not load avatar image'));
      i.src = src;
    });
  }
  // A cut-out is either a dataURL, or {rgb, alpha} (JPEG pair, used where WebP can't be encoded).
  async function loadCutout(src) {
    if (!src) throw new Error('no cut-out');
    if (typeof src === 'string') return loadImg(src);
    const [rgb, alpha] = await Promise.all([loadImg(src.rgb), loadImg(src.alpha)]);
    const c = canvas(S);
    const x = c.getContext('2d');
    x.drawImage(rgb, 0, 0, S, S);
    const m = canvas(S);
    const mc = m.getContext('2d');
    mc.drawImage(alpha, 0, 0, S, S);
    const md = mc.getImageData(0, 0, S, S).data;
    const id = x.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i++) {
      const a = md[i * 4];
      id.data[i * 4 + 3] = a < 40 ? 0 : a > 215 ? 255 : a;
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  function cutKey(c) {
    if (!c) return '0';
    return typeof c === 'string' ? c.length + ':' + c.slice(-24) : 'p' + c.rgb.length + ':' + c.alpha.length;
  }

  function rgba(hex, a) {
    const [r, g, b] = root.Neko.util.hexToRgb(hex);
    return `rgba(${r},${g},${b},${a})`;
  }
  function emoji(ctx, ch, x, y, size, rot) {
    ctx.save();
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.font = `${Math.round(size)}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,.22)';
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetY = size * 0.05;
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
  function dilate(src, r, colour, size) {
    const d = canvas(size || S);
    const ctx = d.getContext('2d');
    const steps = 28;
    for (let a = 0; a < steps; a++) ctx.drawImage(src, Math.cos((a / steps) * Math.PI * 2) * r, Math.sin((a / steps) * Math.PI * 2) * r);
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, d.width, d.height);
    return d;
  }

  /* ---------- face geometry ---------- */
  function analyseBase(data) {
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (data[(y * S + x) * 4 + 3] > 128) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return { x0: 0, y0: 0, x1: S, y1: S };
    return { x0, y0, x1, y1 };
  }
  function rowSpan(data, y) {
    y = Math.max(0, Math.min(S - 1, Math.round(y)));
    let l = -1, r = -1;
    for (let x = 0; x < S; x++) if (data[(y * S + x) * 4 + 3] > 128) { if (l < 0) l = x; r = x; }
    return l < 0 ? null : { l, r, w: r - l, c: (l + r) / 2 };
  }
  function sampleColour(data, cx, cy, rad) {
    let r = 0, g = 0, b = 0, n = 0;
    const R = Math.max(2, Math.round(rad));
    for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
      if (x * x + y * y > R * R) continue;
      const px = Math.round(cx + x), py = Math.round(cy + y);
      if (px < 0 || py < 0 || px >= S || py >= S) continue;
      const i = (py * S + px) * 4;
      if (data[i + 3] < 200) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    return n ? root.Neko.util.rgbToHex(r / n, g / n, b / n) : null;
  }

  function centroid(data) {
    let sx = 0, sy = 0, n = 0;
    for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) if (data[(y * S + x) * 4 + 3] > 128) { sx += x; sy += y; n++; }
    return n ? { x: sx / n, y: sy / n } : { x: S / 2, y: S / 2 };
  }

  // Face frame: eye centre, eye distance d, head angle, u = along the eyes, v = towards the chin.
  function computeFace(data, given) {
    const bb = analyseBase(data);
    const h = bb.y1 - bb.y0;
    const eyes = given && given.eyes && given.eyes.length ? given.eyes.map((e) => Object.assign({}, e)) : null;
    const mass = centroid(data);
    let cx, cy, d, ang = 0;
    if (eyes && eyes.length >= 2) {
      const [a, b] = eyes;
      d = Math.hypot(b.x - a.x, b.y - a.y);
      ang = Math.atan2(b.y - a.y, b.x - a.x);
      cx = (a.x + b.x) / 2; cy = (a.y + b.y) / 2;
      // the chin is on the side where the body is
      const vx = -Math.sin(ang), vy = Math.cos(ang);
      if ((mass.x - cx) * vx + (mass.y - cy) * vy < -d * 0.1) { ang += Math.PI; eyes.reverse(); }
    } else if (eyes && eyes.length === 1) {
      const e = eyes[0];
      d = Math.max(e.r * 4.2, 14);
      const dir = mass.x >= e.x ? 1 : -1; // the hidden eye is towards the middle of the head
      cx = e.x + dir * d * 0.5; cy = e.y;
    } else {
      const span = rowSpan(data, bb.y0 + h * 0.3) || { w: bb.x1 - bb.x0, c: (bb.x0 + bb.x1) / 2 };
      d = span.w * 0.36;
      cx = span.c;
      cy = bb.y0 + Math.min(span.w * 0.55, h * 0.4);
    }
    const u = { x: Math.cos(ang), y: Math.sin(ang) }, v = { x: -Math.sin(ang), y: Math.cos(ang) };
    const at = (along, down) => ({ x: cx + u.x * along + v.x * down, y: cy + u.y * along + v.y * down });
    const neck = at(0, d * 1.2);
    const top = at(0, -d * 1.1);
    let crop;
    if (eyes) {
      const c = d * 4.4, cc = at(0, d * 0.3);
      crop = { x: cc.x - c / 2, y: cc.y - c / 2, s: c };
    } else {
      const bottom = Math.min(cy + d * 1.9, bb.y0 + h * 0.95);
      const c = Math.max(bottom - bb.y0 + d * 0.2, d * 3.1) * 1.3;
      crop = { x: cx - c / 2, y: (bb.y0 + bottom) / 2 - c / 2 + d * 0.1, s: c };
    }
    const up = at(0, -d * 0.55);
    const fur = sampleColour(data, up.x, up.y, d * 0.18) || sampleColour(data, cx, cy, d * 0.15) || '#999999';
    return { eyes, d, cx, cy, ang, u, v, at, neck, top, crop, bb, fur };
  }

  /* ---------- face edits ---------- */
  function lidFill(ctx, x, y, fur, rad) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(fur, 1));
    g.addColorStop(0.72, rgba(fur, 1));
    g.addColorStop(1, rgba(fur, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Run fn in the eye's local frame (x along the eye line, y towards the chin).
  function local(ctx, e, ang, fn) {
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(ang);
    fn();
    ctx.restore();
  }
  function lash(ctx, r, up) {
    ctx.strokeStyle = 'rgba(28,22,20,.88)';
    ctx.lineWidth = Math.max(1.6, r * 0.2);
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (up) { ctx.moveTo(-r * 1.05, r * 0.25); ctx.quadraticCurveTo(0, -r * 0.75, r * 1.05, r * 0.25); }
    else { ctx.moveTo(-r * 1.05, -r * 0.05); ctx.quadraticCurveTo(0, r * 0.6, r * 1.05, -r * 0.05); }
    ctx.stroke();
  }
  // Clone-stamp real fur from nearby (src centre → drawn at the eye), soft edges.
  function clonePatch(ctx, src, e, from, R) {
    const D = Math.ceil(R * 2);
    const t = canvas(D);
    const tc = t.getContext('2d');
    tc.drawImage(src, from.x - R, from.y - R, D, D, 0, 0, D, D);
    const g = tc.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.62, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    tc.globalCompositeOperation = 'destination-in';
    tc.fillStyle = g;
    tc.fillRect(0, 0, D, D);
    ctx.drawImage(t, e.x - R, e.y - R);
  }
  function closeEye(ctx, en, e) {
    const f = en.face, r = e.r;
    const above = { x: e.x - f.v.x * r * 2.15, y: e.y - f.v.y * r * 2.15 };
    const fur = sampleColour(en.data, e.x - f.v.x * r * 1.9, e.y - f.v.y * r * 1.9, r * 0.45) || f.fur;
    lidFill(ctx, e.x, e.y, fur, r * 1.3);
    clonePatch(ctx, en.base, e, above, r * 1.3);
    local(ctx, e, f.ang, () => {
      const g = ctx.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.14)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(0, r * 0.1, r * 1.05, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      lash(ctx, r, false);
    });
  }
  function squint(ctx, en, e) {
    const f = en.face, r = e.r;
    const below = { x: e.x + f.v.x * r * 2.1, y: e.y + f.v.y * r * 2.1 };
    const fur = sampleColour(en.data, e.x + f.v.x * r * 1.9, e.y + f.v.y * r * 1.9, r * 0.45) || f.fur;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(f.ang);
    ctx.beginPath();
    ctx.moveTo(-r * 1.6, r * 0.3);
    ctx.quadraticCurveTo(0, -r * 0.75, r * 1.6, r * 0.3);
    ctx.lineTo(r * 1.6, r * 1.8);
    ctx.lineTo(-r * 1.6, r * 1.8);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // keep the clip, draw in image space
    lidFill(ctx, e.x + f.v.x * r * 0.25, e.y + f.v.y * r * 0.25, fur, r * 1.35);
    clonePatch(ctx, en.base, e, below, r * 1.4);
    ctx.restore();
    local(ctx, e, f.ang, () => lash(ctx, r, true));
  }
  function magnify(ctx, src, e, k) {
    const R = e.r * 1.35, D = Math.ceil(R * 2 * k);
    const t = canvas(D);
    const tc = t.getContext('2d');
    tc.drawImage(src, e.x - R, e.y - R, R * 2, R * 2, 0, 0, D, D);
    const g = tc.createRadialGradient(D / 2, D / 2, 0, D / 2, D / 2, D / 2);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.72, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    tc.globalCompositeOperation = 'destination-in';
    tc.fillStyle = g;
    tc.fillRect(0, 0, D, D);
    ctx.drawImage(t, e.x - D / 2, e.y - D / 2);
  }
  function catchlight(ctx, e) {
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    ctx.beginPath(); ctx.arc(e.x - e.r * 0.32, e.y - e.r * 0.36, Math.max(1.2, e.r * 0.17), 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.beginPath(); ctx.arc(e.x + e.r * 0.3, e.y + e.r * 0.28, Math.max(0.8, e.r * 0.08), 0, Math.PI * 2); ctx.fill();
  }
  function heart(ctx, x, y, s, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 20, s / 20);
    ctx.beginPath();
    ctx.moveTo(0, 6);
    ctx.bezierCurveTo(-12, -2, -8, -12, 0, -6);
    ctx.bezierCurveTo(8, -12, 12, -2, 0, 6);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.stroke();
    ctx.restore();
  }
  function star(ctx, x, y, s, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? s * 0.28 : s;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.shadowColor = 'rgba(255,200,40,.9)';
    ctx.shadowBlur = s;
    ctx.fill();
    ctx.restore();
  }
  function brows(ctx, eyes, ang) {
    ctx.save();
    ctx.strokeStyle = 'rgba(35,26,22,.7)';
    ctx.lineCap = 'round';
    eyes.forEach((e, i) => {
      const dir = eyes.length === 1 ? 1 : i === 0 ? 1 : -1; // inner end points to the middle and goes up
      local(ctx, e, ang, () => {
        ctx.lineWidth = Math.max(2, e.r * 0.26);
        ctx.beginPath();
        ctx.moveTo(-dir * e.r * 0.9, -e.r * 1.35);
        ctx.quadraticCurveTo(0, -e.r * 1.55, dir * e.r * 0.85, -e.r * 2.0);
        ctx.stroke();
      });
    });
    ctx.restore();
  }

  /* ---------- maneki accessories ---------- */
  /* ---------- maneki accessories ---------- */
  function collar(ctx, f, colour) {
    const d = f.d, hw = d * 2.4, sag = d * 0.38, t = d * 0.2;
    const band = () => {
      ctx.beginPath();
      ctx.moveTo(-hw, -sag);
      ctx.quadraticCurveTo(0, sag, hw, -sag);
      ctx.lineTo(hw, -sag + t);
      ctx.quadraticCurveTo(0, sag + t, -hw, -sag + t);
      ctx.closePath();
    };
    const sh = root.Neko.util.shade;
    ctx.save();
    ctx.translate(f.neck.x, f.neck.y);
    ctx.rotate(f.ang);
    ctx.globalCompositeOperation = 'source-atop'; // only on the pet
    ctx.save(); ctx.translate(0, d * 0.07); band(); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill(); ctx.restore();
    const g = ctx.createLinearGradient(0, -t, 0, t * 2);
    g.addColorStop(0, sh(colour, 0.25)); g.addColorStop(0.5, colour); g.addColorStop(1, sh(colour, -0.35));
    band(); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = Math.max(1, d * 0.03);
    ctx.strokeStyle = sh(colour, -0.45);
    ctx.stroke();
    ctx.setLineDash([d * 0.08, d * 0.07]);
    ctx.strokeStyle = 'rgba(255,255,255,.45)';
    ctx.beginPath();
    ctx.moveTo(-hw, -sag + t * 0.3);
    ctx.quadraticCurveTo(0, sag + t * 0.3, hw, -sag + t * 0.3);
    ctx.stroke();
    ctx.restore();
    const b = f.at(0, d * 1.2 + t + d * 0.12);
    bell(ctx, b.x, b.y, d * 0.2);
  }
  function bell(ctx, x, y, r) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = r * 0.5;
    ctx.shadowOffsetY = r * 0.2;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#FFF4C0');
    g.addColorStop(0.45, '#F4C24D');
    g.addColorStop(1, '#A87412');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#7A520B';
    ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath(); ctx.moveTo(x - r * 0.92, y - r * 0.05); ctx.lineTo(x + r * 0.92, y - r * 0.05); ctx.stroke();
    ctx.fillStyle = '#5A3C08';
    ctx.beginPath(); ctx.arc(x, y + r * 0.42, r * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y + r * 0.42); ctx.lineTo(x, y + r * 0.95); ctx.lineWidth = r * 0.1; ctx.stroke();
  }
  function koban(ctx, x, y, h, rot) {
    const rx = h * 0.36, ry = h * 0.5;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot || 0);
    ctx.shadowColor = 'rgba(0,0,0,.3)';
    ctx.shadowBlur = h * 0.08;
    ctx.shadowOffsetY = h * 0.04;
    const g = ctx.createLinearGradient(-rx, -ry, rx, ry);
    g.addColorStop(0, '#FFF1B5'); g.addColorStop(0.45, '#F4C24D'); g.addColorStop(1, '#B07C12');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = h * 0.035; ctx.strokeStyle = '#8A5E0C'; ctx.stroke();
    ctx.lineWidth = h * 0.015;
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.76, ry * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#7A520B';
    ctx.font = `700 ${Math.round(h * 0.24)}px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('千', 0, -h * 0.13);
    ctx.fillText('両', 0, h * 0.15);
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = h * 0.04; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(0, 0, rx * 0.62, ry * 0.7, 0, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
    ctx.restore();
  }
  function partyHat(ctx, f, colours) {
    const d = f.d, base = f.at(d * 0.25, -d * 0.95), w = d * 0.62, hgt = d * 1.25, tilt = f.ang + 0.18;
    const cone = () => { ctx.beginPath(); ctx.moveTo(-w, 0); ctx.lineTo(0, -hgt); ctx.lineTo(w, 0); ctx.quadraticCurveTo(0, d * 0.16, -w, 0); ctx.closePath(); };
    ctx.save();
    ctx.translate(base.x, base.y);
    ctx.rotate(tilt);
    ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = d * 0.1; ctx.shadowOffsetY = d * 0.04;
    cone(); ctx.fillStyle = colours[0]; ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    cone(); ctx.clip();
    ctx.fillStyle = colours[1];
    for (let i = -3; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-w * 2, -hgt * 0.1 + i * d * 0.34); ctx.lineTo(w * 2, -hgt * 0.45 + i * d * 0.34); ctx.lineTo(w * 2, -hgt * 0.35 + i * d * 0.34); ctx.lineTo(-w * 2, i * d * 0.34); ctx.fill(); }
    ctx.restore();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath(); ctx.arc(0, -hgt, d * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---------- colour grading (pet only) ---------- */
  function grade(ctx, state) {
    ctx.save();
    if (state === 'worried') {
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,.45)';
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(80,120,190,.12)';
      ctx.fillRect(0, 0, S, S);
    } else if (state === 'sleepy') {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(30,42,95,.26)';
      ctx.fillRect(0, 0, S, S);
    } else if (state === 'happy' || state === 'rich' || state === 'party' || state === 'love' || state === 'wink') {
      ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = state === 'love' ? 'rgba(255,150,170,.35)' : 'rgba(255,200,100,.38)';
      ctx.fillRect(0, 0, S, S);
    }
    ctx.restore();
  }

  /* ---------- pet layer: real photo + mood edits + accessories ---------- */
  function petLayer(e, state) {
    const f = e.face, t = e.theme;
    const c = canvas(S);
    const x = c.getContext('2d');
    x.drawImage(e.base, 0, 0);
    const eyes = f.eyes;
    if (eyes) {
      const last = eyes[eyes.length - 1];
      if (state === 'sleepy') eyes.forEach((ey) => closeEye(x, e, ey));
      else if (state === 'wink') { if (eyes.length > 1) catchlight(x, eyes[0]); closeEye(x, e, last); }
      else if (state === 'happy' || state === 'party') eyes.forEach((ey) => squint(x, e, ey));
      else if (state === 'surprised') eyes.forEach((ey) => { magnify(x, e.base, ey, 1.3); catchlight(x, { x: ey.x, y: ey.y, r: ey.r * 1.3 }); });
      else if (state === 'love') eyes.forEach((ey) => heart(x, ey.x, ey.y, ey.r * 1.25, '#FF3B6B'));
      else if (state === 'rich') eyes.forEach((ey) => star(x, ey.x - ey.r * 0.25, ey.y - ey.r * 0.3, ey.r * 0.75, '#FFE27A'));
      else eyes.forEach((ey) => catchlight(x, ey));
      if (state === 'worried') brows(x, eyes, f.ang);
    }
    grade(x, state);
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(e.base, 0, 0);
    x.globalCompositeOperation = 'source-over';
    if (t.collarOn !== false) collar(x, f, (t.colors && t.colors.collar) || '#D7263D');
    return c;
  }

  /* ---------- floating effects, placed relative to the face crop ---------- */
  function effects(ctx, e, state, full) {
    const f = e.face, cr = f.crop;
    const at = (fx, fy) => [cr.x + fx * cr.s, cr.y + fy * cr.s];
    const E = (ch, fx, fy, sz, rot) => { const [x, y] = at(fx, fy); emoji(ctx, ch, x, y, cr.s * sz, rot); };
    switch (state) {
      case 'happy': E('✨', 0.8, 0.2, 0.14); E('✨', 0.22, 0.26, 0.09); E('🎵', 0.2, 0.62, 0.1, -0.2); break;
      case 'rich': { const [kx, ky] = at(0.2, 0.26); koban(ctx, kx, ky, cr.s * 0.15, -0.35); E('✨', 0.8, 0.2, 0.12); E('💰', 0.8, 0.68, 0.14); break; }
      case 'love': E('❤️', 0.8, 0.2, 0.13, 0.2); E('💕', 0.21, 0.26, 0.11, -0.2); break;
      case 'wink': E('✨', 0.8, 0.21, 0.12); E('💫', 0.21, 0.26, 0.09); break;
      case 'surprised': E('❗', 0.8, 0.19, 0.16, 0.15); E('❕', 0.21, 0.24, 0.1, -0.2); break;
      case 'worried': E('💦', 0.79, 0.21, 0.13); E('💸', 0.21, 0.26, 0.11, -0.2); break;
      case 'sleepy': E('💤', 0.79, 0.19, 0.15); E('🌙', 0.21, 0.23, 0.1, -0.3); break;
      case 'party': partyHat(ctx, f, ['#D7263D', '#F4C24D']); E('🎉', 0.2, 0.28, 0.13, -0.2); E('🎊', 0.8, 0.64, 0.12); break;
      default: break;
    }
    if (full && state === 'rich') {
      const bb = f.bb;
      koban(ctx, bb.x1 - (bb.x1 - bb.x0) * 0.12, bb.y1 - (bb.y1 - bb.y0) * 0.1, (bb.y1 - bb.y0) * 0.24, 0.2);
    }
  }

  /* ---------- kinds ---------- */
  function renderSticker(e, state, outline) {
    const pet = petLayer(e, state);
    const out = canvas(S);
    const o = out.getContext('2d');
    o.save();
    o.shadowColor = 'rgba(0,0,0,.2)';
    o.shadowBlur = 10;
    o.shadowOffsetY = 4;
    o.drawImage(dilate(pet, 13, outline), 0, 0);
    o.restore();
    o.drawImage(dilate(pet, 7, '#FFFFFF'), 0, 0);
    o.drawImage(pet, 0, 0);
    effects(o, e, state, true);
    return out;
  }

  function stateBg(e, state) {
    const st = STATES[state] || STATES.normal;
    return st.bg || [e.theme.ui.primarySoft, e.theme.ui.primary];
  }

  function renderPortrait(e, state, P, badge) {
    const pet = petLayer(e, state);
    const layer = canvas(S);
    const lc = layer.getContext('2d');
    lc.save();
    lc.shadowColor = 'rgba(0,0,0,.25)';
    lc.shadowBlur = 8;
    lc.shadowOffsetY = 3;
    lc.drawImage(pet, 0, 0);
    lc.restore();
    effects(lc, e, state, false);

    const out = canvas(P);
    const o = out.getContext('2d');
    const cx = P / 2, cy = P / 2, R = P * 0.47;
    const [c1, c2] = stateBg(e, state);
    o.save();
    o.beginPath(); o.arc(cx, cy, R, 0, Math.PI * 2); o.clip();
    const g = o.createRadialGradient(cx, cy * 0.8, R * 0.1, cx, cy, R * 1.1);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    o.fillStyle = g; o.fillRect(0, 0, P, P);
    if (state === 'sleepy') {
      o.fillStyle = 'rgba(255,255,255,.8)';
      [[0.2, 0.3], [0.3, 0.16], [0.75, 0.24], [0.68, 0.42], [0.15, 0.55], [0.85, 0.55]].forEach(([a, b], i) => { o.beginPath(); o.arc(P * a, P * b, P * (i % 2 ? 0.006 : 0.01), 0, 7); o.fill(); });
    } else if (state === 'rich' || state === 'normal') {
      o.fillStyle = 'rgba(255,255,255,.18)';
      for (let i = 0; i < 12; i++) { const a0 = (i / 12) * Math.PI * 2; o.beginPath(); o.moveTo(cx, cy); o.arc(cx, cy, R * 1.2, a0, a0 + Math.PI / 12); o.fill(); }
    }
    const cr = e.face.crop;
    o.drawImage(layer, cr.x, cr.y, cr.s, cr.s, 0, P * 0.03, P, P);
    o.restore();
    o.lineWidth = P * 0.028;
    o.strokeStyle = '#FFFFFF';
    o.beginPath(); o.arc(cx, cy, R, 0, Math.PI * 2); o.stroke();
    if (badge) {
      const bx = P * 0.83, by = P * 0.83, br = P * 0.145;
      o.save();
      o.shadowColor = 'rgba(0,0,0,.25)'; o.shadowBlur = P * 0.03; o.shadowOffsetY = P * 0.01;
      o.fillStyle = '#FFFFFF';
      o.beginPath(); o.arc(bx, by, br, 0, Math.PI * 2); o.fill();
      o.restore();
      emoji(o, emojiFor(e.theme, state), bx, by + P * 0.006, br * 1.35);
    }
    return out;
  }

  function renderIcon(e, size) {
    const P = 512;
    const out = canvas(P);
    const o = out.getContext('2d');
    const t = e.theme;
    const bg = t.builtin ? '#D7263D' : t.ui.primaryDark;
    const gold = '#F4C24D';
    const rr = (r) => { o.beginPath(); o.moveTo(r, 0); o.arcTo(P, 0, P, P, r); o.arcTo(P, P, 0, P, r); o.arcTo(0, P, 0, 0, r); o.arcTo(0, 0, P, 0, r); o.closePath(); };
    o.save();
    rr(112); o.clip();
    const g = o.createRadialGradient(P / 2, P * 0.55, 20, P / 2, P * 0.55, P * 0.75);
    g.addColorStop(0, root.Neko.util.shade(bg, 0.2)); g.addColorStop(1, root.Neko.util.shade(bg, -0.3));
    o.fillStyle = g; o.fillRect(0, 0, P, P);
    o.fillStyle = rgba(gold, 0.16);
    for (let i = 0; i < 16; i++) { const a0 = (i / 16) * Math.PI * 2; o.beginPath(); o.moveTo(P / 2, P * 0.58); o.arc(P / 2, P * 0.58, P, a0, a0 + Math.PI / 16); o.fill(); }
    o.fillStyle = rgba(gold, 0.22);
    o.beginPath(); o.arc(P / 2, P * 0.58, 190, 0, Math.PI * 2); o.fill();
    o.strokeStyle = rgba(gold, 0.6); o.lineWidth = 6; o.stroke();
    // the pet sticker, bottom-aligned
    const st = renderSticker(e, 'normal', '#FFFFFF');
    const bb = e.face.bb, pad = 16;
    const bw = bb.x1 - bb.x0 + pad * 2, bh = bb.y1 - bb.y0 + pad * 2;
    const sc = Math.min(430 / bw, 440 / bh);
    const dw = bw * sc, dh = bh * sc;
    o.drawImage(st, bb.x0 - pad, bb.y0 - pad, bw, bh, (P - dw) / 2, P - dh + 6, dw, dh);
    koban(o, P * 0.8, P * 0.8, 120, 0.22);
    o.restore();
    // 福 fortune coin
    const fx = 88, fy = 88;
    const cg = o.createRadialGradient(fx - 14, fy - 14, 6, fx, fy, 50);
    cg.addColorStop(0, '#FFF4C0'); cg.addColorStop(0.5, gold); cg.addColorStop(1, '#A87412');
    o.fillStyle = cg;
    o.beginPath(); o.arc(fx, fy, 48, 0, Math.PI * 2); o.fill();
    o.lineWidth = 4; o.strokeStyle = '#8A5E0C'; o.stroke();
    o.fillStyle = '#C21A2E';
    o.font = '700 56px "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif';
    o.textAlign = 'center'; o.textBaseline = 'middle';
    o.fillText('福', fx, fy + 3);
    rr(112);
    o.lineWidth = 10; o.strokeStyle = gold;
    o.save(); o.clip(); o.lineWidth = 20; o.stroke(); o.restore();
    if (size && size !== P) {
      const s = canvas(size);
      const sc2 = s.getContext('2d');
      sc2.imageSmoothingQuality = 'high';
      sc2.drawImage(out, 0, 0, size, size);
      return s;
    }
    return out;
  }

  /* ---------- templates: several photos of the same character ---------- */
  function templatesOf(t) {
    if (t.templates && t.templates.length) return t.templates;
    const src = t.cutout || t.sticker; // themes made before multi-photo templates
    return src ? [{ id: 'main', cutout: src, face: t.face }] : [];
  }
  function mainTemplate(t) {
    const ts = templatesOf(t);
    return ts.find((x) => x.id === t.mainId) || ts[0] || null;
  }
  function templateFor(t, state) {
    const id = t.moodMap && t.moodMap[state];
    return (id && templatesOf(t).find((x) => x.id === id)) || mainTemplate(t);
  }

  /* ---------- cache / public API ---------- */
  const cache = new Map();
  function keyOf(t, tpl) {
    return [t.id, tpl.id, cutKey(tpl.cutout), JSON.stringify(tpl.face || null)].join('|');
  }

  function prepareTpl(t, tpl) {
    const k = keyOf(t, tpl);
    let entry = cache.get(k);
    if (entry) return entry.ready;
    entry = { ok: false, urls: {}, theme: t };
    cache.set(k, entry);
    // keep memory small on phones: drop the least recently added entries
    while (cache.size > 10) {
      const oldest = cache.keys().next().value;
      if (oldest === k) break;
      cache.delete(oldest);
    }
    entry.ready = (async () => {
      if (!tpl.cutout) return entry;
      const img = await loadCutout(tpl.cutout);
      const base = canvas(S);
      const bc = base.getContext('2d');
      bc.imageSmoothingQuality = 'high';
      bc.drawImage(img, 0, 0, S, S);
      let data;
      try { data = bc.getImageData(0, 0, S, S).data; } catch (err) { return entry; } // tainted (file://)
      entry.base = base;
      entry.data = data;
      entry.face = computeFace(data, tpl.face);
      entry.ok = true;
      return entry;
    })().catch(() => entry);
    return entry.ready;
  }

  function prepare(t) {
    return Promise.all(templatesOf(t).map((tpl) => prepareTpl(t, tpl)));
  }

  function entryOf(t, tpl) {
    const e = tpl && cache.get(keyOf(t, tpl));
    return e && e.ok ? e : null;
  }
  function ready(t) {
    return entryOf(t, mainTemplate(t));
  }

  function toURL(c) {
    return c.toDataURL('image/png');
  }

  // kind: portrait | portrait-plain | sticker | icon | favicon
  function get(t, state, kind) {
    state = STATES[state] ? state : 'normal';
    const whole = kind === 'icon' || kind === 'favicon';
    const e = (!whole && entryOf(t, templateFor(t, state))) || ready(t);
    if (!e) return null;
    e.theme = t;
    const k = [state, kind, t.collarOn === false ? 0 : 1, t.colors && t.colors.collar, t.ui && t.ui.primary, t.species, !!t.builtin].join('|');
    if (!e.urls[k]) {
      let c;
      if (kind === 'sticker') c = renderSticker(e, state, (t.ui && t.ui.primary) || '#F2B632');
      else if (kind === 'icon') c = renderIcon(e);
      else if (kind === 'favicon') c = renderPortrait(e, 'normal', 128, false);
      else c = renderPortrait(e, state, 256, kind !== 'portrait-plain');
      e.urls[k] = toURL(c);
    }
    return e.urls[k];
  }

  root.Avatar = { STATES, emojiFor, prepare, ready, get, templatesOf, mainTemplate, templateFor, loadCutout, SIZE: S };
})(window);
