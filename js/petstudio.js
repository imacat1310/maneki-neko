/*
 * Pet Studio: recognise the main character in a photo and turn it into a
 * maneki-neko mascot + app theme, the same way Mit is drawn.
 *
 * 1. Detect   – COCO-SSD (TensorFlow.js, loaded from CDN when online);
 *               falls back to an offline saliency detector.
 * 2. Cut out  – foreground/background colour models inside the box,
 *               smoothed, largest blob, holes filled.
 * 3. Read     – k-means palette of the fur, stripe contrast, eye & nose colour.
 * 4. Build    – sticker (outlined cut-out), mascot colours, UI palette.
 */
(function (root) {
  'use strict';

  const U = root.Neko.util;
  const MAX = 480;
  const TF_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.22.0/dist/tf.min.js';
  const COCO_URL = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js';

  const SPECIES = { cat: 'cat', dog: 'dog', 'teddy bear': 'bear', bear: 'bear', bird: 'other', horse: 'other', sheep: 'other', cow: 'other', elephant: 'other', zebra: 'other', giraffe: 'other', person: 'other' };
  const ANIMAL = new Set(['cat', 'dog', 'bird', 'horse', 'sheep', 'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'teddy bear']);

  /* ---------- colour maths ---------- */
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hexHsl(hex) { return rgbToHsl.apply(null, U.hexToRgb(hex)); }
  function hslHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    const k = (n) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return U.rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
  }
  function dist2(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    // weighted RGB distance (closer to perceptual than plain RGB)
    return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- k-means ---------- */
  function kmeans(samples, k, iters) {
    iters = iters || 12;
    if (!samples.length) return { centers: [], counts: [] };
    k = Math.min(k, samples.length);
    // farthest-point initialisation
    const centers = [samples[Math.floor(samples.length / 2)].slice()];
    while (centers.length < k) {
      let best = null, bestD = -1;
      for (let i = 0; i < samples.length; i += 3) {
        let d = Infinity;
        for (const c of centers) d = Math.min(d, dist2(samples[i], c));
        if (d > bestD) { bestD = d; best = samples[i]; }
      }
      centers.push(best.slice());
    }
    let counts = new Array(k).fill(0);
    for (let it = 0; it < iters; it++) {
      const sums = centers.map(() => [0, 0, 0]);
      counts = new Array(k).fill(0);
      for (const s of samples) {
        let bi = 0, bd = Infinity;
        for (let j = 0; j < k; j++) {
          const d = dist2(s, centers[j]);
          if (d < bd) { bd = d; bi = j; }
        }
        sums[bi][0] += s[0]; sums[bi][1] += s[1]; sums[bi][2] += s[2];
        counts[bi]++;
      }
      for (let j = 0; j < k; j++) if (counts[j]) centers[j] = sums[j].map((v) => v / counts[j]);
    }
    return { centers, counts };
  }

  function nearest(px, centers) {
    let bd = Infinity;
    for (const c of centers) { const d = dist2(px, c); if (d < bd) bd = d; }
    return bd;
  }

  /* ---------- image helpers ---------- */
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = typeof file === 'string' ? file : URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not read this image'));
      img.src = url;
    });
  }
  function toCanvas(img, max) {
    const s = Math.min(1, max / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
    const c = document.createElement('canvas');
    c.width = Math.round((img.naturalWidth || img.width) * s);
    c.height = Math.round((img.naturalHeight || img.height) * s);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load ' + src));
      document.head.appendChild(s);
    });
  }
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  }

  /* ---------- 1. detection ---------- */
  let detectorPromise = null;
  function loadDetector() {
    if (!detectorPromise) {
      detectorPromise = (async () => {
        if (navigator.onLine === false) throw new Error('offline');
        if (!root.tf) await loadScript(TF_URL);
        if (!root.cocoSsd) await loadScript(COCO_URL);
        return root.cocoSsd.load({ base: 'lite_mobilenet_v2' });
      })();
      detectorPromise.catch(() => { detectorPromise = null; });
    }
    return withTimeout(detectorPromise, 30000);
  }

  async function detectAI(canvas) {
    const model = await loadDetector();
    const preds = await model.detect(canvas, 10, 0.25);
    const A = canvas.width * canvas.height;
    let best = null, bestScore = 0;
    for (const p of preds) {
      const [x, y, w, h] = p.bbox;
      const weight = ANIMAL.has(p.class) ? 1.6 : p.class === 'person' ? 0.7 : 0.35;
      const sc = p.score * Math.sqrt((w * h) / A) * weight;
      if (sc > bestScore) { bestScore = sc; best = p; }
    }
    if (!best) return null;
    const [x, y, w, h] = best.bbox;
    return { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(canvas.width - x, w), h: Math.min(canvas.height - y, h), label: best.class, score: best.score, all: preds };
  }

  function detectSaliency(px, W, H) {
    const band = Math.max(3, Math.round(Math.min(W, H) * 0.05));
    const border = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      if (x < band || y < band || x >= W - band || y >= H - band) border.push(px(x, y));
    }
    const bg = kmeans(border, 6, 8).centers;
    const cx = W / 2, cy = H / 2;
    const sal = new Float32Array(W * H);
    let maxS = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = (x - cx) / W, dy = (y - cy) / H;
      const prior = Math.exp(-(dx * dx + dy * dy) / 0.12);
      const v = Math.sqrt(nearest(px(x, y), bg)) * (0.35 + 0.65 * prior);
      sal[y * W + x] = v;
      if (v > maxS) maxS = v;
    }
    const t = otsu(sal, maxS);
    let bin = new Uint8Array(W * H);
    for (let i = 0; i < sal.length; i++) bin[i] = sal[i] > t ? 1 : 0;
    bin = majority(bin, W, H, 3);
    bin = largestBlob(bin, W, H);
    const b = bounds(bin, W, H);
    if (!b || b.w * b.h < W * H * 0.02) return { x: W * 0.15, y: H * 0.1, w: W * 0.7, h: H * 0.8, label: null, score: 0 };
    return Object.assign(b, { label: null, score: 0 });
  }

  function otsu(vals, max) {
    const bins = 64, hist = new Array(bins).fill(0);
    for (const v of vals) hist[Math.min(bins - 1, Math.floor((v / (max || 1)) * bins))]++;
    const total = vals.length;
    let sum = 0;
    for (let i = 0; i < bins; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, best = 0, th = 0;
    for (let i = 0; i < bins; i++) {
      wB += hist[i];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += i * hist[i];
      const mB = sumB / wB, mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) { best = between; th = i; }
    }
    return ((th + 0.5) / bins) * max;
  }

  /* ---------- 2. segmentation ---------- */
  function majority(bin, W, H, r) {
    // box filter via integral image
    const I = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += bin[y * W + x];
        I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row;
      }
    }
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - r), y0 = Math.max(0, y - r), x1 = Math.min(W, x + r + 1), y1 = Math.min(H, y + r + 1);
      const s = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
      out[y * W + x] = s * 2 > (x1 - x0) * (y1 - y0) ? 1 : 0;
    }
    return out;
  }

  function largestBlob(bin, W, H) {
    const lab = new Int32Array(W * H);
    const q = new Int32Array(W * H);
    let best = 0, bestSize = 0, next = 0;
    for (let i = 0; i < bin.length; i++) {
      if (!bin[i] || lab[i]) continue;
      next++;
      let head = 0, tail = 0, size = 0;
      q[tail++] = i; lab[i] = next;
      while (head < tail) {
        const p = q[head++]; size++;
        const x = p % W, y = (p / W) | 0;
        if (x > 0 && bin[p - 1] && !lab[p - 1]) { lab[p - 1] = next; q[tail++] = p - 1; }
        if (x < W - 1 && bin[p + 1] && !lab[p + 1]) { lab[p + 1] = next; q[tail++] = p + 1; }
        if (y > 0 && bin[p - W] && !lab[p - W]) { lab[p - W] = next; q[tail++] = p - W; }
        if (y < H - 1 && bin[p + W] && !lab[p + W]) { lab[p + W] = next; q[tail++] = p + W; }
      }
      if (size > bestSize) { bestSize = size; best = next; }
    }
    const out = new Uint8Array(W * H);
    for (let i = 0; i < out.length; i++) out[i] = lab[i] === best ? 1 : 0;
    return out;
  }

  function fillHoles(bin, W, H) {
    const seen = new Uint8Array(W * H);
    const q = new Int32Array(W * H);
    let head = 0, tail = 0;
    const push = (p) => { if (!bin[p] && !seen[p]) { seen[p] = 1; q[tail++] = p; } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (head < tail) {
      const p = q[head++];
      const x = p % W, y = (p / W) | 0;
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }
    const out = new Uint8Array(W * H);
    for (let i = 0; i < out.length; i++) out[i] = bin[i] || !seen[i] ? 1 : 0;
    return out;
  }

  function bounds(bin, W, H) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (bin[y * W + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  function segment(px, W, H, box) {
    const pad = 0.04;
    const bx0 = Math.max(0, Math.floor(box.x - box.w * pad)), by0 = Math.max(0, Math.floor(box.y - box.h * pad));
    const bx1 = Math.min(W, Math.ceil(box.x + box.w * (1 + pad))), by1 = Math.min(H, Math.ceil(box.y + box.h * (1 + pad)));
    const inBox = (x, y) => x >= bx0 && x < bx1 && y >= by0 && y < by1;

    // background model: outside the box (or a thin border if the box fills the frame)
    const bgS = [];
    const coversAll = (bx1 - bx0) * (by1 - by0) > W * H * 0.8;
    const band = Math.max(2, Math.round(Math.min(W, H) * 0.035));
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const edge = x < band || y < band || x >= W - band || y >= H - band;
      if (coversAll ? edge : !inBox(x, y)) bgS.push(px(x, y));
    }
    const bg = kmeans(bgS, 6, 8).centers;

    // foreground model: centre ellipse of the box
    const fgS = [];
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    for (let y = by0; y < by1; y += 2) for (let x = bx0; x < bx1; x += 2) {
      const dx = (x - cx) / (box.w * 0.32), dy = (y - cy) / (box.h * 0.34);
      if (dx * dx + dy * dy <= 1) fgS.push(px(x, y));
    }
    let fg = kmeans(fgS, 5, 8).centers;
    const distinct = fg.filter((c) => nearest(c, bg) > 900);
    if (distinct.length) fg = distinct;

    let bin = new Uint8Array(W * H);
    for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
      const p = px(x, y);
      bin[y * W + x] = nearest(p, fg) < nearest(p, bg) ? 1 : 0;
    }
    bin = majority(bin, W, H, 2);
    bin = majority(bin, W, H, 2);
    bin = largestBlob(bin, W, H);
    bin = fillHoles(bin, W, H);

    const area = bin.reduce((s, v) => s + v, 0);
    const boxArea = box.w * box.h;
    if (area < boxArea * 0.22 || area > boxArea * 1.1) {
      // unreliable cut-out → soft ellipse inside the detection box
      bin = new Uint8Array(W * H);
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
        const dx = (x - cx) / (box.w / 2), dy = (y - cy) / (box.h / 2);
        if (dx * dx + dy * dy <= 1) bin[y * W + x] = 1;
      }
      return { mask: bin, quality: 'ellipse' };
    }
    return { mask: bin, quality: 'cutout' };
  }

  /* ---------- 3. palette ---------- */
  function readPalette(px, W, H, mask, box) {
    const r = 3;
    const S = [];
    const step = Math.max(1, Math.floor(Math.sqrt((box.w * box.h) / 6000)));
    for (let y = box.y + r; y < box.y + box.h - r; y += step) for (let x = box.x + r; x < box.x + box.w - r; x += step) {
      const i = y * W + x;
      if (mask[i] && mask[i - r] && mask[i + r] && mask[i - r * W] && mask[i + r * W]) S.push(px(x, y));
    }
    const km = kmeans(S, 5, 14);
    const total = km.counts.reduce((a, b) => a + b, 0) || 1;
    let clusters = km.centers.map((c, i) => {
      const hex = U.rgbToHex(c[0], c[1], c[2]);
      const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      return { rgb: c, hex, share: km.counts[i] / total, h, s, l, lum: U.luminance(hex) };
    }).filter((c) => c.share > 0.03).sort((a, b) => b.share - a.share);
    if (!clusters.length) clusters = [{ hex: '#A9A6A3', share: 1, h: 0, s: 0, l: 0.65, lum: 0.38 }];

    const byLum = clusters.slice().sort((a, b) => a.lum - b.lum);
    const darkest = byLum[0], lightest = byLum[byLum.length - 1];
    let fur = clusters[0];
    let furLight, stripe, pattern = 'solid';

    // texture: mean luminance gradient inside the mask
    let grad = 0, gn = 0;
    for (let y = box.y + 2; y < box.y + box.h - 2; y += 2) for (let x = box.x + 2; x < box.x + box.w - 2; x += 2) {
      const i = y * W + x;
      if (!mask[i]) continue;
      const a = px(x, y), b = px(x + 2, y), c = px(x, y + 2);
      const la = a[0] + a[1] + a[2], lb = b[0] + b[1] + b[2], lc = c[0] + c[1] + c[2];
      grad += (Math.abs(la - lb) + Math.abs(la - lc)) / 6; gn++;
    }
    grad = gn ? grad / gn : 0;

    const whiteShare = clusters.filter((c) => c.l > 0.8 && c.s < 0.35).reduce((s, c) => s + c.share, 0);
    const nonWhite = clusters.filter((c) => !(c.l > 0.8 && c.s < 0.35));

    if (whiteShare > 0.2 && nonWhite.length && Math.abs(nonWhite[0].lum - lightest.lum) > 0.25) {
      pattern = 'bicolor';
      fur = nonWhite[0];
      furLight = '#FAF7F2';
    }
    if (!furLight) furLight = lightest.lum - fur.lum > 0.06 ? lightest.hex : U.shade(fur.hex, 0.45);

    // stripes: the darkest colour that still covers a real share of the coat
    // (the very darkest cluster is often just pupils or shadows)
    const stripeC = byLum.find((c) => c !== fur && c.share > 0.07 && fur.lum - c.lum > 0.04);
    if (stripeC) {
      stripe = stripeC.hex;
      if (pattern !== 'bicolor' && grad > 9) pattern = 'tabby';
    } else {
      stripe = U.shade(fur.hex, -0.32);
    }

    // eyes: saturated yellow/green/blue/amber pixels in the upper part of the subject
    const eyeC = [], noseC = [];
    for (let y = box.y; y < box.y + box.h * 0.62; y += 1) for (let x = box.x; x < box.x + box.w; x += 1) {
      const i = y * W + x;
      if (!mask[i]) continue;
      const p = px(x, y);
      const [h, s, l] = rgbToHsl(p[0], p[1], p[2]);
      if (s > 0.32 && l > 0.2 && l < 0.78 && h >= 38 && h <= 235 && dist2(p, fur.rgb || [0, 0, 0]) > 6000) eyeC.push(p);
      const rx = (x - box.x) / box.w, ry = (y - box.y) / box.h;
      if (rx > 0.3 && rx < 0.7 && ry > 0.3 && s > 0.16 && l > 0.42 && l < 0.86 && (h >= 335 || h <= 22)) noseC.push(p);
    }
    const area = mask.reduce((s, v) => s + v, 0) || 1;
    const avg = (arr) => { const s = [0, 0, 0]; for (const p of arr) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return U.rgbToHex(s[0] / arr.length, s[1] / arr.length, s[2] / arr.length); };
    let eye = null;
    if (eyeC.length > area * 0.0015 && eyeC.length < area * 0.12) {
      const [h, s, l] = hexHsl(avg(eyeC));
      eye = hslHex(h, clamp(s + 0.15, 0.4, 0.85), clamp(l, 0.4, 0.62));
    }
    if (!eye) eye = fur.lum < 0.15 ? '#E6B422' : '#D8B13A';
    const nose = noseC.length > area * 0.0008 ? avg(noseC) : null;

    return { fur: fur.hex, furLight, stripe, eye, nose, pattern, swatches: clusters.map((c) => c.hex), grad };
  }

  function vividColours(px, W, H) {
    const S = [];
    for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) S.push(px(x, y));
    const km = kmeans(S, 8, 8);
    const total = S.length;
    return km.centers.map((c, i) => {
      const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
      return { hex: U.rgbToHex(c[0], c[1], c[2]), h, s, l, share: km.counts[i] / total };
    }).filter((c) => c.s > 0.35 && c.l > 0.25 && c.l < 0.82 && c.share > 0.02).sort((a, b) => b.s * Math.sqrt(b.share) - a.s * Math.sqrt(a.share)).map((c) => c.hex);
  }

  /* ---------- 4. theme ---------- */
  function deriveUI(primarySeed) {
    const [h, s0] = hexHsl(primarySeed);
    const s = clamp(s0, 0.5, 0.85);
    const primary = hslHex(h, s, 0.54);
    const redish = h < 20 || h > 335;
    return {
      primary,
      primaryDark: hslHex(h, s, 0.34),
      primarySoft: hslHex(h, s * 0.9, 0.91),
      onPrimary: U.luminance(primary) > 0.42 ? '#2E2522' : '#FFFFFF',
      bg: hslHex(h, 0.55, 0.965),
      accent: redish ? '#E0A21B' : '#D7263D',
    };
  }

  function pickPrimarySeed(pal) {
    const [fh, fs, fl] = hexHsl(pal.fur);
    if (fs > 0.28 && fl > 0.18 && fl < 0.88) return pal.fur;
    const [, es] = hexHsl(pal.eye);
    if (es > 0.3) return pal.eye;
    return '#F0B429';
  }

  /* ---------- eyes ---------- */
  // Finds the two eyes: blobs of iris colour (or dark pupils) side by side in the upper face.
  function detectEyes(px, W, H, mask, box, furRgb) {
    const x0 = box.x, y0 = box.y, w = box.w, h = Math.round(box.h * 0.6);
    const map = new Uint8Array(w * h); // 1 = iris, 2 = pupil
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gi = (y + y0) * W + x + x0;
      if (!mask[gi]) continue;
      const p = px(x + x0, y + y0);
      const [hh, s, l] = rgbToHsl(p[0], p[1], p[2]);
      const farFromFur = dist2(p, furRgb) > 5000;
      if (farFromFur && s > 0.3 && l > 0.16 && l < 0.8 && ((hh >= 30 && hh <= 240) || (hh >= 12 && l < 0.42))) map[y * w + x] = 1;
      else if (l < 0.11) map[y * w + x] = 2;
    }
    const lab = new Int32Array(w * h), q = new Int32Array(w * h), blobs = [];
    let n = 0;
    for (let i = 0; i < map.length; i++) {
      if (!map[i] || lab[i]) continue;
      n++;
      let head = 0, tail = 0;
      q[tail++] = i; lab[i] = n;
      const b = { iris: 0, area: 0, x0: w, y0: h, x1: 0, y1: 0 };
      while (head < tail) {
        const p = q[head++];
        const x = p % w, y = (p / w) | 0;
        b.area++; if (map[p] === 1) b.iris++;
        if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if (map[np] && !lab[np]) { lab[np] = n; q[tail++] = np; }
        }
      }
      const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
      if (b.area < 8 || bw > w * 0.3 || bh > h * 0.4 || bw / bh > 2.6 || bh / bw > 2.6) continue;
      if (b.area / (bw * bh) < 0.25) continue;
      b.cx = x0 + (b.x0 + b.x1) / 2; b.cy = y0 + (b.y0 + b.y1) / 2; b.r = Math.max(bw, bh) / 2;
      b.weight = b.iris >= 6 && b.iris / b.area > 0.12 ? b.area : b.area * 0.3;
      blobs.push(b);
    }
    blobs.sort((a, b) => b.weight - a.weight);
    const top = blobs.slice(0, 14);
    let best = null, bestScore = 0;
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const a = top[i], b = top[j];
      const dx = Math.abs(a.cx - b.cx), dy = Math.abs(a.cy - b.cy);
      if (dx < box.w * 0.12 || dx > box.w * 0.7 || dy > dx * 0.35) continue;
      const ratio = a.r / b.r;
      if (ratio < 0.5 || ratio > 2) continue;
      if (a.r > dx * 0.45 || b.r > dx * 0.45) continue;
      const score = (a.weight + b.weight) * (1 - dy / dx) * (1 - Math.abs(Math.log(ratio)) / 1.5);
      if (score > bestScore) { bestScore = score; best = [a, b]; }
    }
    if (!best) return null;
    return best.sort((a, b) => a.cx - b.cx).map((b) => ({ x: b.cx, y: b.cy, r: Math.max(2, b.r) }));
  }

  /* ---------- cut-out (hi-res, transparent) ---------- */
  const CUT = 400, CUT_MARGIN = 30;
  function makeCutout(img, canvas, mask, box) {
    const W = canvas.width, H = canvas.height;
    const mc = document.createElement('canvas');
    mc.width = W; mc.height = H;
    const mctx = mc.getContext('2d');
    const id = mctx.createImageData(W, H);
    for (let i = 0; i < mask.length; i++) if (mask[i]) id.data[i * 4 + 3] = 255;
    mctx.putImageData(id, 0, 0);

    // work on a higher-resolution copy of the photo so the fur stays sharp
    const hi = toCanvas(img, 1024);
    const k = hi.width / W;
    const soft = document.createElement('canvas');
    soft.width = hi.width; soft.height = hi.height;
    const sctx = soft.getContext('2d');
    sctx.imageSmoothingQuality = 'high';
    sctx.filter = 'blur(' + (1.1 * k).toFixed(1) + 'px)';
    sctx.drawImage(mc, 0, 0, hi.width, hi.height);
    const hctx = hi.getContext('2d');
    hctx.globalCompositeOperation = 'destination-in';
    hctx.drawImage(soft, 0, 0);

    const side = Math.max(box.w, box.h);
    const sx = box.x + box.w / 2 - side / 2, sy = box.y + box.h / 2 - side / 2;
    const scale = (CUT - CUT_MARGIN * 2) / side;
    const out = document.createElement('canvas');
    out.width = CUT; out.height = CUT;
    const o = out.getContext('2d');
    o.imageSmoothingQuality = 'high';
    o.drawImage(hi, sx * k, sy * k, side * k, side * k, CUT_MARGIN, CUT_MARGIN, CUT - CUT_MARGIN * 2, CUT - CUT_MARGIN * 2);
    const map = (x, y) => [CUT_MARGIN + (x - sx) * scale, CUT_MARGIN + (y - sy) * scale];
    let url = out.toDataURL('image/webp', 0.9);
    if (!url.startsWith('data:image/webp')) url = out.toDataURL('image/png');
    return { url, map, scale };
  }

  function overlay(canvas, mask, box, eyes) {
    const c = document.createElement('canvas');
    c.width = canvas.width; c.height = canvas.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height);
    const W = c.width;
    for (let i = 0; i < mask.length; i++) {
      const x = i % W;
      const edge = mask[i] && (!mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W]);
      if (!mask[i]) {
        img.data[i * 4] *= 0.45; img.data[i * 4 + 1] *= 0.45; img.data[i * 4 + 2] *= 0.45;
      } else if (edge && x > 0) {
        img.data[i * 4] = 255; img.data[i * 4 + 1] = 214; img.data[i * 4 + 2] = 80;
      }
    }
    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = '#FFD650';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.setLineDash([]);
    ctx.strokeStyle = '#4BE38A';
    ctx.lineWidth = 2.5;
    for (const e of eyes || []) { ctx.beginPath(); ctx.arc(e.x, e.y, e.r + 3, 0, Math.PI * 2); ctx.stroke(); }
    return c.toDataURL('image/jpeg', 0.85);
  }

  function thumb(canvas, size) {
    const s = Math.min(1, size / Math.max(canvas.width, canvas.height));
    const c = document.createElement('canvas');
    c.width = Math.round(canvas.width * s); c.height = Math.round(canvas.height * s);
    c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  }

  const tick = () => new Promise((r) => setTimeout(r, 30));

  async function analyze(file, onStep) {
    const step = onStep || (() => {});
    step('load', 'Reading photo…');
    const img = await loadImage(file);
    const canvas = toCanvas(img, MAX);
    const W = canvas.width, H = canvas.height;
    const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
    const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };

    let det = null, detector = 'Offline smart detector';
    step('detect', 'Looking for the main character (AI detector)…');
    try {
      det = await detectAI(canvas);
      if (det) detector = 'AI object detector (COCO-SSD)';
    } catch (e) {
      console.info('AI detector unavailable, using offline detector:', e.message);
    }
    if (!det) {
      step('detect', 'Using offline saliency detector…');
      await tick();
      det = detectSaliency(px, W, H);
    }
    const box = { x: Math.round(det.x), y: Math.round(det.y), w: Math.max(8, Math.round(det.w)), h: Math.max(8, Math.round(det.h)) };
    step('found', det.label ? `Found a ${det.label} (${Math.round(det.score * 100)}% sure)` : 'Found the main subject');
    await tick();

    step('cut', 'Cutting out the character…');
    await tick();
    const seg = segment(px, W, H, box);
    const tight = bounds(seg.mask, W, H) || box;

    step('palette', 'Reading fur, stripes and eye colours…');
    await tick();
    const pal = readPalette(px, W, H, seg.mask, tight);
    const vivid = vividColours(px, W, H);

    const species = det.label ? SPECIES[det.label] || 'other' : 'cat';
    const ears = root.Neko.SPECIES_EARS[species] || 'pointy';
    const nose = pal.nose || (species === 'dog' || species === 'bear' ? '#2E2624' : '#E8A0A6');
    const colors = {
      fur: pal.fur,
      furLight: pal.furLight,
      stripe: pal.stripe,
      eye: pal.eye,
      nose,
      earInner: U.mix(species === 'dog' ? pal.fur : nose, '#FFE4E6', 0.55),
      collar: '#D7263D',
      gold: '#F4C24D',
    };
    const seed = pickPrimarySeed(pal);
    const ui = deriveUI(seed);
    colors.collar = ui.accent === '#D7263D' ? '#D7263D' : '#2F6FDB';

    step('eyes', 'Finding the eyes…');
    await tick();
    const furRgb = U.hexToRgb(pal.fur);
    const eyes = detectEyes(px, W, H, seg.mask, tight, furRgb);

    step('sticker', 'Making the realistic cut-out…');
    await tick();
    const cut = makeCutout(img, canvas, seg.mask, tight);
    const face = eyes ? { eyes: eyes.map((e) => { const [x, y] = cut.map(e.x, e.y); return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(e.r * cut.scale * 10) / 10 }; }) } : null;

    step('done', 'Done!');
    return {
      detector,
      label: det.label,
      score: det.score,
      quality: seg.quality,
      species, ears, pattern: pal.pattern,
      colors, ui,
      swatches: Array.from(new Set(pal.swatches.concat(vivid, [pal.eye]))).slice(0, 10),
      cutout: cut.url,
      face,
      photo: thumb(canvas, 220),
      overlay: overlay(canvas, seg.mask, tight, eyes),
      box: tight,
      texture: Math.round(pal.grad * 10) / 10,
    };
  }

  root.PetStudio = { analyze, deriveUI, loadDetector, hexHsl, hslHex };
})(window);
