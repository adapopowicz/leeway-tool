/* Draw: hoop-sized canvas with line, pixel and ASCII brushes. Everything is stored in mm as vectors. */
(function (LW) {
  'use strict';
  const $ = LW.$;
  const D = (LW.draw = {
    tool: 'line', hoop: 'h10', lw: 8, smooth: 40, px: 25, pxb: 1, pstyle: 'solid',
    ch: 60, amode: 'auto', atext: 'leeway', snap: true, alw: 5, er: 40,
    sstep: 15, slw: 6, sdiag: false, measure: null,
    grid: true, uop: 35, under: null, shirt: '#6c524b', thread: '#efe6cf',
    strokes: [], pixels: new Map(), glyphs: new Map(), seq: 0,
  });
  let cv, ctx, wrap, dpr = 1, view = { s: 4, ox: 0, oy: 0 }, cur = null, hover = null;
  const undo = [], redo = [];

  const field = () => { const H = LW.HOOPS[D.hoop]; return H.w ? { w: H.w * 10, h: H.h * 10 } : { w: 100, h: 100 }; };
  const cellW = () => (D.ch / 10) * LW.font.ASPECT, cellH = () => D.ch / 10;

  // ---------- state / history ----------
  const ser = () => JSON.stringify({ strokes: D.strokes, pixels: Array.from(D.pixels.values()), glyphs: Array.from(D.glyphs.values()) });
  const load = (s) => {
    const o = typeof s === 'string' ? JSON.parse(s) : s;
    D.strokes = o.strokes || [];
    D.pixels = new Map((o.pixels || []).map((p) => [`${p.s}|${p.i}|${p.j}`, p]));
    D.glyphs = new Map((o.glyphs || []).map((g, n) => [g.k || 'f' + n, g]));
  };
  const commit = () => { undo.push(ser()); if (undo.length > 100) undo.shift(); redo.length = 0; };
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => LW.store.set('draw', { state: JSON.parse(ser()), hoop: D.hoop }), 400); };
  D.undo = () => { if (!undo.length) return; redo.push(ser()); load(undo.pop()); render(); save(); };
  D.redo = () => { if (!redo.length) return; undo.push(ser()); load(redo.pop()); render(); save(); };
  const isEmpty = () => !D.strokes.length && !D.pixels.size && !D.glyphs.size;

  // ---------- geometry ----------
  function layout() {
    const r = wrap.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const f = field(), m = 50;
    const s = Math.max(0.5, Math.min((r.width - 2 * m) / f.w, (r.height - 2 * m) / f.h));
    view = { s, ox: (r.width - f.w * s) / 2, oy: (r.height - f.h * s) / 2 };
    render();
  }
  const toMm = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left - view.ox) / view.s, (e.clientY - r.top - view.oy) / view.s]; };

  // ---------- rendering ----------
  function drawContent(c, s, ox, oy, color) {
    c.save(); c.translate(ox, oy); c.scale(s, s);
    c.strokeStyle = c.fillStyle = color; c.lineCap = 'round'; c.lineJoin = 'round';
    D.pixels.forEach((p) => c.fillRect(p.i * p.s - 0.004, p.j * p.s - 0.004, p.s + 0.008, p.s + 0.008));
    D.strokes.forEach((st) => {
      c.lineWidth = st.w;
      if (st.t === 'stair') { c.lineJoin = 'miter'; c.lineCap = 'square'; c.stroke(new Path2D(stairPath(st.v, st.s))); c.lineJoin = 'round'; c.lineCap = 'round'; }
      else c.stroke(new Path2D(LW.smoothPath(st.pts)));
    });
    if (cur && cur.type === 'line') { c.lineWidth = D.lw / 10; c.stroke(new Path2D(LW.smoothPath(cur.pts))); }
    if (cur && cur.type === 'stair' && cur.v.length > 1) { c.lineWidth = D.slw / 10; c.lineJoin = 'miter'; c.lineCap = 'square'; c.stroke(new Path2D(stairPath(cur.v, cur.s))); }
    D.glyphs.forEach((g) => LW.font.draw(c, g.ch, g.x, g.y, g.h, g.lw));
    c.restore();
  }
  const stairPath = (v, s) => 'M' + v.map((q) => LW.fmt(q[0] * s) + ' ' + LW.fmt(q[1] * s)).join('L');
  function render() {
    if (!ctx) return;
    const W = cv.width / dpr, H = cv.height / dpr, f = field(), s = view.s;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // fabric
    ctx.fillStyle = D.shirt; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = D.shirt; ctx.fillRect(view.ox, view.oy, f.w * s, f.h * s);
    // tracing image
    if (D.under) {
      const im = D.under, k = Math.min((f.w * s) / im.naturalWidth, (f.h * s) / im.naturalHeight);
      ctx.globalAlpha = D.uop / 100;
      ctx.drawImage(im, view.ox + (f.w * s - im.naturalWidth * k) / 2, view.oy + (f.h * s - im.naturalHeight * k) / 2, im.naturalWidth * k, im.naturalHeight * k);
      ctx.globalAlpha = 1;
    }
    // grid
    if (D.grid) {
      let gx, gy;
      if (D.tool === 'pixel') gx = gy = D.px / 10;
      else if (D.tool === 'stair') gx = gy = D.sstep / 10;
      else if (D.tool === 'ascii' && D.snap) { gx = cellW(); gy = cellH(); }
      else gx = gy = 10;
      ctx.beginPath();
      for (let x = 0; x <= f.w + 1e-6; x += gx) { const X = Math.round(view.ox + x * s) + 0.5; ctx.moveTo(X, view.oy); ctx.lineTo(X, view.oy + f.h * s); }
      for (let y = 0; y <= f.h + 1e-6; y += gy) { const Y = Math.round(view.oy + y * s) + 0.5; ctx.moveTo(view.ox, Y); ctx.lineTo(view.ox + f.w * s, Y); }
      ctx.strokeStyle = gx * s < 6 ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.13)'; ctx.lineWidth = 1; ctx.stroke();
      // centre cross
      ctx.beginPath(); ctx.moveTo(view.ox + (f.w * s) / 2, view.oy); ctx.lineTo(view.ox + (f.w * s) / 2, view.oy + f.h * s);
      ctx.moveTo(view.ox, view.oy + (f.h * s) / 2); ctx.lineTo(view.ox + f.w * s, view.oy + (f.h * s) / 2);
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.stroke();
    }
    // content (clipped to field)
    ctx.save(); ctx.beginPath(); ctx.rect(view.ox, view.oy, f.w * s, f.h * s); ctx.clip();
    drawContent(ctx, s, view.ox, view.oy, D.thread);
    ctx.restore();
    // field border
    ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1;
    ctx.strokeRect(view.ox + 0.5, view.oy + 0.5, f.w * s - 1, f.h * s - 1); ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillText(`${f.w} × ${f.h} mm hoop field`, view.ox, view.oy - 8);
    // brush cursor
    if (hover) {
      const [x, y] = hover; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
      if (D.tool === 'erase') { ctx.beginPath(); ctx.arc(view.ox + x * s, view.oy + y * s, (D.er / 20) * s, 0, 7); ctx.stroke(); }
      if (D.tool === 'pixel') { const p = D.px / 10, n = D.pxb, i = Math.floor(x / p) - Math.floor((n - 1) / 2), j = Math.floor(y / p) - Math.floor((n - 1) / 2); ctx.strokeRect(view.ox + i * p * s, view.oy + j * p * s, n * p * s, n * p * s); }
      if (D.tool === 'stair') { const st = D.sstep / 10, X = view.ox + Math.round(x / st) * st * s, Y = view.oy + Math.round(y / st) * st * s; ctx.beginPath(); ctx.moveTo(X - 6, Y); ctx.lineTo(X + 6, Y); ctx.moveTo(X, Y - 6); ctx.lineTo(X, Y + 6); ctx.stroke(); }
      if (D.tool === 'ascii' && D.snap) { const cw = cellW(), chh = cellH(); ctx.strokeRect(view.ox + Math.floor(x / cw) * cw * s, view.oy + Math.floor(y / chh) * chh * s, cw * s, chh * s); }
    }
    // measurement
    if (D.measure && D.measure.b) {
      const { a, b: e } = D.measure, A = [view.ox + a[0] * s, view.oy + a[1] * s], B = [view.ox + e[0] * s, view.oy + e[1] * s];
      const len = Math.hypot(e[0] - a[0], e[1] - a[1]);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.moveTo(...A); ctx.lineTo(...B); ctx.stroke();
      ctx.lineWidth = 1.6; ctx.strokeStyle = '#f2e600'; ctx.stroke();
      [A, B].forEach((P) => { ctx.beginPath(); ctx.arc(P[0], P[1], 3, 0, 7); ctx.fillStyle = '#f2e600'; ctx.fill(); });
      const t = `${len.toFixed(1)} mm  ·  ${(len / 10).toFixed(2)} cm`;
      ctx.font = 'bold 12px ui-monospace, Menlo, monospace';
      const tw = ctx.measureText(t).width, mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2 - 14;
      ctx.fillStyle = '#f2e600'; ctx.fillRect(mx - tw / 2 - 6, my - 12, tw + 12, 18);
      ctx.fillStyle = '#1f1c1a'; ctx.fillText(t, mx - tw / 2, my + 1);
    }
    // info
    const b = bounds();
    $('#dr-info').textContent = isEmpty() ? 'empty canvas · L line · S pixel line · P pixel fill · A ASCII · E eraser · M measure · ⌘Z undo' : `design ${(b.x1 - b.x0).toFixed(1)} × ${(b.y1 - b.y0).toFixed(1)} mm · ${D.strokes.length} lines · ${D.pixels.size} pixels · ${D.glyphs.size} characters`;
  }

  function bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, r = 0) => { x0 = Math.min(x0, x - r); y0 = Math.min(y0, y - r); x1 = Math.max(x1, x + r); y1 = Math.max(y1, y + r); };
    D.strokes.forEach((st) => (st.t === 'stair' ? st.v.map((q) => [q[0] * st.s, q[1] * st.s]) : st.pts).forEach((p) => add(p[0], p[1], st.w / 2)));
    D.pixels.forEach((p) => { add(p.i * p.s, p.j * p.s); add((p.i + 1) * p.s, (p.j + 1) * p.s); });
    D.glyphs.forEach((g) => { add(g.x, g.y); add(g.x + g.h * LW.font.ASPECT, g.y + g.h); });
    return isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
  }

  // ---------- brushes ----------
  const autoChar = (dx, dy, fy) => {
    const a = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 180;
    if (a < 22.5 || a > 157.5) return fy > 0.6 ? '_' : '-';
    if (a < 67.5) return '\\';
    if (a < 112.5) return '|';
    return '/';
  };
  const textChars = () => (D.atext || '*').replace(/\s+/g, ' ');
  function nextChar(dx, dy, fy) {
    const t = textChars();
    if (D.amode === 'auto') return autoChar(dx, dy, fy);
    if (D.amode === 'one') return t.trim()[0] || '*';
    if (D.amode === 'rand') { const u = t.replace(/ /g, ''); return u[Math.floor(Math.random() * u.length)] || '*'; }
    const c = t[D.seq % t.length]; D.seq++; return c === ' ' ? nextChar(dx, dy, fy) : c; // sequence
  }
  function stampAscii(x, y, dx, dy) {
    const h = cellH(), cw = cellW(), lw = D.alw / 10;
    if (D.snap) {
      const c = Math.floor(x / cw), r = Math.floor(y / h), k = `${D.ch}|${c}|${r}`;
      if (cur.last === k) return;
      cur.last = k;
      const fy = y / h - r;
      if (D.amode !== 'auto' && D.glyphs.has(k)) return;
      D.glyphs.set(k, { k, ch: nextChar(dx, dy, fy), x: c * cw, y: r * h, h, lw });
    } else {
      const k = 'f' + LW.uid('');
      D.glyphs.set(k, { k, ch: nextChar(dx, dy, 0.5), x: x - cw / 2, y: y - h / 2, h, lw });
    }
  }
  function paintPixels(x, y) {
    const p = D.px / 10, n = D.pxb, i0 = Math.floor(x / p) - Math.floor((n - 1) / 2), j0 = Math.floor(y / p) - Math.floor((n - 1) / 2);
    for (let i = i0; i < i0 + n; i++) for (let j = j0; j < j0 + n; j++) {
      const k = `${p}|${i}|${j}`; if (!D.pixels.has(k)) D.pixels.set(k, { s: p, i, j });
    }
  }
  function erase(x, y) {
    const r = D.er / 20, r2 = r * r;
    D.pixels.forEach((p, k) => { const cx = (p.i + 0.5) * p.s, cy = (p.j + 0.5) * p.s; if ((cx - x) ** 2 + (cy - y) ** 2 < r2 + (p.s * p.s) / 4) D.pixels.delete(k); });
    D.glyphs.forEach((g, k) => { const cx = g.x + (g.h * LW.font.ASPECT) / 2, cy = g.y + g.h / 2; if ((cx - x) ** 2 + (cy - y) ** 2 < r2 + (g.h * g.h) / 9) D.glyphs.delete(k); });
    D.strokes = D.strokes.filter((st) => !(st.t === 'stair' ? st.v.map((q) => [q[0] * st.s, q[1] * st.s]) : st.pts).some((p) => (p[0] - x) ** 2 + (p[1] - y) ** 2 < r2 + (st.w * st.w) / 4));
  }
  // extend a pixel line to grid vertex (gi, gj) using only horizontal / vertical (or 45°) unit steps
  function stairTo(gi, gj) {
    const v = cur.v;
    let [i, j] = v[v.length - 1], guard = 0;
    const sx = Math.sign(gi - i), sy = Math.sign(gj - j), tx = Math.abs(gi - i), ty = Math.abs(gj - j);
    let mx = 0, my = 0;
    while ((i !== gi || j !== gj) && guard++ < 2000) {
      if (D.sdiag && i !== gi && j !== gj) { i += sx; j += sy; mx++; my++; }
      else if (j === gj || (i !== gi && (mx + 0.5) / tx <= (my + 0.5) / ty)) { i += sx; mx++; }
      else { j += sy; my++; }
      v.push([i, j]);
    }
  }
  const stairClean = (v) => { // drop duplicate & collinear vertices
    const out = [];
    v.forEach((q) => {
      const n = out.length;
      if (n && out[n - 1][0] === q[0] && out[n - 1][1] === q[1]) return;
      if (n >= 2) { const a = out[n - 2], b = out[n - 1]; if ((b[0] - a[0]) * (q[1] - b[1]) - (b[1] - a[1]) * (q[0] - b[0]) === 0 && (b[0] - a[0]) * (q[0] - b[0]) + (b[1] - a[1]) * (q[1] - b[1]) > 0) { out[n - 1] = q; return; } }
      out.push(q);
    });
    return out;
  };
  const angleSnap = (a, p) => { const dx = p[0] - a[0], dy = p[1] - a[1], t = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy); return [a[0] + Math.cos(t) * l, a[1] + Math.sin(t) * l]; };

  // walk along a segment in small steps
  function walk(a, b, step, fn) {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), n = Math.max(1, Math.ceil(L / step));
    for (let i = 1; i <= n; i++) fn(a[0] + (dx * i) / n, a[1] + (dy * i) / n, dx, dy);
  }

  function onDown(e) {
    if (e.button !== 0) return;
    cv.setPointerCapture(e.pointerId);
    const p = toMm(e);
    if (D.tool === 'measure') { D.measure = { a: p, b: null }; cur = { type: 'measure' }; render(); return; }
    commit();
    cur = { type: D.tool, pts: [p], last: null, prev: p, anchor: p, dist: 0 };
    if (D.tool === 'stair') { cur.s = D.sstep / 10; cur.v = [[Math.round(p[0] / cur.s), Math.round(p[1] / cur.s)]]; }
    if (D.tool === 'pixel') paintPixels(p[0], p[1]);
    if (D.tool === 'erase') erase(p[0], p[1]);
    if (D.tool === 'ascii' && D.amode !== 'auto') stampAscii(p[0], p[1], 1, 0);
    render();
  }
  function onMove(e) {
    const p = toMm(e); hover = p;
    if (!cur) { render(); return; }
    const prev = cur.prev;
    if (cur.type === 'measure') { D.measure.b = e.shiftKey ? angleSnap(D.measure.a, p) : p; render(); return; }
    if (D.tool === 'line') { if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 0.12) { cur.pts.push(p); cur.prev = p; } }
    else if (D.tool === 'stair') { stairTo(Math.round(p[0] / cur.s), Math.round(p[1] / cur.s)); }
    else if (D.tool === 'pixel') { walk(prev, p, (D.px / 10) * 0.4, (x, y) => paintPixels(x, y)); cur.prev = p; }
    else if (D.tool === 'erase') { walk(prev, p, D.er / 40, (x, y) => erase(x, y)); cur.prev = p; }
    else if (D.tool === 'ascii') {
      if (D.snap) {
        // use direction over roughly one cell of travel for "auto" so curves read well
        const a = cur.anchor, dd = Math.hypot(p[0] - a[0], p[1] - a[1]);
        if (dd >= cellW() * 0.5 || D.amode !== 'auto') {
          const dx = p[0] - a[0], dy = p[1] - a[1];
          walk(prev, p, cellW() / 3, (x, y) => stampAscii(x, y, dx, dy));
          cur.anchor = p;
        }
        cur.prev = p;
      } else {
        const adv = cellW();
        let d = Math.hypot(p[0] - prev[0], p[1] - prev[1]);
        if (cur.dist + d >= adv) { const dx = p[0] - prev[0], dy = p[1] - prev[1]; walk(prev, p, adv, (x, y) => stampAscii(x, y, dx, dy)); cur.dist = 0; cur.prev = p; }
      }
    }
    render();
  }
  function onUp() {
    if (!cur) return;
    if (cur.type === 'measure') { cur = null; render(); return; }
    if (cur.type === 'stair') { const v = stairClean(cur.v); if (v.length > 1) D.strokes.push({ t: 'stair', v, s: cur.s, w: D.slw / 10 }); }
    if (cur.type === 'line') {
      const eps = 0.03 + (D.smooth / 100) * 0.45;
      const pts = LW.simplify(cur.pts, eps).map((q) => [+q[0].toFixed(3), +q[1].toFixed(3)]);
      D.strokes.push({ pts, w: D.lw / 10 });
    }
    save();
    cur = null; render();
  }

  // ---------- export ----------
  function exportBody(color) {
    const parts = [];
    const byW = {};
    const byWs = {};
    D.strokes.forEach((st) => { if (st.t === 'stair') byWs[st.w] = (byWs[st.w] || '') + stairPath(st.v, st.s); else byW[st.w] = (byW[st.w] || '') + LW.smoothPath(st.pts); });
    for (const w in byWs) parts.push(`<path d="${byWs[w]}" fill="none" stroke="${color}" stroke-width="${LW.fmt(+w)}" stroke-linecap="square" stroke-linejoin="miter"/>`);
    for (const w in byW) parts.push(`<path d="${byW[w]}" fill="none" stroke="${color}" stroke-width="${LW.fmt(+w)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    const bySize = {};
    D.pixels.forEach((p) => (bySize[p.s] = bySize[p.s] || new Set()).add(p.i + ',' + p.j));
    for (const s in bySize) {
      const set = bySize[s]; let mi = Infinity, mj = Infinity, xi = -Infinity, xj = -Infinity;
      set.forEach((k) => { const [i, j] = k.split(',').map(Number); mi = Math.min(mi, i); mj = Math.min(mj, j); xi = Math.max(xi, i); xj = Math.max(xj, j); });
      const polys = LW.gridContours((i, j) => set.has(i + mi + ',' + (j + mj)), xi - mi + 1, xj - mj + 1);
      const d = LW.polysToPath(polys, +s, mi * s, mj * s);
      parts.push(D.pstyle === 'outline'
        ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="${LW.fmt(Math.max(0.35, s * 0.18))}"/>`
        : `<path d="${d}" fill="${color}" fill-rule="evenodd"/>`);
    }
    const byLw = {};
    D.glyphs.forEach((g) => (byLw[g.lw] = (byLw[g.lw] || '') + LW.font.charPath(g.ch, g.x, g.y, g.h)));
    for (const lw in byLw) parts.push(`<path d="${byLw[lw]}" fill="none" stroke="${color}" stroke-width="${LW.fmt(+lw)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    return parts.join('\n');
  }
  const exportSvg = (color = D.thread) => { const f = field(); return LW.svgDoc(f.w, f.h, exportBody(color), 'Leeway drawing'); };

  // ---------- init ----------
  D.init = () => {
    cv = $('#dr-canvas'); ctx = cv.getContext('2d'); wrap = $('#dr-wrap');
    const saved = LW.store.get('draw', null);
    if (saved) { try { load(saved.state); D.hoop = saved.hoop || D.hoop; } catch (e) {} }

    const tools = LW.$$('#dr-tools button');
    const setTool = (t) => {
      D.tool = t; tools.forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
      if (t !== 'measure') D.measure = null;
      LW.$$('[data-for]').forEach((s) => (s.hidden = s.dataset.for !== t));
      render();
    };
    D.setTool = setTool;
    tools.forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));

    const rng = (id, key, fmt) => LW.bindRange($('#' + id), fmt, (v) => { D[key] = v; render(); });
    const mm = (v) => (v / 10).toFixed(1) + ' mm';
    rng('dr-lw', 'lw', mm); rng('dr-smooth', 'smooth', (v) => v + '%'); rng('dr-px', 'px', mm); rng('dr-pxb', 'pxb', (v) => v + '×' + v);
    rng('dr-sstep', 'sstep', mm); rng('dr-slw', 'slw', mm);
    $('#dr-sdiag').onchange = (e) => (D.sdiag = e.target.checked);
    rng('dr-ch', 'ch', mm); rng('dr-alw', 'alw', mm); rng('dr-er', 'er', mm); rng('dr-uop', 'uop', (v) => v + '%');
    $('#dr-amode').onchange = (e) => { D.amode = e.target.value; $('#dr-atext').hidden = D.amode === 'auto'; };
    $('#dr-atext').hidden = true;
    $('#dr-atext').oninput = (e) => { D.atext = e.target.value; D.seq = 0; };
    $('#dr-snap').onchange = (e) => { D.snap = e.target.checked; render(); };
    $('#dr-grid').onchange = (e) => { D.grid = e.target.checked; render(); };
    $('#dr-pstyle').onchange = (e) => (D.pstyle = e.target.value);
    const hs = $('#dr-hoop');
    hs.innerHTML = Object.entries(LW.HOOPS).filter(([k]) => k !== 'none').map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    hs.value = D.hoop;
    hs.onchange = () => { D.hoop = hs.value; layout(); save(); };
    $('#dr-under').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; D.under = await LW.loadImage(await LW.readFile(f, 'dataURL')); render(); e.target.value = ''; };
    LW.swatches($('#dr-shirt'), LW.SHIRT_COLORS.slice(0, 6), D.shirt, (h) => { D.shirt = h; render(); });
    LW.swatches($('#dr-thread'), LW.THREADS.slice(0, 10).concat(LW.THREADS.slice(-2)), D.thread, (h) => { D.thread = h; render(); });

    $('#dr-undo').onclick = D.undo; $('#dr-redo').onclick = D.redo;
    $('#dr-clear').onclick = () => { if (isEmpty() || !confirm('Clear the canvas?')) return; commit(); D.strokes = []; D.pixels.clear(); D.glyphs.clear(); render(); save(); };
    $('#dr-svg').onclick = () => { if (isEmpty()) return LW.toast('Draw something first'); const f = field(); LW.download(`leeway-drawing-${f.w}x${f.h}mm.svg`, exportSvg(), 'image/svg+xml'); };
    $('#dr-png').onclick = () => {
      if (isEmpty()) return LW.toast('Draw something first');
      const f = field(), k = 300 / 25.4;
      const s = exportSvg('#000000').replace(/width="[^"]+mm" height="[^"]+mm"/, `width="${Math.round(f.w * k)}" height="${Math.round(f.h * k)}"`);
      LW.svgToPng(s, Math.round(f.w * k), Math.round(f.h * k), `leeway-drawing-${f.w}x${f.h}mm.png`, '#ffffff');
    };
    $('#dr-send').onclick = () => {
      if (isEmpty()) return LW.toast('Draw something first');
      const n = LW.library.items.filter((d) => d.source === 'generated' && /^Drawing/.test(d.name)).length + 1;
      const d = LW.library.add(`Drawing ${n}`, exportSvg('#1f1c1a'), 'generated');
      if (!d) return;
      LW.showTab('mockup'); LW.mockup.addLayer(d.id, { color: D.thread });
      LW.toast('Drawing added to the library and placed on the shirt');
    };

    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('pointerleave', () => { hover = null; render(); });
    new ResizeObserver(layout).observe(wrap);
    window.addEventListener('lw-tab', (e) => { if (e.detail === 'draw') setTimeout(layout, 0); });
    window.addEventListener('keydown', (e) => {
      if (!$('#view-draw').classList.contains('on') || /input|select|textarea/i.test(document.activeElement.tagName)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? D.redo() : D.undo(); return; }
      const t = { l: 'line', s: 'stair', p: 'pixel', a: 'ascii', e: 'erase', m: 'measure' }[e.key.toLowerCase()];
      if (t && !mod) setTool(t);
    });
  };
})(window.LW);
