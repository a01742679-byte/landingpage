/* ==========================================================================
   SVOLTS · Laboratorio Solar Interactivo — motor de física
   Funciones puras (sin DOM). En el navegador: window.SVLab. En Node: require.
   Cada fórmula está documentada junto a su función. Unidades SI salvo que se
   indique otra cosa (nm, eV, µW).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SVLab = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------------
     CONSTANTES (SI 2019, valores exactos por definición salvo kB·T)
     ------------------------------------------------------------------------ */
  const H = 6.62607015e-34;      // constante de Planck [J·s]
  const C = 299792458;           // velocidad de la luz [m/s]
  const QE = 1.602176634e-19;    // carga elemental [C] (= J por eV)
  const KB = 1.380649e-23;       // constante de Boltzmann [J/K]
  const HC_EVNM = (H * C) / QE * 1e9; // h·c en eV·nm ≈ 1239.84
  const R_SUN = 6.957e8;         // radio solar nominal IAU [m]
  const AU = 1.495978707e11;     // unidad astronómica [m]

  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d === undefined ? 0 : d); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ------------------------------------------------------------------------
     1. FOTÓN
     f = c / λ          E = h·f = h·c / λ          E[eV] = E[J] / e
     ------------------------------------------------------------------------ */
  function photon(lambdaNm) {
    const lam = Math.max(1e-3, num(lambdaNm)) * 1e-9;   // m
    const f = C / lam;                                   // Hz
    const eJ = H * f;                                    // J
    return { lambdaNm: lam * 1e9, lambdaM: lam, f, eJ, eV: eJ / QE, waveNumberCm: 1 / (lam * 100) };
  }
  // λ [nm] a partir de la frecuencia [Hz] o de la energía [eV]
  const lambdaFromF = (f) => (C / Math.max(1, num(f))) * 1e9;
  const lambdaFromEv = (ev) => HC_EVNM / Math.max(1e-6, num(ev));

  /* ------------------------------------------------------------------------
     2. REGIONES ESPECTRALES
     Límites convencionales (ISO 21348 / CIE). El límite visible varía según la
     fuente (380–400 nm y 700–780 nm); aquí se usa 380–750 nm.
     ------------------------------------------------------------------------ */
  const REGIONS = [
    { id: 'uv', name: 'Ultravioleta', short: 'UV', from: 100, to: 380 },
    { id: 'vis', name: 'Visible', short: 'Visible', from: 380, to: 750 },
    { id: 'ir', name: 'Infrarrojo', short: 'IR', from: 750, to: 1e6 },
  ];
  function regionOf(lambdaNm) {
    const l = num(lambdaNm);
    if (l < 380) return l < 280 ? { id: 'uv', name: 'Ultravioleta C', short: 'UV-C' } : l < 315 ? { id: 'uv', name: 'Ultravioleta B', short: 'UV-B' } : { id: 'uv', name: 'Ultravioleta A', short: 'UV-A' };
    if (l <= 750) {
      const band = l < 450 ? 'violeta' : l < 485 ? 'azul' : l < 500 ? 'cian' : l < 565 ? 'verde' : l < 590 ? 'amarillo' : l < 625 ? 'naranja' : 'rojo';
      return { id: 'vis', name: 'Visible (' + band + ')', short: 'Visible', band };
    }
    if (l < 1400) return { id: 'ir', name: 'Infrarrojo cercano (IR-A)', short: 'IR-A' };
    if (l < 3000) return { id: 'ir', name: 'Infrarrojo (IR-B)', short: 'IR-B' };
    return { id: 'ir', name: 'Infrarrojo (IR-C)', short: 'IR-C' };
  }

  /* Color aproximado de una longitud de onda visible (aproximación lineal por
     tramos, Bruton 1996), con atenuación en los extremos. Fuera de 380–750 nm
     devuelve un color convencional (no visible para el ojo humano). */
  function wavelengthToRGB(lambdaNm) {
    const l = num(lambdaNm);
    let r = 0, g = 0, b = 0;
    if (l >= 380 && l < 440) { r = -(l - 440) / 60; b = 1; }
    else if (l >= 440 && l < 490) { g = (l - 440) / 50; b = 1; }
    else if (l >= 490 && l < 510) { g = 1; b = -(l - 510) / 20; }
    else if (l >= 510 && l < 580) { r = (l - 510) / 70; g = 1; }
    else if (l >= 580 && l < 645) { r = 1; g = -(l - 645) / 65; }
    else if (l >= 645 && l <= 750) { r = 1; }
    let k = 1;
    if (l >= 380 && l < 420) k = 0.35 + 0.65 * (l - 380) / 40;
    else if (l > 700 && l <= 750) k = 0.35 + 0.65 * (750 - l) / 50;
    if (l < 380) return { r: 167, g: 139, b: 250, visible: false };   // UV: violeta convencional
    if (l > 750) return { r: 160, g: 40, b: 40, visible: false };     // IR: rojo oscuro convencional
    const t = (x) => Math.round(255 * Math.pow(clamp(x * k, 0, 1), 0.8));
    return { r: t(r), g: t(g), b: t(b), visible: true };
  }
  const rgbStr = (c, a) => (a == null ? 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')' : 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')');

  /* ------------------------------------------------------------------------
     3. ESPECTROS
     Ley de Planck (radiancia espectral de un cuerpo negro):
       B(λ,T) = 2hc² / λ⁵ · 1 / (exp(hc / (λ k T)) − 1)        [W/m²/sr/m]
     Irradiancia en la Tierra de un Sol ideal a temperatura T:
       E(λ) = π · B(λ,T) · (R_sol / UA)²                        [W/m²/m]
     Se reporta en W/m²/nm (× 1e-9). Es un MODELO, no una medición: el Sol real
     se aparta del cuerpo negro por las líneas de absorción y el limbo solar.
     ------------------------------------------------------------------------ */
  function planckEarth(lambdaNm, T) {
    const lam = num(lambdaNm) * 1e-9;
    const temp = Math.max(1, num(T, 5772));
    const x = (H * C) / (lam * KB * temp);
    if (x > 700) return 0;
    const B = (2 * H * C * C) / Math.pow(lam, 5) / Math.expm1(x);
    return Math.PI * B * Math.pow(R_SUN / AU, 2) * 1e-9;
  }
  // Interpolación lineal en una tabla ordenada (wl ascendente)
  function interp(wl, y, x) {
    const n = wl.length;
    if (!n || x < wl[0] || x > wl[n - 1]) return null;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (wl[m] <= x) lo = m; else hi = m; }
    const t = wl[hi] === wl[lo] ? 0 : (x - wl[lo]) / (wl[hi] - wl[lo]);
    return y[lo] + t * (y[hi] - y[lo]);
  }
  // Integral por regla del trapecio entre a y b (incluye los extremos interpolados)
  function integrate(wl, y, a, b) {
    const n = wl.length;
    if (n < 2) return 0;
    const A = Math.max(num(a, wl[0]), wl[0]);
    const Bv = Math.min(num(b, wl[n - 1]), wl[n - 1]);
    if (Bv <= A) return 0;
    let s = 0;
    let px = A, py = interp(wl, y, A);
    for (let i = 0; i < n; i++) {
      if (wl[i] <= A) continue;
      if (wl[i] >= Bv) break;
      s += (wl[i] - px) * (y[i] + py) / 2;
      px = wl[i]; py = y[i];
    }
    s += (Bv - px) * (interp(wl, y, Bv) + py) / 2;
    return s;
  }
  // Flujo de fotones de una tabla espectral entre a y b [fotones/s/m²]
  //   Φ = ∫ E(λ) · λ / (h·c) dλ
  function photonFlux(wl, y, a, b) {
    const yy = y.map((v, i) => v * (wl[i] * 1e-9) / (H * C));
    return integrate(wl, yy, a, b);
  }

  /* ------------------------------------------------------------------------
     4. EFECTO FOTOELÉCTRICO (modelo didáctico simplificado)
     Einstein:  K_max = h·f − Φ        emisión solo si h·f ≥ Φ
     Potencial de frenado:  V₀ = K_max / e
     Corriente:  I = e · Ṅ_e · η_col
       Ṅ_fot = P / (h·f)                 fotones por segundo que llegan al cátodo
       Ṅ_e   = Y · Ṅ_fot  (si h·f ≥ Φ)   electrones emitidos por segundo
               Y = rendimiento cuántico supuesto (constante, 1·10⁻³ por defecto;
               en metales reales es del orden de 10⁻⁵ a 10⁻³ y depende de f)
       η_col = fracción de electrones que llegan al ánodo:
               V ≥ 0  → 1 (geometría ideal de placas paralelas)
               V < 0  → fracción con K > e·|V|. Con energías distribuidas de
                        manera uniforme entre 0 y K_max: 1 − e·|V| / K_max
     Supuestos: vacío perfecto, placas paralelas, sin carga espacial ni corriente
     oscura, rendimiento cuántico constante. Sirve para las tendencias, no para
     predecir corrientes de un tubo real.
     ------------------------------------------------------------------------ */
  // Funciones de trabajo de referencia [eV]. Dependen de la cara cristalina,
  // la limpieza y la oxidación de la superficie: se dan valor usado y rango.
  const MATERIALS = [
    { id: 'cs', name: 'Cesio', symbol: 'Cs', phi: 2.1, range: '2.1 – 2.14', note: 'El metal con menor función de trabajo; se oxida con mucha facilidad.' },
    { id: 'k', name: 'Potasio', symbol: 'K', phi: 2.29, range: '2.29 – 2.3', note: 'Muestras policristalinas.' },
    { id: 'na', name: 'Sodio', symbol: 'Na', phi: 2.36, range: '2.28 – 2.36', note: 'Muestras policristalinas; el valor cambia con la oxidación.' },
    { id: 'zn', name: 'Zinc', symbol: 'Zn', phi: 4.3, range: '3.63 – 4.9', note: 'Solo responde al ultravioleta. Valor muy sensible a la superficie.' },
    { id: 'cu', name: 'Cobre', symbol: 'Cu', phi: 4.7, range: '4.53 – 5.10', note: 'Varía con la cara cristalina; solo responde al ultravioleta.' },
  ];
  function photoelectric(p) {
    const ph = photon(p.lambdaNm);
    const phi = Math.max(0.1, num(p.phiEv, 2.3));
    const P = Math.max(0, num(p.powerW, 10e-6));          // potencia luminosa en el cátodo [W]
    const Y = clamp(num(p.yield, 1e-3), 0, 1);
    const V = num(p.volts, 0);
    const emits = ph.eV >= phi - 1e-12;
    const kmaxEv = emits ? ph.eV - phi : 0;
    const photonRate = P / ph.eJ;                          // fotones/s
    const emissionRate = emits ? Y * photonRate : 0;       // electrones/s
    let collection;
    if (!emits) collection = 0;
    else if (V >= 0) collection = 1;
    else collection = kmaxEv > 0 ? clamp(1 - (-V) / kmaxEv, 0, 1) : 0;
    const current = QE * emissionRate * collection;        // A
    const f0 = (phi * QE) / H;                             // frecuencia umbral [Hz]
    return {
      photon: ph, phiEv: phi, emits,
      kmaxEv, kmaxJ: kmaxEv * QE,
      vmaxMs: Math.sqrt((2 * kmaxEv * QE) / 9.1093837015e-31), // rapidez máxima del electrón [m/s]
      stopV: kmaxEv,                                          // V₀ en volts (numéricamente = K_max en eV)
      thresholdHz: f0, thresholdNm: (C / f0) * 1e9,
      photonRate, emissionRate, collection, current,
    };
  }
  // Curva I(V) para graficar (mismo modelo)
  function photoelectricIV(p, vMin, vMax, n) {
    const pts = [];
    const N = Math.max(2, n || 120);
    for (let k = 0; k <= N; k++) {
      const V = vMin + ((vMax - vMin) * k) / N;
      pts.push({ v: V, i: photoelectric(Object.assign({}, p, { volts: V })).current });
    }
    return pts;
  }

  /* ------------------------------------------------------------------------
     5. CELDA FOTOVOLTAICA (unión p-n, conceptual)
     Un fotón crea un par electrón-hueco si E ≥ E_g. El excedente E − E_g se
     pierde como calor (termalización). Límite de longitud de onda: λ_c = hc/E_g.
     Bandas prohibidas a 300 K (Sze & Ng, Physics of Semiconductor Devices).
     ------------------------------------------------------------------------ */
  const SEMICONDUCTORS = [
    { id: 'si', name: 'Silicio cristalino', symbol: 'Si', eg: 1.12, note: 'Material de la mayoría de los paneles comerciales. Banda indirecta: absorbe débilmente cerca del límite.' },
    { id: 'gaas', name: 'Arseniuro de galio', symbol: 'GaAs', eg: 1.42, note: 'Banda directa: absorbe en pocas micras. Se usa en satélites y celdas de alta eficiencia.' },
    { id: 'ge', name: 'Germanio', symbol: 'Ge', eg: 0.66, note: 'Absorbe más infrarrojo, pero da poco voltaje. Se usa como capa inferior en celdas multiunión.' },
  ];
  function pvPhoton(lambdaNm, egEv) {
    const ph = photon(lambdaNm);
    const eg = Math.max(0.1, num(egEv, 1.12));
    const absorbed = ph.eV >= eg;
    return {
      photon: ph, eg, absorbed,
      cutoffNm: HC_EVNM / eg,
      usefulEv: absorbed ? eg : 0,
      heatEv: absorbed ? ph.eV - eg : 0,
      usefulFraction: absorbed ? eg / ph.eV : 0,
    };
  }

  /* ------------------------------------------------------------------------
     6. FORMATO CIENTÍFICO
     ------------------------------------------------------------------------ */
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sci(v, digits) {
    const d = digits == null ? 3 : digits;
    if (!Number.isFinite(v)) return '—';
    if (v === 0) return '0';
    const e = Math.floor(Math.log10(Math.abs(v)));
    let m = v / Math.pow(10, e);
    let ee = e;
    if (Math.abs(Number(m.toPrecision(d))) >= 10) { m /= 10; ee += 1; }
    const ms = Number(m.toPrecision(d)).toLocaleString('es-MX', { minimumFractionDigits: d - 1, maximumFractionDigits: d - 1 });
    return ms + ' × 10' + String(ee).split('').map((ch) => SUP[ch]).join('');
  }

  return {
    H, C, QE, KB, HC_EVNM, R_SUN, AU,
    photon, lambdaFromF, lambdaFromEv, REGIONS, regionOf, wavelengthToRGB, rgbStr,
    planckEarth, interp, integrate, photonFlux,
    MATERIALS, photoelectric, photoelectricIV,
    SEMICONDUCTORS, pvPhoton, sci,
  };
});
