/*
 * Maneki-Neko character generator.
 * Draws Mit (or any pet, given its colours) as a beckoning lucky cat in SVG.
 * Works in the browser (window.Neko) and in JavaScriptCore (ava/generate-ava.js).
 */
(function (root) {
  'use strict';

  let uid = 0;

  // Mit: silver tabby, round yellow-green eyes, pink nose, chubby cheeks.
  const MIT = {
    name: 'Mit',
    species: 'cat',
    ears: 'pointy',
    pattern: 'tabby',
    fur: '#A9A6A3',
    furLight: '#E7E3DD',
    stripe: '#6C6866',
    eye: '#C9C24B',
    nose: '#CFA0A0',
    earInner: '#EDBDBA',
    collar: '#D7263D',
    gold: '#F4C24D',
  };

  const SPECIES_EARS = { cat: 'pointy', dog: 'floppy', rabbit: 'long', hamster: 'round', bear: 'round', other: 'pointy' };

  /* ---------- colour helpers ---------- */
  function hexToRgb(hex) {
    hex = String(hex || '#000').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  }
  function mix(a, b, t) {
    const A = hexToRgb(a), B = hexToRgb(b);
    return rgbToHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  }
  function shade(hex, amt) {
    return amt < 0 ? mix(hex, '#000000', -amt) : mix(hex, '#ffffff', amt);
  }
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  /* ---------- parts ---------- */
  function earsBack(o, c) {
    const L = [];
    if (o.ears === 'pointy') {
      L.push(`<path d="M44,64 C35,40 39,16 50,9 C63,11 81,23 93,34 Z" fill="${c.furEdge}" stroke="${c.line}" stroke-width="2.4" stroke-linejoin="round"/>`);
      L.push(`<path d="M52,54 C48,38 51,24 55,19 C64,23 74,30 83,37 Z" fill="${c.earInner}"/>`);
      if (o.pattern === 'tabby') L.push(`<path d="M50,30 C54,34 58,38 60,44" stroke="${c.stripe}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".5"/>`);
    } else if (o.ears === 'round') {
      L.push(`<circle cx="54" cy="36" r="19" fill="${c.furEdge}" stroke="${c.line}" stroke-width="2.4"/>`);
      L.push(`<circle cx="55" cy="37" r="10.5" fill="${c.earInner}"/>`);
    } else if (o.ears === 'long') {
      L.push(`<g transform="rotate(-14 76 40)"><ellipse cx="76" cy="0" rx="14" ry="42" fill="${c.furEdge}" stroke="${c.line}" stroke-width="2.4"/><ellipse cx="76" cy="4" rx="7" ry="31" fill="${c.earInner}"/></g>`);
    }
    return L.join('');
  }

  function earsFront(o, c) {
    if (o.ears !== 'floppy') return '';
    return `<path d="M56,34 C36,30 20,56 22,88 C23,106 40,112 49,100 C58,86 62,62 70,40 Z" fill="${c.floppy}" stroke="${c.line}" stroke-width="2.4" stroke-linejoin="round"/>`;
  }

  function mirror(svg) {
    return `<g transform="matrix(-1 0 0 1 200 0)">${svg}</g>`;
  }

  function headPattern(o, c) {
    const s = c.stripe;
    if (o.pattern === 'tabby') {
      return `<g stroke="${s}" stroke-linecap="round" fill="none" opacity=".85">
        <path d="M100,27 L100,52" stroke-width="4.2"/>
        <path d="M91,29 Q88.5,41 92,54" stroke-width="3.8"/>
        <path d="M109,29 Q111.5,41 108,54" stroke-width="3.8"/>
        <path d="M82,33 Q79,43 84,50" stroke-width="3.2"/>
        <path d="M118,33 Q121,43 116,50" stroke-width="3.2"/>
        <path d="M40,82 Q50,80 60,86" stroke-width="3"/>
        <path d="M42,93 Q52,91 60,95" stroke-width="3"/>
        <path d="M160,82 Q150,80 140,86" stroke-width="3"/>
        <path d="M158,93 Q148,91 140,95" stroke-width="3"/>
        <path d="M86,73 Q80,70 72,66" stroke-width="2" opacity=".6"/>
        <path d="M114,73 Q120,70 128,66" stroke-width="2" opacity=".6"/>
      </g>`;
    }
    if (o.pattern === 'bicolor') {
      return `<path d="M100,40 C94,58 84,74 72,100 C80,122 120,122 128,100 C116,74 106,58 100,40 Z" fill="${c.furLight}"/>`;
    }
    if (o.pattern === 'pointed') {
      return `<ellipse cx="100" cy="98" rx="34" ry="28" fill="${c.stripe}" opacity=".55"/>`;
    }
    if (o.pattern === 'spotted') {
      return `<g fill="${c.stripe}" opacity=".75"><ellipse cx="66" cy="50" rx="10" ry="8"/><ellipse cx="136" cy="56" rx="12" ry="9"/><ellipse cx="148" cy="96" rx="7" ry="6"/><ellipse cx="52" cy="104" rx="6" ry="5"/></g>`;
    }
    return '';
  }

  function eye(cx, cy, c, mood, side) {
    const dark = '#1E1A1A';
    const lineCol = c.line;
    if (mood === 'happy' || (mood === 'wink' && side === 'r')) {
      return `<path d="M${cx - 13},${cy + 4} Q${cx},${cy - 10} ${cx + 13},${cy + 4}" stroke="${lineCol}" stroke-width="4.2" fill="none" stroke-linecap="round"/>`;
    }
    if (mood === 'sleepy') {
      return `<path d="M${cx - 13},${cy} Q${cx},${cy + 10} ${cx + 13},${cy}" stroke="${lineCol}" stroke-width="4.2" fill="none" stroke-linecap="round"/>`;
    }
    const pupilR = mood === 'surprised' ? 5 : mood === 'worried' ? 7.5 : 9.5;
    return `<g>
      <circle cx="${cx}" cy="${cy}" r="14.8" fill="${c.eyeRing}"/>
      <circle cx="${cx}" cy="${cy}" r="13" fill="url(#${c.id}-eye)"/>
      <ellipse cx="${cx}" cy="${cy + 0.5}" rx="${pupilR}" ry="${pupilR + 0.8}" fill="${dark}"/>
      <circle cx="${cx - 4.2}" cy="${cy - 5}" r="3.9" fill="#fff"/>
      <circle cx="${cx + 4.5}" cy="${cy + 4.2}" r="1.7" fill="#fff" opacity=".85"/>
    </g>`;
  }

  function face(o, c, mood) {
    const P = [];
    const dog = o.species === 'dog';
    // muzzle
    P.push(`<ellipse cx="${dog ? 90 : 91}" cy="107" rx="${dog ? 14 : 11.5}" ry="${dog ? 11 : 9}" fill="${c.furLight}"/>`);
    P.push(`<ellipse cx="${dog ? 110 : 109}" cy="107" rx="${dog ? 14 : 11.5}" ry="${dog ? 11 : 9}" fill="${c.furLight}"/>`);
    P.push(`<ellipse cx="100" cy="117" rx="9" ry="5.5" fill="${c.furLight}"/>`);
    // blush
    P.push(`<ellipse cx="59" cy="104" rx="9" ry="5" fill="#F4929B" opacity="${mood === 'happy' || mood === 'wink' ? 0.55 : 0.32}"/>`);
    P.push(`<ellipse cx="141" cy="104" rx="9" ry="5" fill="#F4929B" opacity="${mood === 'happy' || mood === 'wink' ? 0.55 : 0.32}"/>`);
    // eyes
    P.push(eye(76, 80, c, mood, 'l'));
    P.push(eye(124, 80, c, mood, 'r'));
    // brows for worried
    if (mood === 'worried') {
      P.push(`<path d="M62,64 L86,58" stroke="${c.line}" stroke-width="3" stroke-linecap="round"/><path d="M138,64 L114,58" stroke="${c.line}" stroke-width="3" stroke-linecap="round"/>`);
      P.push(`<path d="M152,44 C148,52 146,56 150,59 C154,62 158,58 157,54 C156,50 153,47 152,44 Z" fill="#7EC8F2" stroke="#4A9BCB" stroke-width="1.2"/>`);
    }
    // nose
    if (dog) {
      P.push(`<ellipse cx="100" cy="98" rx="9" ry="6.5" fill="${c.nose}"/><ellipse cx="97" cy="96" rx="2.6" ry="1.6" fill="#fff" opacity=".5"/>`);
    } else {
      P.push(`<path d="M93,95.5 Q100,91.5 107,95.5 Q104.5,101.5 100,103.5 Q95.5,101.5 93,95.5 Z" fill="${c.nose}" stroke="${shade(c.nose, -0.25)}" stroke-width="1"/>`);
    }
    // mouth
    const m = c.line;
    if (mood === 'happy' || mood === 'wink') {
      P.push(`<path d="M92,108 Q100,123 108,108 Z" fill="#C6505C" stroke="${m}" stroke-width="1.6" stroke-linejoin="round"/>`);
      P.push(`<path d="M96,113 Q100,118 104,113" fill="#F08A96"/>`);
    } else if (mood === 'surprised') {
      P.push(`<ellipse cx="100" cy="112" rx="4.5" ry="5.5" fill="#C6505C" stroke="${m}" stroke-width="1.6"/>`);
    } else if (mood === 'worried') {
      P.push(`<path d="M91,113 Q95.5,109 100,113 Q104.5,117 109,113" stroke="${m}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
    } else {
      P.push(`<path d="M100,103.5 Q99.5,110.5 92.5,111.5 M100,103.5 Q100.5,110.5 107.5,111.5" stroke="${m}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
    }
    // whiskers
    const w = c.whisker;
    P.push(`<g stroke="${w}" stroke-width="1.3" stroke-linecap="round" opacity=".95">
      <path d="M82,105 L38,97"/><path d="M82,109 L36,110"/><path d="M83,113 L40,122"/>
      <path d="M118,105 L162,97"/><path d="M118,109 L164,110"/><path d="M117,113 L160,122"/>
    </g>`);
    return P.join('');
  }

  function bell(x, y, c) {
    return `<g>
      <circle cx="${x}" cy="${y}" r="9.5" fill="url(#${c.id}-gold)" stroke="${shade(c.gold, -0.45)}" stroke-width="1.8"/>
      <path d="M${x - 9},${y - 1} L${x + 9},${y - 1}" stroke="${shade(c.gold, -0.45)}" stroke-width="1.6"/>
      <circle cx="${x}" cy="${y + 4}" r="2.2" fill="${shade(c.gold, -0.55)}"/>
      <circle cx="${x - 3.5}" cy="${y - 4.5}" r="2" fill="#fff" opacity=".7"/>
    </g>`;
  }

  function koban(x, y, c, scale) {
    const s = scale || 1;
    const dk = shade(c.gold, -0.45);
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <ellipse cx="0" cy="0" rx="19" ry="27" fill="url(#${c.id}-gold)" stroke="${dk}" stroke-width="2.4"/>
      <ellipse cx="0" cy="0" rx="14" ry="21.5" fill="none" stroke="${dk}" stroke-width="1.2" opacity=".6"/>
      <text x="0" y="-3" text-anchor="middle" font-size="12" font-weight="700" fill="${dk}" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif">千</text>
      <text x="0" y="13" text-anchor="middle" font-size="12" font-weight="700" fill="${dk}" font-family="'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif">両</text>
      <path d="M-11,-16 Q-14,-4 -11,10" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".55"/>
    </g>`;
  }

  function paw(cx, cy, r, c) {
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.fur}" stroke="${c.line}" stroke-width="2.4"/>
      <ellipse cx="${cx}" cy="${cy + r * 0.28}" rx="${r * 0.4}" ry="${r * 0.32}" fill="${c.earInner}"/>
      <circle cx="${cx - r * 0.45}" cy="${cy - r * 0.28}" r="${r * 0.17}" fill="${c.earInner}"/>
      <circle cx="${cx}" cy="${cy - r * 0.46}" r="${r * 0.17}" fill="${c.earInner}"/>
      <circle cx="${cx + r * 0.45}" cy="${cy - r * 0.28}" r="${r * 0.17}" fill="${c.earInner}"/>`;
  }

  function sparkles(c) {
    const star = (x, y, s) => `<path transform="translate(${x} ${y}) scale(${s})" d="M0,-10 C1.5,-3 3,-1.5 10,0 C3,1.5 1.5,3 0,10 C-1.5,3 -3,1.5 -10,0 C-3,-1.5 -1.5,-3 0,-10 Z" fill="${c.gold}"/>`;
    return star(168, 30, 0.9) + star(186, 56, 0.55) + star(24, 44, 0.6);
  }

  function zzz(c) {
    return `<g fill="${c.line}" font-family="Arial Rounded MT Bold,Arial,sans-serif" font-weight="700" opacity=".7">
      <text x="150" y="44" font-size="16">z</text><text x="163" y="30" font-size="12">z</text><text x="173" y="19" font-size="9">z</text></g>`;
  }

  /* ---------- main builder ---------- */
  function colours(o) {
    const id = 'nk' + (++uid).toString(36) + Math.random().toString(36).slice(2, 6);
    const light = luminance(o.fur) > 0.55;
    return {
      id,
      fur: o.fur,
      furEdge: shade(o.fur, -0.08),
      furLight: o.furLight,
      stripe: o.stripe,
      floppy: o.pattern === 'solid' ? shade(o.fur, -0.14) : o.stripe,
      eye: o.eye,
      eyeRing: shade(o.eye, -0.45),
      nose: o.nose,
      earInner: o.earInner,
      collar: o.collar,
      gold: o.gold,
      line: shade(o.fur, light ? -0.6 : -0.5),
      whisker: light ? shade(o.fur, -0.35) : '#FFFFFF',
    };
  }

  function defs(c) {
    return `<defs>
      <radialGradient id="${c.id}-fur" gradientUnits="userSpaceOnUse" cx="96" cy="70" r="120">
        <stop offset="0" stop-color="${shade(c.fur, 0.16)}"/><stop offset=".55" stop-color="${c.fur}"/><stop offset="1" stop-color="${shade(c.fur, -0.2)}"/>
      </radialGradient>
      <radialGradient id="${c.id}-eye" cx=".45" cy=".4" r=".7">
        <stop offset="0" stop-color="${shade(c.eye, 0.35)}"/><stop offset=".6" stop-color="${c.eye}"/><stop offset="1" stop-color="${shade(c.eye, -0.3)}"/>
      </radialGradient>
      <linearGradient id="${c.id}-gold" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${shade(c.gold, 0.45)}"/><stop offset=".5" stop-color="${c.gold}"/><stop offset="1" stop-color="${shade(c.gold, -0.25)}"/>
      </linearGradient>
    </defs>`;
  }

  function build(opts) {
    const o = Object.assign({}, MIT, opts || {});
    if (!o.ears) o.ears = SPECIES_EARS[o.species] || 'pointy';
    const pose = o.pose || 'maneki';
    const mood = o.mood || 'normal';
    const c = colours(o);
    const longEars = o.ears === 'long';
    let vb;
    if (pose === 'head') vb = longEars ? [2, -50, 196, 196] : [10, -10, 180, 180];
    else vb = longEars ? [-8, -42, 216, 268] : [0, 0, 200, 226];

    const P = [defs(c)];
    let clipOpen = '';

    if (o.bg) {
      const cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2, r = Math.min(vb[2], vb[3]) / 2;
      P.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${o.bg}"/>`);
      if (pose === 'head') {
        P.push(`<clipPath id="${c.id}-clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath>`);
        clipOpen = `<g clip-path="url(#${c.id}-clip)">`;
        P.push(clipOpen);
      }
    }

    const furFill = `url(#${c.id}-fur)`;

    if (pose === 'maneki') {
      // tail curling behind
      P.push(`<path d="M150,206 C178,204 188,180 176,160" stroke="${c.line}" stroke-width="16" fill="none" stroke-linecap="round"/>`);
      P.push(`<path d="M150,206 C178,204 188,180 176,160" stroke="${c.fur}" stroke-width="11.5" fill="none" stroke-linecap="round"/>`);
      if (o.pattern === 'tabby' || o.pattern === 'pointed') {
        P.push(`<g stroke="${c.stripe}" stroke-width="3" stroke-linecap="round" opacity=".85"><path d="M172,196 L180,201"/><path d="M180,182 L188,183"/><path d="M178,168 L186,165"/></g>`);
      }
      // body
      P.push(`<path d="M46,206 C40,160 54,128 100,124 C146,128 160,160 154,206 C154,214 148,219 140,219 L60,219 C52,219 46,214 46,206 Z" fill="${furFill}" stroke="${c.line}" stroke-width="2.4"/>`);
      P.push(`<ellipse cx="100" cy="178" rx="36" ry="34" fill="${c.furLight}"/>`);
      if (o.pattern === 'tabby') {
        P.push(`<g stroke="${c.stripe}" stroke-width="3.2" stroke-linecap="round" fill="none" opacity=".75">
          <path d="M50,168 Q58,162 64,170"/><path d="M49,184 Q57,178 64,186"/><path d="M52,199 Q58,195 64,201"/>
          <path d="M150,168 Q142,162 136,170"/><path d="M151,184 Q143,178 136,186"/><path d="M148,199 Q142,195 136,201"/>
          <path d="M90,166 Q100,170 110,166" opacity=".35"/><path d="M88,182 Q100,187 112,182" opacity=".35"/></g>`);
      } else if (o.pattern === 'spotted') {
        P.push(`<g fill="${c.stripe}" opacity=".7"><ellipse cx="58" cy="176" rx="8" ry="6"/><ellipse cx="146" cy="190" rx="7" ry="6"/></g>`);
      }
      // feet
      const foot = (x) => `<ellipse cx="${x}" cy="213" rx="17" ry="9.5" fill="${o.pattern === 'pointed' ? c.stripe : c.furLight}" stroke="${c.line}" stroke-width="2.2"/>
        <path d="M${x - 5},207 L${x - 5},212 M${x + 5},207 L${x + 5},212" stroke="${c.line}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`;
      P.push(foot(74), foot(126));
      // collar
      P.push(`<path d="M50,124 Q100,152 150,124 L152,137 Q100,166 48,137 Z" fill="${c.collar}" stroke="${shade(c.collar, -0.35)}" stroke-width="1.8"/>`);
    } else {
      // head pose: small shoulders + collar
      P.push(`<path d="M46,190 C46,140 70,124 100,124 C130,124 154,140 154,190 Z" fill="${furFill}" stroke="${c.line}" stroke-width="2.4"/>`);
      P.push(`<path d="M56,126 Q100,150 144,126 L146,138 Q100,162 54,138 Z" fill="${c.collar}" stroke="${shade(c.collar, -0.35)}" stroke-width="1.8"/>`);
    }

    // ears behind the head
    const eb = earsBack(o, c);
    if (eb) P.push(eb, mirror(eb));

    // head with chubby cheeks
    P.push(`<path d="M100,23 C142,23 165,48 165,80 C167,98 162,112 150,122 C138,132 120,136 100,136 C80,136 62,132 50,122 C38,112 33,98 35,80 C35,48 58,23 100,23 Z" fill="${furFill}" stroke="${c.line}" stroke-width="2.4"/>`);
    P.push(headPattern(o, c));

    const ef = earsFront(o, c);
    if (ef) P.push(ef, mirror(ef));

    P.push(face(o, c, mood));

    if (pose === 'maneki') {
      P.push(bell(100, 151, c));
      // koban held against chest
      P.push(koban(132, 180, c));
      P.push(`<ellipse cx="115" cy="170" rx="12.5" ry="11.5" fill="${c.fur}" stroke="${c.line}" stroke-width="2.2"/>
        <path d="M110,163 L110,169 M116,162 L116,168" stroke="${c.line}" stroke-width="1.5" stroke-linecap="round" opacity=".6"/>`);
      // raised beckoning paw (animatable)
      const arm = [];
      arm.push(`<path d="M64,152 C52,142 42,126 36,108" stroke="${c.line}" stroke-width="27" fill="none" stroke-linecap="round"/>`);
      arm.push(`<path d="M64,152 C52,142 42,126 36,108" stroke="${c.fur}" stroke-width="22" fill="none" stroke-linecap="round"/>`);
      if (o.pattern === 'tabby') {
        arm.push(`<g stroke="${c.stripe}" stroke-width="3" stroke-linecap="round" opacity=".8"><path d="M40,134 L51,127"/><path d="M47,144 L57,136"/><path d="M36,122 L46,117"/></g>`);
      }
      arm.push(paw(34, 97, 15.5, c));
      P.push(`<g class="nk-arm">${arm.join('')}</g>`);
    } else {
      P.push(bell(100, 148, c));
    }

    if (mood === 'happy' || mood === 'wink') P.push(sparkles(c));
    if (mood === 'sleepy') P.push(zzz(c));
    if (clipOpen) P.push('</g>');

    return { vb, inner: P.join('') };
  }

  function svg(opts) {
    opts = opts || {};
    const b = build(opts);
    const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
    const cls = opts.className ? ` class="${opts.className}"` : '';
    const label = (opts.name || MIT.name) + ' the maneki-neko';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.vb.join(' ')}"${size}${cls} role="img" aria-label="${label}">${b.inner}</svg>`;
  }

  // App icon: the character on a rounded, sun-rayed tile.
  function icon(opts) {
    opts = Object.assign({}, opts || {});
    const bg = opts.iconBg || '#D7263D';
    const gold = opts.gold || MIT.gold;
    const b = build(Object.assign({}, opts, { pose: 'maneki', bg: null }));
    const rays = [];
    for (let i = 0; i < 16; i++) {
      const a1 = (i / 16) * Math.PI * 2, a2 = a1 + Math.PI / 16;
      rays.push(`M256,300 L${(256 + Math.cos(a1) * 420).toFixed(1)},${(300 + Math.sin(a1) * 420).toFixed(1)} L${(256 + Math.cos(a2) * 420).toFixed(1)},${(300 + Math.sin(a2) * 420).toFixed(1)} Z`);
    }
    const id = 'ic' + (++uid).toString(36);
    const radius = opts.maskable ? 0 : 112;
    const inset = opts.maskable ? 84 : 54;
    const w = 512 - inset * 2;
    const h = w * (b.vb[3] / b.vb[2]);
    const size = opts.size ? ` width="${opts.size}" height="${opts.size}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"${size} role="img" aria-label="Maneki-Neko app icon">
      <defs>
        <radialGradient id="${id}-bg" cx=".5" cy=".55" r=".75"><stop offset="0" stop-color="${shade(bg, 0.18)}"/><stop offset="1" stop-color="${shade(bg, -0.28)}"/></radialGradient>
        <clipPath id="${id}-clip"><rect width="512" height="512" rx="${radius}"/></clipPath>
      </defs>
      <g clip-path="url(#${id}-clip)">
        <rect width="512" height="512" fill="url(#${id}-bg)"/>
        <path d="${rays.join(' ')}" fill="${gold}" opacity=".16"/>
        <circle cx="256" cy="300" r="190" fill="${gold}" opacity=".22"/>
        <circle cx="256" cy="300" r="190" fill="none" stroke="${gold}" stroke-width="6" opacity=".6"/>
        <svg x="${inset}" y="${512 - h - (opts.maskable ? 60 : 18)}" width="${w}" height="${h}" viewBox="${b.vb.join(' ')}">${b.inner}</svg>
      </g>
      ${radius ? `<rect x="5" y="5" width="502" height="502" rx="${radius - 5}" fill="none" stroke="${gold}" stroke-width="10"/>` : ''}
    </svg>`;
  }

  function coin(size) {
    const c = colours(MIT);
    const s = size ? ` width="${size}" height="${size}"` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-24 -30 48 60"${s} role="img" aria-label="Koban coin">${defs(c)}${koban(0, 0, c)}</svg>`;
  }

  function toDataURL(svgString) {
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  }

  root.Neko = { MIT, SPECIES_EARS, svg, icon, coin, toDataURL, util: { hexToRgb, rgbToHex, mix, shade, luminance } };
})(typeof window !== 'undefined' ? window : globalThis);
