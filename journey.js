/* ==========================================================================
   SVOLTS · El viaje de un fotón (portada, versión 4)
   Escena fijada al desplazamiento en cinco capítulos. El avance del scroll
   (0 → 1) decide qué se dibuja; el tiempo solo anima detalles (destellos,
   partículas). Capas: WebGL para el Sol (SVFX), Canvas 2D para todo lo demás
   y HTML para los textos (siempre presentes para lectores de pantalla).

   Cifras que aparecen (todas verificables):
     · Temperatura efectiva de la superficie solar: 5772 K (IAU 2015)
     · Luminosidad solar: 3.828 × 10²⁶ W (IAU 2015)
     · 1 UA = 149 597 870.7 km; la luz tarda 499 s (8 min 19 s)
     · Irradiancia fuera de la atmósfera: ≈ 1361 W/m² (Kopp y Lean, 2011)
     · En superficie, día despejado: ≈ 1000 W/m² (AM1.5, ASTM G173)
     · Fotón de 550 nm: 2.25 eV; banda prohibida del silicio: 1.12 eV
     · Panel JA Solar 620 W del catálogo: 2.465 × 1.134 m → 22.2 %
     · Red eléctrica en México: 60 Hz; 620 W × 5.5 h × 0.75 = 2.56 kWh/día
   Con movimiento reducido (o sin JavaScript) se muestran tarjetas estáticas.
   ========================================================================== */
(() => {
  'use strict';
  const sec = document.getElementById('viaje');
  if (!sec) return;
  const track = sec.querySelector('.journey__track');
  const stage = sec.querySelector('.journey__stage');
  const cv = sec.querySelector('.journey__cv');
  const glc = sec.querySelector('.journey__gl');
  const chs = Array.from(sec.querySelectorAll('.jch'));
  const dots = Array.from(sec.querySelectorAll('.journey__dot'));
  const bar = sec.querySelector('.journey__bar');
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  const FX = window.SVFX;
  const N = 5;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeIn = (t) => { t = clamp(t, 0, 1); return t * t; };
  const nf = (v, d = 0) => Number(v).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  const motionOK = () => (FX ? FX.motionOK() : !RM.matches);

  // Generador pseudoaleatorio con semilla (mismo dibujo en cada visita)
  function rng(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Caminata aleatoria del fotón dentro del Sol: del centro al borde derecho
  const WALK = (() => {
    const r = rng(7);
    for (let tries = 0; tries < 400; tries++) {
      const pts = [[0, 0]];
      let x = 0, y = 0;
      for (let i = 0; i < 900; i++) {
        const a = r() * TAU;
        x += Math.cos(a) * 0.095; y += Math.sin(a) * 0.095;
        if (x * x + y * y >= 1) {
          const ang = Math.atan2(y, x);
          if (Math.abs(ang) < 0.55 && pts.length > 45) { pts.push([Math.cos(ang), Math.sin(ang)]); return pts; }
          break;
        }
        pts.push([x, y]);
      }
    }
    return [[0, 0], [1, 0]];
  })();
  const SEEDS = (() => { const r = rng(42); return Array.from({ length: 64 }, () => [r(), r(), r(), r()]); })();

  /* ---------------- Primitivas de dibujo ---------------- */
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
  function photonDot(ctx, x, y, s) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, 18 * s);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,240,200,.95)');
    g.addColorStop(0.45, 'rgba(245,166,35,.35)');
    g.addColorStop(1, 'rgba(245,166,35,0)');
    ctx.fillStyle = g; circle(ctx, x, y, 18 * s); ctx.fill();
  }
  function trail(ctx, x0, y0, x1, y1, w, color) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(255,226,161,0)');
    g.addColorStop(1, color || 'rgba(255,226,161,.75)');
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  function label(ctx, text, x, y, align, color, size) {
    ctx.font = '700 ' + (size || 12) + 'px Manrope, system-ui, sans-serif';
    ctx.textAlign = align || 'left';
    ctx.fillStyle = color || 'rgba(188,216,238,.9)';
    ctx.fillText(text, x, y);
  }
  function sun2D(ctx, x, y, r) {
    let g = ctx.createRadialGradient(x, y, r * 0.85, x, y, r * 3.2);
    g.addColorStop(0, 'rgba(245,166,35,.55)'); g.addColorStop(0.35, 'rgba(245,166,35,.15)'); g.addColorStop(1, 'rgba(245,166,35,0)');
    ctx.fillStyle = g; circle(ctx, x, y, r * 3.2); ctx.fill();
    g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.1, x, y, r);
    g.addColorStop(0, '#FFF4D6'); g.addColorStop(0.5, '#F5A623'); g.addColorStop(1, '#B9590C');
    ctx.fillStyle = g; circle(ctx, x, y, r); ctx.fill();
  }
  function earth(ctx, x, y, r) {
    let g = ctx.createRadialGradient(x, y, r * 0.92, x, y, r * 1.45);
    g.addColorStop(0, 'rgba(143,188,227,.6)'); g.addColorStop(1, 'rgba(95,168,232,0)');
    ctx.fillStyle = g; circle(ctx, x, y, r * 1.45); ctx.fill();
    g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.3, r * 0.1, x, y, r);
    g.addColorStop(0, '#8CC8F7'); g.addColorStop(0.55, '#2473B8'); g.addColorStop(1, '#0B2E57');
    ctx.fillStyle = g; circle(ctx, x, y, r); ctx.fill();
    ctx.save(); circle(ctx, x, y, r); ctx.clip();
    ctx.fillStyle = 'rgba(160,205,170,.55)';
    [[-0.35, -0.2, 0.32, 0.22], [0.15, 0.25, 0.26, 0.16], [0.3, -0.38, 0.18, 0.12]].forEach(([dx, dy, rx, ry]) => {
      ctx.beginPath(); ctx.ellipse(x + dx * r, y + dy * r, rx * r, ry * r, 0.6, 0, TAU); ctx.fill();
    });
    g = ctx.createLinearGradient(x - r * 0.15, y, x + r, y);
    g.addColorStop(0, 'rgba(5,14,28,0)'); g.addColorStop(1, 'rgba(5,14,28,.88)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  /* ---------------- Escenas ----------------
     A = área de dibujo { x, y, w, h, cx, cy, m }, c = avance local 0..1,
     t = tiempo (s), gl = true si el Sol lo dibuja WebGL. */
  const R0 = (A) => A.m * 0.34;
  const SCENES = [
    // 1 · Origen: la caminata aleatoria del núcleo a la superficie
    function origin(ctx, A, c, t, gl) {
      const R = R0(A);
      if (!gl) sun2D(ctx, A.cx, A.cy, R);
      const k = Math.floor((WALK.length - 1) * clamp(c / 0.72, 0, 1));
      const seg = (from, to, style, w) => {
        ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath();
        for (let i = from; i <= to; i++) { const p = WALK[i]; const X = A.cx + p[0] * R, Y = A.cy + p[1] * R; if (i === from) ctx.moveTo(X, Y); else ctx.lineTo(X, Y); }
        ctx.stroke();
      };
      ctx.save();
      ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      seg(0, k, 'rgba(255,250,236,.32)', 1.1);
      ctx.shadowColor = 'rgba(255,226,161,.95)'; ctx.shadowBlur = 8;
      seg(Math.max(0, k - 14), k, 'rgba(255,252,242,.95)', 1.8);
      ctx.restore();
      ctx.fillStyle = '#FFF6E0'; circle(ctx, A.cx, A.cy, 3.5); ctx.fill();
      label(ctx, 'núcleo', A.cx + 9, A.cy - 9, 'left', 'rgba(255,248,235,.95)');
      let hx, hy;
      if (c < 0.72) { const p = WALK[k]; hx = A.cx + p[0] * R; hy = A.cy + p[1] * R; }
      else {
        const e = WALK[WALK.length - 1];
        const s = smooth((c - 0.72) / 0.28);
        hx = lerp(A.cx + e[0] * R, A.cx + R * 1.75, s); hy = lerp(A.cy + e[1] * R, A.cy, s);
        trail(ctx, hx - 60 * s, hy, hx, hy, 3);
        label(ctx, 'superficie · 5,772 K', A.cx + R * 0.72, A.cy - R * 0.92, 'left', 'rgba(255,248,235,.9)');
      }
      photonDot(ctx, hx, hy, 1);
    },
    // 2 · Trayecto: 1 UA en 8 min 19 s
    function travel(ctx, A, c, t, gl) {
      const s = smooth(c);
      const R = R0(A);
      const sx = lerp(A.cx, A.x + A.w * 0.06, s), sr = lerp(R, R * 0.16, s);
      if (!gl) sun2D(ctx, sx, A.cy, sr);
      // estelas: el espacio "pasa" a los lados
      const v = Math.sin(Math.PI * clamp(c, 0, 1));
      ctx.lineCap = 'round';
      SEEDS.slice(0, 34).forEach((q) => {
        const len = 14 + 70 * v * q[2];
        const x = A.x + A.w - (((q[0] * A.w) + t * (60 + 160 * q[2]) * (0.25 + v)) % (A.w + len));
        const y = A.y + q[1] * A.h;
        ctx.strokeStyle = 'rgba(188,216,238,' + (0.08 + 0.25 * v * q[3]).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + len, y); ctx.stroke();
      });
      const er = lerp(A.m * 0.016, A.m * 0.09, s);
      const ex = A.x + A.w * 0.9;
      earth(ctx, ex, A.cy, er);
      const p = smooth((c - 0.02) / 0.9);
      const px = lerp(sx + sr + 8, ex - er - 8, p);
      trail(ctx, Math.max(sx + sr, px - 170), A.cy, px, A.cy, 3);
      photonDot(ctx, px, A.cy, 1.05);
      // regla de distancia
      const ry = A.y + A.h * 0.88, x0 = A.x + A.w * 0.06, x1 = ex;
      ctx.strokeStyle = 'rgba(188,216,238,.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, ry); ctx.lineTo(x1, ry);
      for (let i = 0; i <= 10; i++) { const xx = lerp(x0, x1, i / 10); ctx.moveTo(xx, ry - (i % 5 ? 3 : 7)); ctx.lineTo(xx, ry + (i % 5 ? 3 : 7)); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(245,166,35,.9)'; ctx.fillRect(x0, ry - 1, clamp(px - x0, 0, x1 - x0), 2);
      label(ctx, '1 UA = 149.6 millones de km', (x0 + x1) / 2, ry + 22, 'center');
      label(ctx, 'Sol', x0, ry - 12, 'left', 'rgba(255,226,161,.9)');
      label(ctx, 'Tierra', x1, ry - 12, 'right', 'rgba(188,216,238,.9)');
    },
    // 3 · Atmósfera: ozono, dispersión y absorción
    function atmosphere(ctx, A, c, t) {
      const ground = A.y + A.h * 0.8;
      const Rb = Math.max(A.w, A.h) * 2.4;
      const pcx = A.cx, pcy = ground + Rb;
      const atm = A.h * 0.52;
      let g = ctx.createRadialGradient(pcx, pcy, Rb, pcx, pcy, Rb + atm);
      g.addColorStop(0, 'rgba(143,188,227,.85)'); g.addColorStop(0.22, 'rgba(95,168,232,.42)'); g.addColorStop(0.65, 'rgba(36,115,184,.12)'); g.addColorStop(1, 'rgba(36,115,184,0)');
      ctx.fillStyle = g; circle(ctx, pcx, pcy, Rb + atm); ctx.fill();
      const ozR = Rb + atm * 0.64;
      ctx.save();
      ctx.beginPath(); ctx.rect(A.x - 10, A.y - 10, A.w + 20, A.h + 20); ctx.clip();
      const og = ctx.createLinearGradient(A.x, 0, A.x + A.w, 0);
      og.addColorStop(0, 'rgba(245,166,35,0)'); og.addColorStop(0.2, 'rgba(245,166,35,.22)'); og.addColorStop(0.8, 'rgba(245,166,35,.22)'); og.addColorStop(1, 'rgba(245,166,35,0)');
      ctx.strokeStyle = og; ctx.lineWidth = Math.max(2, atm * 0.022);
      ctx.beginPath(); ctx.arc(pcx, pcy, ozR, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      ctx.restore();
      g = ctx.createLinearGradient(0, ground, 0, ground + A.h * 0.3);
      g.addColorStop(0, '#1B5A93'); g.addColorStop(1, '#0B1F3A');
      ctx.fillStyle = g; circle(ctx, pcx, pcy, Rb); ctx.fill();
      ctx.strokeStyle = 'rgba(188,216,238,.75)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(pcx, pcy, Rb, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
      const yOz = ground - atm * 0.64;
      // fotones de distintos colores
      const TYPES = [['uv', 'rgba(167,139,250,'], ['blue', 'rgba(95,168,232,'], ['green', 'rgba(130,220,140,'], ['red', 'rgba(240,96,80,'], ['ir', 'rgba(170,60,50,']];
      SEEDS.slice(0, 30).forEach((q, k) => {
        const [type, col] = TYPES[k % 5];
        const ph = (q[0] + t * (0.16 + q[2] * 0.1)) % 1;
        const x0 = A.x + A.w * (0.04 + 0.92 * q[1]);
        const y = A.y + ph * (ground - A.y + 10);
        let x = x0, yy = y, a = 0.9;
        if (type === 'uv' && y > yOz) { const d = y - yOz; if (d > 26) return; a = 1 - d / 26; ctx.fillStyle = 'rgba(245,166,35,' + (a * 0.6).toFixed(2) + ')'; circle(ctx, x, yOz, 2 + d * 0.3); ctx.fill(); return; }
        if (type === 'blue') {
          const yS = A.y + (ground - A.y) * (0.42 + 0.3 * q[3]);
          if (y > yS) { const d = y - yS; const ang = q[3] * TAU; x = x0 + Math.cos(ang) * d * 1.1; yy = yS + Math.sin(ang) * d * 0.7; a = clamp(1 - d / 160, 0, 1); }
        }
        if (type === 'ir' && k % 2 && y > ground - atm * 0.22) { const d = y - (ground - atm * 0.22); if (d > 20) return; a = 1 - d / 20; }
        if (y > ground - 2 && type !== 'blue') return;
        ctx.strokeStyle = col + (a * 0.5).toFixed(2) + ')'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, yy - 12); ctx.lineTo(x, yy); ctx.stroke();
        ctx.fillStyle = col + a.toFixed(2) + ')'; circle(ctx, x, yy, 2.4); ctx.fill();
      });
      // nuestro fotón
      const p = clamp(c / 0.85, 0, 1);
      const mx = A.cx - A.w * 0.08, my = lerp(A.y + 8, ground - 6, easeIn(p));
      trail(ctx, mx, my - 70, mx, my, 3);
      photonDot(ctx, mx, my, 1.05);
      if (c > 0.85) { const f = (c - 0.85) / 0.15; ctx.strokeStyle = 'rgba(255,226,161,' + (1 - f).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(mx, ground, 10 + f * 40, 3 + f * 8, 0, 0, TAU); ctx.stroke(); }
      label(ctx, 'Capa de ozono: absorbe el UV', A.x + 6, yOz - 12, 'left', 'rgba(255,214,150,.92)');
      label(ctx, 'El aire dispersa el azul', A.x + A.w * 0.98, A.y + A.h * 0.5, 'right', 'rgba(143,188,227,.95)');
      label(ctx, '1,361 W/m²', A.x + A.w * 0.98, A.y + 16, 'right', 'rgba(255,226,161,.95)', 13);
      ctx.globalAlpha *= clamp((c - 0.55) / 0.3, 0, 1);
      label(ctx, '≈ 1,000 W/m² en el suelo', A.x + A.w * 0.98, ground - 12, 'right', '#fff', 13);
    },
    // 4 · Celda: del panel al corte p-n
    function cell(ctx, A, c, t) {
      const hit = [0.58, 0.42];
      const pw = A.w * 0.72, ph = A.h * 0.44, pcx = A.cx, pcy = A.cy + A.h * 0.02;
      const TL = [pcx - pw * 0.4, pcy - ph / 2], TR = [pcx + pw * 0.4, pcy - ph / 2], BR = [pcx + pw / 2, pcy + ph / 2], BL = [pcx - pw / 2, pcy + ph / 2];
      const P = (u, v) => [lerp(lerp(TL[0], TR[0], u), lerp(BL[0], BR[0], u), v), lerp(lerp(TL[1], TR[1], u), lerp(BL[1], BR[1], u), v)];
      const H = P(hit[0], hit[1]);
      const k = smooth((c - 0.26) / 0.22);
      // Fase A: el panel visto desde arriba
      if (k < 1) {
        ctx.save();
        ctx.globalAlpha *= 1 - k;
        ctx.translate(H[0], H[1]); ctx.scale(1 + 2.4 * k, 1 + 2.4 * k); ctx.translate(-H[0], -H[1]);
        const g = ctx.createLinearGradient(TL[0], TL[1], BR[0], BR[1]);
        g.addColorStop(0, '#1B4A7C'); g.addColorStop(1, '#0B1F3A');
        ctx.fillStyle = g; ctx.strokeStyle = '#C9D3DE'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(TL[0], TL[1]); ctx.lineTo(TR[0], TR[1]); ctx.lineTo(BR[0], BR[1]); ctx.lineTo(BL[0], BL[1]); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(95,168,232,.55)'; ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 1; i < 6; i++) { const a = P(i / 6, 0), b = P(i / 6, 1); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        for (let j = 1; j < 4; j++) { const a = P(0, j / 4), b = P(1, j / 4); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
        ctx.stroke();
        const sh = (t * 0.25) % 1.6 - 0.3;
        const s0 = P(clamp(sh, 0, 1), 0), s1 = P(clamp(sh + 0.12, 0, 1), 0), s2 = P(clamp(sh, 0, 1), 1), s3 = P(clamp(sh - 0.12, 0, 1), 1);
        ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]); ctx.lineTo(s2[0], s2[1]); ctx.lineTo(s3[0], s3[1]); ctx.closePath(); ctx.fill();
        const pa = clamp(c / 0.26, 0, 1);
        if (pa < 1) { const y = lerp(A.y, H[1], easeIn(pa)); trail(ctx, H[0], y - 70, H[0], y, 3); photonDot(ctx, H[0], y, 1); }
        else { ctx.strokeStyle = 'rgba(255,226,161,.9)'; ctx.lineWidth = 2; circle(ctx, H[0], H[1], 6 + 10 * k); ctx.stroke(); }
        label(ctx, 'Panel de 620 W · 22.2 %', pcx, pcy + ph / 2 + 26, 'center', 'rgba(188,216,238,.9)');
        ctx.restore();
      }
      // Fase B: corte de la celda
      const sa = smooth((c - 0.36) / 0.16);
      if (sa <= 0) return;
      ctx.save();
      ctx.globalAlpha *= sa;
      const x0 = A.x + A.w * 0.08, x1 = A.x + A.w * 0.8, top = A.y + A.h * 0.1, hh = A.h * 0.74;
      const yC = top, yN = top + hh * 0.05, yD = top + hh * 0.3, yP = top + hh * 0.46, yB = top + hh * 0.92, yE = top + hh;
      ctx.fillStyle = '#C9D3DE'; ctx.fillRect(x0, yC, x1 - x0, yN - yC);
      ctx.fillStyle = '#2B5D93'; ctx.fillRect(x0, yN, x1 - x0, yD - yN);
      const dg = ctx.createLinearGradient(0, yD, 0, yP); dg.addColorStop(0, '#244E7C'); dg.addColorStop(1, '#5B4A3E');
      ctx.fillStyle = dg; ctx.fillRect(x0, yD, x1 - x0, yP - yD);
      ctx.fillStyle = '#6A4F33'; ctx.fillRect(x0, yP, x1 - x0, yB - yP);
      ctx.fillStyle = '#9AA9BA'; ctx.fillRect(x0, yB, x1 - x0, yE - yB);
      const nI = Math.max(5, Math.round((x1 - x0) / 46));
      ctx.font = '700 13px Manrope, system-ui, sans-serif'; ctx.textAlign = 'center';
      for (let i = 0; i < nI; i++) {
        const x = lerp(x0, x1, (i + 0.5) / nI);
        ctx.fillStyle = 'rgba(159,208,255,.9)'; ctx.fillText('+', x, lerp(yD, yP, 0.38));
        ctx.fillStyle = 'rgba(255,196,120,.9)'; ctx.fillText('−', x, lerp(yD, yP, 0.9));
      }
      // Rótulos a la derecha del corte, o dentro de las capas si no caben
      const inside = A.w < 520;
      const lx = inside ? x0 + 8 : x1 + 12;
      label(ctx, 'capa n', lx, (yN + yD) / 2 + 4, 'left', inside ? 'rgba(255,255,255,.9)' : undefined);
      label(ctx, inside ? 'unión p-n' : 'unión p-n · campo E', lx, (yD + yP) / 2 + 4, 'left', 'rgba(255,255,255,.85)');
      label(ctx, 'capa p', lx, (yP + yB) / 2 + 4, 'left', inside ? 'rgba(255,255,255,.9)' : undefined);
      const hx = lerp(x0, x1, 0.5), hy = lerp(yD, yP, 0.55);
      const pin = smooth((c - 0.42) / 0.12);
      if (pin < 1) { const y = lerp(top - 40, hy, pin); trail(ctx, hx, y - 60, hx, y, 3); photonDot(ctx, hx, y, 0.9); }
      if (c >= 0.54) {
        const ge = smooth((c - 0.54) / 0.2);
        const ex = smooth((c - 0.74) / 0.2);
        const eY = lerp(hy, yN + 2, ge);
        const eX = lerp(hx, x1 + 30, ex);
        const hY = lerp(hy, yB - 6, smooth((c - 0.54) / 0.28));
        if (c < 0.7) { const f = (c - 0.54) / 0.16; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - f).toFixed(2) + ')'; ctx.lineWidth = 2; circle(ctx, hx, hy, 6 + f * 26); ctx.stroke(); }
        if (c < 0.8) {
          const f = clamp((c - 0.54) / 0.26, 0, 1);
          ctx.strokeStyle = 'rgba(245,140,35,' + (0.85 * (1 - f)).toFixed(2) + ')'; ctx.lineWidth = 1.6;
          for (let i = -1; i <= 1; i++) { const x = hx + 20 + i * 7; ctx.beginPath(); ctx.moveTo(x, hy - 4); ctx.quadraticCurveTo(x + 4, hy - 14 - f * 18, x, hy - 22 - f * 26); ctx.stroke(); }
          label(ctx, '1.13 eV → calor', hx + 34, hy - 22 - f * 10, 'left', 'rgba(255,190,120,' + (1 - f).toFixed(2) + ')');
        }
        ctx.strokeStyle = '#FFB547'; ctx.lineWidth = 2.2; circle(ctx, hx - 10, hY, 5); ctx.stroke();
        label(ctx, 'h⁺', hx - 26, hY + 4, 'right', '#FFB547');
        ctx.save(); ctx.shadowColor = 'rgba(95,168,232,.95)'; ctx.shadowBlur = 12; ctx.fillStyle = '#D6ECFF'; circle(ctx, ex > 0 ? eX : hx + 6, eY, 5); ctx.fill(); ctx.restore();
        label(ctx, 'e⁻', (ex > 0 ? eX : hx + 6) + 10, eY - 8, 'left', '#D6ECFF');
      }
      ctx.restore();
    },
    // 5 · Tu casa: corriente directa → inversor → corriente alterna
    function home(ctx, A, c, t) {
      const wy = A.y + A.h * 0.5;
      const invX = A.x + A.w * 0.36, invW = Math.min(110, A.w * 0.2), invH = invW * 0.72;
      const houseX = A.x + A.w * 0.8, groundY = A.y + A.h * 0.78;
      ctx.strokeStyle = 'rgba(188,216,238,.45)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(A.x, wy); ctx.lineTo(invX - invW / 2, wy); ctx.stroke();
      const sp = 22, off = (t * 70) % sp;
      ctx.save(); ctx.shadowColor = 'rgba(95,168,232,.9)'; ctx.shadowBlur = 8; ctx.fillStyle = '#CFE8FF';
      for (let x = A.x + off; x < invX - invW / 2 - 4; x += sp) { circle(ctx, x, wy, 3); ctx.fill(); }
      ctx.restore();
      label(ctx, 'Corriente directa (CD)', A.x + 4, wy - 16);
      // inversor
      const ix = invX - invW / 2, iy = wy - invH / 2;
      ctx.fillStyle = '#F4F7FA'; ctx.strokeStyle = '#2473B8'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ix, iy, invW, invH, 12) : ctx.rect(ix, iy, invW, invH); ctx.fill(); ctx.stroke();
      label(ctx, 'CD → CA', invX, wy + 5, 'center', '#0B1F3A', 13);
      ctx.fillStyle = (Math.floor(t * 2) % 2) ? '#F5A623' : '#B9780C'; circle(ctx, ix + invW - 12, iy + 12, 4); ctx.fill();
      label(ctx, 'Inversor', invX, iy + invH + 20, 'center');
      // onda alterna hacia la casa
      const hw = Math.min(150, A.w * 0.26), hh = hw * 0.62;
      const hx = houseX - hw / 2, hy = groundY - hh;
      const reach = smooth((c - 0.12) / 0.4);
      const ax0 = ix + invW, ax1 = lerp(ax0, hx - 30, reach);
      if (ax1 > ax0 + 2) {
        ctx.save(); ctx.strokeStyle = '#F5A623'; ctx.lineWidth = 2.6; ctx.shadowColor = 'rgba(245,166,35,.8)'; ctx.shadowBlur = 10;
        ctx.beginPath();
        for (let x = ax0; x <= ax1; x += 2) { const y = wy + Math.sin((x - ax0) / 46 * TAU - t * 4) * 12; if (x === ax0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
        ctx.stroke(); ctx.restore();
        label(ctx, 'Corriente alterna · 127 V · 60 Hz', (ax0 + ax1) / 2, wy - 26, 'center', 'rgba(255,226,161,.95)');
      }
      // casa
      ctx.strokeStyle = 'rgba(188,216,238,.4)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(A.x + A.w * 0.52, groundY); ctx.lineTo(A.x + A.w, groundY); ctx.stroke();
      ctx.fillStyle = '#17375F'; ctx.fillRect(hx, hy, hw, hh);
      ctx.fillStyle = '#2473B8'; ctx.beginPath(); ctx.moveTo(hx - 12, hy + 2); ctx.lineTo(houseX, hy - hh * 0.62); ctx.lineTo(hx + hw + 12, hy + 2); ctx.closePath(); ctx.fill();
      if (reach >= 1) { ctx.strokeStyle = 'rgba(245,166,35,.7)'; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(ax1, wy); ctx.lineTo(ax1, hy + hh * 0.45); ctx.lineTo(hx, hy + hh * 0.45); ctx.stroke(); }
      const lit = smooth((c - 0.45) / 0.25);
      const win = (x, y, w, h) => {
        if (lit > 0) { ctx.save(); ctx.shadowColor = 'rgba(245,166,35,' + lit.toFixed(2) + ')'; ctx.shadowBlur = 26 * lit; ctx.fillStyle = 'rgba(255,214,120,' + (0.25 + 0.75 * lit).toFixed(2) + ')'; ctx.fillRect(x, y, w, h); ctx.restore(); }
        else { ctx.fillStyle = '#0B1F3A'; ctx.fillRect(x, y, w, h); }
      };
      win(hx + hw * 0.14, hy + hh * 0.22, hw * 0.24, hh * 0.3);
      win(hx + hw * 0.62, hy + hh * 0.22, hw * 0.24, hh * 0.3);
      ctx.fillStyle = '#0B1F3A'; ctx.fillRect(hx + hw * 0.42, hy + hh * 0.5, hw * 0.16, hh * 0.5);
      if (lit > 0.6) label(ctx, '≈ 2.56 kWh al día por panel', houseX, groundY + 24, 'center', 'rgba(255,226,161,' + ((lit - 0.6) / 0.4).toFixed(2) + ')', 13);
    },
  ];

  /* ---------------- Modo estático (sin movimiento) ---------------- */
  const STATIC_C = [0.6, 0.5, 0.6, 0.66, 0.75];
  function renderStatic() {
    sec.classList.add('is-static');
    sec.classList.remove('is-live');
    chs.forEach((li, i) => {
      const card = li.querySelector('.jch__card');
      if (!card || card.querySelector('.jch__art')) return;
      const c = document.createElement('canvas');
      c.className = 'jch__art';
      c.setAttribute('aria-hidden', 'true');
      card.insertBefore(c, card.firstChild);
      const w = Math.max(240, card.clientWidth - 2), h = 150, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      const x = c.getContext('2d');
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      const A = { x: 8, y: 8, w: w - 16, h: h - 16 };
      A.cx = A.x + A.w / 2; A.cy = A.y + A.h / 2; A.m = Math.min(A.w, A.h);
      if (i === 0) { A.m *= 1.4; }
      SCENES[i](x, A, STATIC_C[i], 3, false);
    });
  }
  if (RM.matches || !cv || !stage) { renderStatic(); return; }

  /* ---------------- Modo vivo ---------------- */
  sec.classList.add('is-live');
  const ctx = cv.getContext('2d');
  let W = 0, H = 0;
  let A = null;
  function area() {
    if (W >= 900) {
      const x = W * 0.43, y = H * 0.1, w = W - x - 96, h = H * 0.8;
      A = { x, y, w, h };
    } else {
      // En móvil la escena ocupa el espacio libre sobre la tarjeta más alta
      const y = Math.max(150, H * 0.2);
      let tallest = 0;
      chs.forEach((li) => { const c = li.querySelector('.jch__card'); if (c) tallest = Math.max(tallest, c.offsetHeight); });
      const free = H - 52 - tallest - y - 12;
      const h = clamp(Math.min(H * 0.38, free), 150, H * 0.42);
      A = { x: 18, y, w: W - 36 - 34, h };
    }
    A.cx = A.x + A.w / 2; A.cy = A.y + A.h / 2; A.m = Math.min(A.w, A.h);
  }
  function resize() {
    W = stage.clientWidth; H = stage.clientHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    area();
    readProgress(); P = Pt;
    render();
  }

  const sun = FX ? FX.createScene(glc, { kind: 'sun', host: stage, manual: true, interactive: false, sky: ['#050E1C', '#0A1D38'], stars: 1, glow: 1.1, flare: 0, scale: 0.5, time0: 12 }) : null;
  if (!sun && glc) glc.hidden = true;

  let P = 0, Pt = 0, time = 3;
  function readProgress() {
    const r = track.getBoundingClientRect();
    const total = Math.max(1, track.offsetHeight - stage.offsetHeight);
    Pt = clamp(-r.top / total, 0, 1);
  }

  const J = {};
  ['km', 't', 'irr', 'kwh'].forEach((k) => { J[k] = sec.querySelector('[data-j="' + k + '"]'); });
  const setText = (el, s) => { if (el && el.textContent !== s) el.textContent = s; };
  let activeCh = -1;
  function hud(x) {
    const ch = clamp(Math.floor(x), 0, N - 1);
    if (ch !== activeCh) {
      activeCh = ch;
      chs.forEach((li, i) => li.classList.toggle('is-on', i === ch));
      dots.forEach((d, i) => { if (i === ch) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
    }
    sec.classList.toggle('is-past-intro', x > 0.25);
    if (bar) bar.style.setProperty('--p', (x / N).toFixed(4));
    const c1 = clamp(x - 1, 0, 1);
    setText(J.km, nf(Math.round(149597871 * smooth((c1 - 0.02) / 0.9))));
    const s = Math.round(499 * smooth((c1 - 0.02) / 0.9));
    setText(J.t, Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s');
    const c2 = clamp(x - 2, 0, 1);
    const irr = 1361 - 361 * smooth((c2 - 0.1) / 0.75);
    setText(J.irr, (c2 >= 0.85 ? '≈ ' : '') + nf(Math.round(irr)) + ' W/m²');
    const c4 = clamp(x - 4, 0, 1);
    setText(J.kwh, nf(2.5575 * smooth((c4 - 0.35) / 0.5), 2) + ' kWh');
  }
  function render() {
    if (!A) return;
    ctx.clearRect(0, 0, W, H);
    const x = P * N;
    // Sol en WebGL durante los capítulos 1 y 2
    const gw = clamp(1 - Math.max(0, x - 2) / 0.14, 0, 1);
    if (sun) {
      glc.style.opacity = gw.toFixed(3);
      sun.setEnabled(gw > 0.01);
      if (gw > 0.01) {
        const s = smooth(clamp(x - 1, 0, 1));
        const R = R0(A);
        sun.set({ x: lerp(A.cx, A.x + A.w * 0.06, s), y: A.cy, r: lerp(R, R * 0.16, s) });
      }
    }
    for (let i = 0; i < N; i++) {
      const d = Math.max(0, i - x, x - (i + 1));
      const w = clamp(1 - d / 0.12, 0, 1);
      if (w <= 0.001) continue;
      ctx.save();
      ctx.globalAlpha = w;
      SCENES[i](ctx, A, clamp(x - i, 0, 1), time, !!sun && i < 2);
      ctx.restore();
    }
    hud(x);
  }

  // Bucle: corre solo mientras la escena está en pantalla
  let inView = false, raf = 0, last = 0;
  function loop(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    readProgress();
    P += (Pt - P) * Math.min(1, dt * 9);
    if (Math.abs(Pt - P) < 0.0002) P = Pt;
    time += dt;
    render();
    if (inView && motionOK() && !document.hidden) raf = requestAnimationFrame(loop); else last = 0;
  }
  const kick = () => { if (!raf && inView && motionOK()) raf = requestAnimationFrame(loop); };
  window.addEventListener('scroll', () => {
    if (!inView) return;
    if (motionOK()) kick(); else { readProgress(); P = Pt; render(); }
  }, { passive: true });
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => { inView = es[0].isIntersecting; if (inView) { readProgress(); kick(); render(); } }, { rootMargin: '60px' }).observe(stage);
  else inView = true;
  document.addEventListener('visibilitychange', kick);
  document.addEventListener('svfx:pause', () => { readProgress(); P = Pt; render(); kick(); });
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage); else window.addEventListener('resize', resize);

  // Navegación por capítulos (teclado y clic)
  const scrollToCh = (i) => {
    const total = track.offsetHeight - stage.offsetHeight;
    const top = track.getBoundingClientRect().top + window.scrollY + total * ((i + 0.45) / N);
    window.scrollTo({ top, behavior: motionOK() ? 'smooth' : 'auto' });
  };
  dots.forEach((d, i) => d.addEventListener('click', () => scrollToCh(i)));
  chs.forEach((li, i) => li.addEventListener('focusin', () => { if (i !== activeCh) scrollToCh(i); }));

  resize();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
})();
