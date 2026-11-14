/* ==========================================================================
   SVOLTS · Laboratorio — Simulación 2: efecto fotoeléctrico
   Cámara de vacío en Canvas: fuente de luz, fotones, cátodo, ánodo, electrones,
   circuito con batería variable, voltímetro y amperímetro.
   Los resultados numéricos salen de SVLab.photoelectric() (modelo documentado
   en lab-core.js). La animación usa la MISMA física para el movimiento:
     rapidez inicial  v₀ ∝ √K          (K uniforme entre 0 y K_max)
     aceleración      a ∝ V / d         (campo uniforme entre placas)
   por eso un electrón llega al ánodo solo si K > e·|V| cuando V < 0.
   ========================================================================== */
(() => {
  'use strict';
  const L = window.SVLab;
  const U = window.SVLabUI;
  const { $, nf, state } = U;

  const P_MAX = 20e-6;       // potencia luminosa máxima sobre el cátodo [W]
  const YIELD = 1e-3;        // rendimiento cuántico supuesto
  const METAL_COLOR = { cs: '#D9B45A', k: '#C3CCD6', na: '#D9DEE4', zn: '#A6B5C4', cu: '#C77B4A' };

  const mat = () => L.MATERIALS.find((m) => m.id === state.peMat) || L.MATERIALS[2];
  const model = () => L.photoelectric({ lambdaNm: state.peL, phiEv: mat().phi, powerW: P_MAX * state.peI / 100, yield: YIELD, volts: state.peV });

  /* ---------------- Geometría del lienzo ---------------- */
  const cv = $('#peCanvas');
  let Gm = null;
  const box = U.fitCanvas(cv, (w) => (w < 560 ? w * 1.02 : w * 0.64), layout);
  function layout() {
    const { w, h } = box;
    const narrow = w < 560;
    const tube = { x0: w * 0.08, x1: w * 0.94, y0: h * (narrow ? 0.2 : 0.17), y1: h * (narrow ? 0.62 : 0.66) };
    const plateH = (tube.y1 - tube.y0) * 0.66;
    const pyc = (tube.y0 + tube.y1) / 2;
    const cath = { x: w * 0.2, w: Math.max(8, w * 0.018), y0: pyc - plateH / 2, y1: pyc + plateH / 2 };
    const anode = { x: w * 0.82, w: Math.max(8, w * 0.018), y0: cath.y0, y1: cath.y1 };
    const lamp = { x: w * 0.5, y: h * (narrow ? 0.07 : 0.06) };
    const y1 = h * (narrow ? 0.74 : 0.77), y2 = h * (narrow ? 0.87 : 0.88);
    const cx = cath.x + cath.w / 2, ax = anode.x + anode.w / 2;
    Gm = {
      w, h, narrow, tube, cath, anode, lamp, y1, y2, cx, ax,
      face: cath.x + cath.w, gap: anode.x - (cath.x + cath.w),
      volt: { x: (cx + ax) / 2, y: y1, r: Math.max(16, h * 0.05) },
      amm: { x: cx + (ax - cx) * 0.3, y: y2, r: Math.max(16, h * 0.05) },
      bat: { x: cx + (ax - cx) * 0.66, y: y2 },
    };
    // Trayecto de los electrones por el circuito: ánodo → abajo → izquierda → cátodo
    Gm.path = [[ax, anode.y1], [ax, y2], [cx, y2], [cx, cath.y1]];
    Gm.pathLen = Gm.path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - Gm.path[i - 1][0], p[1] - Gm.path[i - 1][1]) : 0), 0);
    draw(0);
  }

  /* ---------------- Partículas ---------------- */
  let photons = [], electrons = [], wireDots = [], flashes = [];
  let emitAcc = 0;
  const MAX_E = 260;
  function reset() { photons = []; electrons = []; wireDots = []; flashes = []; emitAcc = 0; }

  function spawnPhoton() {
    const g = Gm;
    const ty = g.cath.y0 + 10 + Math.random() * (g.cath.y1 - g.cath.y0 - 20);
    const sx = g.lamp.x + (Math.random() - 0.5) * 14, sy = g.lamp.y + 18;
    const dx = g.face - sx, dy = ty - sy, len = Math.hypot(dx, dy);
    const sp = Math.max(260, g.w * 0.55);
    photons.push({ x: sx, y: sy, vx: (dx / len) * sp, vy: (dy / len) * sp, ty, ph: Math.random() * 6 });
  }
  function spawnElectron(y, M) {
    if (electrons.length >= MAX_E) return;
    const g = Gm;
    const s = g.gap / 1.1;                              // 1 eV cruza el espacio en ~1.1 s sin campo
    const K = M.kmaxEv * Math.random();                 // energía uniforme entre 0 y K_max
    electrons.push({ x: g.face + 2, y, vx: s * Math.sqrt(K), vy: (Math.random() - 0.5) * s * 0.14, t: 0 });
  }

  function step(dt) {
    const M = model();
    const g = Gm;
    if (!g) return;
    // emisión de fotones (tasa visual proporcional a la intensidad)
    if (state.peI > 0) {
      emitAcc += dt * (3 + 42 * (state.peI / 100));
      while (emitAcc >= 1) { emitAcc -= 1; spawnPhoton(); }
    }
    // fotones
    for (let i = photons.length - 1; i >= 0; i--) {
      const p = photons[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.ph += dt * 30;
      if (p.x <= g.face) {
        photons.splice(i, 1);
        if (M.emits && Math.random() < 0.6) spawnElectron(p.ty, M);
        else flashes.push({ x: g.face, y: p.ty, t: 0, warm: !M.emits });
      }
    }
    // electrones: v_x += a·dt con a = s²·V/(2d)
    const s = g.gap / 1.1;
    const ax = (s * s * state.peV) / (2 * g.gap);
    for (let i = electrons.length - 1; i >= 0; i--) {
      const e = electrons[i];
      e.t += dt;
      e.vx += ax * dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      if (e.y < g.cath.y0 + 4 || e.y > g.cath.y1 - 4) e.vy *= -1;
      if (e.x >= g.anode.x) { electrons.splice(i, 1); if (wireDots.length < 80) wireDots.push({ d: 0 }); }
      else if (e.x <= g.face || e.t > 9) electrons.splice(i, 1);
    }
    // electrones por el circuito
    const ws = Math.max(90, g.w * 0.2);
    for (let i = wireDots.length - 1; i >= 0; i--) { wireDots[i].d += ws * dt; if (wireDots[i].d >= g.pathLen) wireDots.splice(i, 1); }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t += dt; if (flashes[i].t > 0.35) flashes.splice(i, 1); }
    draw(M);
  }

  /* ---------------- Dibujo ---------------- */
  function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function pointOnPath(d) {
    const p = Gm.path;
    for (let i = 1; i < p.length; i++) {
      const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (d <= seg) { const t = d / seg; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; }
      d -= seg;
    }
    return p[p.length - 1];
  }
  function meter(ctx, m, letter, value, accent) {
    ctx.fillStyle = '#0E2647'; ctx.strokeStyle = accent; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = accent; ctx.textAlign = 'center';
    ctx.font = '700 ' + Math.round(m.r * 0.72) + 'px "Space Grotesk", system-ui, sans-serif';
    ctx.fillText(letter, m.x, m.y + m.r * 0.26);
    ctx.font = '700 12px Manrope, system-ui, sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(value, m.x, m.y + m.r + 16);
  }
  function draw(Min) {
    const g = Gm; if (!g) return;
    const M = Min || model();
    const { ctx, w, h } = box;
    const col = L.wavelengthToRGB(state.peL);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    // circuito (detrás del tubo)
    ctx.strokeStyle = 'rgba(188,216,238,.55)'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(g.cx, g.cath.y1); ctx.lineTo(g.cx, g.y2); ctx.lineTo(g.ax, g.y2); ctx.lineTo(g.ax, g.anode.y1);
    ctx.moveTo(g.cx, g.y1); ctx.lineTo(g.ax, g.y1);
    ctx.stroke();
    // batería: placa larga = polo positivo
    const b = g.bat, pos = state.peV >= 0;
    ctx.fillStyle = '#0B1F3A'; ctx.fillRect(b.x - 14, b.y - 18, 28, 36);
    ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 3;
    const longX = pos ? b.x + 6 : b.x - 6, shortX = pos ? b.x - 6 : b.x + 6;
    ctx.beginPath(); ctx.moveTo(longX, b.y - 16); ctx.lineTo(longX, b.y + 16); ctx.stroke();
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(shortX, b.y - 8); ctx.lineTo(shortX, b.y + 8); ctx.stroke();
    ctx.fillStyle = '#F5A623'; ctx.font = '700 12px Manrope, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('+', longX + (pos ? 10 : -10), b.y - 14);
    ctx.fillStyle = 'rgba(188,216,238,.85)'; ctx.fillText('Fuente variable', b.x, b.y + 34);
    meter(ctx, g.volt, 'V', (state.peV > 0 ? '+' : '') + nf(state.peV, 2) + ' V', '#F5A623');
    meter(ctx, g.amm, 'A', fmtI(M.current), '#5FA8E8');
    // electrones por el cable
    ctx.fillStyle = '#9FD0FF';
    wireDots.forEach((d) => { const [x, y] = pointOnPath(d.d); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });

    // tubo de vidrio
    const t = g.tube, tr = (t.y1 - t.y0) / 2;
    const grd = ctx.createLinearGradient(0, t.y0, 0, t.y1);
    grd.addColorStop(0, 'rgba(188,216,238,.16)'); grd.addColorStop(0.5, 'rgba(188,216,238,.05)'); grd.addColorStop(1, 'rgba(188,216,238,.12)');
    rr(ctx, t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0, tr);
    ctx.fillStyle = grd; ctx.fill();
    ctx.strokeStyle = 'rgba(188,216,238,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(t.x0 + tr, t.y0 + 8); ctx.lineTo(t.x1 - tr, t.y0 + 8); ctx.stroke();
    ctx.fillStyle = 'rgba(188,216,238,.55)'; ctx.font = '600 11px Manrope, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('VACÍO', (g.face + g.anode.x) / 2, t.y1 - 10);

    // campo eléctrico entre placas (flechas tenues)
    if (Math.abs(state.peV) > 0.05) {
      ctx.strokeStyle = state.peV > 0 ? 'rgba(95,168,232,.22)' : 'rgba(245,166,35,.22)'; ctx.lineWidth = 1.5;
      const n = 4, dir = state.peV > 0 ? -1 : 1; // E apunta del ánodo al cátodo si V > 0 (dir = −1: hacia la izquierda)
      for (let k = 0; k < n; k++) {
        const y = g.cath.y0 + ((k + 0.5) / n) * (g.cath.y1 - g.cath.y0);
        const xa = g.face + 30, xb = g.anode.x - 30;
        ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y);
        const tip = dir < 0 ? xa : xb;
        ctx.moveTo(tip - dir * 8, y - 5); ctx.lineTo(tip, y); ctx.lineTo(tip - dir * 8, y + 5); ctx.stroke();
      }
    }

    // haz de luz
    if (state.peI > 0) {
      const a = 0.05 + 0.16 * (state.peI / 100);
      ctx.fillStyle = L.rgbStr(col, a);
      ctx.beginPath(); ctx.moveTo(g.lamp.x - 10, g.lamp.y + 16); ctx.lineTo(g.lamp.x + 10, g.lamp.y + 16);
      ctx.lineTo(g.face, g.cath.y1 - 6); ctx.lineTo(g.face, g.cath.y0 + 6); ctx.closePath(); ctx.fill();
    }
    // placas
    const mc = METAL_COLOR[state.peMat] || '#ccc';
    const pg = ctx.createLinearGradient(g.cath.x, 0, g.cath.x + g.cath.w, 0);
    pg.addColorStop(0, mc); pg.addColorStop(1, '#ffffff');
    ctx.fillStyle = pg; rr(ctx, g.cath.x, g.cath.y0, g.cath.w, g.cath.y1 - g.cath.y0, 3); ctx.fill();
    ctx.fillStyle = '#8FA3B8'; rr(ctx, g.anode.x, g.anode.y0, g.anode.w, g.anode.y1 - g.anode.y0, 3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = '700 12px Manrope, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Cátodo (' + mat().symbol + ')', g.cx, g.cath.y0 - 10);
    ctx.fillText('Ánodo', g.ax, g.anode.y0 - 10);

    // fotones
    photons.forEach((p) => {
      const r = 3.4;
      ctx.fillStyle = L.rgbStr(col, 0.95); ctx.shadowColor = L.rgbStr(col, 0.9); ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = L.rgbStr(col, 0.35); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    });
    flashes.forEach((f) => {
      const a = 1 - f.t / 0.35;
      ctx.fillStyle = f.warm ? 'rgba(245,166,35,' + (a * 0.6) + ')' : 'rgba(255,255,255,' + (a * 0.5) + ')';
      ctx.beginPath(); ctx.arc(f.x + 3, f.y, 4 + f.t * 16, 0, Math.PI * 2); ctx.fill();
    });
    // electrones
    electrons.forEach((e) => {
      ctx.fillStyle = '#CFE8FF'; ctx.shadowColor = 'rgba(95,168,232,.9)'; ctx.shadowBlur = 10;
      ctx.beginPath(); ctx.arc(e.x, e.y, 3.6, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });

    // fuente de luz
    ctx.save(); ctx.translate(g.lamp.x, g.lamp.y);
    ctx.fillStyle = '#17375F'; rr(ctx, -34, -14, 68, 30, 10); ctx.fill();
    ctx.fillStyle = state.peI > 0 ? L.rgbStr(col) : '#2C4A70';
    ctx.shadowColor = L.rgbStr(col, 0.9); ctx.shadowBlur = state.peI > 0 ? 18 : 0;
    rr(ctx, -16, 12, 32, 8, 3); ctx.fill(); ctx.shadowBlur = 0;
    ctx.fillStyle = '#BCD8EE'; ctx.font = '700 11px Manrope, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(col.visible ? nf(state.peL) + ' nm' : (state.peL < 380 ? 'UV ' : 'IR ') + nf(state.peL) + ' nm', 0, 4);
    ctx.restore();
    ctx.fillStyle = 'rgba(188,216,238,.85)'; ctx.font = '600 11px Manrope, system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Fuente de luz · ' + nf(state.peI) + ' %', g.lamp.x + 42, g.lamp.y + 4);
  }
  function fmtI(a) {
    if (a <= 0) return '0 nA';
    if (a < 1e-9) return nf(a * 1e12, 0) + ' pA';
    return nf(a * 1e9, 2) + ' nA';
  }

  /* ---------------- Lecturas y gráficas ---------------- */
  function renderReadouts() {
    const M = model();
    const m = mat();
    const ph = M.photon;
    const cell = (label, value, sub, cls) => '<div class="ro' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><strong>' + value + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    $('#peReadouts').innerHTML =
      cell('Energía del fotón', nf(ph.eV, 3) + ' eV', L.sci(ph.eJ, 3) + ' J', 'ro--sun') +
      cell('Frecuencia', nf(ph.f / 1e12, 1) + ' THz', L.sci(ph.f, 3) + ' Hz') +
      cell('Longitud de onda', nf(ph.lambdaNm, 0) + ' nm', L.regionOf(ph.lambdaNm).name) +
      cell('Función de trabajo Φ', nf(m.phi, 2) + ' eV', 'Umbral: ' + nf(M.thresholdNm, 0) + ' nm · ' + nf(M.thresholdHz / 1e12, 0) + ' THz') +
      cell('Energía cinética máxima', M.emits ? nf(M.kmaxEv, 3) + ' eV' : '0 eV', M.emits ? L.sci(M.kmaxJ, 3) + ' J · ' + nf(M.vmaxMs / 1000, 0) + ' km/s' : 'hf < Φ: sin emisión', M.emits ? 'ro--blue' : '') +
      cell('Potencial de frenado V₀', M.emits ? nf(M.stopV, 3) + ' V' : '—', 'Corriente nula con V ≤ −V₀') +
      cell('Fotones por segundo', L.sci(M.photonRate, 3) + ' /s', 'P = ' + nf(P_MAX * state.peI / 100 * 1e6, 1) + ' µW sobre el cátodo') +
      cell('Electrones emitidos', M.emits ? L.sci(M.emissionRate, 3) + ' /s' : '0 /s', 'Rendimiento cuántico Y = 1 × 10⁻³') +
      cell('Eficiencia de recolección', nf(M.collection * 100, 0) + ' %', state.peV >= 0 ? 'V ≥ 0: llegan todos' : 'Fracción con K > e·|V|') +
      cell('Corriente fotoeléctrica', fmtI(M.current), 'I = e · Ṅₑ · η', 'ro--navy');
    let msg, tone;
    if (state.peI === 0) { msg = 'La fuente está apagada: sin fotones no hay emisión.'; tone = 'idle'; }
    else if (!M.emits) { msg = 'Sin emisión. Cada fotón trae ' + nf(ph.eV, 2) + ' eV y el ' + m.name.toLowerCase() + ' necesita ' + nf(m.phi, 2) + ' eV. Subir la intensidad solo agrega fotones con la misma energía: baja la longitud de onda por debajo de ' + nf(M.thresholdNm, 0) + ' nm.'; tone = 'off'; }
    else if (M.current === 0) { msg = 'Hay emisión, pero el voltaje de ' + nf(state.peV, 2) + ' V frena a todos los electrones antes del ánodo (V₀ = ' + nf(M.stopV, 2) + ' V). El amperímetro marca cero.'; tone = 'stop'; }
    else { msg = 'Se emiten electrones con hasta ' + nf(M.kmaxEv, 2) + ' eV. Llega al ánodo el ' + nf(M.collection * 100, 0) + ' % y circulan ' + fmtI(M.current) + '.'; tone = 'on'; }
    const st = $('#peStatus'); st.textContent = msg; st.dataset.tone = tone;
    $('#peMatNote').innerHTML = '<strong>' + m.name + ' (' + m.symbol + '):</strong> se usa Φ = ' + nf(m.phi, 2) + ' eV. Valores reportados: ' + m.range + ' eV. ' + m.note + ' La función de trabajo depende de la cara cristalina, la limpieza y la oxidación de la superficie, por lo que cambia entre experimentos. Fuentes: tablas de HyperPhysics (datos del CRC Handbook of Chemistry and Physics) y LibreTexts.';
    $('#peStop').disabled = !M.emits;
    $('#peToCell').dataset.carry = String(Math.max(280, state.peL));
    renderIV(M); renderKF(M);
  }
  function svgWrap(W, H, g, label) { return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="mc-svg" role="img" aria-label="' + label + '">' + g + '</svg>'; }
  function renderIV(M) {
    const W = 460, H = 260, Lm = 54, R = 14, T = 16, B = 40;
    const vmin = -6, vmax = 6;
    const base = { lambdaNm: state.peL, phiEv: mat().phi, powerW: P_MAX * state.peI / 100, yield: YIELD };
    const pts = L.photoelectricIV(base, vmin, vmax, 240);
    const satMax = L.photoelectric(Object.assign({}, base, { powerW: P_MAX, volts: 6 })).current || 1e-9;
    const imax = Math.max(satMax, 1e-12) * 1.12 * 1e9;
    const X = (v) => Lm + ((v - vmin) / (vmax - vmin)) * (W - Lm - R);
    const Y = (i) => T + (1 - i / imax) * (H - T - B);
    let g = '';
    for (let v = -6; v <= 6; v += 2) g += '<line class="mc-grid" x1="' + X(v) + '" x2="' + X(v) + '" y1="' + T + '" y2="' + (H - B) + '"/><text class="mc-tick" x="' + X(v) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + v + '</text>';
    const step = imax > 10 ? 5 : imax > 4 ? 2 : imax > 2 ? 1 : 0.5;
    for (let i = 0; i <= imax; i += step) g += '<line class="mc-grid" x1="' + Lm + '" x2="' + (W - R) + '" y1="' + Y(i) + '" y2="' + Y(i) + '"/><text class="mc-tick" x="' + (Lm - 6) + '" y="' + (Y(i) + 4) + '" text-anchor="end">' + nf(i, step < 1 ? 1 : 0) + '</text>';
    g += '<line class="mc-zero" x1="' + X(0) + '" x2="' + X(0) + '" y1="' + T + '" y2="' + (H - B) + '"/>';
    g += '<text class="mc-axis" x="' + ((Lm + W - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">Voltaje aplicado (V)</text><text class="mc-axis" transform="translate(13 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">Corriente (nA)</text>';
    g += '<path class="mc-line" d="' + pts.map((p, k) => (k ? 'L' : 'M') + X(p.v).toFixed(1) + ' ' + Y(p.i * 1e9).toFixed(1)).join('') + '"/>';
    if (M.emits && M.stopV <= 6) g += '<line class="mc-v0" x1="' + X(-M.stopV) + '" x2="' + X(-M.stopV) + '" y1="' + T + '" y2="' + (H - B) + '"/><text class="mc-lab" x="' + (X(-M.stopV) - 4) + '" y="' + (T + 12) + '" text-anchor="end">−V₀</text>';
    g += '<circle class="mc-pt" cx="' + X(state.peV).toFixed(1) + '" cy="' + Y(M.current * 1e9).toFixed(1) + '" r="6"/>';
    $('#peIV').innerHTML = svgWrap(W, H, g, 'Curva de corriente contra voltaje. Corriente actual ' + fmtI(M.current) + ' con ' + nf(state.peV, 2) + ' V.');
  }
  function renderKF(M) {
    const W = 460, H = 260, Lm = 46, R = 14, T = 16, B = 40;
    const fmax = 3000, kmax = 12; // THz, eV
    const X = (f) => Lm + (f / fmax) * (W - Lm - R);
    const Y = (k) => T + (1 - k / kmax) * (H - T - B);
    const hEvTHz = (L.H / L.QE) * 1e12;
    let g = '';
    for (let f = 0; f <= fmax; f += 500) g += '<line class="mc-grid" x1="' + X(f) + '" x2="' + X(f) + '" y1="' + T + '" y2="' + (H - B) + '"/><text class="mc-tick" x="' + X(f) + '" y="' + (H - B + 16) + '" text-anchor="middle">' + f + '</text>';
    for (let k = 0; k <= kmax; k += 2) g += '<line class="mc-grid" x1="' + Lm + '" x2="' + (W - R) + '" y1="' + Y(k) + '" y2="' + Y(k) + '"/><text class="mc-tick" x="' + (Lm - 6) + '" y="' + (Y(k) + 4) + '" text-anchor="end">' + k + '</text>';
    g += '<text class="mc-axis" x="' + ((Lm + W - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">Frecuencia (THz)</text><text class="mc-axis" transform="translate(12 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">K máx (eV)</text>';
    L.MATERIALS.forEach((m) => {
      const f0 = m.phi / hEvTHz;
      const on = m.id === state.peMat;
      g += '<line class="mc-mat' + (on ? ' is-on' : '') + '" x1="' + X(f0).toFixed(1) + '" y1="' + Y(0) + '" x2="' + X(fmax).toFixed(1) + '" y2="' + Y(hEvTHz * fmax - m.phi).toFixed(1) + '"/>';
      if (on) g += '<text class="mc-lab" x="' + (X(f0) + 4).toFixed(1) + '" y="' + (Y(0) - 6) + '">f₀ ' + m.symbol + '</text>';
    });
    const f = M.photon.f / 1e12;
    g += '<line class="mc-zero" x1="' + X(f).toFixed(1) + '" x2="' + X(f).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '"/>';
    g += '<circle class="mc-pt" cx="' + X(f).toFixed(1) + '" cy="' + Y(M.kmaxEv).toFixed(1) + '" r="6"/>';
    $('#peKF').innerHTML = svgWrap(W, H, g, 'Energía cinética máxima contra frecuencia para cinco metales. Punto actual: ' + nf(f, 0) + ' THz, ' + nf(M.kmaxEv, 2) + ' eV.');
  }

  /* ---------------- Controles ---------------- */
  const lIn = $('#peL'), lNum = $('#peLNum'), fNum = $('#peFNum'), iIn = $('#peI'), vIn = $('#peV');
  function spectrumTrack(input) {
    const a = Number(input.min), b = Number(input.max);
    const stops = [];
    for (let l = a; l <= b; l += (b - a) / 40) { const c = L.wavelengthToRGB(l); stops.push(L.rgbStr(c, c.visible ? 1 : 0.45) + ' ' + (((l - a) / (b - a)) * 100).toFixed(1) + '%'); }
    input.style.setProperty('--track', 'linear-gradient(90deg,' + stops.join(',') + ')');
  }
  spectrumTrack(lIn);
  function sync() {
    lIn.value = state.peL; iIn.value = state.peI; vIn.value = state.peV;
    [lIn, iIn, vIn].forEach(U.paintRange);
    $('#peLOut').textContent = nf(state.peL) + ' nm';
    $('#peIOut').textContent = nf(state.peI) + ' %';
    $('#peVOut').textContent = (state.peV > 0 ? '+' : '') + nf(state.peV, 2) + ' V';
    if (document.activeElement !== lNum) lNum.value = state.peL;
    if (document.activeElement !== fNum) fNum.value = (L.photon(state.peL).f / 1e12).toFixed(1);
  }
  function changed() { U.save(); sync(); renderReadouts(); if (!loop.playing) draw(); }
  lIn.addEventListener('input', () => { state.peL = Number(lIn.value); changed(); });
  iIn.addEventListener('input', () => { state.peI = Number(iIn.value); changed(); });
  vIn.addEventListener('input', () => { state.peV = Number(vIn.value); changed(); });
  U.numberInput(lNum, { label: 'Longitud de onda', min: 100, max: 850, unit: 'nm', err: $('#peErr'), apply: (v) => { state.peL = v; changed(); }, restore: sync });
  U.numberInput(fNum, { label: 'Frecuencia', min: 352.7, max: 2997.9, dec: 1, unit: 'THz', err: $('#peErr'), apply: (v) => { state.peL = Math.round(L.lambdaFromF(v * 1e12) * 10) / 10; changed(); }, restore: sync });
  $('#peStop').addEventListener('click', () => { const M = model(); if (M.emits) { state.peV = Math.max(-6, -Math.ceil(M.stopV * 100) / 100); changed(); } });
  $('#peZero').addEventListener('click', () => { state.peV = 0; changed(); });
  $('#peMats').innerHTML = L.MATERIALS.map((m) => '<button type="button" role="radio" class="mat" data-m="' + m.id + '" style="--mc:' + METAL_COLOR[m.id] + '"><span class="mat__sym">' + m.symbol + '</span><span class="mat__t"><strong>' + m.name + '</strong><small>Φ = ' + nf(m.phi, 2) + ' eV · ' + nf(L.HC_EVNM / m.phi, 0) + ' nm</small></span></button>').join('');
  const setMat = U.segmented($('#peMats'), 'm', state.peMat, (id) => { state.peMat = id; reset(); changed(); });
  $('#peReset').addEventListener('click', () => {
    Object.assign(state, { peL: 400, peI: 60, peMat: 'na', peV: 0 });
    setMat('na'); reset(); changed();
  });

  /* ---------------- Ciclo de animación ---------------- */
  const loop = U.createLoop(step);
  const paint = U.bindPlay($('#pePlay'), loop, () => { userPaused = !loop.playing; });
  let userPaused = false, shown = false, inView = true;
  const vis = () => loop.setVisible(shown && inView);
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { inView = es[0].isIntersecting; vis(); }).observe(cv);
  U.reduce.addEventListener('change', () => { if (U.reduce.matches) { loop.pause(); paint(); } });

  U.register('fotoelectrico', {
    show() {
      shown = true;
      box.resize(); layout(); sync(); renderReadouts();
      if (!U.reduce.matches && !userPaused) loop.play();
      if (U.reduce.matches && !loop.playing) {
        // Movimiento reducido: un cuadro estático con partículas representativas
        for (let k = 0; k < 40; k++) step(0.05);
      }
      vis(); paint();
    },
    hide() { shown = false; vis(); },
    carry(l) { if (Number.isFinite(l)) { state.peL = Math.min(850, Math.max(100, Math.round(l))); U.save(); } },
  });
})();
