/* Mockup studio: put designs on the to-scale shirt, stack them, recolour, resize, check hoops. */
(function (LW) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const S = LW.SHIRT;
  const $ = LW.$;
  const M = (LW.mockup = {
    shirtColor: S.photo || LW.SHIRT_COLORS[0].hex,
    hoop: { type: 'h10', cx: 0, cy: 0 },
    layers: [], sel: null,
    side: 'front', photo: 'fit', calib: 'length',
    hoops: { front: { type: 'h10', cx: 0, cy: 21 }, back: { type: 'h10', cx: 0, cy: 15 } },
    view: { x: S.img.x, y: S.img.y, w: S.img.w, h: S.img.h },
    thread: true, grid: false, dims: false,
    measuring: false, measures: [],
  });
  M.hoop = M.hoops.front;

  // ---------- shirt geometry for the current view (cm, origin = centre, y = 0 at shoulder top / HPS) ----------
  const PHOTO = { cx: 299, hps: 111, w: 600, h: 750 };
  const imgs = () => window.LW_SHIRT_IMGS || {};
  let G;
  function geom() {
    const side = M.side;
    if (M.photo === 'fit') {
      G = { img: { x: -56, y: -3, w: 112, h: 80.5 }, href: (imgs()[side] || {}).fit, neck: side === 'front' ? 9 : 4.1,
        chestY: 30, chestHalf: 33.5, hem: 75, lenX: 28, sleeve: [[-34, 4.5], [-49.75, 23.3]], sleeveC: [-41, 19.5], sleeveRot: 16, scaled: true };
    } else {
      const k = M.calib === 'chest' ? 306 / 67 : 527 / 75;
      const c = (x, y) => [(x - PHOTO.cx) / k, (y - PHOTO.hps) / k];
      G = { img: { x: -PHOTO.cx / k, y: -PHOTO.hps / k, w: PHOTO.w / k, h: PHOTO.h / k }, href: (imgs()[side] || {}).orig,
        neck: side === 'front' ? 55 / k : 25 / k, chestY: c(0, 420)[1], chestHalf: 153 / k, hem: c(0, 639)[1], lenX: c(430, 0)[0],
        sleeve: [c(138, 152), c(29, 348)], sleeveC: c(104, 300), sleeveRot: 25, scaled: false };
    }
    return G;
  }
  geom();
  M.geom = () => G;
  const sideLayers = () => M.layers.filter((l) => (l.side || 'front') === M.side);
  let svg, gShirt, gGrid, gLayers, gHoop, gGuides, gSel, gMeasure, imgEl;
  const els = {}; // layer id -> elements
  const history = [], future = [];

  // ---------- helpers ----------
  const mk = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  const design = (L) => LW.library.get(L.designId);
  const dims = (L) => { const d = design(L); const n = d && d.norm; return n ? { w: L.w, h: (L.w * n.h) / n.w, n } : { w: L.w, h: L.w, n: null }; };
  const hoopDef = () => LW.HOOPS[M.hoop.type];
  const pxSize = () => { const r = svg.getBoundingClientRect(); if (!r.width || !r.height) return M.view.w / 1000; return Math.max(M.view.w / r.width, M.view.h / r.height); }; // cm per screen px
  const toSvg = (e) => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const paperColor = (L) => (L.paper === 'hide' ? 'transparent' : L.paper === 'white' ? '#f7f5ef' : M.shirtColor);
  const corners = (L) => {
    const { w, h } = dims(L), a = (L.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [L.cx + x * c - y * s, L.cy + x * s + y * c]);
  };
  const aabb = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }; };
  const hoopRect = () => { const h = hoopDef(); return { x0: M.hoop.cx - h.w / 2, y0: M.hoop.cy - h.h / 2, x1: M.hoop.cx + h.w / 2, y1: M.hoop.cy + h.h / 2, w: h.w, h: h.h }; };
  const fitsLargestHoop = (L) => { const { w, h } = dims(L); const b = aabb(corners(L)); const bw = b.x1 - b.x0, bh = b.y1 - b.y0; return (bw <= 10.001 && bh <= 23.501) || (bw <= 23.501 && bh <= 10.001) || (w <= 10.001 && h <= 23.501); };

  // ---------- history ----------
  const snap = () => JSON.stringify({ layers: M.layers, hoops: M.hoops });
  const pushHistory = () => { history.push(snap()); if (history.length > 80) history.shift(); future.length = 0; };
  const restore = (s) => { const o = JSON.parse(s); M.layers = o.layers; M.hoops = o.hoops; M.hoop = M.hoops[M.side]; $('#hoop-type').value = M.hoop.type; if (!M.layers.find((l) => l.id === M.sel)) M.sel = null; rebuildLayers(); render(); };
  M.undo = () => { if (!history.length) return; future.push(snap()); restore(history.pop()); };
  M.redo = () => { if (!future.length) return; history.push(snap()); restore(future.pop()); };

  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => LW.store.set('mockup', { layers: M.layers, hoops: M.hoops, shirtColor: M.shirtColor, thread: M.thread, side: M.side, photo: M.photo, calib: M.calib }), 300); };

  // ---------- build stage ----------
  function buildStage() {
    svg = $('#stage');
    svg.innerHTML = `
      <defs>
        <filter id="lw-tint" color-interpolation-filters="sRGB"><feColorMatrix id="lw-tint-m" type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0"/></filter>
        <filter id="lw-thread" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.025" result="b"/>
          <feSpecularLighting in="b" surfaceScale="2.5" specularConstant="0.5" specularExponent="16" lighting-color="#ffffff" result="sp"><feDistantLight azimuth="235" elevation="48"/></feSpecularLighting>
          <feComposite in="sp" in2="SourceAlpha" operator="in" result="spIn"/>
          <feTurbulence type="fractalNoise" baseFrequency="9 1.4" numOctaves="2" seed="11" result="nz"/>
          <feColorMatrix in="nz" type="matrix" values="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 0 0 0 0 1" result="nzg"/>
          <feComposite in="SourceGraphic" in2="nzg" operator="arithmetic" k1="0.45" k2="0.78" k3="0" k4="0" result="tx"/>
          <feComposite in="tx" in2="SourceAlpha" operator="in" result="tx2"/>
          <feComposite in="tx2" in2="spIn" operator="arithmetic" k1="0" k2="1" k3="0.45" k4="0" result="lit"/>
          <feGaussianBlur in="SourceAlpha" stdDeviation="0.035" result="sb"/>
          <feOffset in="sb" dx="0.02" dy="0.04" result="so"/>
          <feColorMatrix in="so" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.5 0" result="sh"/>
          <feMerge><feMergeNode in="sh"/><feMergeNode in="lit"/></feMerge>
        </filter>
      </defs>`;
    gShirt = mk('g', { id: 'g-shirt' }, svg);
    imgEl = mk('image', { preserveAspectRatio: 'none' }, gShirt);
    applyPhoto();
    gGrid = mk('g', { id: 'g-grid', 'pointer-events': 'none' }, svg);
    gLayers = mk('g', { id: 'g-layers' }, svg);
    gHoop = mk('g', { id: 'g-hoop' }, svg);
    gGuides = mk('g', { id: 'g-guides', 'pointer-events': 'none' }, svg);
    gMeasure = mk('g', { id: 'g-measure', 'pointer-events': 'none' }, svg);
    gSel = mk('g', { id: 'g-sel' }, svg);
    setView(M.view);
  }

  function setView(v) {
    M.view = v;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    renderOverlay();
  }
  const zoomBy = (f, cx, cy) => {
    const v = M.view;
    if (cx == null) { cx = v.x + v.w / 2; cy = v.y + v.h / 2; }
    const w = LW.clamp(v.w * f, 6, 260), k = w / v.w;
    setView({ x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k, w, h: v.h * k });
  };
  const fitShirt = () => setView({ x: G.img.x - 2, y: G.img.y - 2, w: G.img.w + 4, h: G.img.h + 4 });
  function applyPhoto() {
    geom();
    imgEl.setAttribute('href', G.href || '');
    ['x', 'y'].forEach((k) => imgEl.setAttribute(k, G.img[k]));
    imgEl.setAttribute('width', G.img.w); imgEl.setAttribute('height', G.img.h);
  }
  M.setView = (o) => {
    const sideChanged = o.side && o.side !== M.side;
    Object.assign(M, o);
    if (sideChanged) { M.hoop = M.hoops[M.side]; M.sel = null; $('#hoop-type').value = M.hoop.type; renderPlaceChips(); }
    applyPhoto(); M.layers.forEach(updateLayerEl); syncViewUI(); fitShirt(); render();
  };
  function syncViewUI() {
    LW.$$('#side-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === M.side));
    $('#shirt-photo').value = M.photo; $('#shirt-calib').value = M.calib;
    $('#shirt-calib-wrap').hidden = M.photo !== 'orig';
    const n = $('#shirt-note');
    n.textContent = M.photo === 'fit'
      ? 'Photo fitted to the size guide: chest 67, length 75, sleeve 24.5 cm, so everything is to scale.'
      : M.calib === 'length'
        ? `Original photo, scaled on body length (75 cm). Its chest reads ${(2 * G.chestHalf).toFixed(1)} cm instead of 67, so widths look bigger than on the real shirt.`
        : `Original photo, scaled on chest width (67 cm). Its length reads ${G.hem.toFixed(1)} cm instead of 75, so heights look smaller than on the real shirt.`;
    $('#stage-side').textContent = M.side === 'front' ? 'FRONT' : 'BACK';
  }
  const fitRect = (x0, y0, x1, y1, pad = 4) => setView({ x: x0 - pad, y: y0 - pad, w: x1 - x0 + 2 * pad, h: y1 - y0 + 2 * pad });

  // ---------- shirt colour ----------
  function applyShirt() {
    const c = LW.SHIRT_COLORS.find((x) => x.hex.toLowerCase() === M.shirtColor.toLowerCase());
    if (c && c.photo) { imgEl.removeAttribute('filter'); }
    else {
      const [r, g, b] = LW.hexToRgb(M.shirtColor).map((v) => v / 255);
      const row = (k) => `${LW.fmt((k / S.baseLum) * 0.299, 4)} ${LW.fmt((k / S.baseLum) * 0.587, 4)} ${LW.fmt((k / S.baseLum) * 0.114, 4)} 0 0`;
      $('#lw-tint-m').setAttribute('values', `${row(r)} ${row(g)} ${row(b)} 0 0 0 1 0`);
      imgEl.setAttribute('filter', 'url(#lw-tint)');
    }
    M.layers.forEach(updateLayerEl);
    LW.$$('.card .th, .layers .th').forEach((t) => (t.style.background = M.shirtColor));
    window.dispatchEvent(new CustomEvent('lw-shirt', { detail: M.shirtColor }));
    save();
  }
  M.setShirtColor = (hex) => { M.shirtColor = hex; applyShirt(); };

  // ---------- layers ----------
  function rebuildLayers() {
    gLayers.innerHTML = '';
    for (const k in els) delete els[k];
    M.layers.forEach((L) => {
      const d = design(L); if (!d) return; LW.library.ensure(d);
      if (!d.norm) return;
      const g = mk('g', { class: 'layer-g', 'data-id': L.id }, gLayers);
      const f = mk('g', {}, g);
      const t = mk('g', {}, f);
      t.innerHTML = `<rect class="hit" x="0" y="0" width="${d.norm.w}" height="${d.norm.h}" fill="transparent"/>` + d.norm.inner;
      // knock-out (white) shapes are drawn again on top, without the thread filter
      let k = null;
      if (d.norm.hasPaper) { k = mk('g', { class: 'knock' }, g); k.innerHTML = d.norm.inner; }
      els[L.id] = { g, f, t, k };
      updateLayerEl(L);
    });
    renderLayerList();
  }
  function updateLayerEl(L) {
    const e = els[L.id]; if (!e) return;
    const { n } = dims(L); if (!n) return;
    const k = L.w / n.w;
    e.t.setAttribute('transform', `translate(${L.cx} ${L.cy}) rotate(${L.rot}) scale(${L.flip ? -k : k} ${k}) translate(${-n.w / 2} ${-n.h / 2})`);
    const knock = e.k && L.paper === 'fabric';
    e.g.style.color = L.color;
    e.f.style.setProperty('--lw-paper', knock ? 'transparent' : paperColor(L));
    if (e.k) {
      e.k.style.display = knock ? '' : 'none';
      e.k.setAttribute('transform', e.t.getAttribute('transform'));
      e.k.style.color = 'transparent'; e.k.style.setProperty('--lw-paper', M.shirtColor);
    }
    e.g.style.display = L.visible === false || (L.side || 'front') !== M.side ? 'none' : '';
    e.g.classList.toggle('locked', !!L.locked);
    if (M.thread) e.f.setAttribute('filter', 'url(#lw-thread)'); else e.f.removeAttribute('filter');
  }

  const defaultPos = (h) => {
    const H = hoopDef();
    if (H.w) return { cx: M.hoop.cx, cy: M.hoop.cy };
    return { cx: 0, cy: G.neck + (M.side === 'front' ? 7 : 6) + h / 2 };
  };
  M.addLayer = (designId, opts = {}) => {
    const d = LW.library.get(designId); if (!d) return;
    LW.library.ensure(d); if (!d.norm) return LW.toast(d.error || 'Could not read design', 'err');
    pushHistory();
    let w = d.norm.w / 10; // true size in cm
    const H = hoopDef();
    const maxW = H.w ? H.w : 10, maxH = H.h ? H.h : 10;
    const hh = (w * d.norm.h) / d.norm.w;
    if (w > maxW || hh > maxH) w = Math.min(maxW / w, maxH / hh) * w;
    const L = Object.assign({ id: LW.uid('L'), side: M.side, designId, name: d.name, w: +w.toFixed(2), rot: 0, flip: false, color: LW.store.get('lastThread', '#efe6cf'), paper: 'fabric', visible: true }, opts);
    const p = defaultPos((L.w * d.norm.h) / d.norm.w);
    if (L.cx == null) { L.cx = p.cx; L.cy = p.cy; }
    M.layers.push(L);
    M.sel = L.id;
    rebuildLayers(); render();
    if (d.norm.hasText) LW.toast('This design contains live text — outline it in Illustrator before digitising.');
  };
  const selL = () => M.layers.find((l) => l.id === M.sel);
  const change = (fn, hist = true) => { const L = selL(); if (!L) return; if (hist) pushHistory(); fn(L); updateLayerEl(L); render(); };

  // ---------- rendering ----------
  function render() {
    renderOverlay();
    renderLayerList();
    renderProps();
    save();
  }

  function hoopStatus() {
    const H = hoopDef();
    const res = { inside: [], partial: [], tooBig: [] };
    sideLayers().forEach((L) => { if (L.visible !== false && !fitsLargestHoop(L)) res.tooBig.push(L); });
    if (!H.w) return res;
    const r = hoopRect(), eps = 0.001;
    sideLayers().forEach((L) => {
      if (L.visible === false) return;
      const b = aabb(corners(L));
      const inside = b.x0 >= r.x0 - eps && b.y0 >= r.y0 - eps && b.x1 <= r.x1 + eps && b.y1 <= r.y1 + eps;
      const overlaps = b.x1 > r.x0 && b.x0 < r.x1 && b.y1 > r.y0 && b.y0 < r.y1;
      if (inside) res.inside.push(L); else if (overlaps) res.partial.push(L);
    });
    return res;
  }

  function renderOverlay() {
    if (!svg) return;
    const px = pxSize();
    // grid
    gGrid.innerHTML = '';
    if (M.grid) {
      let d = '';
      const I = G.img;
      for (let x = Math.ceil(I.x); x <= I.x + I.w; x++) d += `M${x} ${I.y}V${I.y + I.h}`;
      for (let y = Math.ceil(I.y); y <= I.y + I.h; y++) d += `M${I.x} ${y}H${I.x + I.w}`;
      mk('path', { d, stroke: '#ffffff', 'stroke-opacity': 0.18, 'stroke-width': px * 0.8, fill: 'none' }, gGrid);
      let d5 = '';
      for (let x = Math.ceil(I.x / 5) * 5; x <= I.x + I.w; x += 5) d5 += `M${x} ${I.y}V${I.y + I.h}`;
      for (let y = Math.ceil(I.y / 5) * 5; y <= I.y + I.h; y += 5) d5 += `M${I.x} ${y}H${I.x + I.w}`;
      mk('path', { d: d5, stroke: '#ffffff', 'stroke-opacity': 0.35, 'stroke-width': px, fill: 'none' }, gGrid);
    }
    // measurements
    gGuides.innerHTML = '';
    const fs = px * 11;
    const label = (x, y, t, anchor = 'middle', parent = gGuides) => {
      const tx = mk('text', { x, y, 'font-size': fs, 'text-anchor': anchor, fill: '#fff', 'font-family': 'ui-monospace, Menlo, monospace', stroke: 'rgba(0,0,0,.45)', 'stroke-width': px * 2.5, 'paint-order': 'stroke' }, parent);
      tx.textContent = t; return tx;
    };
    if (M.dims) {
      const st = { stroke: '#fff', 'stroke-width': px * 1.2, 'stroke-dasharray': `${px * 4} ${px * 3}`, fill: 'none' };
      const spec = (v, real) => (G.scaled ? `${real} cm` : `${v.toFixed(1)} cm · spec ${real}`);
      const [s0, s1] = G.sleeve, sl = Math.hypot(s1[0] - s0[0], s1[1] - s0[1]);
      mk('path', Object.assign({ d: `M${-G.chestHalf} ${G.chestY}H${G.chestHalf}` }, st), gGuides); label(0, G.chestY - px * 6, 'chest ' + spec(2 * G.chestHalf, S.chest));
      mk('path', Object.assign({ d: `M${G.lenX} 0V${G.hem}` }, st), gGuides); label(G.lenX - px * 4, G.hem * 0.4, 'length ' + spec(G.hem, S.length), 'end');
      mk('path', Object.assign({ d: `M${s0[0]} ${s0[1]}L${s1[0]} ${s1[1]}` }, st), gGuides); label((s0[0] + s1[0]) / 2 - px * 6, (s0[1] + s1[1]) / 2 - px * 6, 'sleeve ' + spec(sl, S.sleeve), 'end');
      mk('path', Object.assign({ d: `M-12 ${G.neck}H12` }, st, { 'stroke-opacity': 0.7 }), gGuides); label(13, G.neck + fs * 0.35, M.side === 'front' ? 'neckline' : 'back neck', 'start');
    }
    // hoop
    gHoop.innerHTML = '';
    const H = hoopDef(), stat = hoopStatus();
    if (H.w) {
      const r = hoopRect(), bad = stat.partial.length > 0;
      const ring = 1.1, gap = 0.7;
      const rr = mk('rect', { x: r.x0 - gap - ring / 2, y: r.y0 - gap - ring / 2, width: r.w + 2 * gap + ring, height: r.h + 2 * gap + ring, rx: H.w === H.h ? 2.4 : 2.6, fill: 'none', stroke: bad ? '#e8794f' : '#e9e2d3', 'stroke-opacity': 0.62, 'stroke-width': ring, class: 'hoop-ring', style: 'cursor:move' }, gHoop);
      rr.dataset.hoop = '1';
      mk('rect', { x: r.x0 - gap, y: r.y0 - gap, width: r.w + 2 * gap, height: r.h + 2 * gap, rx: 1.8, fill: 'none', stroke: 'rgba(0,0,0,.25)', 'stroke-width': px, 'pointer-events': 'none' }, gHoop);
      mk('rect', { x: r.x0, y: r.y0, width: r.w, height: r.h, fill: 'none', stroke: bad ? '#ffb199' : '#fff', 'stroke-width': px * 1.2, 'stroke-dasharray': `${px * 5} ${px * 4}`, 'pointer-events': 'none' }, gHoop);
      const lt = label(r.x0 - gap - ring, r.y0 - gap - ring - px * 6, `${H.w} × ${H.h} cm field`, 'start', gHoop);
      lt.setAttribute('pointer-events', 'none');
      // centre tick
      mk('path', { d: `M${M.hoop.cx - 0.4} ${M.hoop.cy}H${M.hoop.cx + 0.4}M${M.hoop.cx} ${M.hoop.cy - 0.4}V${M.hoop.cy + 0.4}`, stroke: '#fff', 'stroke-opacity': 0.6, 'stroke-width': px, 'pointer-events': 'none' }, gHoop);
    }
    // status text
    const st = $('#hoop-status');
    if (!H.w) { st.className = 'status'; st.textContent = 'No hoop shown.'; }
    else if (stat.partial.length) { st.className = 'status bad'; st.textContent = `✕ ${stat.partial.map((l) => l.name).join(', ')} ${stat.partial.length > 1 ? 'cross' : 'crosses'} the hoop edge.`; }
    else if (stat.inside.length) {
      const b = aabb(stat.inside.flatMap(corners));
      st.className = 'status ok'; st.textContent = `✓ ${stat.inside.length} layer${stat.inside.length > 1 ? 's' : ''} fit · stitch area ${(b.x1 - b.x0).toFixed(1)} × ${(b.y1 - b.y0).toFixed(1)} cm`;
    } else { st.className = 'status'; st.textContent = 'Hoop is empty — drag the hoop frame or a design.'; }
    if (stat.tooBig.length) { st.className = 'status bad'; st.textContent += `  ⚠ ${stat.tooBig.map((l) => l.name).join(', ')} is larger than the biggest hoop (10 × 23.5).`; }
    renderMeasures(px);
    // selection
    renderSel(px);
  }

  function renderSel(px) {
    gSel.innerHTML = '';
    const L = selL(); if (!L || L.visible === false) return;
    const { w, h } = dims(L), hs = px * 9;
    const g = mk('g', { transform: `translate(${L.cx} ${L.cy}) rotate(${L.rot})` }, gSel);
    mk('rect', { x: -w / 2, y: -h / 2, width: w, height: h, fill: 'none', stroke: '#2b6cff', 'stroke-width': px * 1.3, 'pointer-events': 'none' }, g);
    if (!L.locked) {
      mk('line', { x1: 0, y1: -h / 2, x2: 0, y2: -h / 2 - hs * 2.4, stroke: '#2b6cff', 'stroke-width': px * 1.3 }, g);
      const rc = mk('circle', { cx: 0, cy: -h / 2 - hs * 2.4, r: hs * 0.6, fill: '#fff', stroke: '#2b6cff', 'stroke-width': px * 1.5, style: 'cursor:grab' }, g);
      rc.dataset.h = 'rot';
      [[-1, -1, 'nwse'], [1, -1, 'nesw'], [1, 1, 'nwse'], [-1, 1, 'nesw']].forEach(([sx, sy, c]) => {
        const r = mk('rect', { x: (sx * w) / 2 - hs / 2, y: (sy * h) / 2 - hs / 2, width: hs, height: hs, fill: '#fff', stroke: '#2b6cff', 'stroke-width': px * 1.5, style: `cursor:${c}-resize` }, g);
        r.dataset.h = 'scale';
      });
    }
    const t = mk('text', { x: 0, y: h / 2 + px * 18, 'font-size': px * 11, 'text-anchor': 'middle', fill: '#fff', 'font-family': 'ui-monospace, Menlo, monospace', stroke: 'rgba(30,60,160,.85)', 'stroke-width': px * 3, 'paint-order': 'stroke', 'pointer-events': 'none' }, g);
    t.textContent = `${w.toFixed(1)} × ${h.toFixed(1)} cm`;
  }

  const thumb = (d, color) => {
    LW.library.ensure(d);
    if (!d.norm) return `<div class="err">${LW.esc(d.error || 'error')}</div>`;
    return `<svg viewBox="${-d.norm.w * 0.04} ${-d.norm.h * 0.04} ${d.norm.w * 1.08} ${d.norm.h * 1.08}">${LW.resolveInner(d.norm.inner, color || '#efe6cf', M.shirtColor)}</svg>`;
  };
  M.thumb = thumb;

  function renderLayerList() {
    const ol = $('#layers'); ol.innerHTML = '';
    const stat = hoopStatus(), bad = new Set(stat.partial.concat(stat.tooBig).map((l) => l.id));
    const list = sideLayers();
    $('#layers-side').textContent = (M.side === 'front' ? 'front' : 'back') + ' · top first';
    if (!list.length) { ol.innerHTML = `<li class="muted" style="cursor:default;display:block;border-style:dashed">Nothing on the ${M.side} yet — pick a design on the left.</li>`; return; }
    list.slice().reverse().forEach((L) => {
      const d = design(L); const li = document.createElement('li');
      const { w, h } = dims(L);
      li.className = (L.id === M.sel ? 'on ' : '') + (bad.has(L.id) ? 'out ' : '') + (L.visible === false ? 'hid' : '');
      li.innerHTML = `<button class="eye" title="Show / hide">${L.visible === false ? '◌' : '●'}</button>
        <div class="th" style="background:${M.shirtColor}">${d ? thumb(d, L.color) : ''}</div>
        <div class="nm">${LW.esc(L.name)}<small>${w.toFixed(1)}×${h.toFixed(1)} cm</small></div>
        <div class="ops"><button data-op="up" title="Bring forward">▲</button><button data-op="down" title="Send backward">▼</button><button data-op="lock" title="Lock">${L.locked ? '🔒' : '○'}</button></div>`;
      li.onclick = (e) => {
        const op = e.target.dataset.op;
        if (e.target.classList.contains('eye')) { pushHistory(); L.visible = L.visible === false; updateLayerEl(L); render(); return; }
        if (op) {
          if (op === 'lock') { L.locked = !L.locked; updateLayerEl(L); render(); return; }
          // swap with the next layer on the same side
          const same = sideLayers(), k = same.indexOf(L), other = same[op === 'up' ? k + 1 : k - 1];
          if (!other) return;
          pushHistory();
          const i = M.layers.indexOf(L), j = M.layers.indexOf(other);
          M.layers[i] = other; M.layers[j] = L; rebuildLayers(); render(); return;
        }
        M.sel = L.id; render();
      };
      ol.appendChild(li);
    });
  }

  let propsFor = null;
  function renderProps() {
    const L = selL();
    $('#props-empty').hidden = !!L; $('#props-body').hidden = !L;
    if (!L) { propsFor = null; return; }
    const { w, h } = dims(L);
    const setv = (id, v) => { const el = $(id); if (document.activeElement !== el) el.value = v; };
    setv('#p-name', L.name);
    setv('#p-w', w.toFixed(2)); setv('#p-h', h.toFixed(2));
    setv('#p-x', L.cx.toFixed(1)); setv('#p-y', (L.cy - h / 2 - G.neck).toFixed(1)); setv('#p-r', Math.round(L.rot));
    $('#p-paper').value = L.paper || 'fabric';
    if (propsFor !== L.id) {
      LW.swatches($('#p-color'), LW.THREADS, L.color, (hex) => { change((l) => (l.color = hex)); LW.store.set('lastThread', hex); });
      propsFor = L.id;
    }
    const d = design(L), warn = [];
    if (!fitsLargestHoop(L)) warn.push('Bigger than the 10 × 23.5 cm hoop — it can’t be stitched in one hooping.');
    if (d && d.norm && d.norm.hasText) warn.push('Contains live text: outline fonts (Type → Create Outlines) before digitising.');
    if (Math.min(w, h) < 1) warn.push('Very small — fine details under ~1 mm won’t stitch.');
    $('#p-warn').innerHTML = warn.join('<br>');
  }

  // ---------- library panel ----------
  function renderLibrary() {
    const grid = $('#lib-grid'); grid.innerHTML = '';
    const items = LW.library.items;
    $('#lib-count').textContent = items.length;
    items.forEach((d) => {
      const c = document.createElement('div');
      c.className = 'card'; c.title = 'Add “' + d.name + '” to the shirt';
      c.innerHTML = `<div class="th" style="background:${M.shirtColor}">${thumb(d, LW.store.get('lastThread', '#efe6cf'))}</div><div class="nm">${LW.esc(d.name)}</div>` +
        (d.source !== 'bundled' ? `<span class="tag">${d.source === 'generated' ? 'made here' : 'imported'}</span><button class="x" title="Remove from library">✕</button>` : '');
      c.onclick = (e) => {
        if (e.target.classList.contains('x')) {
          e.stopPropagation();
          if (M.layers.some((l) => l.designId === d.id)) return LW.toast('Remove it from the shirt first');
          LW.library.remove(d.id); return;
        }
        M.addLayer(d.id);
      };
      grid.appendChild(c);
    });
  }
  async function importFiles(files) {
    let n = 0;
    for (const f of files) {
      if (!/svg/i.test(f.type) && !/\.svg$/i.test(f.name)) { LW.toast(`${f.name}: use the Image → ASCII / Pixel tab for bitmaps`); continue; }
      const txt = await LW.readFile(f);
      if (LW.library.add(f.name.replace(/\.svg$/i, ''), txt, 'imported', true)) n++;
    }
    if (n) { LW.library.emit(); LW.toast(`Imported ${n} design${n > 1 ? 's' : ''}`); }
  }

  // ---------- measure tool ----------
  function setMeasuring(on) {
    M.measuring = on;
    svg.classList.toggle('measuring', on);
    $('#stage-hint').textContent = on
      ? 'measure: drag between any two points · snaps to design corners, hoop & neckline · shift = straight · M or Esc to stop'
      : 'drag to move · corner = resize · ◦ = rotate · wheel = zoom · space+drag = pan · M = measure';
    updMeasureBtns();
  }
  M.setMeasuring = setMeasuring;
  function updMeasureBtns() {
    $('#m-measure').classList.toggle('on', M.measuring);
    $('#m-clear').hidden = !M.measures.some((m) => m.side === M.side);
  }
  function snapPoints() {
    const pts = [];
    sideLayers().forEach((L) => {
      if (L.visible === false) return;
      const c = corners(L);
      c.forEach((p, i) => { pts.push(p); const q = c[(i + 1) % 4]; pts.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); });
      pts.push([L.cx, L.cy]);
    });
    if (hoopDef().w) {
      const r = hoopRect();
      [[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1], [(r.x0 + r.x1) / 2, r.y0], [(r.x0 + r.x1) / 2, r.y1], [r.x0, (r.y0 + r.y1) / 2], [r.x1, (r.y0 + r.y1) / 2], [M.hoop.cx, M.hoop.cy]].forEach((p) => pts.push(p));
    }
    pts.push([0, G.neck], [0, G.hem], [-G.chestHalf, G.chestY], [G.chestHalf, G.chestY], [0, 0]);
    return pts;
  }
  function snapTo(p, from, shift) {
    let q = [p.x, p.y], snapped = false;
    if (shift && from) { // horizontal / vertical / 45°
      const dx = q[0] - from[0], dy = q[1] - from[1], a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), l = Math.hypot(dx, dy);
      q = [from[0] + Math.cos(a) * l, from[1] + Math.sin(a) * l];
    } else {
      const tol = pxSize() * 9;
      let best = tol;
      snapPoints().forEach((s) => { const d = Math.hypot(s[0] - q[0], s[1] - q[1]); if (d < best) { best = d; q = s.slice(); snapped = true; } });
    }
    return { q, snapped };
  }
  function renderMeasures(px) {
    gMeasure.innerHTML = '';
    const list = M.measures.filter((m) => m.side === M.side);
    if (drag && drag.mode === 'measure' && drag.m.b) list.push(drag.m);
    list.forEach((m) => {
      const [a, b] = [m.a, m.b]; if (!b) return;
      const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
      const col = '#f2e600', sw = px * 1.6;
      mk('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: 'rgba(0,0,0,.45)', 'stroke-width': sw * 2.4 }, gMeasure);
      mk('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: col, 'stroke-width': sw }, gMeasure);
      const nx = len ? -dy / len : 0, ny = len ? dx / len : 1, t = px * 6;
      [a, b].forEach((p) => mk('line', { x1: p[0] - nx * t, y1: p[1] - ny * t, x2: p[0] + nx * t, y2: p[1] + ny * t, stroke: col, 'stroke-width': sw }, gMeasure));
      if (m.snapA) mk('circle', { cx: a[0], cy: a[1], r: px * 3.5, fill: col }, gMeasure);
      if (m.snapB) mk('circle', { cx: b[0], cy: b[1], r: px * 3.5, fill: col }, gMeasure);
      const txt = `${len.toFixed(1)} cm` + (Math.abs(dx) > 0.3 && Math.abs(dy) > 0.3 ? `  (↔ ${Math.abs(dx).toFixed(1)} · ↕ ${Math.abs(dy).toFixed(1)})` : '');
      const mxp = (a[0] + b[0]) / 2 + nx * px * 14, myp = (a[1] + b[1]) / 2 + ny * px * 14;
      const tx = mk('text', { x: mxp, y: myp + px * 4, 'font-size': px * 12, 'text-anchor': 'middle', fill: '#1f1c1a', 'font-family': 'ui-monospace, Menlo, monospace', 'font-weight': 700, stroke: col, 'stroke-width': px * 5, 'stroke-linejoin': 'round', 'paint-order': 'stroke' }, gMeasure);
      tx.textContent = txt;
    });
  }

  // ---------- pointer interaction ----------
  let drag = null, spaceDown = false;
  function onDown(e) {
    if (e.button === 2) return;
    const p = toSvg(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || spaceDown) { drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, v: { ...M.view } }; svg.classList.add('panning'); return; }
    const t = e.target;
    const L = selL();
    if (M.measuring) {
      const s0 = snapTo(p);
      drag = { mode: 'measure', m: { side: M.side, a: s0.q, b: null, snapA: s0.snapped } };
      return;
    }
    if (t.dataset && t.dataset.h && L) {
      pushHistory();
      drag = { mode: t.dataset.h, L, p0: p, w0: L.w, r0: L.rot, d0: Math.hypot(p.x - L.cx, p.y - L.cy), a0: Math.atan2(p.y - L.cy, p.x - L.cx) };
      return;
    }
    const lg = t.closest && t.closest('.layer-g');
    if (lg) {
      const id = lg.dataset.id, l = M.layers.find((x) => x.id === id);
      M.sel = id; render();
      if (l && !l.locked) { pushHistory(); drag = { mode: 'move', L: l, p0: p, cx: l.cx, cy: l.cy }; }
      return;
    }
    if (t.dataset && t.dataset.hoop) { pushHistory(); drag = { mode: 'hoop', p0: p, cx: M.hoop.cx, cy: M.hoop.cy }; return; }
    M.sel = null; render();
    drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, v: { ...M.view }, soft: true };
  }
  function onMove(e) {
    if (!drag) return;
    if (drag.mode === 'pan') {
      const r = svg.getBoundingClientRect(), k = pxSize();
      const dx = (e.clientX - drag.sx) * k, dy = (e.clientY - drag.sy) * k;
      if (drag.soft && Math.hypot(dx, dy) < 3 * k) return;
      setView({ ...drag.v, x: drag.v.x - dx, y: drag.v.y - dy });
      return;
    }
    const p = toSvg(e), L = drag.L;
    if (drag.mode === 'measure') {
      const s1 = snapTo(p, drag.m.a, e.shiftKey);
      drag.m.b = s1.q; drag.m.snapB = s1.snapped;
      renderMeasures(pxSize());
      return;
    }
    gGuides.querySelectorAll('.snap').forEach((n) => n.remove());
    if (drag.mode === 'move') {
      let cx = drag.cx + p.x - drag.p0.x, cy = drag.cy + p.y - drag.p0.y;
      const tol = pxSize() * 6;
      if (Math.abs(cx) < tol) { cx = 0; mk('path', { class: 'snap', d: `M0 -3V78`, stroke: '#f2e600', 'stroke-width': pxSize() * 1.2 }, gGuides); }
      if (hoopDef().w && Math.abs(cx - M.hoop.cx) < tol) cx = M.hoop.cx;
      if (hoopDef().w && Math.abs(cy - M.hoop.cy) < tol) { cy = M.hoop.cy; mk('path', { class: 'snap', d: `M${M.hoop.cx - 15} ${cy}H${M.hoop.cx + 15}`, stroke: '#f2e600', 'stroke-width': pxSize() * 1.2 }, gGuides); }
      L.cx = +cx.toFixed(2); L.cy = +cy.toFixed(2);
    } else if (drag.mode === 'scale') {
      const d = Math.hypot(p.x - L.cx, p.y - L.cy);
      L.w = +LW.clamp((drag.w0 * d) / drag.d0, 0.3, 60).toFixed(2);
    } else if (drag.mode === 'rot') {
      let a = drag.r0 + ((Math.atan2(p.y - L.cy, p.x - L.cx) - drag.a0) * 180) / Math.PI;
      a = ((a + 540) % 360) - 180;
      if (e.shiftKey) a = Math.round(a / 15) * 15; else if (Math.abs(a) < 2) a = 0;
      L.rot = +a.toFixed(1);
    } else if (drag.mode === 'hoop') {
      let cx = drag.cx + p.x - drag.p0.x, cy = drag.cy + p.y - drag.p0.y;
      if (Math.abs(cx) < pxSize() * 6) cx = 0;
      M.hoop.cx = +cx.toFixed(2); M.hoop.cy = +cy.toFixed(2);
    }
    if (L) updateLayerEl(L);
    renderOverlay(); renderProps();
  }
  function onUp() {
    if (!drag) return;
    if (drag.mode === 'measure') {
      const m = drag.m; drag = null;
      if (m.b && Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) > 0.05) M.measures.push(m);
      renderOverlay(); updMeasureBtns();
      return;
    }
    svg.classList.remove('panning');
    gGuides.querySelectorAll('.snap').forEach((n) => n.remove());
    if (drag.mode !== 'pan') render();
    drag = null;
  }

  // ---------- exports ----------
  const layerExportG = (L, ox, oy, paperOverride) => {
    const { n } = dims(L); if (!n) return '';
    const k = (L.w / n.w) * 10; // mm out per mm in
    const tr = `translate(${LW.fmt((L.cx - ox) * 10)} ${LW.fmt((L.cy - oy) * 10)}) rotate(${L.rot}) scale(${LW.fmt(L.flip ? -k : k, 5)} ${LW.fmt(k, 5)}) translate(${LW.fmt(-n.w / 2)} ${LW.fmt(-n.h / 2)})`;
    const paper = paperOverride !== undefined ? paperOverride : L.paper === 'hide' ? null : '#ffffff';
    return `<g id="${LW.esc(LW.slug(L.name))}" data-thread="${L.color}">\n<g transform="${tr}">${LW.resolveInner(n.inner, L.color, paper)}</g>\n</g>`;
  };
  M.exportHoop = () => {
    const H = hoopDef(); if (!H.w) return LW.toast('Choose a hoop first');
    const stat = hoopStatus(), list = stat.inside.concat(stat.partial);
    if (!list.length) return LW.toast('No layers inside the hoop');
    if (stat.partial.length && !confirm(`${stat.partial.map((l) => l.name).join(', ')} cross the hoop edge and will be clipped by the field. Export anyway?`)) return;
    const r = hoopRect();
    const ordered = sideLayers().filter((l) => list.includes(l));
    const body = ordered.map((L) => layerExportG(L, r.x0, r.y0)).join('\n');
    const svgTxt = LW.svgDoc(H.w * 10, H.h * 10, body, `Leeway hoop ${H.w}x${H.h} cm`);
    const name = `leeway-${M.side}-hoop-${H.w}x${H.h}-${ordered.map((l) => LW.slug(l.name)).join('+').slice(0, 60)}.svg`;
    LW.download(name, svgTxt, 'image/svg+xml');
    LW.toast(`Exported ${ordered.length} layer${ordered.length > 1 ? 's' : ''} at true size (mm), positioned in the hoop`);
  };
  M.exportSelected = () => {
    const L = selL(); if (!L) return LW.toast('Select a layer first');
    const b = aabb(corners(L));
    const body = layerExportG(L, b.x0, b.y0);
    LW.download(`${LW.slug(L.name)}-${((b.x1 - b.x0) * 10).toFixed(0)}x${((b.y1 - b.y0) * 10).toFixed(0)}mm.svg`, LW.svgDoc((b.x1 - b.x0) * 10, (b.y1 - b.y0) * 10, body, L.name), 'image/svg+xml');
  };
  M.exportPNG = async () => {
    const v = G.img, pad = 2;
    const defs = svg.querySelector('defs').outerHTML;
    const shirt = gShirt.outerHTML;
    const layers = gLayers.outerHTML;
    const vb = `${v.x - pad} ${v.y - pad} ${v.w + 2 * pad} ${v.h + 2 * pad}`;
    const W = 2400, Hh = Math.round((W * (v.h + 2 * pad)) / (v.w + 2 * pad));
    const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${W}" height="${Hh}">${defs}<rect x="${v.x - pad}" y="${v.y - pad}" width="${v.w + 2 * pad}" height="${v.h + 2 * pad}" fill="#efebe4"/>${shirt}${layers}</svg>`;
    try { await LW.svgToPng(s, W, Hh, `leeway-mockup-${M.side}-${new Date().toISOString().slice(0, 10)}.png`); }
    catch (e) { LW.toast('PNG export failed: ' + e.message, 'err'); }
  };
  M.saveProject = () => {
    const used = new Set(M.layers.map((l) => l.designId));
    const designs = LW.library.items.filter((d) => used.has(d.id)).map(({ id, name, source, svg }) => ({ id, name, source, svg }));
    LW.download(`leeway-project-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: 'leeway', version: 2, shirtColor: M.shirtColor, hoops: M.hoops, layers: M.layers, designs }, null, 1), 'application/json');
  };
  M.openProject = async (file) => {
    try {
      const o = JSON.parse(await LW.readFile(file));
      (o.designs || []).forEach((d) => { if (!LW.library.get(d.id)) { const x = { ...d, source: d.source === 'bundled' ? 'imported' : d.source }; LW.library.ensure(x); if (x.norm) LW.library.items.push(x); } });
      LW.library.persist(); LW.library.emit();
      pushHistory();
      M.layers = (o.layers || []).filter((l) => LW.library.get(l.designId));
      if (o.hoops) M.hoops = o.hoops; else if (o.hoop) M.hoops.front = o.hoop;
      M.hoop = M.hoops[M.side]; M.shirtColor = o.shirtColor || M.shirtColor; M.sel = null;
      LW.swatches($('#shirt-sw'), LW.SHIRT_COLORS, M.shirtColor, M.setShirtColor);
      $('#hoop-type').value = M.hoop.type;
      rebuildLayers(); applyShirt(); render();
      LW.toast('Project opened');
    } catch (e) { LW.toast('Could not open project: ' + e.message, 'err'); }
  };

  // ---------- placement presets ----------
  const PLACES = {
    front: [['center', 'Centre chest'], ['left', 'Left chest'], ['right', 'Right chest'], ['low', 'Lower front'], ['sleeve', 'Sleeve']],
    back: [['neck', 'Back neck'], ['upper', 'Upper back'], ['cback', 'Centre back'], ['low', 'Lower back'], ['sleeve', 'Sleeve']],
  };
  function renderPlaceChips() {
    const el = $('#p-place');
    el.innerHTML = PLACES[M.side].map(([k, t]) => `<button data-place="${k}">${t}</button>`).join('');
    LW.$$('button', el).forEach((b) => (b.onclick = () => place(b.dataset.place)));
  }
  const place = (kind) => change((L) => {
    const { w, h } = dims(L), N = G.neck;
    if (kind === 'center') { L.cx = 0; L.cy = N + 7 + h / 2; L.rot = 0; }
    if (kind === 'left') { L.cx = 11; L.cy = N + 9 + h / 2; L.rot = 0; }  // wearer's left = viewer's right
    if (kind === 'right') { L.cx = -11; L.cy = N + 9 + h / 2; L.rot = 0; }
    if (kind === 'low') { L.cx = 0; L.cy = G.hem - 8 - h / 2; L.rot = 0; }
    if (kind === 'neck') { if (w > 8) L.w = 8; L.cx = 0; L.cy = N + 2.5 + dims(L).h / 2; L.rot = 0; }
    if (kind === 'upper') { L.cx = 0; L.cy = N + 6 + h / 2; L.rot = 0; }
    if (kind === 'cback') { L.cx = 0; L.cy = N + 18 + h / 2; L.rot = 0; }
    if (kind === 'sleeve') { L.cx = G.sleeveC[0]; L.cy = G.sleeveC[1]; L.rot = G.sleeveRot; if (w > 8) L.w = 8; }
    // bring the hoop along if this is the only design in it
    const st = hoopStatus();
    if (hoopDef().w && st.partial.includes(L) && st.inside.length === 0 && st.partial.length === 1) { M.hoop.cx = L.cx; M.hoop.cy = L.cy; }
  });

  // ---------- init ----------
  M.init = () => {
    const saved = LW.store.get('mockup', null);
    if (saved) {
      M.layers = (saved.layers || []).filter((l) => LW.library.get(l.designId));
      if (saved.hoops) M.hoops = saved.hoops; else if (saved.hoop) M.hoops.front = saved.hoop;
      M.shirtColor = saved.shirtColor || M.shirtColor;
      if (saved.thread === false) M.thread = false;
      ['side', 'photo', 'calib'].forEach((k) => saved[k] && (M[k] = saved[k]));
    }
    M.layers.forEach((l) => { if (!l.side) l.side = 'front'; });
    M.hoop = M.hoops[M.side];
    geom();
    buildStage();
    $('#t-thread').checked = M.thread;

    LW.swatches($('#shirt-sw'), LW.SHIRT_COLORS, M.shirtColor, M.setShirtColor);
    const ht = $('#hoop-type');
    ht.innerHTML = Object.entries(LW.HOOPS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    ht.value = M.hoop.type;
    ht.onchange = () => { pushHistory(); M.hoop.type = ht.value; render(); };
    $('#hoop-to-sel').onclick = () => { const L = selL(); if (!L) return LW.toast('Select a layer first'); pushHistory(); M.hoop.cx = L.cx; M.hoop.cy = L.cy; render(); };
    $('#hoop-center').onclick = () => { pushHistory(); M.hoop.cx = 0; M.hoop.cy = G.neck + (M.side === 'front' ? 7 : 6) + hoopDef().h / 2; render(); };
    LW.$$('#side-seg button').forEach((b) => (b.onclick = () => M.setView({ side: b.dataset.v })));
    $('#shirt-photo').onchange = (e) => M.setView({ photo: e.target.value });
    $('#shirt-calib').onchange = (e) => M.setView({ calib: e.target.value });
    $('#m-measure').onclick = () => setMeasuring(!M.measuring);
    $('#m-clear').onclick = () => { M.measures = M.measures.filter((m) => m.side !== M.side); renderOverlay(); updMeasureBtns(); };

    $('#lib-file').onchange = (e) => { importFiles(Array.from(e.target.files)); e.target.value = ''; };
    LW.dropzone($('#lib-drop'), importFiles);
    LW.dropzone($('#stage-wrap'), importFiles);
    LW.library.onChange(renderLibrary);

    svg.addEventListener('pointerdown', onDown);
    svg.addEventListener('pointermove', onMove);
    svg.addEventListener('pointerup', onUp);
    svg.addEventListener('pointercancel', onUp);
    svg.addEventListener('wheel', (e) => { e.preventDefault(); const p = toSvg(e); zoomBy(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y); }, { passive: false });
    svg.addEventListener('dblclick', (e) => { if (!e.target.closest('.layer-g')) fitShirt(); });
    new ResizeObserver(() => renderOverlay()).observe(svg);

    $('#z-in').onclick = () => zoomBy(1 / 1.3); $('#z-out').onclick = () => zoomBy(1.3);
    $('#z-fit').onclick = fitShirt;
    $('#z-hoop').onclick = () => { const H = hoopDef(); if (!H.w) return fitRect(-20, 0, 20, 40); const r = hoopRect(); fitRect(r.x0, r.y0, r.x1, r.y1, 5); };
    $('#t-thread').onchange = (e) => { M.thread = e.target.checked; M.layers.forEach(updateLayerEl); save(); };
    $('#t-grid').onchange = (e) => { M.grid = e.target.checked; renderOverlay(); };
    $('#t-dims').onchange = (e) => { M.dims = e.target.checked; renderOverlay(); };
    $('#x-png').onclick = M.exportPNG; $('#x-hoop').onclick = M.exportHoop;
    $('#x-sel').onclick = M.exportSelected; $('#x-save').onclick = M.saveProject;
    $('#x-open').onchange = (e) => { if (e.target.files[0]) M.openProject(e.target.files[0]); e.target.value = ''; };
    $('#x-clear').onclick = () => { if (!M.layers.length || !confirm('Remove all layers from the shirt?')) return; pushHistory(); M.layers = []; M.sel = null; rebuildLayers(); render(); };
    LW.$$('.menu-b button, .menu-b .btnlike').forEach((b) => b.addEventListener('click', () => b.closest('details').removeAttribute('open')));

    // properties
    $('#p-name').oninput = (e) => { const L = selL(); if (L) { L.name = e.target.value; renderLayerList(); save(); } };
    $('#p-w').onchange = (e) => change((L) => (L.w = Math.max(0.2, +e.target.value || L.w)));
    $('#p-h').onchange = (e) => change((L) => { const d = dims(L); if (d.n) L.w = Math.max(0.2, ((+e.target.value || d.h) * d.n.w) / d.n.h); });
    $('#p-x').onchange = (e) => change((L) => (L.cx = +e.target.value || 0));
    $('#p-y').onchange = (e) => change((L) => (L.cy = (+e.target.value || 0) + G.neck + dims(L).h / 2));
    $('#p-r').onchange = (e) => change((L) => (L.rot = +e.target.value || 0));
    $('#p-paper').onchange = (e) => change((L) => (L.paper = e.target.value));
    $('#p-flip').onclick = () => change((L) => (L.flip = !L.flip));
    $('#p-dup').onclick = () => { const L = selL(); if (!L) return; pushHistory(); const c = { ...L, id: LW.uid('L'), name: L.name + ' copy', cx: L.cx + 1, cy: L.cy + 1 }; M.layers.push(c); M.sel = c.id; rebuildLayers(); render(); };
    $('#p-del').onclick = () => { const L = selL(); if (!L) return; pushHistory(); M.layers = M.layers.filter((l) => l !== L); M.sel = null; rebuildLayers(); render(); };
    renderPlaceChips();

    // keyboard
    window.addEventListener('keydown', (e) => {
      if (!$('#view-mockup').classList.contains('on')) return;
      const typing = /input|select|textarea/i.test(document.activeElement.tagName);
      if (e.code === 'Space' && !typing) { spaceDown = true; svg.classList.add('panning'); e.preventDefault(); return; }
      if (typing) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod && e.key.toLowerCase() === 'm') { setMeasuring(!M.measuring); return; }
      if (e.key === 'Escape' && M.measuring) { setMeasuring(false); return; }
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? M.redo() : M.undo(); return; }
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); $('#p-dup').click(); return; }
      const L = selL(); if (!L) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); $('#p-del').click(); }
      if (e.key === 'Escape') { M.sel = null; render(); }
      const st = e.shiftKey ? 1 : 0.1;
      const mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, -st], ArrowDown: [0, st] }[e.key];
      if (mv) { e.preventDefault(); change((l) => { l.cx = +(l.cx + mv[0]).toFixed(2); l.cy = +(l.cy + mv[1]).toFixed(2); }); }
    });
    window.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceDown = false; svg.classList.remove('panning'); } });

    renderLibrary();
    rebuildLayers();
    applyShirt();
    syncViewUI();
    fitShirt();
    render();
  };
})(window.LW);
