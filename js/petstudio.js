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
  const detectorPromises = {};
  function loadDetector(base) {
    base = base || 'lite_mobilenet_v2';
    if (!detectorPromises[base]) {
      detectorPromises[base] = (async () => {
        if (navigator.onLine === false) throw new Error('offline');
        if (!root.tf) await loadScript(TF_URL);
        if (!root.cocoSsd) await loadScript(COCO_URL);
        return root.cocoSsd.load({ base });
      })();
      detectorPromises[base].catch(() => { delete detectorPromises[base]; });
    }
    return withTimeout(detectorPromises[base], 40000);
  }

  // How well a box's centre matches the colours of a character we already know (0..1).
  function colourMatch(px, box, known) {
    const K = known.map((h) => U.hexToRgb(h));
    const x0 = box.x + box.w * 0.25, y0 = box.y + box.h * 0.25, x1 = box.x + box.w * 0.75, y1 = box.y + box.h * 0.75;
    const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 900)));
    let sum = 0, n = 0;
    for (let y = Math.floor(y0); y < y1; y += step) for (let x = Math.floor(x0); x < x1; x += step) { sum += Math.sqrt(nearest(px(x, y), K)); n++; }
    const md = n ? sum / n : 999;
    return 1 / (1 + Math.pow(md / 60, 2));
  }

  function pickSubject(preds, W, H, px, known) {
    let best = null, bestScore = 0;
    for (const p of preds) {
      let [x, y, w, h] = p.bbox;
      x = Math.max(0, x); y = Math.max(0, y); w = Math.min(W - x, w); h = Math.min(H - y, h);
      if (w < 6 || h < 6) continue;
      const box = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
      const weight = ANIMAL.has(p.class) ? 1.6 : p.class === 'person' ? 0.7 : 0.35;
      const match = known ? colourMatch(px, box, known) : 1;
      const sc = p.score * Math.sqrt((w * h) / (W * H)) * weight * (known ? 0.25 + match * 1.5 : 1);
      if (sc > bestScore) { bestScore = sc; best = Object.assign(box, { label: p.class, score: p.score, match: known ? match : null }); }
    }
    return best;
  }

  async function detectAI(canvas, px, known) {
    const W = canvas.width, H = canvas.height;
    const lite = await loadDetector('lite_mobilenet_v2');
    let best = pickSubject(await lite.detect(canvas, 20, 0.2), W, H, px, known);
    if (!best || best.score < 0.55 || !ANIMAL.has(best.label)) {
      // curled-up, lying or side-on pets are often missed by the small model → try the larger one
      try {
        const big = await loadDetector('mobilenet_v2');
        const b2 = pickSubject(await big.detect(canvas, 20, 0.2), W, H, px, known);
        if (b2 && (!best || b2.score * (ANIMAL.has(b2.label) ? 1.3 : 1) > best.score * (ANIMAL.has(best.label) ? 1.3 : 1))) best = b2;
      } catch (e) { /* keep the small model's answer */ }
    }
    return best;
  }

  /* ---------- AI segmentation (MediaPipe interactive segmenter) ---------- */
  const MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35';
  const MAGIC_TOUCH = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';
  let segPromise = null;
  function loadSegmenter() {
    if (!segPromise) {
      segPromise = (async () => {
        if (navigator.onLine === false) throw new Error('offline');
        const vision = await import(MP_BASE + '/vision_bundle.mjs');
        const files = await vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm');
        const opts = (delegate) => ({ baseOptions: { modelAssetPath: MAGIC_TOUCH, delegate }, outputCategoryMask: true, outputConfidenceMasks: false });
        try { return await vision.InteractiveSegmenter.createFromOptions(files, opts('GPU')); }
        catch (e) { return vision.InteractiveSegmenter.createFromOptions(files, opts('CPU')); }
      })();
      segPromise.catch(() => { segPromise = null; });
    }
    return withTimeout(segPromise, 45000);
  }

  function runSeg(seg, canvas, roi) {
    return new Promise((resolve, reject) => {
      try {
        seg.segment(canvas, roi, (res) => {
          const m = res.categoryMask;
          const MW = m.width, MH = m.height, a = m.getAsUint8Array();
          const W = canvas.width, H = canvas.height;
          const pts = roi.keypoint ? [roi.keypoint] : roi.scribble;
          const votes = {};
          for (const p of pts) {
            const v = a[Math.min(MH - 1, Math.round(p.y * (MH - 1))) * MW + Math.min(MW - 1, Math.round(p.x * (MW - 1)))];
            votes[v] = (votes[v] || 0) + 1;
          }
          const fg = +Object.keys(votes).sort((x, y) => votes[y] - votes[x])[0]; // label under the points
          const out = new Uint8Array(W * H);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const mi = Math.min(MH - 1, Math.round((y * MH) / H)) * MW + Math.min(MW - 1, Math.round((x * MW) / W));
            out[y * W + x] = a[mi] === fg ? 1 : 0;
          }
          if (m.close) m.close();
          resolve(out);
        });
      } catch (e) { reject(e); }
    });
  }

  function expandBox(box, pad, W, H) {
    const x0 = Math.max(0, Math.floor(box.x - box.w * pad)), y0 = Math.max(0, Math.floor(box.y - box.h * pad));
    const x1 = Math.min(W, Math.ceil(box.x + box.w * (1 + pad))), y1 = Math.min(H, Math.ceil(box.y + box.h * (1 + pad)));
    return { x0, y0, x1, y1 };
  }

  // A good mask sits inside the box and fills a fair part of it.
  function scoreMask(mask, W, H, box, pad) {
    const e = expandBox(box, pad, W, H);
    let inside = 0, total = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      total++;
      if (x >= e.x0 && x < e.x1 && y >= e.y0 && y < e.y1) inside++;
    }
    if (!total) return 0;
    const precision = inside / total, coverage = inside / (box.w * box.h);
    return precision * Math.min(1, coverage / 0.3) * (coverage > 1.25 ? 0.5 : 1);
  }

  function thinPoints(pts, max) {
    if (pts.length <= max) return pts;
    const out = [];
    for (let i = 0; i < max; i++) out.push(pts[Math.floor((i * pts.length) / max)]);
    return out;
  }

  // Segment on a crop around the subject so the model sees it large (much better for odd postures),
  // then paste the mask back into the full frame.
  async function segmentAI(canvas, box, region, pad) {
    const seg = await loadSegmenter();
    const W = canvas.width, H = canvas.height;
    const e = expandBox(box, Math.max(0.15, pad), W, H);
    const cw = e.x1 - e.x0, ch = e.y1 - e.y0;
    const crop = document.createElement('canvas');
    const k = Math.min(3, 512 / Math.max(cw, ch));
    crop.width = Math.round(cw * k); crop.height = Math.round(ch * k);
    crop.getContext('2d').drawImage(canvas, e.x0, e.y0, cw, ch, 0, 0, crop.width, crop.height);
    const toCrop = (x, y) => ({ x: clamp((x - e.x0) / cw, 0.002, 0.998), y: clamp((y - e.y0) / ch, 0.002, 0.998) });
    const cx = box.x + box.w / 2;
    const rois = [];
    const painted = region && region.strokes && region.strokes.length ? region.strokes : null;
    if (region && region.paths) {
      // a scribble is one continuous line: use the user's real brush strokes, longest first
      region.paths.slice().sort((a, b) => b.length - a.length).slice(0, 3)
        .forEach((pp) => rois.push({ scribble: thinPoints(pp, 60).map((p) => toCrop(p.x * W, p.y * H)) }));
    }
    if (painted) {
      const c = painted.reduce((a, p) => ({ x: a.x + p.x / painted.length, y: a.y + p.y / painted.length }), { x: 0, y: 0 });
      rois.push({ keypoint: toCrop(c.x * W, c.y * H) });
    }
    [[0.5, 0.5], [0.5, 0.32], [0.5, 0.7], [0.33, 0.5], [0.67, 0.5]].forEach(([fx, fy]) => rois.push({ keypoint: toCrop(box.x + box.w * fx, box.y + box.h * fy) }));
    // how much of the painted area a mask covers (a highlight means "this is the character")
    const recall = (m) => {
      if (!painted) return 1;
      let hit = 0;
      for (const p of painted) hit += m[Math.min(H - 1, Math.round(p.y * H)) * W + Math.min(W - 1, Math.round(p.x * W))];
      return hit / painted.length;
    };
    let best = null, bestS = -1;
    for (const roi of rois) {
      const cm = await runSeg(seg, crop, roi);
      const m = new Uint8Array(W * H);
      let filled = 0;
      for (let y = e.y0; y < e.y1; y++) for (let x = e.x0; x < e.x1; x++) {
        const v = cm[Math.min(crop.height - 1, Math.round((y - e.y0) * k)) * crop.width + Math.min(crop.width - 1, Math.round((x - e.x0) * k))];
        m[y * W + x] = v; filled += v;
      }
      let sc = scoreMask(m, W, H, box, pad) * Math.pow(recall(m), 2);
      if (filled > cw * ch * 0.9) sc *= 0.3; // grabbed the whole frame/card, not the character
      if (sc > bestS) { bestS = sc; best = m; }
      if (sc > 0.85) break;
    }
    return best && bestS >= 0.3 ? best : null;
  }

  // If the AI mask swallowed background (e.g. a whole photo card or blanket), trim it back to the
  // character's colours: learn background colours outside the box and character colours at its centre.
  function trimBackground(mask, px, W, H, box, known) {
    const e = expandBox(box, 0.06, W, H);
    const bgS = [];
    for (let y = 0; y < H; y += 3) for (let x = 0; x < W; x += 3) if (x < e.x0 || x >= e.x1 || y < e.y0 || y >= e.y1) bgS.push(px(x, y));
    if (bgS.length < 50) return mask;
    const bg = kmeans(bgS, 6, 8).centers;
    const fgS = [];
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    for (let y = box.y; y < box.y + box.h; y += 2) for (let x = box.x; x < box.x + box.w; x += 2) {
      const dx = (x - cx) / (box.w * 0.3), dy = (y - cy) / (box.h * 0.3);
      if (dx * dx + dy * dy <= 1 && mask[y * W + x]) fgS.push(px(x, y));
    }
    let fg = kmeans(fgS, 5, 8).centers.filter((c) => nearest(c, bg) > 900);
    if (known) fg = fg.concat(known.map((h) => U.hexToRgb(h)));
    if (!fg.length) return mask;
    // only when the mask spills well outside the detected character
    let total = 0, outside = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      total++;
      const x = i % W, y = (i / W) | 0;
      if (x < e.x0 || x >= e.x1 || y < e.y0 || y >= e.y1) outside++;
    }
    if (!total || outside / total < 0.15 || box.w * box.h > W * H * 0.7) return mask;
    // remove background-coloured parts connected to the spill (fur enclosed by the character stays)
    const bgLike = new Uint8Array(W * H);
    for (let i = 0; i < mask.length; i++) if (mask[i]) { const p = px(i % W, (i / W) | 0); if (nearest(p, fg) >= nearest(p, bg)) bgLike[i] = 1; }
    const out = Uint8Array.from(mask);
    const q = new Int32Array(W * H);
    let head = 0, tail = 0;
    for (let i = 0; i < mask.length; i++) {
      const x = i % W, y = (i / W) | 0;
      if (mask[i] && bgLike[i] && (x < e.x0 || x >= e.x1 || y < e.y0 || y >= e.y1)) { out[i] = 0; q[tail++] = i; }
    }
    while (head < tail) {
      const p = q[head++];
      const x = p % W;
      for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (n < 0 || n >= out.length || !out[n] || !bgLike[n]) continue;
        out[n] = 0; q[tail++] = n;
      }
    }
    let b = majority(out, W, H, 1);
    b = fillHoles(largestBlob(b, W, H), W, H);
    const area = b.reduce((a, v) => a + v, 0);
    return area > total * 0.15 ? b : mask;
  }

  function cleanMask(mask, W, H, box, pad) {
    const e = expandBox(box, pad, W, H);
    let bin = new Uint8Array(W * H);
    for (let y = e.y0; y < e.y1; y++) for (let x = e.x0; x < e.x1; x++) bin[y * W + x] = mask[y * W + x];
    bin = majority(bin, W, H, 1);
    bin = largestBlob(bin, W, H);
    return fillHoles(bin, W, H);
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

  // Offline colour-model cut-out (GrabCut-style): fg/bg colour models, refined a few rounds.
  function segment(px, W, H, box, seeds, known) {
    const pad = 0.04;
    const { x0: bx0, y0: by0, x1: bx1, y1: by1 } = expandBox(box, pad, W, H);
    const inBox = (x, y) => x >= bx0 && x < bx1 && y >= by0 && y < by1;

    const bgS = [];
    const coversAll = (bx1 - bx0) * (by1 - by0) > W * H * 0.8;
    const band = Math.max(2, Math.round(Math.min(W, H) * 0.035));
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
      const edge = x < band || y < band || x >= W - band || y >= H - band;
      if (coversAll ? edge : !inBox(x, y)) bgS.push(px(x, y));
    }
    let bg = kmeans(bgS, 6, 8).centers;

    const fgS = (seeds || []).slice();
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    for (let y = by0; y < by1; y += 2) for (let x = bx0; x < bx1; x += 2) {
      const dx = (x - cx) / (box.w * 0.32), dy = (y - cy) / (box.h * 0.34);
      if (dx * dx + dy * dy <= 1) fgS.push(px(x, y));
    }
    let fg = kmeans(fgS, 5, 8).centers;
    if (known) fg = fg.concat(known.map((h) => U.hexToRgb(h)));
    const distinct = fg.filter((c) => nearest(c, bg) > 900);
    if (distinct.length) fg = distinct;

    const classify = () => {
      const b = new Uint8Array(W * H);
      for (let y = by0; y < by1; y++) for (let x = bx0; x < bx1; x++) {
        const p = px(x, y);
        b[y * W + x] = nearest(p, fg) < nearest(p, bg) ? 1 : 0;
      }
      return b;
    };
    const post = (b) => fillHoles(largestBlob(majority(majority(b, W, H, 2), W, H, 2), W, H), W, H);
    let bin = post(classify());
    // refine: re-learn both colour models from the current cut-out
    for (let it = 0; it < 2; it++) {
      const f2 = [], b2 = bgS.filter((_, i) => i % 3 === 0);
      for (let y = by0; y < by1; y += 3) for (let x = bx0; x < bx1; x += 3) (bin[y * W + x] ? f2 : b2).push(px(x, y));
      if (f2.length < 30) break;
      fg = kmeans(f2, 6, 6).centers;
      bg = kmeans(b2, 7, 6).centers;
      bin = post(classify());
    }

    const area = bin.reduce((a, v) => a + v, 0);
    const boxArea = box.w * box.h;
    if (area < boxArea * 0.22 || area > boxArea * 1.1) {
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

    return { fur: fur.hex, furLight, stripe, eye, nose, pattern, swatches: clusters.map((c) => c.hex), grad, area: area / (W * H) };
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
  // Finds the eyes at any head angle: blobs of iris colour or dark pupils with a catch-light.
  // Returns two eyes, one eye (side-on face) or null.
  function detectEyes(px, W, H, mask, box, furRgb) {
    const x0 = box.x, y0 = box.y, w = box.w, h = box.h;
    const map = new Uint8Array(w * h); // 1 iris, 2 pupil, 3 catch-light
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const gi = (y + y0) * W + x + x0;
      if (!mask[gi]) continue;
      const p = px(x + x0, y + y0);
      const [hh, s, l] = rgbToHsl(p[0], p[1], p[2]);
      const farFromFur = dist2(p, furRgb) > 5000;
      if (farFromFur && s > 0.3 && l > 0.16 && l < 0.8 && ((hh >= 30 && hh <= 240) || (hh >= 12 && l < 0.42))) map[y * w + x] = 1;
      else if (l < 0.13) map[y * w + x] = 2;
      else if (l > 0.9 && s < 0.25) map[y * w + x] = 3;
    }
    const lab = new Int32Array(w * h), q = new Int32Array(w * h), blobs = [];
    let n = 0;
    for (let i = 0; i < map.length; i++) {
      if (map[i] !== 1 && map[i] !== 2 || lab[i]) continue;
      n++;
      let head = 0, tail = 0;
      q[tail++] = i; lab[i] = n;
      const b = { iris: 0, pupil: 0, area: 0, x0: w, y0: h, x1: 0, y1: 0 };
      while (head < tail) {
        const p = q[head++];
        const x = p % w, y = (p / w) | 0;
        b.area++; if (map[p] === 1) b.iris++; else b.pupil++;
        if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const np = ny * w + nx;
          if ((map[np] === 1 || map[np] === 2) && !lab[np]) { lab[np] = n; q[tail++] = np; }
        }
      }
      const bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1;
      const big = Math.max(w, h);
      if (b.area < 8 || bw > big * 0.25 || bh > big * 0.25 || bw / bh > 2.6 || bh / bw > 2.6) continue;
      if (b.area / (bw * bh) < 0.25) continue;
      // catch-light: a bright speck in or right next to the blob
      let hl = 0;
      const mx = Math.ceil(bw * 0.25), my = Math.ceil(bh * 0.25);
      for (let y = Math.max(0, b.y0 - my); y <= Math.min(h - 1, b.y1 + my); y++) for (let x = Math.max(0, b.x0 - mx); x <= Math.min(w - 1, b.x1 + mx); x++) if (map[y * w + x] === 3) hl++;
      b.cx = x0 + (b.x0 + b.x1) / 2; b.cy = y0 + (b.y0 + b.y1) / 2; b.r = Math.max(bw, bh) / 2;
      // a real eye = coloured iris around a dark pupil (and usually a catch-light)
      const irisy = b.iris >= 6 && b.iris / b.area > 0.12;
      const structured = irisy && b.pupil / b.area > 0.08;
      const lit = hl > 0 && hl < b.area;
      b.weight = b.area * (structured ? 2 : irisy ? 0.6 : 0.25) * (lit ? 1.5 : 1);
      b.strong = structured && b.iris >= 10;
      blobs.push(b);
    }
    blobs.sort((a, b) => b.weight - a.weight);
    const top = blobs.slice(0, 16);
    const span = Math.max(box.w, box.h);
    let best = null, bestScore = 0;
    for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) {
      const a = top[i], b = top[j];
      const dx = Math.abs(a.cx - b.cx), dy = Math.abs(a.cy - b.cy), dist = Math.hypot(dx, dy);
      if (dist < span * 0.1 || dist > span * 0.7) continue;
      const tilt = Math.atan2(dy, dx); // 0 = level … π/2 = lying on its side
      const ratio = a.r / b.r;
      if (ratio < 0.5 || ratio > 2) continue;
      if (a.r > dist * 0.45 || b.r > dist * 0.45) continue;
      const mid = Math.round((a.cy + b.cy) / 2) * W + Math.round((a.cx + b.cx) / 2);
      if (!mask[mid]) continue; // both eyes on the same face
      const score = (a.weight + b.weight) * (1 - Math.abs(Math.log(ratio)) / 1.5) * (1 - 0.3 * tilt / (Math.PI / 2));
      if (score > bestScore) { bestScore = score; best = [a, b]; }
    }
    const asEye = (b) => ({ x: b.cx, y: b.cy, r: Math.max(2, b.r) });
    if (best) {
      const vertical = Math.abs(best[0].cy - best[1].cy) > Math.abs(best[0].cx - best[1].cx);
      return best.sort((a, b) => (vertical ? a.cy - b.cy : a.cx - b.cx)).map(asEye);
    }
    const single = top.find((b) => b.strong);
    return single ? [asEye(single)] : null;
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

  // region: { box?: {x,y,w,h}, strokes?: [{x,y}] } in 0..1 photo coordinates (from the highlight tool)
  function regionBox(region, W, H) {
    if (region.box) {
      const b = region.box;
      return { x: Math.round(b.x * W), y: Math.round(b.y * H), w: Math.max(8, Math.round(b.w * W)), h: Math.max(8, Math.round(b.h * H)) };
    }
    let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
    for (const p of region.strokes) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const r = region.brush || 0.03;
    x0 -= r; y0 -= r; x1 += r; y1 += r;
    const bx = Math.max(0, x0 * W), by = Math.max(0, y0 * H);
    return { x: Math.round(bx), y: Math.round(by), w: Math.max(8, Math.round(Math.min(W, x1 * W) - bx)), h: Math.max(8, Math.round(Math.min(H, y1 * H) - by)) };
  }

  // Merge the palettes of several photos of the same character (weighted by how big it is in each).
  function mergePalettes(pals) {
    pals = pals.filter(Boolean);
    if (!pals.length) return null;
    const avg = (key) => {
      let r = 0, g = 0, b = 0, wsum = 0;
      for (const p of pals) {
        if (!p[key]) continue;
        const w = p.area || 0.1;
        const c = U.hexToRgb(p[key]);
        r += c[0] * w; g += c[1] * w; b += c[2] * w; wsum += w;
      }
      return wsum ? U.rgbToHex(r / wsum, g / wsum, b / wsum) : null;
    };
    const votes = {};
    pals.forEach((p) => { votes[p.pattern] = (votes[p.pattern] || 0) + (p.area || 0.1); });
    const pattern = Object.keys(votes).sort((a, b) => votes[b] - votes[a])[0];
    const swatches = Array.from(new Set(pals.flatMap((p) => p.swatches || []))).slice(0, 12);
    return { fur: avg('fur'), furLight: avg('furLight'), stripe: avg('stripe'), eye: avg('eye'), nose: avg('nose'), pattern, swatches, area: 1 };
  }

  // Colours of the character in earlier photos → used to pick & cut out the same character.
  function knownColours(pals) {
    return Array.from(new Set((pals || []).filter(Boolean).flatMap((p) => [p.fur, p.furLight, p.stripe].concat((p.swatches || []).slice(0, 3))).filter(Boolean)));
  }

  // Build mascot colours + UI palette from a (merged) palette.
  function themeFrom(pal, species) {
    const nose = pal.nose || (species === 'dog' || species === 'bear' ? '#2E2624' : '#E8A0A6');
    const colors = {
      fur: pal.fur, furLight: pal.furLight, stripe: pal.stripe, eye: pal.eye, nose,
      earInner: U.mix(species === 'dog' ? pal.fur : nose, '#FFE4E6', 0.55),
      collar: '#D7263D', gold: '#F4C24D',
    };
    const ui = deriveUI(pickPrimarySeed(pal));
    colors.collar = ui.accent === '#D7263D' ? '#D7263D' : '#2F6FDB';
    return { colors, ui };
  }

  /*
   * Analyse one photo.
   * opts.region – user highlight (skips detection, guides the cut-out)
   * opts.known  – palettes of the same character from other photos
   */
  async function analyze(file, opts) {
    if (typeof opts === 'function') opts = { onStep: opts };
    opts = opts || {};
    const step = opts.onStep || (() => {});
    const region = opts.region && ((opts.region.strokes && opts.region.strokes.length) || opts.region.box) ? opts.region : null;
    const known = opts.known && opts.known.length ? knownColours(opts.known) : null;

    step('load', 'Reading photo…');
    const img = await loadImage(file);
    const canvas = toCanvas(img, MAX);
    const W = canvas.width, H = canvas.height;
    const data = canvas.getContext('2d').getImageData(0, 0, W, H).data;
    const px = (x, y) => { const i = (y * W + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };

    let det = null, detector = 'Offline smart detector';
    if (region) {
      det = Object.assign(regionBox(region, W, H), { label: null, score: 0 });
      detector = region.box ? 'Your box' : 'Your highlight';
      step('found', 'Using the area you highlighted');
    } else {
      step('detect', known ? 'Looking for the same character (AI detector)…' : 'Looking for the main character (AI detector)…');
      try {
        det = await detectAI(canvas, px, known);
        if (det) detector = 'AI object detector (COCO-SSD)';
      } catch (e) {
        console.info('AI detector unavailable, using offline detector:', e.message);
      }
      if (!det) {
        step('detect', 'Using offline saliency detector…');
        await tick();
        det = detectSaliency(px, W, H);
      }
      step('found', det.label
        ? `Found a ${det.label} (${Math.round(det.score * 100)}% sure${det.match != null ? `, ${Math.round(det.match * 100)}% colour match` : ''})`
        : 'Found the main subject');
    }
    const box = { x: Math.round(det.x), y: Math.round(det.y), w: Math.max(8, Math.round(det.w)), h: Math.max(8, Math.round(det.h)) };
    await tick();

    // how far the cut-out may reach beyond the box
    const pad = region ? (region.box ? 0.03 : 0.45) : 0.1;
    step('cut', 'Cutting out the character (AI segmenter)…');
    let mask = null, quality = 'ai', segmenter = 'AI segmenter (MediaPipe)';
    try {
      const m = await segmentAI(canvas, box, region, pad);
      // a brush highlight is trusted as-is; otherwise trim background the AI may have swallowed
      if (m) mask = cleanMask(region && region.strokes ? m : trimBackground(m, px, W, H, box, known), W, H, box, pad);
    } catch (e) {
      console.info('AI segmenter unavailable, using colour model:', e.message);
    }
    if (!mask) {
      step('cut', 'Cutting out with the offline colour model…');
      await tick();
      const seeds = region && region.strokes ? thinPoints(region.strokes, 400).map((p) => px(Math.min(W - 1, Math.round(p.x * W)), Math.min(H - 1, Math.round(p.y * H)))) : [];
      const seg = segment(px, W, H, box, seeds.concat(seeds, seeds), known);
      mask = seg.mask; quality = seg.quality; segmenter = 'Offline colour model';
    }
    const tight = bounds(mask, W, H) || box;

    step('palette', 'Reading fur, stripes and eye colours…');
    await tick();
    const pal = readPalette(px, W, H, mask, tight);
    pal.swatches = Array.from(new Set(pal.swatches.concat(vividColours(px, W, H), [pal.eye]))).slice(0, 10);

    step('eyes', 'Finding the eyes…');
    await tick();
    const eyes = detectEyes(px, W, H, mask, tight, U.hexToRgb(pal.fur));

    step('sticker', 'Making the realistic cut-out…');
    await tick();
    const cut = makeCutout(img, canvas, mask, tight);
    const face = eyes ? { eyes: eyes.map((e) => { const [x, y] = cut.map(e.x, e.y); return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, r: Math.round(e.r * cut.scale * 10) / 10 }; }) } : null;

    const species = det.label ? SPECIES[det.label] || 'other' : null;
    step('done', 'Done!');
    return {
      detector, segmenter,
      label: det.label, score: det.score, match: det.match,
      quality,
      species, ears: species ? root.Neko.SPECIES_EARS[species] || 'pointy' : null,
      pal,
      cutout: cut.url,
      face,
      region: region || null,
      photo: thumb(toCanvas(img, 640), 640),
      thumb: thumb(canvas, 200),
      overlay: overlay(canvas, mask, tight, eyes),
      box: tight,
      texture: Math.round(pal.grad * 10) / 10,
    };
  }

  root.PetStudio = { analyze, deriveUI, mergePalettes, themeFrom, loadDetector, loadSegmenter, hexHsl, hslHex };
})(window);
