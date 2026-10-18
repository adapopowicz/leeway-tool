/* Image -> ASCII art or pixel art, output as true-size SVG (mm) for digitising. */
(function (LW) {
  'use strict';
  const $ = LW.$;
  const C = (LW.convert = {
    img: null, name: 'image', mode: 'ascii', hoop: 'h10', widthMm: 90,
    bri: 0, con: 0, gam: 100, cut: 8, inv: false, auto: true,
    astyle: 'ramp', cols: 38, set: ' .:-=+*#%@', custom: '', edge: 45, glyph: 'stroke', lw: 5,
    px: 25, psample: 'mean', dither: 'none', thr: 50, pstyle: 'solid', gap: 10,
    shirt: '#6c524b', thread: '#efe6cf',
    result: null,
  });
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  // ---- sampling: returns darkness grid (1 = ink) of size cols x rows, sampled with box filter ----
  function sample(cols, rows, sub = 1, darkest = false) {
    const W = cols * sub, H = rows * sub;
    const k = Math.max(1, Math.min(darkest ? 8 : 4, Math.floor(2400 / Math.max(W, H))));
    const cw = W * k, ch = H * k;
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(C.img, 0, 0, cw, ch);
    const data = ctx.getImageData(0, 0, cw, ch).data;
    const out = new Float32Array(W * H);
    const b = C.bri / 200, cc = LW.clamp(C.con / 100, -0.99, 0.99), f = (1 + cc) / (1 - cc), g = C.gam / 100, cut = C.cut / 100;
    const adj = (L) => {
      L = LW.clamp(L + b, 0, 1);
      L = LW.clamp((L - 0.5) * f + 0.5, 0, 1);
      L = Math.pow(L, g);
      if (C.inv) L = 1 - L;
      const D = 1 - L;
      return D <= cut ? 0 : (D - cut) / (1 - cut);
    };
    const useMax = darkest && C.mode === 'pixel' && C.psample === 'max';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let s = 0, mx = 0;
      for (let yy = 0; yy < k; yy++) for (let xx = 0; xx < k; xx++) {
        const i = ((y * k + yy) * cw + x * k + xx) * 4, a = data[i + 3] / 255;
        const L = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255;
        if (useMax) mx = Math.max(mx, adj(L * a + (1 - a)));
        else s += L * a + (1 - a);
      }
      out[y * W + x] = useMax ? mx : adj(s / (k * k));
    }
    if (C.auto) { // stretch so the darkest ~1% becomes full ink (helps coloured backgrounds / grey lines)
      const srt = Float32Array.from(out).sort();
      const hi = srt[Math.floor(srt.length * 0.99)] || 1, lo = srt[Math.floor(srt.length * 0.02)] || 0;
      if (hi - lo > 0.05) for (let i = 0; i < out.length; i++) out[i] = LW.clamp((out[i] - lo) / (hi - lo), 0, 1);
    }
    return { d: out, W, H };
  }

  const hoop = () => LW.HOOPS[C.hoop];
  const charset = () => {
    let s = C.set === 'custom' ? C.custom : C.set;
    if (!s) s = ' .:-=+*#%@';
    if (s[0] !== ' ') s = ' ' + s;
    return s;
  };

  // ---- ASCII ----
  function asciiRows() {
    const ar = C.img.naturalHeight / C.img.naturalWidth;
    const cols = C.cols, rows = Math.max(1, Math.round(cols * ar * LW.font.ASPECT));
    const SW = 6, SH = 10;
    const hi = sample(cols, rows, 1); // cell means
    const needEdges = C.astyle !== 'ramp';
    const ed = needEdges ? sample(cols * SW / 2, rows * SH / 2, 2) : null; // 6x10 px per cell
    const ramp = charset();
    const thr = 1.1 * (1 - C.edge / 100) + 0.04;
    const out = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const D = hi.d[r * cols + c];
        let ch = ramp[Math.min(ramp.length - 1, Math.round(D * (ramp.length - 1)))];
        if (needEdges) {
          let jxx = 0, jyy = 0, jxy = 0, mag = 0, wy = 0;
          const W = ed.W, H = ed.H, a = ed.d;
          for (let y = r * SH; y < (r + 1) * SH; y++) for (let x = c * SW; x < (c + 1) * SW; x++) {
            const px = (xx, yy) => a[LW.clamp(yy, 0, H - 1) * W + LW.clamp(xx, 0, W - 1)];
            const gx = px(x + 1, y - 1) + 2 * px(x + 1, y) + px(x + 1, y + 1) - px(x - 1, y - 1) - 2 * px(x - 1, y) - px(x - 1, y + 1);
            const gy = px(x - 1, y + 1) + 2 * px(x, y + 1) + px(x + 1, y + 1) - px(x - 1, y - 1) - 2 * px(x, y - 1) - px(x + 1, y - 1);
            const m = Math.hypot(gx, gy);
            jxx += gx * gx; jyy += gy * gy; jxy += gx * gy; mag += m; wy += m * (y - r * SH + 0.5);
          }
          const theta = 0.5 * Math.atan2(2 * jxy, jxx - jyy); // gradient direction
          const phi = ((theta * 180) / Math.PI + 90 + 360) % 180; // line direction
          const pr = (phi * Math.PI) / 180;
          const seg = Math.min(SW / Math.max(1e-3, Math.abs(Math.cos(pr))), SH / Math.max(1e-3, Math.abs(Math.sin(pr))));
          const strength = mag / seg / 4; // ≈1 for a crisp full-contrast edge, independent of its angle
          if (strength > thr) {
            const cy = wy / mag / SH;
            if (phi < 22.5 || phi > 157.5) ch = cy > 0.62 ? '_' : cy < 0.3 ? '"' : '-';
            else if (phi < 67.5) ch = '\\';
            else if (phi < 112.5) ch = cy > 0.75 ? '.' : '|';
            else ch = '/';
          } else if (C.astyle === 'edges') ch = ' ';
        }
        line += ch;
      }
      out.push(line.replace(/\s+$/, ''));
    }
    // trim empty rows top/bottom & common left margin
    while (out.length && !out[0].trim()) out.shift();
    while (out.length && !out[out.length - 1].trim()) out.pop();
    const lead = Math.min(...out.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
    return { rows: out.map((l) => l.slice(isFinite(lead) ? lead : 0)), cols };
  }

  function buildAscii() {
    const { rows, cols } = asciiRows();
    const cw = C.widthMm / cols, chh = cw / LW.font.ASPECT;
    const usedCols = Math.max(1, ...rows.map((r) => r.length));
    const wMm = usedCols * cw, hMm = Math.max(1, rows.length) * chh;
    const lw = C.lw / 10;
    let body;
    if (C.glyph === 'stroke') {
      const d = LW.font.textPath(rows, chh);
      body = `<path d="${d}" fill="none" stroke="${C.thread}" stroke-width="${LW.fmt(lw)}" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      body = `<g fill="${C.thread}" font-family="'Courier New', Courier, monospace" font-size="${LW.fmt(chh * 0.98)}" xml:space="preserve">` +
        rows.map((r, i) => r.trim() ? `<text x="0" y="${LW.fmt((i + 0.78) * chh)}" textLength="${LW.fmt(r.length * cw)}" lengthAdjust="spacing">${LW.esc(r)}</text>` : '').join('') + '</g>';
    }
    const glyphs = rows.join('').replace(/\s/g, '').length;
    const warn = [];
    if (chh < 3.5) warn.push(`Characters are ${chh.toFixed(1)} mm tall — under ~3.5 mm they turn into blobs when stitched. Use fewer columns or a bigger width.`);
    if (C.glyph === 'text') warn.push('Text output needs the font converted to outlines before Ember can read it. The single-line stroke option avoids that.');
    return { body, wMm, hMm, rows, info: `${usedCols} × ${rows.length} characters · ${glyphs} glyphs · char ${cw.toFixed(1)} × ${chh.toFixed(1)} mm`, warn };
  }

  // ---- PIXEL ----
  function buildPixel() {
    const pmm = C.px / 10;
    const cols = Math.max(2, Math.round(C.widthMm / pmm));
    const rows = Math.max(1, Math.round((cols * C.img.naturalHeight) / C.img.naturalWidth));
    const s = sample(cols, rows, 1, true), d = s.d;
    const on = new Uint8Array(cols * rows), t = C.thr / 100;
    if (C.dither === 'none') for (let i = 0; i < d.length; i++) on[i] = d[i] > t ? 1 : 0;
    else if (C.dither === 'bayer') for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) { const i = y * cols + x; on[i] = d[i] + (0.5 - t) > (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16 ? 1 : 0; }
    else {
      const e = Float32Array.from(d);
      const k = C.dither === 'fs' ? [[1, 0, 7 / 16], [-1, 1, 3 / 16], [0, 1, 5 / 16], [1, 1, 1 / 16]] : [[1, 0, 1 / 8], [2, 0, 1 / 8], [-1, 1, 1 / 8], [0, 1, 1 / 8], [1, 1, 1 / 8], [0, 2, 1 / 8]];
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x, v = e[i], o = v > t ? 1 : 0;
        on[i] = o; const err = v - o;
        k.forEach(([dx, dy, w]) => { const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < cols && yy < rows) e[yy * cols + xx] += err * w; });
      }
    }
    // crop to content
    let x0 = cols, y0 = rows, x1 = -1, y1 = -1, count = 0;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (on[y * cols + x]) { count++; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    if (x1 < 0) { x0 = y0 = 0; x1 = y1 = 0; }
    const filled = (i, j) => { const x = i + x0, y = j + y0; return x >= x0 && x <= x1 && y >= y0 && y <= y1 && on[y * cols + x] === 1; };
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const wMm = cw * pmm, hMm = ch * pmm;
    let body = '';
    const gap = C.gap / 100;
    const lw = Math.max(0.3, C.gap / 10);
    if (C.pstyle === 'solid' || C.pstyle === 'outline') {
      const polys = LW.gridContours(filled, cw, ch);
      const dd = LW.polysToPath(polys, pmm);
      body = C.pstyle === 'solid'
        ? `<path d="${dd}" fill="${C.thread}" fill-rule="evenodd"/>`
        : `<path d="${dd}" fill="none" stroke="${C.thread}" stroke-width="${LW.fmt(lw)}" stroke-linejoin="miter"/>`;
    } else {
      const parts = [];
      for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
        if (!filled(i, j)) continue;
        const x = i * pmm, y = j * pmm, sz = pmm * (1 - gap), o = (pmm - sz) / 2;
        if (C.pstyle === 'tiles') parts.push(`M${LW.fmt(x + o)} ${LW.fmt(y + o)}h${LW.fmt(sz)}v${LW.fmt(sz)}h${LW.fmt(-sz)}Z`);
        else if (C.pstyle === 'dots') { const r = sz / 2, cx = x + pmm / 2, cy = y + pmm / 2; parts.push(`M${LW.fmt(cx - r)} ${LW.fmt(cy)}a${LW.fmt(r)} ${LW.fmt(r)} 0 1 0 ${LW.fmt(2 * r)} 0a${LW.fmt(r)} ${LW.fmt(r)} 0 1 0 ${LW.fmt(-2 * r)} 0Z`); }
        else { const m = pmm * 0.15; parts.push(`M${LW.fmt(x + m)} ${LW.fmt(y + m)}L${LW.fmt(x + pmm - m)} ${LW.fmt(y + pmm - m)}M${LW.fmt(x + pmm - m)} ${LW.fmt(y + m)}L${LW.fmt(x + m)} ${LW.fmt(y + pmm - m)}`); }
      }
      body = C.pstyle === 'cross'
        ? `<path d="${parts.join('')}" fill="none" stroke="${C.thread}" stroke-width="${LW.fmt(lw)}" stroke-linecap="round"/>`
        : `<path d="${parts.join('')}" fill="${C.thread}"/>`;
    }
    const warn = [];
    if (pmm < 2 && C.pstyle !== 'outline') warn.push(`${pmm.toFixed(1)} mm pixels are very small for fill stitches — try ≥ 2.5 mm, or the outline style.`);
    if (C.pstyle === 'outline' && lw > pmm / 2) warn.push('Line is thick compared to the pixel size — steps will fill in.');
    if (C.dither !== 'none' && pmm < 3) warn.push('Dithering creates many isolated pixels = lots of jumps/trims. Bigger pixels or no dithering stitch cleaner.');
    return { body, wMm, hMm, info: `${cw} × ${ch} pixels · ${count} filled · pixel ${pmm.toFixed(1)} mm`, warn };
  }

  // ---- render ----
  let raf;
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(run); };
  function run() {
    if (!C.img) return;
    let r;
    try { r = C.mode === 'ascii' ? buildAscii() : buildPixel(); } catch (e) { console.error(e); LW.toast('Conversion failed: ' + e.message, 'err'); return; }
    C.result = r;
    const H = hoop();
    const fits = !H.w || (r.wMm <= H.w * 10 + 0.01 && r.hMm <= H.h * 10 + 0.01);
    $('#cv-size').innerHTML = `Output <b>${r.wMm.toFixed(1)} × ${r.hMm.toFixed(1)} mm</b>` + (H.w ? (fits ? ' · fits ✓' : ` · <span style="color:var(--warn)">too big for ${H.w}×${H.h} hoop</span>`) : '') + `<br>${r.info}`;
    $('#cv-warn').innerHTML = r.warn.join('<br>');
    // preview: hoop field around the design
    const fw = H.w ? Math.max(H.w * 10, r.wMm) : r.wMm, fh = H.w ? Math.max(H.h * 10, r.hMm) : r.hMm, m = Math.max(fw, fh) * 0.06;
    const ox = (fw - r.wMm) / 2, oy = (fh - r.hMm) / 2;
    $('#cv-out').style.background = C.shirt;
    $('#cv-out').innerHTML = `<svg viewBox="${-m} ${-m} ${fw + 2 * m} ${fh + 2 * m}" style="width:100%;height:100%;max-width:none;max-height:none">
      ${H.w ? `<rect x="0" y="0" width="${H.w * 10}" height="${H.h * 10}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="${fw / 400}" stroke-dasharray="${fw / 100} ${fw / 150}"/>
      <text x="0" y="${-m * 0.3}" font-size="${fw / 40}" fill="#fff" fill-opacity=".7" font-family="ui-monospace,Menlo,monospace">${H.w * 10} × ${H.h * 10} mm hoop field</text>` : ''}
      <g transform="translate(${ox} ${oy})">${r.body}</g></svg>`;
  }

  const exportSvg = () => C.result && LW.svgDoc(C.result.wMm, C.result.hMm, C.result.body, `${C.name} — ${C.mode}`);
  const outName = (ext) => `${LW.slug(C.name)}-${C.mode}-${Math.round(C.result.wMm)}x${Math.round(C.result.hMm)}mm.${ext}`;

  async function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) return LW.toast('Please choose an image file');
    const url = await LW.readFile(file, 'dataURL');
    C.img = await LW.loadImage(url);
    C.name = (file.name || 'pasted').replace(/\.[^.]+$/, '');
    $('#cv-src-img').src = url;
    $('#cv-src-info').textContent = `${C.name} · ${C.img.naturalWidth} × ${C.img.naturalHeight} px`;
    schedule();
  }

  C.init = () => {
    // hoop select
    const hs = $('#cv-hoop');
    hs.innerHTML = Object.entries(LW.HOOPS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    hs.value = C.hoop;
    hs.onchange = () => {
      C.hoop = hs.value; const H = hoop();
      if (H.w) {
        const ar = C.img ? C.img.naturalHeight / C.img.naturalWidth : 1;
        C.widthMm = Math.floor(Math.min(H.w * 10, (H.h * 10) / ar) * 0.95);
        $('#cv-width').value = C.widthMm;
      }
      schedule();
    };
    $('#cv-width').oninput = (e) => { C.widthMm = LW.clamp(+e.target.value || 90, 5, 400); schedule(); };

    const seg = (id, key, after) => LW.$$(`#${id} button`).forEach((b) => (b.onclick = () => {
      LW.$$(`#${id} button`).forEach((x) => x.classList.toggle('on', x === b)); C[key] = b.dataset.v; after && after(); schedule();
    }));
    seg('cv-mode', 'mode', () => { $('#cv-ascii').hidden = C.mode !== 'ascii'; $('#cv-pixel').hidden = C.mode !== 'pixel'; $('#cv-copy').hidden = $('#cv-txt').hidden = C.mode !== 'ascii'; });
    seg('cv-astyle', 'astyle');

    const rng = (id, key, fmt) => LW.bindRange($('#' + id), fmt, (v) => { C[key] = v; schedule(); });
    rng('cv-bri', 'bri'); rng('cv-con', 'con'); rng('cv-gam', 'gam', (v) => (v / 100).toFixed(2)); rng('cv-cut', 'cut', (v) => v + '%');
    rng('cv-cols', 'cols'); rng('cv-edge', 'edge'); rng('cv-lw', 'lw', (v) => (v / 10).toFixed(1) + ' mm');
    rng('cv-px', 'px', (v) => (v / 10).toFixed(1) + ' mm'); rng('cv-thr', 'thr', (v) => v + '%');
    const gapFmt = (v) => (C.pstyle === 'outline' || C.pstyle === 'cross' ? Math.max(0.3, v / 10).toFixed(1) + ' mm' : v + '%');
    const updGap = rng('cv-gap', 'gap', gapFmt);
    $('#cv-inv').onchange = (e) => { C.inv = e.target.checked; schedule(); };
    $('#cv-auto').onchange = (e) => { C.auto = e.target.checked; schedule(); };
    $('#cv-set').onchange = (e) => { C.set = e.target.value; $('#cv-custom').hidden = C.set !== 'custom'; schedule(); };
    $('#cv-custom').oninput = (e) => { C.custom = e.target.value; schedule(); };
    $('#cv-glyph').onchange = (e) => { C.glyph = e.target.value; schedule(); };
    $('#cv-psample').onchange = (e) => { C.psample = e.target.value; schedule(); };
    $('#cv-dither').onchange = (e) => { C.dither = e.target.value; schedule(); };
    $('#cv-pstyle').onchange = (e) => { C.pstyle = e.target.value; updGap(); schedule(); };

    LW.swatches($('#cv-shirt'), LW.SHIRT_COLORS, C.shirt, (h) => { C.shirt = h; schedule(); });
    LW.swatches($('#cv-thread'), LW.THREADS.slice(0, 12).concat(LW.THREADS.slice(-3)), C.thread, (h) => { C.thread = h; schedule(); });

    $('#cv-file').onchange = (e) => { loadFile(e.target.files[0]); e.target.value = ''; };
    LW.dropzone($('#cv-drop'), (f) => loadFile(f[0]));
    LW.dropzone($('#cv-out'), (f) => loadFile(f[0]));
    window.addEventListener('paste', (e) => {
      if (!$('#view-convert').classList.contains('on')) return;
      const it = Array.from(e.clipboardData.items || []).find((i) => i.type.startsWith('image/'));
      if (it) loadFile(it.getAsFile());
    });

    const need = () => { if (!C.result) { LW.toast('Choose an image first'); return false; } return true; };
    $('#cv-svg').onclick = () => need() && LW.download(outName('svg'), exportSvg(), 'image/svg+xml');
    $('#cv-txt').onclick = () => need() && C.result.rows && LW.download(outName('txt'), C.result.rows.join('\n') + '\n', 'text/plain');
    $('#cv-copy').onclick = async () => { if (!need() || !C.result.rows) return; try { await navigator.clipboard.writeText(C.result.rows.join('\n')); LW.toast('ASCII copied'); } catch (e) { LW.toast('Clipboard blocked — use .txt instead'); } };
    $('#cv-png').onclick = () => {
      if (!need()) return;
      const r = C.result, k = 300 / 25.4; // 300 dpi, black on white for auto-digitising
      const s = LW.svgDoc(r.wMm, r.hMm, r.body.split(C.thread).join('#000000')).replace(/width="[^"]+mm" height="[^"]+mm"/, `width="${Math.round(r.wMm * k)}" height="${Math.round(r.hMm * k)}"`);
      LW.svgToPng(s, Math.round(r.wMm * k), Math.round(r.hMm * k), outName('png'), '#ffffff');
    };
    $('#cv-send').onclick = () => {
      if (!need()) return;
      const d = LW.library.add(`${C.name} (${C.mode})`, exportSvg().split(C.thread).join('#1f1c1a'), 'generated');
      if (!d) return;
      LW.showTab('mockup'); LW.mockup.addLayer(d.id, { color: C.thread });
      LW.toast('Added to the library and placed on the shirt');
    };
    $('#cv-copy').hidden = $('#cv-txt').hidden = false;
  };
})(window.LW);
