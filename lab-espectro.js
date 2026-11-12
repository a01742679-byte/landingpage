/* ==========================================================================
   SVOLTS · Laboratorio — Simulación 1: espectro de la luz solar
   Gráfica SVG de irradiancia espectral (ASTM G173-03 tabulado + modelo de
   cuerpo negro opcional), regiones UV/visible/IR, lectura al pasar el cursor,
   selección de longitud de onda con teclado, energía del fotón y onda animada.
   ========================================================================== */
(() => {
  'use strict';
  const L = window.SVLab;
  const U = window.SVLabUI;
  const G = window.SV_G173;
  const { $, nf, state } = U;
  const NS = 'http://www.w3.org/2000/svg';

  // Curva de cuerpo negro precalculada en la misma malla que G173 (modelo)
  const BB = G.wl.map((l) => L.planckEarth(l, 5772));

  const SERIES = {
    etr: { key: 'etr', name: 'Extraterrestre AM0', short: 'AM0', data: G.etr, cls: 'sp-etr', terrestrial: false, src: 'ASTM G173 (tabulado)' },
    global: { key: 'global', name: 'Global AM1.5 (37°)', short: 'AM1.5G', data: G.global, cls: 'sp-glo', terrestrial: true, src: 'ASTM G173 (tabulado)' },
    direct: { key: 'direct', name: 'Directa AM1.5', short: 'AM1.5D', data: G.direct, cls: 'sp-dir', terrestrial: true, src: 'ASTM G173 (tabulado)' },
    bb: { key: 'bb', name: 'Cuerpo negro 5772 K', short: 'Planck', data: BB, cls: 'sp-bb', terrestrial: false, src: 'Modelo teórico' },
  };
  const RANGES = { todo: [280, 2500], uv: [280, 400], vis: [380, 750], ir: [750, 4000] };
  // Bandas de absorción atmosférica conocidas (solo se señalan en curvas terrestres)
  const ABSORB = [
    { l: 300, t: 'O₃' }, { l: 760, t: 'O₂' }, { l: 940, t: 'H₂O' }, { l: 1130, t: 'H₂O' },
    { l: 1400, t: 'H₂O' }, { l: 1900, t: 'H₂O' }, { l: 2700, t: 'H₂O, CO₂' },
  ];

  const chartEl = $('#specChart');
  const tip = $('#specTip');
  const lIn = $('#specL'), lNum = $('#specLNum'), fNum = $('#specFNum'), gIn = $('#specG');

  const activeSeries = () => {
    const v = state.specView;
    const list = v === 'terrestre' ? ['global', 'direct'] : v === 'extraterrestre' ? ['etr'] : ['etr', 'global', 'direct'];
    if (state.specBB) list.push('bb');
    return list.map((k) => SERIES[k]);
  };
  const scaleOf = (s) => (s.terrestrial ? state.specG / 1000 : 1);
  const valueAt = (s, l) => { const v = L.interp(G.wl, s.data, l); return v == null ? null : v * scaleOf(s); };

  /* ---------------- Dibujo de la gráfica ---------------- */
  let geo = null; // geometría de la última gráfica (para la lectura con el cursor)
  function niceStep(span, n) {
    const raw = span / n; const p = Math.pow(10, Math.floor(Math.log10(raw))); const m = raw / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
  }
  function render() {
    const compact = chartEl.clientWidth > 0 && chartEl.clientWidth < 640;
    const W = compact ? 420 : 960, H = compact ? 400 : 440, Lm = compact ? 46 : 66, R = compact ? 10 : 16, T = 36, B = 54;
    const [x0, x1] = RANGES[state.specRegion] || RANGES.todo;
    const series = activeSeries();
    // máximo visible
    let ymax = 0;
    series.forEach((s) => { G.wl.forEach((l, i) => { if (l >= x0 && l <= x1) ymax = Math.max(ymax, s.data[i] * scaleOf(s)); }); });
    ymax = Math.max(0.05, ymax * 1.1);
    const X = (l) => Lm + ((l - x0) / (x1 - x0)) * (W - Lm - R);
    const Y = (v) => T + (1 - v / ymax) * (H - T - B);
    geo = { W, H, Lm, R, T, B, x0, x1, ymax, X, Y };

    let g = '<defs><linearGradient id="spVis" gradientUnits="userSpaceOnUse" x1="' + X(380).toFixed(1) + '" x2="' + X(750).toFixed(1) + '" y1="0" y2="0">';
    for (let l = 380; l <= 750; l += 10) g += '<stop offset="' + ((l - 380) / 370).toFixed(3) + '" stop-color="' + L.rgbStr(L.wavelengthToRGB(l)) + '"/>';
    g += '</linearGradient><clipPath id="spClip"><rect x="' + Lm + '" y="' + T + '" width="' + (W - Lm - R) + '" height="' + (H - T - B) + '"/></clipPath></defs>';

    // bandas de región
    const band = (a, b, cls, label) => {
      const A = Math.max(a, x0), Bb = Math.min(b, x1);
      if (Bb <= A) return '';
      const xa = X(A), xb = X(Bb);
      return '<rect class="' + cls + '" x="' + xa.toFixed(1) + '" y="' + T + '" width="' + (xb - xa).toFixed(1) + '" height="' + (H - T - B) + '"/>' +
        ((xb - xa) > 22 ? '<text class="sp-band-t" x="' + ((xa + xb) / 2).toFixed(1) + '" y="' + (T - 12) + '" text-anchor="middle">' + ((xb - xa) > label.length * 9 ? label : label.slice(0, 2) === 'UL' ? 'UV' : label.slice(0, 2) === 'IN' ? 'IR' : 'VIS') + '</text>' : '');
    };
    g += band(x0, 380, 'sp-band sp-band--uv', 'ULTRAVIOLETA') + band(380, 750, 'sp-band sp-band--vis', 'VISIBLE') + band(750, x1, 'sp-band sp-band--ir', 'INFRARROJO');

    // rejilla y ejes
    const ys = niceStep(ymax, 5);
    for (let v = 0; v <= ymax + 1e-9; v += ys) {
      g += '<line class="sp-grid" x1="' + Lm + '" x2="' + (W - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '"/>' +
        '<text class="sp-tick" x="' + (Lm - 8) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">' + nf(v, ys < 0.1 ? 2 : ys < 1 ? 1 : 0) + '</text>';
    }
    const xs = niceStep(x1 - x0, compact ? 4 : 9);
    for (let l = Math.ceil(x0 / xs) * xs; l <= x1 + 1e-9; l += xs) {
      g += '<line class="sp-grid sp-grid--v" x1="' + X(l).toFixed(1) + '" x2="' + X(l).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '"/>' +
        '<text class="sp-tick" x="' + X(l).toFixed(1) + '" y="' + (H - B + 18) + '" text-anchor="middle">' + nf(l) + '</text>';
    }
    g += '<text class="sp-axis" x="' + ((Lm + W - R) / 2) + '" y="' + (H - 10) + '" text-anchor="middle">Longitud de onda λ (nm)</text>' +
      '<text class="sp-axis" transform="translate(15 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">Irradiancia espectral (W/m²/nm)</text>';

    // curvas
    const pathOf = (s) => {
      const k = scaleOf(s); let d = ''; let started = false;
      for (let i = 0; i < G.wl.length; i++) {
        const l = G.wl[i];
        if (l < x0 - 6 || l > x1 + 6) continue;
        d += (started ? 'L' : 'M') + X(l).toFixed(1) + ' ' + Y(s.data[i] * k).toFixed(1);
        started = true;
      }
      return d;
    };
    const prim = series.find((s) => s.key !== 'bb') || series[0];
    if (prim) {
      const d = pathOf(prim);
      const area = d + 'L' + X(Math.min(x1 + 6, G.wl[G.wl.length - 1])).toFixed(1) + ' ' + Y(0) + 'L' + X(Math.max(x0 - 6, 280)).toFixed(1) + ' ' + Y(0) + 'Z';
      g += '<g clip-path="url(#spClip)"><path class="sp-area" d="' + area + '"/>' +
        '<clipPath id="spVisClip"><rect x="' + X(380).toFixed(1) + '" y="' + T + '" width="' + (X(750) - X(380)).toFixed(1) + '" height="' + (H - T - B) + '"/></clipPath>' +
        '<path d="' + area + '" fill="url(#spVis)" class="sp-visfill" clip-path="url(#spVisClip)"/></g>';
    }
    g += '<g clip-path="url(#spClip)">';
    series.slice().reverse().forEach((s) => { g += '<path class="sp-line ' + s.cls + '" d="' + pathOf(s) + '"/>'; });
    g += '</g>';
    // absorciones atmosféricas
    if (series.some((s) => s.terrestrial)) {
      ABSORB.forEach((a) => {
        if (a.l < x0 || a.l > x1) return;
        g += '<g class="sp-abs"><line x1="' + X(a.l).toFixed(1) + '" x2="' + X(a.l).toFixed(1) + '" y1="' + (H - B - 4) + '" y2="' + (H - B - 14) + '"/>' +
          '<text x="' + X(a.l).toFixed(1) + '" y="' + (H - B - 18) + '" text-anchor="middle">' + a.t + '</text></g>';
      });
    }
    g += '<line class="sp-axisline" x1="' + Lm + '" x2="' + (W - R) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    // selección
    const sl = state.specL;
    if (sl >= x0 && sl <= x1) {
      g += '<line class="sp-sel" x1="' + X(sl).toFixed(1) + '" x2="' + X(sl).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '"/>';
      series.forEach((s) => { const v = valueAt(s, sl); if (v != null) g += '<circle class="sp-dot ' + s.cls + '" cx="' + X(sl).toFixed(1) + '" cy="' + Y(v).toFixed(1) + '" r="5"/>'; });
    }
    // capa del cursor
    g += '<g class="sp-hover" id="spHover" visibility="hidden"><line class="sp-hline" y1="' + T + '" y2="' + (H - B) + '"/>' +
      series.map((s) => '<circle class="sp-hdot ' + s.cls + '" r="4"/>').join('') + '</g>';
    g += '<rect class="sp-capture" x="' + Lm + '" y="' + T + '" width="' + (W - Lm - R) + '" height="' + (H - T - B) + '"/>';
    chartEl.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="sp-svg' + (compact ? ' sp-svg--compact' : '') + '" aria-hidden="true">' + g + '</svg>';

    $('#specLegend').innerHTML = series.map((s) => '<span><i class="lg ' + s.cls + '"></i>' + s.name + (s.terrestrial && state.specG !== 1000 ? ' × ' + nf(state.specG / 1000, 2) : '') + ' <em>' + s.src + '</em></span>').join('') +
      '<span><i class="lg lg--vis"></i>Colores del espectro visible</span>';
  }

  /* ---------------- Lectura con el cursor ---------------- */
  function lambdaFromEvent(e) {
    const svg = chartEl.querySelector('svg');
    if (!svg || !geo) return null;
    const r = svg.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * geo.W;
    if (sx < geo.Lm || sx > geo.W - geo.R) return null;
    return geo.x0 + ((sx - geo.Lm) / (geo.W - geo.Lm - geo.R)) * (geo.x1 - geo.x0);
  }
  function hover(e) {
    const l = lambdaFromEvent(e);
    const hg = $('#spHover');
    if (l == null || !hg) { hideTip(); return; }
    const series = activeSeries();
    hg.setAttribute('visibility', 'visible');
    const x = geo.X(l);
    const line = hg.querySelector('.sp-hline'); line.setAttribute('x1', x); line.setAttribute('x2', x);
    hg.querySelectorAll('.sp-hdot').forEach((c, i) => { const v = valueAt(series[i], l); c.setAttribute('cx', x); c.setAttribute('cy', v == null ? -20 : geo.Y(v)); });
    const ph = L.photon(l);
    const rg = L.regionOf(l);
    const col = L.wavelengthToRGB(l);
    tip.innerHTML = '<strong><i style="background:' + L.rgbStr(col) + '"></i>' + nf(l, l < 400 ? 1 : 0) + ' nm · ' + rg.name + '</strong>' +
      '<span>f = ' + L.sci(ph.f, 3) + ' Hz</span>' +
      '<span>E = ' + nf(ph.eV, 3) + ' eV = ' + L.sci(ph.eJ, 3) + ' J</span>' +
      series.map((s) => { const v = valueAt(s, l); return '<span class="tip-s"><i class="lg ' + s.cls + '"></i>' + s.short + ': ' + (v == null ? '—' : nf(v, 3) + ' W/m²/nm') + '</span>'; }).join('');
    tip.hidden = false;
    const fr = chartEl.parentElement.getBoundingClientRect();
    const px = e.clientX - fr.left, py = e.clientY - fr.top;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(fr.width - tw - 8, px + (px > fr.width / 2 ? -tw - 16 : 16))) + 'px';
    tip.style.top = Math.max(8, Math.min(fr.height - th - 8, py - th / 2)) + 'px';
  }
  function hideTip() { tip.hidden = true; const hg = $('#spHover'); if (hg) hg.setAttribute('visibility', 'hidden'); }
  chartEl.addEventListener('pointermove', hover);
  chartEl.addEventListener('pointerleave', hideTip);
  chartEl.addEventListener('click', (e) => { const l = lambdaFromEvent(e); if (l != null) setLambda(Math.round(l * 2) / 2); });
  chartEl.addEventListener('keydown', (e) => {
    const [x0, x1] = RANGES[state.specRegion];
    const step = e.shiftKey ? 10 : 1;
    let l = state.specL;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') l += step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') l -= step;
    else if (e.key === 'Home') l = x0;
    else if (e.key === 'End') l = x1;
    else return;
    e.preventDefault();
    setLambda(Math.min(x1, Math.max(x0, l)));
  });

  /* ---------------- Tarjeta del fotón y tabla por región ---------------- */
  function renderPhoton() {
    const l = state.specL;
    const ph = L.photon(l);
    const rg = L.regionOf(l);
    const col = L.wavelengthToRGB(l);
    const series = activeSeries();
    const prim = series.find((s) => s.key !== 'bb') || series[0];
    const irr = prim ? valueAt(prim, l) : null;
    const flux = irr != null ? irr * ph.lambdaM / (L.H * L.C) : null;
    $('#specPhoton').innerHTML =
      '<div class="photon__swatch" style="--c:' + L.rgbStr(col) + '"><span>' + (col.visible ? 'Color aproximado' : 'No visible para el ojo') + '</span><strong>' + nf(l, l < 400 ? 1 : 0) + ' nm</strong><em>' + rg.name + '</em></div>' +
      '<dl class="photon__grid">' +
      '<div><dt>Longitud de onda</dt><dd>' + L.sci(ph.lambdaM, 4) + ' m</dd></div>' +
      '<div><dt>Frecuencia</dt><dd>' + L.sci(ph.f, 4) + ' Hz</dd><dd class="sub">' + nf(ph.f / 1e12, 1) + ' THz</dd></div>' +
      '<div class="hl"><dt>Energía del fotón</dt><dd>' + L.sci(ph.eJ, 4) + ' J</dd><dd class="big">' + nf(ph.eV, 3) + ' eV</dd></div>' +
      '<div><dt>Irradiancia en ' + (prim ? prim.short : '—') + '</dt><dd>' + (irr == null ? '—' : nf(irr, 3) + ' W/m²/nm') + '</dd><dd class="sub">' + (flux == null ? '' : L.sci(flux, 3) + ' fotones/s/m²/nm') + '</dd></div>' +
      '</dl>' +
      '<p class="photon__calc"><span>f = c / λ = 2.998 × 10⁸ m/s ÷ ' + L.sci(ph.lambdaM, 3) + ' m = <strong>' + L.sci(ph.f, 3) + ' Hz</strong></span>' +
      '<span>E = h · f = 6.626 × 10⁻³⁴ J·s × ' + L.sci(ph.f, 3) + ' Hz = <strong>' + L.sci(ph.eJ, 3) + ' J</strong> ÷ 1.602 × 10⁻¹⁹ J/eV = <strong>' + nf(ph.eV, 3) + ' eV</strong></span></p>' +
      '<div class="photon__go">' +
      (l >= 100 && l <= 850 ? '<a class="btn btn--sm btn--sun" href="#fotoelectrico" data-lab="fotoelectrico" data-carry="' + l + '">Usar esta luz en el efecto fotoeléctrico</a>' : '') +
      (l <= 2000 ? '<a class="btn btn--sm btn--line" href="#celda" data-lab="celda" data-carry="' + l + '">Usar esta luz en la celda fotovoltaica</a>' : '') + '</div>';
  }
  function renderRegions() {
    const series = activeSeries().filter((s) => s.key !== 'bb');
    const regs = [['Ultravioleta', 280, 380], ['Visible', 380, 750], ['Infrarrojo', 750, 4000]];
    let h = '<thead><tr><th scope="col">Región</th>' + series.map((s) => '<th scope="col" class="num">' + s.short + '</th>').join('') + '</tr></thead><tbody>';
    const tot = series.map((s) => L.integrate(G.wl, s.data) * scaleOf(s));
    regs.forEach(([n, a, b]) => {
      const sel = (state.specRegion === 'uv' && a === 280) || (state.specRegion === 'vis' && a === 380) || (state.specRegion === 'ir' && a === 750);
      h += '<tr' + (sel ? ' class="is-sel"' : '') + '><th scope="row">' + n + ' <small>' + a + '–' + b + ' nm</small></th>' + series.map((s, i) => { const v = L.integrate(G.wl, s.data, a, b) * scaleOf(s); return '<td class="num">' + nf(v, 1) + ' W/m²<small>' + nf(tot[i] > 0 ? (v / tot[i]) * 100 : 0, 1) + ' %</small></td>'; }).join('') + '</tr>';
    });
    h += '</tbody><tfoot><tr><th scope="row">Total 280–4000 nm</th>' + tot.map((t) => '<td class="num">' + nf(t, 1) + ' W/m²</td>').join('') + '</tr></tfoot>';
    $('#regTable').innerHTML = h;
    $('#regSrc').textContent = state.specG !== 1000 && series.some((s) => s.terrestrial) ? '(curvas terrestres escaladas a ' + nf(state.specG) + ' W/m²)' : '';
  }

  /* ---------------- Onda electromagnética animada ----------------
     Velocidad visual constante (todas viajan a c); la longitud de onda en
     pantalla crece con λ en escala logarítmica, así la frecuencia visual
     aumenta al disminuir λ, igual que f = c/λ. */
  const wave = $('#waveCanvas');
  const wbox = U.fitCanvas(wave, (w) => (w < 520 ? 150 : 170), () => drawWave(0));
  let phase = 0;
  function waveLenPx(l) {
    const a = Math.log10(280), b = Math.log10(4000);
    return 34 + ((Math.log10(Math.min(4000, Math.max(280, l))) - a) / (b - a)) * 210;
  }
  function drawWave(dt) {
    const { ctx, w, h } = wbox;
    if (!w) return;
    const lam = waveLenPx(state.specL);
    phase += (dt * 90) / lam * Math.PI * 2;
    ctx.clearRect(0, 0, w, h);
    const mid = h * 0.52, amp = h * 0.3, x0 = 30, x1 = w - 24;
    const col = L.wavelengthToRGB(state.specL);
    // eje de propagación
    ctx.strokeStyle = 'rgba(188,216,238,.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, mid); ctx.lineTo(x1, mid); ctx.stroke();
    ctx.fillStyle = 'rgba(188,216,238,.6)'; ctx.beginPath(); ctx.moveTo(x1 + 8, mid); ctx.lineTo(x1, mid - 5); ctx.lineTo(x1, mid + 5); ctx.fill();
    // campo magnético (en perspectiva)
    ctx.strokeStyle = 'rgba(95,168,232,.75)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 2) { const k = (2 * Math.PI * (x - x0)) / lam - phase; const y = mid + Math.sin(k) * amp * 0.38; const xx = x + Math.sin(k) * amp * 0.32; if (x === x0) ctx.moveTo(xx, y); else ctx.lineTo(xx, y); }
    ctx.stroke();
    // campo eléctrico
    ctx.strokeStyle = L.rgbStr(col); ctx.lineWidth = 3; ctx.shadowColor = L.rgbStr(col, 0.6); ctx.shadowBlur = 10;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 2) { const y = mid - Math.sin((2 * Math.PI * (x - x0)) / lam - phase) * amp; if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.shadowBlur = 0;
    // cota de λ entre dos crestas
    // Crestas del campo E: 2π(x − x0)/λ − fase = π/2 + 2πk
    const cx = x0 + ((((phase / (2 * Math.PI) + 0.25) % 1) + 1) % 1) * lam;
    if (cx + lam < x1) {
      const yb = mid - amp - 10;
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx, yb + 4); ctx.lineTo(cx, yb - 4); ctx.moveTo(cx, yb); ctx.lineTo(cx + lam, yb); ctx.moveTo(cx + lam, yb + 4); ctx.lineTo(cx + lam, yb - 4); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '700 12px Manrope, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('λ', cx + lam / 2, yb - 6);
    }
    ctx.textAlign = 'left'; ctx.font = '700 12px Manrope, system-ui, sans-serif';
    ctx.fillStyle = L.rgbStr(col); ctx.fillText('E', x0 - 18, mid - amp + 4);
    ctx.fillStyle = 'rgba(95,168,232,.95)'; ctx.fillText('B', x0 - 18, mid + amp * 0.5);
    ctx.fillStyle = 'rgba(188,216,238,.8)'; ctx.fillText('c', x1 - 4, mid + 18);
  }
  const waveLoop = U.createLoop(drawWave);
  const paintWaveBtn = U.bindPlay($('#waveToggle'), waveLoop);

  /* ---------------- Controles ---------------- */
  function setLambda(l) {
    if (!Number.isFinite(l)) return;
    state.specL = Math.min(4000, Math.max(280, l));
    U.save();
    syncInputs();
    render();
    renderPhoton();
    drawWave(0);
    $('#waveCap').textContent = 'λ = ' + nf(state.specL) + ' nm, f = ' + nf(L.photon(state.specL).f / 1e12, 1) + ' THz. Todas las ondas electromagnéticas viajan a c en el vacío: a menor longitud de onda, mayor frecuencia (f = c/λ) y mayor energía por fotón.';
  }
  function syncInputs() {
    const [x0, x1] = RANGES[state.specRegion];
    lIn.min = x0; lIn.max = x1;
    lIn.value = Math.min(x1, Math.max(x0, state.specL));
    U.paintRange(lIn);
    $('#specLOut').textContent = nf(state.specL, state.specL < 400 ? 1 : 0) + ' nm';
    if (document.activeElement !== lNum) lNum.value = state.specL;
    if (document.activeElement !== fNum) fNum.value = (L.photon(state.specL).f / 1e12).toFixed(1);
    gIn.value = state.specG; U.paintRange(gIn);
    $('#specGOut').textContent = nf(state.specG) + ' W/m²';
    $('#specBB').checked = state.specBB;
  }
  lIn.addEventListener('input', () => setLambda(Number(lIn.value)));
  gIn.addEventListener('input', () => { state.specG = Number(gIn.value); U.save(); syncInputs(); render(); renderPhoton(); renderRegions(); });
  $('#specBB').addEventListener('change', (e) => { state.specBB = e.target.checked; U.save(); render(); renderPhoton(); });
  U.numberInput(lNum, { label: 'Longitud de onda', min: 280, max: 4000, unit: 'nm', err: $('#specErr'), apply: (v) => setLambda(v), restore: syncInputs });
  U.numberInput(fNum, { label: 'Frecuencia', min: 74.9, max: 1070.7, dec: 1, unit: 'THz', err: $('#specErr'), apply: (v) => setLambda(L.lambdaFromF(v * 1e12)), restore: syncInputs });
  U.segmented($('#specView'), 'v', state.specView, (v) => { state.specView = v; U.save(); render(); renderPhoton(); renderRegions(); });
  U.segmented($('#specRegion'), 'r', state.specRegion, (r) => {
    state.specRegion = r; U.save();
    const [x0, x1] = RANGES[r];
    if (state.specL < x0 || state.specL > x1) state.specL = r === 'uv' ? 350 : r === 'vis' ? 550 : r === 'ir' ? 1000 : state.specL;
    setLambda(state.specL); renderRegions();
  });

  let lastCompact = null;
  window.addEventListener('resize', () => {
    const c = chartEl.clientWidth > 0 && chartEl.clientWidth < 640;
    if (c !== lastCompact) { lastCompact = c; render(); }
  }, { passive: true });

  U.register('espectro', {
    show() {
      render(); renderPhoton(); renderRegions(); setLambda(state.specL);
      wbox.resize(); drawWave(0);
      waveLoop.setVisible(true);
      if (!U.reduce.matches && !waveLoop.playing && !waveLoop._userPaused) waveLoop.play();
      paintWaveBtn();
    },
    hide() { waveLoop.setVisible(false); hideTip(); },
    carry(l) { if (Number.isFinite(l)) { state.specL = Math.min(4000, Math.max(280, l)); U.save(); } },
  });
  $('#waveToggle').addEventListener('click', () => { waveLoop._userPaused = !waveLoop.playing; });
})();
