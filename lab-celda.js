/* ==========================================================================
   SVOLTS · Laboratorio — Simulación 3: celda fotovoltaica (unión p-n)
   Corte transversal animado: capa n, región de agotamiento con iones fijos y
   campo eléctrico, capa p, contactos y circuito externo con carga.
   Física (lab-core.js → pvPhoton): absorción solo si E ≥ E_g; el excedente
   E − E_g se pierde como calor; λ_c = h·c/E_g.
   Lecturas con datos reales: corriente máxima teórica y eficiencia última con
   el espectro ASTM G173 global (sin recombinación ni reflexión).
   La animación es conceptual (profundidades y tiempos no están a escala).
   ========================================================================== */
(() => {
  'use strict';
  const L = window.SVLab;
  const U = window.SVLabUI;
  const G = window.SV_G173;
  const { $, nf, state } = U;

  const semi = () => L.SEMICONDUCTORS.find((s) => s.id === state.pnMat) || L.SEMICONDUCTORS[0];
  const pe = () => L.MATERIALS.find((m) => m.id === state.peMat) || L.MATERIALS[2];

  // Límite ideal con AM1.5G: J = q·Φ(λ < λc) ; η_última = E_g·q·Φ(λ < λc) / P_in
  const P_IN = L.integrate(G.wl, G.global);
  function ideal(eg) {
    const lc = L.HC_EVNM / eg;
    const flux = L.photonFlux(G.wl, G.global, 280, Math.min(4000, lc));
    return { lc, jsc: L.QE * flux * 0.1, eta: (eg * L.QE * flux) / P_IN, flux };
  }

  /* ---------------- Geometría ---------------- */
  const cv = $('#pnCanvas');
  let Gm = null;
  const box = U.fitCanvas(cv, (w) => (w < 560 ? w * 1.08 : w * 0.6), layout);
  function layout() {
    const { w, h } = box;
    const narrow = w < 560;
    const x0 = w * 0.06, x1 = w * (narrow ? 0.7 : 0.66);
    const yT = h * 0.26, yN = h * 0.36, yD = h * 0.45, yB = h * 0.8, yC = h * 0.84;
    Gm = { w, h, narrow, x0, x1, yT, yN, yD, yB, yC, xR: w * (narrow ? 0.9 : 0.84), yLoad: (yT + yC) / 2 };
    Gm.path = [[x1 - 6, yT - 4], [Gm.xR, yT - 4], [Gm.xR, yC + 8], [x1 - 6, yC + 8], [x1 - 30, yC]];
    Gm.pathLen = Gm.path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - Gm.path[i - 1][0], p[1] - Gm.path[i - 1][1]) : 0), 0);
    draw();
  }

  /* ---------------- Partículas ---------------- */
  let photons = [], elecs = [], holes = [], wire = [], fx = [];
  let acc = 0, glow = 0, through = 0;
  function reset() { photons = []; elecs = []; holes = []; wire = []; fx = []; acc = 0; glow = 0; through = 0; }
  function spawnPhoton() {
    const g = Gm;
    const x = g.x0 + 18 + Math.random() * (g.x1 - g.x0 - 36);
    const r = L.pvPhoton(state.pnL, semi().eg);
    let yAbs = null;
    if (r.absorbed) {
      // profundidad media relativa: menor para fotones más energéticos (cualitativo)
      const mean = 0.04 + 0.86 * Math.exp(-(r.heatEv) / 0.9);
      const d = Math.min(0.97, -mean * Math.log(1 - Math.random() * 0.98));
      yAbs = g.yT + d * (g.yB - g.yT);
    }
    photons.push({ x, y: g.h * 0.03, yAbs, heat: r.heatEv });
  }
  function step(dt) {
    const g = Gm; if (!g) return;
    if (state.pnI > 0) { acc += dt * (2 + 26 * state.pnI / 100); while (acc >= 1) { acc -= 1; spawnPhoton(); } }
    const sp = Math.max(240, g.h * 0.9);
    for (let i = photons.length - 1; i >= 0; i--) {
      const p = photons[i];
      p.y += sp * dt;
      if (p.yAbs != null && p.y >= p.yAbs) {
        photons.splice(i, 1);
        elecs.push({ x: p.x - 4, y: p.y, vx: 0, vy: 0, t: 0 });
        holes.push({ x: p.x + 4, y: p.y, vx: 0, vy: 0, t: 0 });
        fx.push({ x: p.x, y: p.y, t: 0, heat: p.heat });
      } else if (p.y > g.h + 10) photons.splice(i, 1);
    }
    const drift = Math.max(120, g.h * 0.5), slow = drift * 0.22;
    // electrones: hacia el contacto frontal (arriba)
    for (let i = elecs.length - 1; i >= 0; i--) {
      const e = elecs[i]; e.t += dt;
      if (e.y > g.yD) { e.vx = (Math.random() - 0.5) * slow * 2.2; e.vy = -slow * (0.35 + Math.random() * 0.9); }      // difusión en p
      else if (e.y > g.yN) { e.vx = 0; e.vy = -drift * 1.6; }                                                         // arrastre en agotamiento
      else { e.vx *= 0.9; e.vy = -drift * 0.7; }                                                                       // capa n
      e.x = Math.min(g.x1 - 8, Math.max(g.x0 + 8, e.x + e.vx * dt)); e.y += e.vy * dt;
      if (e.y <= g.yT) { elecs.splice(i, 1); if (wire.length < 70) wire.push({ d: 0, x0: e.x }); through += 1; }
    }
    // huecos: hacia el contacto trasero (abajo)
    for (let i = holes.length - 1; i >= 0; i--) {
      const hh = holes[i]; hh.t += dt;
      if (hh.y < g.yN) { hh.vx = (Math.random() - 0.5) * slow * 2; hh.vy = slow * (0.3 + Math.random() * 0.9); }
      else if (hh.y < g.yD) { hh.vx = 0; hh.vy = drift * 1.4; }
      else { hh.vx *= 0.9; hh.vy = drift * 0.45; }
      hh.x = Math.min(g.x1 - 8, Math.max(g.x0 + 8, hh.x + hh.vx * dt)); hh.y += hh.vy * dt;
      if (hh.y >= g.yB) holes.splice(i, 1);
    }
    // electrones por el circuito externo
    const ws = Math.max(110, g.w * 0.22);
    for (let i = wire.length - 1; i >= 0; i--) { wire[i].d += ws * dt; if (wire[i].d >= g.pathLen) { fx.push({ x: g.x1 - 30, y: g.yC, t: 0, rec: true }); wire.splice(i, 1); } }
    for (let i = fx.length - 1; i >= 0; i--) { fx[i].t += dt; if (fx[i].t > 0.6) fx.splice(i, 1); }
    glow += ((Math.min(1, through / Math.max(dt, 1e-3) / 18)) - glow) * Math.min(1, dt * 3);
    through = 0;
    draw();
  }

  /* ---------------- Dibujo ---------------- */
  function pointOnPath(d) {
    const p = Gm.path;
    for (let i = 1; i < p.length; i++) {
      const seg = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
      if (d <= seg) { const t = d / seg; return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t]; }
      d -= seg;
    }
    return p[p.length - 1];
  }
  function label(ctx, text, x, y, align, color) {
    ctx.font = '700 12px Manrope, system-ui, sans-serif'; ctx.textAlign = align || 'left';
    ctx.fillStyle = color || 'rgba(255,255,255,.92)'; ctx.fillText(text, x, y);
  }
  function draw() {
    const g = Gm; if (!g) return;
    const { ctx, w, h } = box;
    const col = L.wavelengthToRGB(state.pnL);
    const r = L.pvPhoton(state.pnL, semi().eg);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const cw = g.x1 - g.x0;

    // circuito externo
    ctx.strokeStyle = 'rgba(188,216,238,.55)'; ctx.lineWidth = 3;
    ctx.beginPath(); g.path.slice(0, 4).forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    // carga (lámpara/resistencia)
    const ly = g.yLoad;
    ctx.fillStyle = '#0E2647'; ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(g.xR, ly, 22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (glow > 0.02) { ctx.fillStyle = 'rgba(245,166,35,' + (0.15 + glow * 0.7) + ')'; ctx.shadowColor = 'rgba(245,166,35,.9)'; ctx.shadowBlur = 30 * glow; ctx.beginPath(); ctx.arc(g.xR, ly, 14, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; }
    ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(g.xR - 9, ly + 8); for (let k = 0; k < 6; k++) ctx.lineTo(g.xR - 9 + (k + 0.5) * 3, ly + (k % 2 ? 8 : -8)); ctx.lineTo(g.xR + 9, ly - 8); ctx.stroke();
    label(ctx, 'Carga', g.xR, ly + 40, 'center');

    // capas
    ctx.fillStyle = '#2B5D93'; ctx.fillRect(g.x0, g.yT, cw, g.yN - g.yT);
    const dg = ctx.createLinearGradient(0, g.yN, 0, g.yD);
    dg.addColorStop(0, '#244E7C'); dg.addColorStop(1, '#5B4A3E');
    ctx.fillStyle = dg; ctx.fillRect(g.x0, g.yN, cw, g.yD - g.yN);
    ctx.fillStyle = '#6A4F33'; ctx.fillRect(g.x0, g.yD, cw, g.yB - g.yD);
    ctx.fillStyle = '#9AA9BA'; ctx.fillRect(g.x0, g.yB, cw, g.yC - g.yB);
    // dedos del contacto frontal
    ctx.fillStyle = '#C9D3DE';
    const nf_ = Math.max(4, Math.round(cw / 70));
    for (let k = 0; k < nf_; k++) ctx.fillRect(g.x0 + ((k + 0.5) / nf_) * cw - 4, g.yT - 6, 8, 6);
    ctx.fillRect(g.x1 - 14, g.yT - 8, 14, 8);
    // iones fijos y campo
    const nIons = Math.max(5, Math.round(cw / 46));
    ctx.font = '700 13px Manrope, system-ui, sans-serif'; ctx.textAlign = 'center';
    for (let k = 0; k < nIons; k++) {
      const x = g.x0 + ((k + 0.5) / nIons) * cw;
      ctx.fillStyle = 'rgba(159,208,255,.9)'; ctx.fillText('+', x, g.yN + (g.yD - g.yN) * 0.36);
      ctx.fillStyle = 'rgba(255,196,120,.9)'; ctx.fillText('−', x, g.yN + (g.yD - g.yN) * 0.86);
    }
    if (state.pnField) {
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5;
      for (let k = 0; k < nIons - 1; k++) {
        const x = g.x0 + ((k + 1) / nIons) * cw;
        const ya = g.yN + 4, yb = g.yD - 4;
        ctx.beginPath(); ctx.moveTo(x, ya); ctx.lineTo(x, yb); ctx.moveTo(x - 4, yb - 6); ctx.lineTo(x, yb); ctx.lineTo(x + 4, yb - 6); ctx.stroke();
      }
    }
    // rótulos de capas
    const lx = g.narrow ? g.x0 + 8 : g.x0 + 12;
    label(ctx, 'Capa n', lx, g.yT + 17);
    label(ctx, 'Capa p', lx, g.yD + 20);
    label(ctx, 'Contacto trasero', lx, g.yC + 18, 'left', 'rgba(188,216,238,.9)');
    label(ctx, 'Contacto frontal', g.x1 - 4, g.yT - 14, 'right', 'rgba(188,216,238,.9)');
    if (!g.narrow) label(ctx, 'Región de agotamiento' + (state.pnField ? ' (campo E ↓)' : ''), g.x1 + 10, (g.yN + g.yD) / 2 + 4, 'left', 'rgba(255,255,255,.75)');

    // fotones
    photons.forEach((p) => {
      const passed = p.yAbs == null && p.y > g.yT;
      ctx.fillStyle = L.rgbStr(col, passed ? 0.35 : 0.95); ctx.shadowColor = L.rgbStr(col, 0.9); ctx.shadowBlur = passed ? 0 : 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.strokeStyle = L.rgbStr(col, passed ? 0.15 : 0.4); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x, p.y - 3); ctx.stroke();
    });
    // efectos: generación (destello), calor y recombinación
    fx.forEach((f) => {
      const a = 1 - f.t / 0.6;
      if (f.rec) { ctx.fillStyle = 'rgba(255,255,255,' + a * 0.6 + ')'; ctx.beginPath(); ctx.arc(f.x, f.y, 3 + f.t * 10, 0, Math.PI * 2); ctx.fill(); return; }
      ctx.strokeStyle = 'rgba(255,255,255,' + a * 0.8 + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(f.x, f.y, 4 + f.t * 18, 0, Math.PI * 2); ctx.stroke();
      if (f.heat > 0.25) {
        ctx.strokeStyle = 'rgba(245,140,35,' + a * Math.min(1, f.heat / 1.5) + ')'; ctx.lineWidth = 1.5;
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); const x = f.x + k * 6; ctx.moveTo(x, f.y - 6); ctx.quadraticCurveTo(x + 3, f.y - 12 - f.t * 20, x, f.y - 18 - f.t * 26); ctx.stroke(); }
      }
    });
    holes.forEach((hh) => { ctx.strokeStyle = '#FFB547'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hh.x, hh.y, 4, 0, Math.PI * 2); ctx.stroke(); });
    elecs.forEach((e) => { ctx.fillStyle = '#CFE8FF'; ctx.shadowColor = 'rgba(95,168,232,.9)'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(e.x, e.y, 3.8, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0; });
    ctx.fillStyle = '#9FD0FF';
    wire.forEach((d) => { const [x, y] = pointOnPath(d.d); ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill(); });

    // leyenda breve
    const ly2 = h * 0.94;
    ctx.fillStyle = '#CFE8FF'; ctx.beginPath(); ctx.arc(g.x0 + 6, ly2 - 4, 4, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'electrón', g.x0 + 16, ly2, 'left', 'rgba(255,255,255,.85)');
    ctx.strokeStyle = '#FFB547'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.x0 + 90, ly2 - 4, 4, 0, Math.PI * 2); ctx.stroke();
    label(ctx, 'hueco', g.x0 + 100, ly2, 'left', 'rgba(255,255,255,.85)');
    ctx.fillStyle = L.rgbStr(col); ctx.beginPath(); ctx.arc(g.x0 + 160, ly2 - 4, 4, 0, Math.PI * 2); ctx.fill();
    label(ctx, 'fotón ' + nf(state.pnL) + ' nm' + (r.absorbed ? '' : ' (atraviesa)'), g.x0 + 170, ly2, 'left', 'rgba(255,255,255,.85)');
  }

  /* ---------------- Lecturas y comparación ---------------- */
  function renderReadouts() {
    const s = semi();
    const r = L.pvPhoton(state.pnL, s.eg);
    const id = ideal(s.eg);
    const cell = (label, value, sub, cls) => '<div class="ro' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span><strong>' + value + '</strong>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    $('#pnReadouts').innerHTML =
      cell('Energía del fotón', nf(r.photon.eV, 3) + ' eV', L.sci(r.photon.eJ, 3) + ' J', 'ro--sun') +
      cell('Banda prohibida E<sub>g</sub>', nf(s.eg, 2) + ' eV', s.name + ' · 300 K') +
      cell('Longitud de onda de corte', nf(r.cutoffNm, 0) + ' nm', 'λ<sub>c</sub> = h·c / E<sub>g</sub>') +
      cell('¿Se absorbe?', r.absorbed ? 'Sí' : 'No', r.absorbed ? 'Genera un par electrón-hueco' : 'E < E<sub>g</sub>: el material es transparente a esta luz', r.absorbed ? 'ro--blue' : '') +
      cell('Energía aprovechable por par', r.absorbed ? nf(r.usefulEv, 2) + ' eV' : '0 eV', r.absorbed ? nf(r.usefulFraction * 100, 0) + ' % del fotón' : '') +
      cell('Calor de termalización', r.absorbed ? nf(r.heatEv, 2) + ' eV' : '—', r.absorbed ? nf((1 - r.usefulFraction) * 100, 0) + ' % del fotón' : '') +
      cell('Corriente máxima con sol AM1.5G', nf(id.jsc, 1) + ' mA/cm²', 'Un electrón por fotón con λ < λc (ASTM G173)') +
      cell('Eficiencia última', nf(id.eta * 100, 1) + ' %', 'Solo absorción y termalización; sin recombinación', 'ro--navy');
    let msg, tone;
    if (state.pnI === 0) { msg = 'Sin luz no se generan pares y no circula corriente.'; tone = 'idle'; }
    else if (!r.absorbed) { msg = 'Los fotones de ' + nf(r.photon.eV, 2) + ' eV atraviesan el ' + s.name.toLowerCase() + ' porque su banda prohibida es de ' + nf(s.eg, 2) + ' eV. No hay pares ni corriente.'; tone = 'off'; }
    else { msg = 'Cada fotón crea un par electrón-hueco. El campo de la unión envía el electrón a la capa n y el hueco a la capa p; ' + nf(r.heatEv, 2) + ' eV se pierden como calor.'; tone = 'on'; }
    const st = $('#pnStatus'); st.textContent = msg; st.dataset.tone = tone;
    $('#pnToPe').dataset.carry = String(Math.min(850, Math.max(100, state.pnL)));
    renderCompare(r, s);
  }
  function renderCompare(r, s) {
    if (state.pnMode !== 'comparar') return;
    const m = pe();
    const php = L.photon(state.pnL);
    const emits = php.eV >= m.phi;
    $('#cmpTable').innerHTML = '<thead><tr><th scope="col">Con luz de ' + nf(state.pnL) + ' nm (' + nf(php.eV, 2) + ' eV)</th><th scope="col">Efecto fotoeléctrico · ' + m.name + '</th><th scope="col">Efecto fotovoltaico · ' + s.name + '</th></tr></thead><tbody>' +
      '<tr><th scope="row">Umbral</th><td>Φ = ' + nf(m.phi, 2) + ' eV (λ ≤ ' + nf(L.HC_EVNM / m.phi, 0) + ' nm)</td><td>E<sub>g</sub> = ' + nf(s.eg, 2) + ' eV (λ ≤ ' + nf(r.cutoffNm, 0) + ' nm)</td></tr>' +
      '<tr><th scope="row">¿Responde a esta luz?</th><td>' + (emits ? 'Sí: emite electrones' : 'No: sin emisión') + '</td><td>' + (r.absorbed ? 'Sí: genera pares electrón-hueco' : 'No: la luz atraviesa el material') + '</td></tr>' +
      '<tr><th scope="row">Energía del electrón</th><td>' + (emits ? 'Sale con hasta ' + nf(php.eV - m.phi, 2) + ' eV de energía cinética' : '—') + '</td><td>' + (r.absorbed ? 'Aprovecha hasta ' + nf(s.eg, 2) + ' eV; ' + nf(r.heatEv, 2) + ' eV se vuelven calor' : '—') + '</td></tr>' +
      '<tr><th scope="row">¿A dónde va el electrón?</th><td>Al vacío, fuera del metal</td><td>Se queda en el semiconductor y sale por el contacto al circuito</td></tr>' +
      '<tr><th scope="row">¿Necesita fuente externa?</th><td>Sí, para recolectar y medir la corriente</td><td>No: el campo de la unión separa las cargas y la celda entrega potencia</td></tr>' +
      '</tbody>';
  }
  function compareFigs() {
    $('#cmpPe').innerHTML = '<svg viewBox="0 0 300 120" aria-hidden="true"><rect x="16" y="20" width="26" height="86" rx="4" fill="#D9DEE4"/><text x="29" y="14" text-anchor="middle" class="cf-t">metal</text><text x="180" y="14" text-anchor="middle" class="cf-t">vacío</text>' +
      '<path d="M110 30 L46 60" class="cf-ph"/><circle cx="46" cy="60" r="4" class="cf-phd"/><path d="M48 66 C 120 70, 180 72, 262 74" class="cf-e"/><circle cx="262" cy="74" r="5" class="cf-ed"/><text x="200" y="98" text-anchor="middle" class="cf-t">K = hf − Φ</text></svg>';
    $('#cmpPv').innerHTML = '<svg viewBox="0 0 300 120" aria-hidden="true"><rect x="20" y="22" width="200" height="22" fill="#2B5D93"/><rect x="20" y="44" width="200" height="14" fill="#3F4F63"/><rect x="20" y="58" width="200" height="40" fill="#6A4F33"/><text x="28" y="37" class="cf-t cf-t--w">n</text><text x="28" y="84" class="cf-t cf-t--w">p</text>' +
      '<path d="M120 2 L120 50" class="cf-ph"/><circle cx="114" cy="52" r="4" class="cf-ed"/><circle cx="126" cy="52" r="4" class="cf-h"/><path d="M114 46 L114 26" class="cf-e"/><path d="M126 58 L126 92" class="cf-hp"/><path d="M220 30 H 262 V 92 H 220" class="cf-w"/><circle cx="262" cy="61" r="9" class="cf-load"/><text x="262" y="112" text-anchor="middle" class="cf-t">carga</text></svg>';
  }

  /* ---------------- Controles ---------------- */
  const lIn = $('#pnL'), lNum = $('#pnLNum'), iIn = $('#pnI');
  (function spectrumTrack(input) {
    const a = Number(input.min), b = Number(input.max);
    const stops = [];
    for (let l = a; l <= b; l += (b - a) / 40) { const c = L.wavelengthToRGB(l); stops.push(L.rgbStr(c, c.visible ? 1 : 0.45) + ' ' + (((l - a) / (b - a)) * 100).toFixed(1) + '%'); }
    input.style.setProperty('--track', 'linear-gradient(90deg,' + stops.join(',') + ')');
  })(lIn);
  function sync() {
    lIn.value = state.pnL; iIn.value = state.pnI;
    [lIn, iIn].forEach(U.paintRange);
    $('#pnLOut').textContent = nf(state.pnL) + ' nm';
    $('#pnIOut').textContent = nf(state.pnI) + ' %';
    if (document.activeElement !== lNum) lNum.value = state.pnL;
    $('#pnField').checked = state.pnField;
    $('#pnCompare').hidden = state.pnMode !== 'comparar';
  }
  function changed() { U.save(); sync(); renderReadouts(); if (!loop.playing) draw(); }
  lIn.addEventListener('input', () => { state.pnL = Number(lIn.value); changed(); });
  iIn.addEventListener('input', () => { state.pnI = Number(iIn.value); changed(); });
  $('#pnField').addEventListener('change', (e) => { state.pnField = e.target.checked; changed(); });
  U.numberInput(lNum, { label: 'Longitud de onda', min: 280, max: 2000, unit: 'nm', err: $('#pnErr'), apply: (v) => { state.pnL = v; changed(); }, restore: sync });
  $('#pnMats').innerHTML = L.SEMICONDUCTORS.map((s) => '<button type="button" role="radio" class="mat" data-m="' + s.id + '"><span class="mat__sym">' + s.symbol + '</span><span class="mat__t"><strong>' + s.name + '</strong><small>E<sub>g</sub> = ' + nf(s.eg, 2) + ' eV · ' + nf(L.HC_EVNM / s.eg, 0) + ' nm</small></span></button>').join('');
  const setSemi = U.segmented($('#pnMats'), 'm', state.pnMat, (id) => { state.pnMat = id; reset(); changed(); });
  U.segmented($('#pnMode'), 'm', state.pnMode, (m) => { state.pnMode = m; changed(); if (m === 'comparar') $('#pnCompare').scrollIntoView({ behavior: U.reduce.matches ? 'auto' : 'smooth', block: 'nearest' }); });
  $('#pnReset').addEventListener('click', () => { Object.assign(state, { pnL: 550, pnI: 60, pnMat: 'si', pnField: true }); setSemi('si'); reset(); changed(); });
  compareFigs();

  /* ---------------- Ciclo ---------------- */
  const loop = U.createLoop(step);
  let userPaused = false, shown = false, inView = true;
  const paint = U.bindPlay($('#pnPlay'), loop, () => { userPaused = !loop.playing; });
  const vis = () => loop.setVisible(shown && inView);
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { inView = es[0].isIntersecting; vis(); }).observe(cv);
  U.reduce.addEventListener('change', () => { if (U.reduce.matches) { loop.pause(); paint(); } });

  U.register('celda', {
    show() {
      shown = true;
      box.resize(); layout(); sync(); renderReadouts();
      if (!U.reduce.matches && !userPaused) loop.play();
      if (U.reduce.matches && !loop.playing) for (let k = 0; k < 50; k++) step(0.05);
      vis(); paint();
    },
    hide() { shown = false; vis(); },
    carry(l) { if (Number.isFinite(l)) { state.pnL = Math.min(2000, Math.max(280, Math.round(l))); U.save(); } },
  });
})();
