/* Leeway embroidery studio — shared core.
   Plain scripts (no modules) so index.html works when opened straight from disk. */
window.LW = window.LW || {};
(function (LW) {
  'use strict';

  // ---------- constants ----------
  LW.MM_PER_PT = 25.4 / 72;

  // Shirt photo geometry (cm). Origin = centre front, y = 0 at the high point of shoulder (HPS).
  LW.SHIRT = {
    name: 'Stanley/Stella Blaster 2.0 · size M',
    chest: 67, length: 75, sleeve: 24.5,
    img: { x: -56, y: -3, w: 112, h: 80.5 },
    neckCF: 9, // centre-front neckline seam, cm below HPS
    baseLum: 0.355, // luminance of the Mocha photo (for re-tinting)
  };

  // Blaster 2.0 colourways (sampled from size_guide.pdf)
  LW.SHIRT_COLORS = [
    { name: 'Mocha (photo)', hex: '#6c524b', photo: true },
    { name: 'Black', hex: '#2e2e2e' }, { name: 'French Navy', hex: '#262535' },
    { name: 'Dusk', hex: '#434671' }, { name: 'Khaki', hex: '#57574d' },
    { name: 'Stone', hex: '#aca99a' }, { name: 'Violet', hex: '#a1a5c8' },
    { name: 'Pink Joy', hex: '#d58c9d' }, { name: 'Cream', hex: '#efe8d5' },
    { name: 'Natural Raw', hex: '#fcf3de' }, { name: 'White', hex: '#f5f5f5' },
  ];

  // Thread colours — approximate screen colours, check against your real thread chart.
  LW.THREADS = [
    ['Ecru', '#efe6cf'], ['Snow', '#f7f5ef'], ['Cream', '#f1e3b8'], ['Butter', '#f2d77a'],
    ['Acid yellow', '#f2e600'], ['Mustard', '#d9a62e'], ['Orange', '#e07a2e'], ['Rust', '#a8482a'],
    ['Terracotta', '#c0634a'], ['Pink', '#e8a5b4'], ['Red', '#b8282e'], ['Burgundy', '#6e1f2b'],
    ['Lilac', '#b8a6d1'], ['Sky', '#9cc3e0'], ['Cobalt', '#2d4f9e'], ['Navy', '#1f2a44'],
    ['Mint', '#a8d5ba'], ['Sage', '#8e9e7a'], ['Olive', '#6b6a2f'], ['Forest', '#2f4a32'],
    ['Sand', '#c9b48f'], ['Taupe', '#8c7b6b'], ['Chocolate', '#3e2a22'], ['Grey', '#9a9a96'],
    ['Charcoal', '#3b3b3b'], ['Black', '#141414'],
  ].map(([name, hex]) => ({ name, hex }));

  // Embroidery fields of the two hoops (cm)
  LW.HOOPS = {
    none: { label: 'No hoop', w: 0, h: 0 },
    h10: { label: '10 × 10 cm', w: 10, h: 10 },
    h235p: { label: '10 × 23.5 cm · portrait', w: 10, h: 23.5 },
    h235l: { label: '23.5 × 10 cm · landscape', w: 23.5, h: 10 },
  };

  // ---------- small helpers ----------
  LW.uid = (p = 'id') => p + '_' + Math.random().toString(36).slice(2, 9);
  LW.$ = (s, r = document) => r.querySelector(s);
  LW.$$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  LW.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  LW.fmt = (n, d = 3) => {
    const s = (+n).toFixed(d);
    return s.indexOf('.') >= 0 ? s.replace(/0+$/, '').replace(/\.$/, '').replace(/^-0$/, '0') : s;
  };
  LW.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  LW.hexToRgb = (h) => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  LW.lum = (hex) => { const [r, g, b] = LW.hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  LW.slug = (s) => String(s || 'design').trim().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'design';

  LW.store = {
    get(k, d) { try { const v = localStorage.getItem('leeway.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('leeway.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  LW.download = (name, data, type = 'application/octet-stream') => {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  LW.readFile = (file, as = 'text') => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result); r.onerror = rej;
    as === 'dataURL' ? r.readAsDataURL(file) : r.readAsText(file);
  });
  LW.loadImage = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });

  let toastT;
  LW.toast = (msg, kind = '') => {
    let t = LW.$('#toast');
    t.textContent = msg; t.className = 'show ' + kind;
    clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), 2600);
  };

  // Rasterise an SVG string to PNG and download it
  LW.svgToPng = async (svg, wPx, hPx, name, bg) => {
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const img = await LW.loadImage(url);
    const c = document.createElement('canvas'); c.width = wPx; c.height = hPx;
    const ctx = c.getContext('2d');
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, wPx, hPx); }
    ctx.drawImage(img, 0, 0, wPx, hPx);
    c.toBlob((b) => LW.download(name, b), 'image/png');
  };

  // Colour swatch row + custom picker. onPick(hex)
  LW.swatches = (el, colors, current, onPick) => {
    el.innerHTML = '';
    el.classList.add('swatches');
    colors.forEach((c) => {
      const b = document.createElement('button');
      b.className = 'sw' + (c.hex.toLowerCase() === (current || '').toLowerCase() ? ' on' : '');
      b.style.background = c.hex; b.title = c.name; b.type = 'button';
      b.onclick = () => { onPick(c.hex, c); LW.$$('.sw', el).forEach((x) => x.classList.remove('on')); b.classList.add('on'); };
      el.appendChild(b);
    });
    const lab = document.createElement('label');
    lab.className = 'sw sw-custom'; lab.title = 'Custom colour';
    const inp = document.createElement('input'); inp.type = 'color'; inp.value = current && current.length === 7 ? current : '#efe6cf';
    inp.oninput = () => { onPick(inp.value, { name: inp.value }); LW.$$('.sw', el).forEach((x) => x.classList.remove('on')); lab.classList.add('on'); };
    lab.appendChild(inp); el.appendChild(lab);
  };

  // ---------- SVG path transform (uniform scale + translate), output absolute ----------
  const PARAMS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  LW.transformPath = (d, s, tx, ty) => {
    const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) || [];
    const f = (v) => LW.fmt(v, 3);
    const X = (x) => f(x * s + tx), Y = (y) => f(y * s + ty);
    let out = [], i = 0, cmd = null, cx = 0, cy = 0, sx = 0, sy = 0;
    while (i < tokens.length) {
      let t = tokens[i];
      if (/[a-zA-Z]/.test(t)) { cmd = t; i++; if (cmd === 'Z' || cmd === 'z') { out.push('Z'); cx = sx; cy = sy; continue; } }
      else if (!cmd) { i++; continue; }
      const U = cmd.toUpperCase(), rel = cmd !== U, n = PARAMS[U];
      const p = tokens.slice(i, i + n).map(Number); i += n;
      if (p.length < n) break;
      const ax = (v) => (rel ? cx + v : v), ay = (v) => (rel ? cy + v : v);
      switch (U) {
        case 'M': cx = ax(p[0]); cy = ay(p[1]); sx = cx; sy = cy; out.push('M' + X(cx) + ' ' + Y(cy)); cmd = rel ? 'l' : 'L'; break;
        case 'L': cx = ax(p[0]); cy = ay(p[1]); out.push('L' + X(cx) + ' ' + Y(cy)); break;
        case 'H': cx = rel ? cx + p[0] : p[0]; out.push('L' + X(cx) + ' ' + Y(cy)); break;
        case 'V': cy = rel ? cy + p[0] : p[0]; out.push('L' + X(cx) + ' ' + Y(cy)); break;
        case 'C': { const a = [ax(p[0]), ay(p[1]), ax(p[2]), ay(p[3]), ax(p[4]), ay(p[5])]; out.push('C' + X(a[0]) + ' ' + Y(a[1]) + ' ' + X(a[2]) + ' ' + Y(a[3]) + ' ' + X(a[4]) + ' ' + Y(a[5])); cx = a[4]; cy = a[5]; break; }
        case 'S': { const a = [ax(p[0]), ay(p[1]), ax(p[2]), ay(p[3])]; out.push('S' + X(a[0]) + ' ' + Y(a[1]) + ' ' + X(a[2]) + ' ' + Y(a[3])); cx = a[2]; cy = a[3]; break; }
        case 'Q': { const a = [ax(p[0]), ay(p[1]), ax(p[2]), ay(p[3])]; out.push('Q' + X(a[0]) + ' ' + Y(a[1]) + ' ' + X(a[2]) + ' ' + Y(a[3])); cx = a[2]; cy = a[3]; break; }
        case 'T': cx = ax(p[0]); cy = ay(p[1]); out.push('T' + X(cx) + ' ' + Y(cy)); break;
        case 'A': { const ex = ax(p[5]), ey = ay(p[6]); out.push('A' + f(p[0] * s) + ' ' + f(p[1] * s) + ' ' + p[2] + ' ' + p[3] + ' ' + p[4] + ' ' + X(ex) + ' ' + Y(ey)); cx = ex; cy = ey; break; }
      }
    }
    return out.join('');
  };

  // ---------- grid contour tracing (pixel art -> clean outlines) ----------
  // filled(i, j) -> bool. Returns polygons in cell units (array of [x,y]).
  LW.gridContours = (filled, cols, rows) => {
    const edges = new Map();
    const add = (x1, y1, x2, y2) => { const k = x1 + ',' + y1; let l = edges.get(k); if (!l) edges.set(k, (l = [])); l.push([x2, y2]); };
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      if (!filled(i, j)) continue;
      if (!filled(i, j - 1)) add(i, j, i + 1, j);
      if (!filled(i + 1, j)) add(i + 1, j, i + 1, j + 1);
      if (!filled(i, j + 1)) add(i + 1, j + 1, i, j + 1);
      if (!filled(i - 1, j)) add(i, j + 1, i, j);
    }
    const polys = [];
    for (const [k, list] of edges) {
      while (list.length) {
        const start = k.split(',').map(Number);
        let nxt = list.pop(), dir = [nxt[0] - start[0], nxt[1] - start[1]], cur = nxt;
        const pts = [start];
        let guard = 0;
        while (!(cur[0] === start[0] && cur[1] === start[1]) && guard++ < 1e6) {
          pts.push(cur);
          const l = edges.get(cur[0] + ',' + cur[1]);
          if (!l || !l.length) break;
          let idx = 0;
          if (l.length > 1) { const r = [-dir[1], dir[0]]; idx = l.findIndex((e) => e[0] - cur[0] === r[0] && e[1] - cur[1] === r[1]); if (idx < 0) idx = 0; }
          const e = l.splice(idx, 1)[0];
          dir = [e[0] - cur[0], e[1] - cur[1]]; cur = e;
        }
        // drop collinear points
        const out = [];
        for (let n = 0; n < pts.length; n++) {
          const a = pts[(n - 1 + pts.length) % pts.length], b = pts[n], c = pts[(n + 1) % pts.length];
          if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) !== 0) out.push(b);
        }
        if (out.length > 2) polys.push(out);
      }
    }
    return polys;
  };
  LW.polysToPath = (polys, s = 1, tx = 0, ty = 0) =>
    polys.map((p) => 'M' + p.map((q) => LW.fmt(q[0] * s + tx) + ' ' + LW.fmt(q[1] * s + ty)).join('L') + 'Z').join('');

  // ---------- smoothing for freehand strokes ----------
  LW.simplify = (pts, eps) => { // Ramer–Douglas–Peucker
    if (pts.length < 3) return pts.slice();
    const sq = (p, a, b) => {
      let x = a[0], y = a[1], dx = b[0] - x, dy = b[1] - y;
      if (dx || dy) { const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy); if (t > 1) { x = b[0]; y = b[1]; } else if (t > 0) { x += dx * t; y += dy * t; } }
      dx = p[0] - x; dy = p[1] - y; return dx * dx + dy * dy;
    };
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
      const [a, b] = stack.pop(); let m = -1, md = eps * eps;
      for (let i = a + 1; i < b; i++) { const d = sq(pts[i], pts[a], pts[b]); if (d > md) { md = d; m = i; } }
      if (m > 0) { keep[m] = 1; stack.push([a, m], [m, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  // Catmull-Rom -> cubic Bézier path
  LW.smoothPath = (pts, s = 1, tx = 0, ty = 0) => {
    const P = pts.map((p) => [p[0] * s + tx, p[1] * s + ty]), f = (v) => LW.fmt(v, 3);
    if (!P.length) return '';
    if (P.length === 1) return `M${f(P[0][0])} ${f(P[0][1])}l0.001 0`;
    let d = `M${f(P[0][0])} ${f(P[0][1])}`;
    if (P.length === 2) return d + `L${f(P[1][0])} ${f(P[1][1])}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
  };

  // ---------- SVG wrapper for exports (true size in mm) ----------
  LW.svgDoc = (wMm, hMm, body, title = 'Leeway design') =>
    `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${LW.fmt(wMm)}mm" height="${LW.fmt(hMm)}mm" viewBox="0 0 ${LW.fmt(wMm)} ${LW.fmt(hMm)}">\n<title>${LW.esc(title)}</title>\n${body}\n</svg>\n`;

  // ---------- SVG normaliser: any SVG -> {inner, w, h} in mm, ink = currentColor ----------
  let sandbox;
  const unitToMm = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, pc: 25.4 / 6, px: 25.4 / 72, '': 25.4 / 72 };
  const SHAPES = 'path,rect,circle,ellipse,polygon,polyline,line,text,tspan,textPath,use';
  LW.normalizeSVG = (text, idPrefix) => {
    if (!sandbox) {
      sandbox = document.createElement('div');
      sandbox.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px;overflow:hidden;opacity:0;pointer-events:none;z-index:-1';
      document.body.appendChild(sandbox);
    }
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const src = doc.documentElement;
    if (!src || src.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Not a valid SVG file');
    const svg = document.importNode(src, true);
    sandbox.innerHTML = '';
    sandbox.appendChild(svg);

    // unit scale (mm per user unit)
    const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    let mmPerUnit = LW.MM_PER_PT;
    const wAttr = svg.getAttribute('width');
    if (wAttr && vb.length === 4 && vb[2] > 0) {
      const m = wAttr.match(/^([\d.]+)\s*([a-z%]*)$/i);
      if (m && m[2] !== '%') mmPerUnit = (parseFloat(m[1]) * (unitToMm[m[2].toLowerCase()] ?? LW.MM_PER_PT)) / vb[2];
    } else if (wAttr && !(vb.length === 4)) {
      const m = wAttr.match(/^([\d.]+)\s*([a-z]*)$/i);
      if (m) mmPerUnit = unitToMm[m[2].toLowerCase()] ?? LW.MM_PER_PT;
    }

    // bake computed colours, classify ink / paper(white)
    let maxStroke = 0;
    const els = Array.from(svg.querySelectorAll(SHAPES));
    const baked = els.map((el) => {
      const cs = getComputedStyle(el);
      const o = { el, fill: cs.fill, stroke: cs.stroke, sw: parseFloat(cs.strokeWidth) || 0 };
      if (/^(text|tspan|textPath)$/.test(el.nodeName)) {
        o.font = { family: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, style: cs.fontStyle, ls: cs.letterSpacing };
      }
      o.lc = cs.strokeLinecap; o.lj = cs.strokeLinejoin; o.fr = cs.fillRule; o.op = cs.opacity;
      return o;
    });
    const cls = (c) => {
      if (!c || c === 'none' || c === 'transparent') return 'none';
      if (c.startsWith('url')) return 'ink';
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return 'ink';
      const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x));
      if (a === 0) return 'none';
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.82 ? 'paper' : 'ink';
    };
    const colorVal = (k) => (k === 'ink' ? 'currentColor' : k === 'paper' ? 'var(--lw-paper,#ffffff)' : 'none');
    let hasPaper = false;
    // a design drawn only in light colours (e.g. cream thread) has no dark ink: treat light as ink
    const anyInk = baked.some((o) => cls(o.fill) === 'ink' || cls(o.stroke) === 'ink');
    const kind = (c) => { const k = cls(c); return k === 'paper' && !anyInk ? 'ink' : k; };
    baked.forEach((o) => {
      const el = o.el, fk = kind(o.fill), sk = kind(o.stroke);
      if (fk === 'paper' || sk === 'paper') hasPaper = true;
      el.removeAttribute('class');
      let st = `fill:${colorVal(fk)};stroke:${colorVal(sk)};`;
      if (sk !== 'none') { st += `stroke-width:${o.sw};stroke-linecap:${o.lc};stroke-linejoin:${o.lj};`; maxStroke = Math.max(maxStroke, o.sw); }
      if (o.fr === 'evenodd') st += 'fill-rule:evenodd;';
      if (o.font) st += `font-family:${o.font.family};font-size:${o.font.size};font-weight:${o.font.weight};font-style:${o.font.style};letter-spacing:${o.font.ls};`;
      el.setAttribute('style', st);
      ['fill', 'stroke', 'stroke-width'].forEach((a) => el.removeAttribute(a));
    });
    svg.querySelectorAll('style,script,title,desc,metadata').forEach((n) => n.remove());
    svg.querySelectorAll('[class]').forEach((n) => n.removeAttribute('class'));

    // unique ids
    if (idPrefix) {
      const ids = Array.from(svg.querySelectorAll('[id]'));
      const map = {};
      ids.forEach((n) => { const nid = idPrefix + '_' + n.id; map[n.id] = nid; n.id = nid; });
      if (ids.length) {
        svg.querySelectorAll('*').forEach((n) => {
          for (const a of Array.from(n.attributes)) {
            let v = a.value, nv = v.replace(/url\(#([^)]+)\)/g, (m, id) => (map[id] ? `url(#${map[id]})` : m));
            if ((a.name === 'href' || a.name === 'xlink:href') && v[0] === '#' && map[v.slice(1)]) nv = '#' + map[v.slice(1)];
            if (nv !== v) n.setAttribute(a.name, nv);
          }
        });
      }
    }

    // wrap content & measure
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    while (svg.firstChild) g.appendChild(svg.firstChild);
    svg.appendChild(g);
    let bb;
    try { bb = g.getBBox(); } catch (e) { bb = { x: 0, y: 0, width: vb[2] || 100, height: vb[3] || 100 }; }
    if (!bb.width || !bb.height) throw new Error('The SVG looks empty');
    const pad = maxStroke / 2;
    const bx = bb.x - pad, by = bb.y - pad, bw = bb.width + 2 * pad, bh = bb.height + 2 * pad;
    const inner = `<g transform="scale(${LW.fmt(mmPerUnit, 6)}) translate(${LW.fmt(-bx, 4)} ${LW.fmt(-by, 4)})">${g.innerHTML}</g>`;
    const hasText = !!g.querySelector('text');
    sandbox.innerHTML = '';
    return { inner, w: bw * mmPerUnit, h: bh * mmPerUnit, hasPaper, hasText };
  };

  // Resolve colours of a normalised design for export / thumbnails
  LW.resolveInner = (inner, color, paper) =>
    inner.replace(/currentColor/g, color).replace(/var\(--lw-paper,#ffffff\)/g, paper == null ? 'none' : paper);

  // ---------- design library (shared by all three tools) ----------
  const lib = { items: [], subs: [] };
  LW.library = lib;
  lib.onChange = (fn) => lib.subs.push(fn);
  lib.emit = () => lib.subs.forEach((fn) => fn(lib.items));
  lib.get = (id) => lib.items.find((d) => d.id === id);
  lib.ensure = (d) => {
    if (!d.norm && !d.error) {
      try { d.norm = LW.normalizeSVG(d.svg, d.id); } catch (e) { d.error = e.message; }
    }
    return d.norm;
  };
  lib.persist = () => LW.store.set('library', lib.items.filter((d) => d.source !== 'bundled').map(({ id, name, source, svg }) => ({ id, name, source, svg })));
  lib.add = (name, svg, source = 'imported', silent) => {
    const d = { id: LW.uid('d'), name, svg, source };
    lib.ensure(d);
    if (d.error) { LW.toast(`${name}: ${d.error}`, 'err'); return null; }
    lib.items.push(d);
    if (!lib.persist()) LW.toast('Saved for this session only (browser storage is full or blocked)');
    if (!silent) lib.emit();
    return d;
  };
  lib.remove = (id) => { lib.items = lib.items.filter((d) => d.id !== id); lib.persist(); lib.emit(); };
  lib.rename = (id, name) => { const d = lib.get(id); if (d) { d.name = name; lib.persist(); lib.emit(); } };
  lib.init = () => {
    (window.LW_DESIGNS || []).forEach((d) => lib.items.push({ id: d.id, name: d.name, svg: d.svg, source: 'bundled' }));
    LW.store.get('library', []).forEach((d) => lib.items.push(d));
  };

  // ---------- tabs ----------
  LW.initTabs = () => {
    const tabs = LW.$$('[data-tab]');
    const show = (name) => {
      tabs.forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
      LW.$$('.view').forEach((v) => v.classList.toggle('on', v.id === 'view-' + name));
      LW.store.set('tab', name);
      window.dispatchEvent(new CustomEvent('lw-tab', { detail: name }));
    };
    tabs.forEach((t) => (t.onclick = () => show(t.dataset.tab)));
    LW.showTab = show;
    show(LW.store.get('tab', 'mockup'));
  };

  // Generic drop zone helper
  LW.dropzone = (el, onFiles) => {
    ['dragenter', 'dragover'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.remove('drag'); }));
    el.addEventListener('drop', (e) => onFiles(Array.from(e.dataTransfer.files || [])));
  };
})(window.LW);
