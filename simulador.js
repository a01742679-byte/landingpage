/* ==========================================================================
   SVOLTS · Simulador solar — interfaz
   Estado → cálculo (calc.js) → render. Sin dependencias ni backend.
   Los datos del proyecto y del catálogo se guardan solo en este navegador.
   ========================================================================== */
(() => {
  'use strict';

  const C = window.SVCalc;
  const SEED = window.SV_CATALOG_SEED || [];
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const SVG_NS = 'http://www.w3.org/2000/svg';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '');
  const nf = (v, d = 0) => Number(v).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  const money = (v, d = 0) => (v < 0 ? '−$' : '$') + nf(Math.abs(v), d);
  const kwh = (v, d = 1) => nf(v, d) + ' kWh';
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const todayISO = () => new Date().toISOString().slice(0, 10);

  const LS = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* sin almacenamiento */ } },
  };
  const STATE_KEY = 'svolts.sim.state.v1';
  const CAT_KEY = 'svolts.sim.catalog.v1';

  /* ------------------------------------------------------------------------
     1. ESTADO
     ------------------------------------------------------------------------ */
  const EXAMPLE_LOADS = [
    { name: 'Luminarias LED', qty: 8, watts: 18, hours: 6 },
    { name: 'Proyector', qty: 1, watts: 250, hours: 3 },
    { name: 'Computadora portátil', qty: 1, watts: 65, hours: 6 },
    { name: 'Ventiladores de techo', qty: 4, watts: 75, hours: 6 },
    { name: 'Aire acondicionado', qty: 1, watts: 1100, hours: 5 },
  ];
  const DEFAULTS = {
    view: 'basico',
    lastAdv: 'curva',
    project: { name: 'Aula de ejemplo', client: '', place: 'Culiacán, Sinaloa', company: 'SVOLTS Ingeniería Solar', author: 'Rodrigo Espada' },
    basic: { kwh: 500, period: 2, by: 'consumo', n: 10, panelW: 0 },
    vi: { g: 1000, ta: 25, noct: 45, tcIsc: 0.05, ns: 1, np: 1, r: 3, mppt: false, src: 'catalogo', manual: { voc: 52.07, isc: 15.11, vmp: 43.51, imp: 14.25, tcVoc: -0.26 } },
    loads: clone(EXAMPLE_LOADS),
    params: { simultaneity: 0.8, acVolts: 127, daysPerYear: 200 },
    site: { hsp: 5.5, pr: 0.75, tMin: 5, tCellMax: 70 },
    mode: 'grid',
    sel: { panel: 'panel-ja-620', inverter: 'inv-min10000-x2', battery: 'bat-us5000' },
    nPanelsOverride: null,
    nsOverride: null,
    cable: { lengthM: 20, sectionMm2: 6 },
    battery: { days: 0.5, etaInv: 0.92, etaRT: 0.9 },
    econ: { tariff: 2.5, installPct: 20, ivaPct: 0, netMetering: false, degradPct: 0.5, escalationPct: 0, omYear: 0 },
  };
  function loadState() {
    const s = clone(DEFAULTS);
    const saved = LS.get(STATE_KEY);
    if (saved && typeof saved === 'object') {
      Object.keys(DEFAULTS).forEach((k) => {
        if (!(k in saved)) return;
        const d = DEFAULTS[k];
        if (d && typeof d === 'object' && !Array.isArray(d)) s[k] = Object.assign({}, d, saved[k]);
        else s[k] = saved[k];
      });
      if (!Array.isArray(s.loads)) s.loads = clone(EXAMPLE_LOADS);
    }
    return s;
  }
  let state = loadState();
  const saveState = () => LS.set(STATE_KEY, state);

  /* ------------------------------------------------------------------------
     2. CATÁLOGO
     ------------------------------------------------------------------------ */
  let catalog = (() => {
    const saved = LS.get(CAT_KEY);
    if (saved && Array.isArray(saved.items)) return saved.items;
    return clone(SEED);
  })();
  const saveCatalog = () => LS.set(CAT_KEY, { version: window.SV_CATALOG_VERSION || 1, items: catalog });
  const byCat = (cat) => catalog.filter((i) => i.cat === cat);
  const getItem = (id) => catalog.find((i) => i.id === id) || null;
  const CAT_LABEL = { panel: 'Panel', inversor: 'Inversor', bateria: 'Batería' };

  function specLine(i) {
    if (i.cat === 'panel') return nf(i.pmax) + ' W · Voc ' + nf(i.voc, 2) + ' V · Isc ' + nf(i.isc, 2) + ' A · Vmp ' + nf(i.vmp, 2) + ' V · Imp ' + nf(i.imp, 2) + ' A';
    if (i.cat === 'inversor') {
      return nf(i.pacW / 1000, 1) + ' kW CA · CD hasta ' + nf(i.vdcMax) + ' V · ' + i.nMppt + ' MPPT (' + nf(i.mpptMin) + '–' + nf(i.mpptMax) + ' V)' + (i.type === 'aislado48' ? ' · batería ' + nf(i.vbat) + ' V' : ' · sin baterías');
    }
    return nf(i.kwh, 1) + ' kWh · ' + nf(i.vnom) + ' V · ' + nf(i.dod * 100) + ' % utilizable · ' + nf(i.irec) + ' A recomendados';
  }

  /* ------------------------------------------------------------------------
     3. CÁLCULO DEL MODELO COMPLETO
     ------------------------------------------------------------------------ */
  function pick(cat, id, filter) {
    const list = byCat(cat).filter(filter || (() => true));
    return list.find((i) => i.id === id) || list[0] || null;
  }
  function compute() {
    const s = state;
    const M = { alerts: [], steps: {} };
    const modeBat = s.mode === 'battery';
    M.loads = C.loadsSummary(s.loads, s.params);
    const panel = pick('panel', s.sel.panel);
    const inverter = pick('inversor', s.sel.inverter, (i) => (modeBat ? i.type === 'aislado48' : i.type !== 'aislado48'));
    const battery = modeBat ? pick('bateria', s.sel.battery, (i) => !inverter || Math.abs(inverter.vbat / i.vnom - Math.round(inverter.vbat / i.vnom)) < 1e-6) || pick('bateria', s.sel.battery) : null;
    if (panel) s.sel.panel = panel.id;
    if (inverter) s.sel.inverter = inverter.id;
    if (battery) s.sel.battery = battery.id;
    Object.assign(M, { panel, inverter, battery, modeBat });

    const chainEff = modeBat ? s.battery.etaRT : 1;
    M.chainEff = chainEff;
    M.pv = panel ? C.pvRequirement({ energyDayWh: M.loads.energyDayWh, hsp: s.site.hsp, pr: s.site.pr, chainEff, panelW: panel.pmax }) : null;
    M.target = s.nPanelsOverride && s.nPanelsOverride > 0 ? Math.round(s.nPanelsOverride) : (M.pv ? M.pv.panels : 0);

    M.cfg = null;
    M.arr = null;
    M.nInstalled = M.target;
    M.pdcW = M.target * (panel ? panel.pmax : 0);
    if (panel && inverter) {
      M.cfg = C.arrayConfig(panel, inverter, M.target, s.site.tMin, s.site.tCellMax, s.nsOverride);
      if (M.cfg.ns) {
        M.nInstalled = M.cfg.total;
        M.arr = C.verifyArray(panel, inverter, M.cfg, s.site, { demandW: M.loads.demandW, cable: s.cable });
        M.pdcW = M.arr.pdcW;
        if (!M.cfg.feasible) M.arr.checks.unshift({ id: 'cfg', label: 'Configuración serie/paralelo', status: 'fail', detail: M.cfg.note || 'No hay una configuración válida.' });
      } else {
        M.arr = { checks: [{ id: 'cfg', label: 'Configuración serie/paralelo', status: 'fail', detail: M.cfg.note }], pdcW: 0, ratio: 0 };
      }
    }

    M.bat = null;
    M.batChecks = [];
    if (modeBat && battery && inverter) {
      M.bat = C.batterySizing({ battery, vbus: inverter.vbat, days: s.battery.days, etaInv: s.battery.etaInv, energyDayWh: M.loads.energyDayWh, demandW: M.loads.demandW });
      M.batChecks = C.verifyBattery(battery, inverter, M.bat, M.pdcW);
    }

    M.costs = C.costs({ panel, nPanels: M.nInstalled, inverter, battery, nBattery: M.bat && M.bat.valid ? M.bat.count : 0, installPct: s.econ.installPct, ivaPct: s.econ.ivaPct });
    M.energyP = { pdcW: M.pdcW, hsp: s.site.hsp, pr: s.site.pr, chainEff, energyDayWh: M.loads.energyDayWh, daysPerYear: s.params.daysPerYear, netMetering: s.econ.netMetering };
    M.energy = C.energyYear(M.energyP);
    M.cash = C.cashflow({ investment: M.costs.total, energy: M.energyP, tariff: s.econ.tariff, degradPct: s.econ.degradPct, escalationPct: s.econ.escalationPct, omYear: s.econ.omYear });

    // Alertas y estado de cada paso
    const worst = (checks) => (checks.some((c) => c.status === 'fail') ? 'fail' : checks.some((c) => c.status === 'warn') ? 'warn' : 'ok');
    const addAlerts = (step, checks, label) => checks.forEach((c) => { if (c.status === 'fail' || c.status === 'warn') M.alerts.push({ step, status: c.status, text: c.label, where: label }); });
    M.steps.consumo = M.loads.energyDayWh > 0 ? 'ok' : 'warn';
    if (M.loads.energyDayWh <= 0) M.alerts.push({ step: 'consumo', status: 'warn', text: 'Agrega equipos con horas de uso', where: 'Consumo' });
    const arrChecks = M.arr ? M.arr.checks : [];
    const pvChecks = arrChecks.filter((c) => ['cfg', 'vmax', 'mppt-min', 'mppt-max', 'strings', 'drop'].includes(c.id));
    const invChecks = arrChecks.filter((c) => !['cfg', 'vmax', 'mppt-min', 'mppt-max', 'strings', 'drop'].includes(c.id));
    M.steps.paneles = pvChecks.length ? worst(pvChecks) : 'ok';
    M.steps.inversor = invChecks.length ? worst(invChecks) : 'ok';
    addAlerts('paneles', pvChecks, 'Paneles');
    addAlerts('inversor', invChecks, 'Inversor');
    M.steps.baterias = modeBat ? (M.batChecks.length ? worst(M.batChecks) : 'warn') : 'na';
    addAlerts('baterias', M.batChecks, 'Baterías');
    M.steps.economia = M.cash.payback != null ? 'ok' : 'warn';
    if (M.cash.payback == null && M.loads.energyDayWh > 0) M.alerts.push({ step: 'economia', status: 'warn', text: 'No se recupera en 25 años con estos supuestos', where: 'Economía' });
    M.steps.reporte = 'na';
    return M;
  }

  /* ------------------------------------------------------------------------
     4. UTILIDADES DE INTERFAZ
     ------------------------------------------------------------------------ */
  const STATUS_TXT = { ok: 'Cumple', warn: 'Revisar', fail: 'No cumple', na: 'Sin dato' };
  const tile = (label, value, sub, tone) => '<div class="tile-s' + (tone ? ' tile-s--' + tone : '') + '"><span class="tile-s__l">' + label + '</span><strong class="tile-s__v">' + value + '</strong>' + (sub ? '<span class="tile-s__s">' + sub + '</span>' : '') + '</div>';
  const checksHTML = (checks) => checks.map((c) =>
    '<li class="chk chk--' + c.status + '"><span class="spill spill--' + c.status + '">' + STATUS_TXT[c.status] + '</span><div><strong>' + esc(c.label) + '</strong><p>' + esc(c.detail) + '</p></div></li>').join('');

  function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
  function setPath(obj, path, val) {
    const keys = path.split('.');
    const last = keys.pop();
    const target = keys.reduce((o, k) => o[k], obj);
    target[last] = val;
  }

  /* ------------------------------------------------------------------------
     5. RENDER · CONSUMO
     ------------------------------------------------------------------------ */
  const loadsBody = $('#loadsBody');
  function loadRowHTML(l, i) {
    return '<tr data-i="' + i + '">' +
      '<td><input type="text" data-f="name" aria-label="Equipo ' + (i + 1) + '" value="' + esc(l.name) + '" autocomplete="off"></td>' +
      '<td class="num"><input type="number" data-f="qty" aria-label="Cantidad" inputmode="decimal" step="any" min="0" value="' + esc(l.qty) + '"></td>' +
      '<td class="num"><input type="number" data-f="watts" aria-label="Watts por equipo" inputmode="decimal" step="any" min="0" value="' + esc(l.watts) + '"></td>' +
      '<td class="num"><input type="number" data-f="hours" aria-label="Horas por día" inputmode="decimal" step="any" min="0" max="24" value="' + esc(l.hours) + '"></td>' +
      '<td class="num calc" data-k="p"></td><td class="num calc" data-k="e"></td><td class="num calc" data-k="i"></td>' +
      '<td class="x"><button type="button" class="rm" data-rm aria-label="Quitar equipo ' + (i + 1) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></td></tr>';
  }
  function renderLoadRows() {
    loadsBody.innerHTML = state.loads.length ? state.loads.map(loadRowHTML).join('') : '<tr><td colspan="8" class="empty-row">Sin equipos. Agrega uno o carga el aula de ejemplo.</td></tr>';
  }
  function renderConsumo(M) {
    $$('tr[data-i]', loadsBody).forEach((tr) => {
      const r = M.loads.rows[Number(tr.dataset.i)];
      if (!r) return;
      tr.querySelector('[data-k=p]').textContent = nf(r.powerW) + ' W';
      tr.querySelector('[data-k=e]').textContent = nf(r.energyWh) + ' Wh';
      tr.querySelector('[data-k=i]').textContent = nf(r.currentA, 1) + ' A';
    });
    $('#totP').textContent = nf(M.loads.installedW) + ' W';
    $('#totE').textContent = nf(M.loads.energyDayWh) + ' Wh';
    $('#totI').textContent = nf(M.loads.installedCurrentA, 1) + ' A';
    $('#consumoTiles').innerHTML =
      tile('Potencia instalada', nf(M.loads.installedW / 1000, 2) + ' kW', 'Suma de todos los equipos') +
      tile('Demanda simultánea', nf(M.loads.demandW / 1000, 2) + ' kW', nf(M.loads.demandCurrentA, 1) + ' A a ' + nf(M.loads.acVolts) + ' V', 'blue') +
      tile('Energía por día de uso', nf(M.loads.energyDayKWh, 2) + ' kWh', 'Lo que debe producir el sistema', 'sun') +
      tile('Energía al año', nf(M.loads.annualKWh, 0) + ' kWh', nf(M.loads.daysPerYear) + ' días de uso');
    const rows = M.loads.rows.filter((r) => r.energyWh > 0).sort((a, b) => b.energyWh - a.energyWh);
    $('#consumoBars').innerHTML = rows.length
      ? '<h3 class="h4">Dónde se va la energía</h3><ul>' + rows.map((r) =>
        '<li><span class="bar__n">' + esc(r.name || 'Sin nombre') + '</span><span class="bar__t" aria-hidden="true"><i style="width:' + Math.max(2, r.share * 100).toFixed(1) + '%"></i></span><span class="bar__v">' + nf(r.energyWh / 1000, 2) + ' kWh · ' + nf(r.share * 100) + ' %</span></li>').join('') + '</ul>'
      : '';
  }

  /* ------------------------------------------------------------------------
     6. RENDER · TARJETAS DE PRODUCTO
     ------------------------------------------------------------------------ */
  function productCard(i, selected, groupName) {
    const url = safeUrl(i.url);
    const specs = safeUrl(i.specsUrl);
    return '<div class="pcard' + (selected ? ' is-selected' : '') + '">' +
      '<label class="pcard__main"><input type="radio" name="' + groupName + '" value="' + esc(i.id) + '"' + (selected ? ' checked' : '') + '>' +
      '<span class="pcard__radio" aria-hidden="true"></span>' +
      '<span class="pcard__body"><strong class="pcard__t">' + esc(i.brand) + ' ' + esc(i.model) + '</strong>' +
      '<span class="pcard__s">' + esc(specLine(i)) + '</span></span>' +
      '<span class="pcard__p">' + money(i.price, 2) + '<small>MXN</small></span></label>' +
      '<div class="pcard__meta"><span>' + esc(i.supplier) + ' · consultado el ' + esc(fmtDate(i.consulted)) + '</span>' +
      (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Ver en tienda</a>' : '') +
      (specs ? '<a href="' + esc(specs) + '" target="_blank" rel="noopener">Ficha técnica</a>' : '') + '</div>' +
      ((i.notes || i.stock) ? '<details><summary>Existencias y notas</summary>' + (i.stock ? '<p><strong>Existencias:</strong> ' + esc(i.stock) + '</p>' : '') + (i.notes ? '<p>' + esc(i.notes) + '</p>' : '') + '</details>' : '') +
      '</div>';
  }
  function fmtDate(iso) {
    const d = new Date(String(iso) + 'T12:00:00');
    return isNaN(d) ? String(iso || '') : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function renderProductLists(M) {
    const panels = byCat('panel');
    $('#panelList').innerHTML = panels.length ? panels.map((i) => productCard(i, M.panel && i.id === M.panel.id, 'sel-panel')).join('') : '<p class="empty">No hay paneles en el catálogo. Agrega uno desde la pestaña Catálogo.</p>';
    const invs = byCat('inversor').filter((i) => (M.modeBat ? i.type === 'aislado48' : i.type !== 'aislado48'));
    $('#inverterList').innerHTML = invs.length ? invs.map((i) => productCard(i, M.inverter && i.id === M.inverter.id, 'sel-inv')).join('') : '<p class="empty">No hay inversores de este tipo en el catálogo.</p>';
    const bats = byCat('bateria').filter((i) => !M.inverter || Math.abs(M.inverter.vbat / i.vnom - Math.round(M.inverter.vbat / i.vnom)) < 1e-6);
    $('#batteryList').innerHTML = bats.length ? bats.map((i) => productCard(i, M.battery && i.id === M.battery.id, 'sel-bat')).join('') : '<p class="empty">No hay baterías compatibles con el voltaje del inversor.</p>';
  }

  /* ------------------------------------------------------------------------
     7. RENDER · PANELES (diagrama serie/paralelo)
     ------------------------------------------------------------------------ */
  function arrayDiagramSVG(ns, np, vString, iTotal, panel) {
    const showNs = Math.min(ns, 6);
    const compress = ns > 6;
    const rowsShown = Math.min(np, 6);
    const pw = 54, ph = 34, gap = 18, rowGap = 26;
    const x0 = 24;
    const cols = showNs + (compress ? 1 : 0);
    const rowsW = cols * pw + (cols - 1) * gap;
    const busX = x0 + rowsW + 34;
    const invX = busX + 56;
    const W = invX + 130;
    const H = rowsShown * (ph + rowGap) + 40 + (np > rowsShown ? 26 : 0);
    let g = '';
    for (let r = 0; r < rowsShown; r++) {
      const y = 28 + r * (ph + rowGap);
      const cy = y + ph / 2;
      g += '<line class="d-wire" x1="' + (x0 - 14) + '" y1="' + cy + '" x2="' + busX + '" y2="' + cy + '"/>';
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * (pw + gap);
        if (compress && c === showNs - 1) {
          g += '<text class="d-dots" x="' + (x + pw / 2) + '" y="' + (cy + 6) + '" text-anchor="middle">···</text>';
          continue;
        }
        g += '<rect class="d-panel" x="' + x + '" y="' + y + '" width="' + pw + '" height="' + ph + '" rx="6"/>' +
          '<path class="d-cell" d="M' + (x + pw / 3) + ' ' + y + 'v' + ph + 'M' + (x + 2 * pw / 3) + ' ' + y + 'v' + ph + 'M' + x + ' ' + (y + ph / 2) + 'h' + pw + '"/>';
      }
      g += '<circle class="d-node" cx="' + busX + '" cy="' + cy + '" r="4"/>';
    }
    const top = 28 + ph / 2;
    const bottom = 28 + (rowsShown - 1) * (ph + rowGap) + ph / 2;
    const mid = (top + bottom) / 2;
    g += '<line class="d-bus" x1="' + busX + '" y1="' + top + '" x2="' + busX + '" y2="' + bottom + '"/>' +
      '<line class="d-wire" x1="' + busX + '" y1="' + mid + '" x2="' + invX + '" y2="' + mid + '"/>' +
      '<rect class="d-inv" x="' + invX + '" y="' + (mid - 34) + '" width="104" height="68" rx="14"/>' +
      '<text class="d-invt" x="' + (invX + 52) + '" y="' + (mid - 2) + '" text-anchor="middle">Inversor</text>' +
      '<text class="d-invs" x="' + (invX + 52) + '" y="' + (mid + 16) + '" text-anchor="middle">' + nf(iTotal, 1) + ' A · ' + nf(vString) + ' V</text>';
    if (np > rowsShown) g += '<text class="d-dots" x="' + x0 + '" y="' + (H - 8) + '">+ ' + (np - rowsShown) + ' cadena(s) más</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" focusable="false" aria-hidden="true" class="array-svg">' + g + '</svg>';
  }
  function renderPaneles(M) {
    const s = state;
    $$('input[name=mode]').forEach((r) => { r.checked = r.value === s.mode; });
    if (!M.panel) { $('#panelTiles').innerHTML = ''; return; }
    const cfg = M.cfg;
    const kwp = M.pdcW / 1000;
    $('#panelTiles').innerHTML =
      tile('Potencia FV necesaria', nf(M.pv.requiredKW, 2) + ' kW', 'HSP ' + nf(s.site.hsp, 1) + ' · PR ' + nf(s.site.pr, 2) + (M.modeBat ? ' · baterías ' + nf(M.chainEff, 2) : '')) +
      tile('Paneles sugeridos', String(M.pv.panels), 'de ' + nf(M.panel.pmax) + ' W', 'blue') +
      tile('Instalados', String(M.nInstalled) + ' paneles', cfg && cfg.ns ? cfg.ns + ' en serie × ' + cfg.np + ' cadena(s)' : '—', 'sun') +
      tile('Potencia instalada', nf(kwp, 2) + ' kWp', 'Producción: ' + nf(M.energy.genDayKWh, 1) + ' kWh/día');
    const npan = $('#f-npan');
    if (document.activeElement !== npan) npan.value = s.nPanelsOverride ? s.nPanelsOverride : M.pv.panels;
    $('#npanHint').textContent = 'Sugerido: ' + M.pv.panels + ' (' + nf(M.pv.requiredKW, 2) + ' kW ÷ ' + nf(M.panel.pmax) + ' W). Borra el campo para volver al sugerido.';
    const nsSel = $('#f-ns');
    if (cfg && cfg.nsMax >= cfg.nsMin) {
      let opts = '<option value="">Automático (' + (cfg.ns || '—') + ')</option>';
      for (let n = cfg.nsMin; n <= cfg.nsMax; n++) opts += '<option value="' + n + '"' + (s.nsOverride === n ? ' selected' : '') + '>' + n + ' en serie</option>';
      if (nsSel.dataset.sig !== opts) { nsSel.innerHTML = opts; nsSel.dataset.sig = opts; }
      nsSel.value = s.nsOverride && s.nsOverride >= cfg.nsMin && s.nsOverride <= cfg.nsMax ? String(s.nsOverride) : '';
    } else {
      nsSel.innerHTML = '<option value="">Sin opciones válidas</option>';
      nsSel.dataset.sig = '';
    }
    if (cfg && cfg.ns) {
      const vString = cfg.ns * M.panel.vmp;
      const iTotal = cfg.np * M.panel.imp;
      $('#arrayDiagram').innerHTML = arrayDiagramSVG(cfg.ns, cfg.np, vString, iTotal, M.panel);
      $('#arrayCaption').innerHTML = 'En <strong>serie</strong> los voltajes se suman: ' + cfg.ns + ' × ' + nf(M.panel.vmp, 2) + ' V = <strong>' + nf(vString, 1) + ' V</strong> por cadena. En <strong>paralelo</strong> las corrientes se suman: ' + cfg.np + ' × ' + nf(M.panel.imp, 2) + ' A = <strong>' + nf(iTotal, 1) + ' A</strong> en total. Potencia en STC: ' + nf(vString * iTotal) + ' W.';
    } else {
      $('#arrayDiagram').innerHTML = '';
      $('#arrayCaption').textContent = 'Elige un inversor compatible para ver la configuración.';
    }
  }

  /* ------------------------------------------------------------------------
     8. RENDER · INVERSOR / BATERÍAS
     ------------------------------------------------------------------------ */
  function renderInversor(M) {
    $('#arrayChecks').innerHTML = M.arr ? checksHTML(M.arr.checks) : '<li class="empty">Elige un panel y un inversor para ver las pruebas.</li>';
  }
  function renderBaterias(M) {
    $('#batOff').hidden = M.modeBat;
    $('#batOn').hidden = !M.modeBat;
    if (!M.modeBat) return;
    if (!M.bat) { $('#batTiles').innerHTML = ''; $('#batChecks').innerHTML = '<li class="empty">Elige una batería para ver las pruebas.</li>'; return; }
    const b = M.bat;
    if (!b.valid) { $('#batTiles').innerHTML = ''; $('#batChecks').innerHTML = checksHTML(M.batChecks); return; }
    $('#batTiles').innerHTML =
      tile('Configuración', b.count + ' módulo(s)', b.nsB + ' en serie × ' + b.npB + ' en paralelo') +
      tile('Energía nominal', nf(b.nomWh / 1000, 1) + ' kWh', 'Utilizable: ' + nf(b.usableWh / 1000, 1) + ' kWh', 'blue') +
      tile('Autonomía', nf(b.autonomyDays, 2) + ' días', nf(b.autonomyHours, 1) + ' h con toda la demanda', 'sun') +
      tile('Corriente de descarga', nf(b.iDis, 0) + ' A', 'Capacidad: ' + nf(b.iCap, 0) + ' A');
    $('#batChecks').innerHTML = checksHTML(M.batChecks);
  }

  /* ------------------------------------------------------------------------
     9. RENDER · ECONOMÍA Y GRÁFICA
     ------------------------------------------------------------------------ */
  function niceTicks(min, max, n) {
    const span = max - min || 1;
    const raw = span / n;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const m = raw / p;
    const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) ticks.push(Math.abs(v) < step * 1e-6 ? 0 : v);
    return { ticks, step };
  }
  const kfmt = (v) => (Math.abs(v) < 1 ? '$0' : Math.abs(v) >= 1e6 ? (v < 0 ? '−' : '') + '$' + nf(Math.abs(v) / 1e6, 1) + ' M' : (v < 0 ? '−' : '') + '$' + nf(Math.abs(v) / 1000, 0) + ' mil');
  function cashChartSVG(M, idp) {
    const rows = M.cash.rows;
    const pts = [{ y: 0, v: -M.costs.total }].concat(rows.map((r) => ({ y: r.year, v: r.cumulative })));
    const vmin = Math.min(0, ...pts.map((p) => p.v));
    const vmax = Math.max(0, ...pts.map((p) => p.v));
    const pad = (vmax - vmin) * 0.06 || 1;
    const lo = vmin - (vmin < 0 ? Math.max(pad, (vmax - vmin) * 0.14) : 0);
    const hi = vmax + (vmax > 0 ? pad : 0);
    const { ticks } = niceTicks(lo, hi, 4);
    const W = 720, H = 320, L = 74, R = 20, T = 28, B = 40;
    const X = (y) => L + (y / 25) * (W - L - R);
    const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const zero = Y(0);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + X(p.y).toFixed(1) + ' ' + Y(p.v).toFixed(1)).join('');
    const area = line + 'L' + X(25).toFixed(1) + ' ' + zero.toFixed(1) + 'L' + X(0).toFixed(1) + ' ' + zero.toFixed(1) + 'Z';
    let g = '<defs><clipPath id="' + idp + 'up"><rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + Math.max(0, zero - T) + '"/></clipPath>' +
      '<clipPath id="' + idp + 'dn"><rect x="' + L + '" y="' + zero + '" width="' + (W - L - R) + '" height="' + Math.max(0, H - B - zero) + '"/></clipPath></defs>';
    ticks.forEach((t) => {
      g += '<line class="c-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(t).toFixed(1) + '" y2="' + Y(t).toFixed(1) + '"/>' +
        '<text class="c-tick" x="' + (L - 10) + '" y="' + (Y(t) + 4).toFixed(1) + '" text-anchor="end">' + kfmt(t) + '</text>';
    });
    [0, 5, 10, 15, 20, 25].forEach((yr) => {
      g += '<text class="c-tick" x="' + X(yr).toFixed(1) + '" y="' + (H - 14) + '" text-anchor="middle">' + yr + '</text>';
    });
    g += '<text class="c-axis" x="' + ((L + W - R) / 2) + '" y="' + (H - 0) + '" text-anchor="middle">Años</text>';
    g += '<path class="c-neg" d="' + area + '" clip-path="url(#' + idp + 'dn)"/><path class="c-pos" d="' + area + '" clip-path="url(#' + idp + 'up)"/>';
    g += '<line class="c-zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + zero.toFixed(1) + '" y2="' + zero.toFixed(1) + '"/>';
    g += '<path class="c-line" d="' + line + '"/>';
    const pb = M.cash.payback;
    if (pb != null && pb <= 25) {
      g += '<line class="c-pb" x1="' + X(pb).toFixed(1) + '" x2="' + X(pb).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '"/>' +
        '<circle class="c-dot c-dot--pb" cx="' + X(pb).toFixed(1) + '" cy="' + zero.toFixed(1) + '" r="6"/>';
      const right = X(pb) > W * 0.7;
      g += '<text class="c-label" x="' + (X(pb) + (right ? -10 : 10)).toFixed(1) + '" y="' + (T + 14) + '" text-anchor="' + (right ? 'end' : 'start') + '">Recuperas lo invertido en el año ' + nf(pb, 1) + '</text>';
    }
    const end = pts[pts.length - 1];
    g += '<circle class="c-dot" cx="' + X(25).toFixed(1) + '" cy="' + Y(end.v).toFixed(1) + '" r="5"/>' +
      '<text class="c-label" x="' + (X(25) - 8).toFixed(1) + '" y="' + (Y(end.v) - 14).toFixed(1) + '" text-anchor="end">' + kfmt(end.v) + '</text>';
    g += '<circle class="c-dot c-dot--neg" cx="' + X(0).toFixed(1) + '" cy="' + Y(pts[0].v).toFixed(1) + '" r="5"/>' +
      '<text class="c-label" x="' + (X(0) + 12).toFixed(1) + '" y="' + (Y(pts[0].v) + 22).toFixed(1) + '">Inversión ' + kfmt(pts[0].v) + '</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="cash-svg" focusable="false" aria-hidden="true">' + g + '</svg>';
  }
  function costTableHTML(M) {
    const c = M.costs;
    let h = '<thead><tr><th scope="col">Concepto</th><th scope="col" class="num">Cant.</th><th scope="col" class="num">Precio unitario</th><th scope="col" class="num">Importe</th></tr></thead><tbody>';
    c.items.forEach((i) => { h += '<tr><td>' + esc(i.desc) + '</td><td class="num">' + i.qty + '</td><td class="num">' + money(i.unit, 2) + '</td><td class="num">' + money(i.total, 2) + '</td></tr>'; });
    h += '<tr><td colspan="3">Instalación y accesorios (' + nf(c.installPct) + ' % del equipo)</td><td class="num">' + money(c.install, 2) + '</td></tr>';
    if (c.ivaPct > 0) h += '<tr><td colspan="3">IVA (' + nf(c.ivaPct) + ' %)</td><td class="num">' + money(c.iva, 2) + '</td></tr>';
    h += '</tbody><tfoot><tr><th scope="row" colspan="3">Inversión total estimada</th><td class="num">' + money(c.total, 2) + '</td></tr></tfoot>';
    return h;
  }
  function paybackText(M) {
    return M.cash.payback != null ? nf(M.cash.payback, 1) + ' años' : 'Más de 25 años';
  }
  function renderEconomia(M) {
    const e = M.energy;
    $('#econTiles').innerHTML =
      tile('Inversión estimada', money(M.costs.total), M.costs.ivaPct > 0 ? 'Incluye IVA' : 'Sin IVA agregado', 'blue') +
      tile('Ahorro del primer año', money(M.cash.firstYearSaving), kwh(e.selfKWh, 0) + ' solares aprovechados', 'sun') +
      tile('Tiempo de recuperación', paybackText(M), M.cash.simplePayback ? 'Simple: ' + nf(M.cash.simplePayback, 1) + ' años' : '') +
      tile('Ahorro neto a 25 años', money(M.cash.net), 'Ahorros menos inversión') +
      tile('Cobertura del consumo', nf(e.coverage * 100, 0) + ' %', 'Producción: ' + kwh(e.genYearKWh, 0) + '/año') ;
    $('#costTable').innerHTML = costTableHTML(M);
    $('#cashChart').innerHTML = cashChartSVG(M, 'sc');
  }

  /* ------------------------------------------------------------------------
     10. RESUMEN EN VIVO + PASOS
     ------------------------------------------------------------------------ */
  const STEP_ORDER = ['consumo', 'paneles', 'inversor', 'baterias', 'economia', 'reporte'];
  let liveOpen = false;
  function renderLive(M) {
    const alerts = M.alerts;
    const hasFail = alerts.some((a) => a.status === 'fail');
    $('#live').innerHTML =
      '<div class="live__head"><h2 class="h4">Tu sistema, en vivo</h2><button type="button" class="live__toggle" aria-expanded="' + liveOpen + '" aria-controls="live-detail">' + (liveOpen ? 'Ocultar detalle' : 'Ver detalle') + (alerts.length ? ' (' + alerts.length + ')' : '') + '</button></div>' +
      '<dl class="live__list" id="live-detail">' +
      '<div><dt>Consumo</dt><dd>' + nf(M.loads.energyDayKWh, 2) + ' kWh/día</dd></div>' +
      '<div><dt>Paneles</dt><dd>' + (M.panel ? M.nInstalled + ' × ' + nf(M.panel.pmax) + ' W = ' + nf(M.pdcW / 1000, 2) + ' kWp' : '—') + '</dd></div>' +
      '<div><dt>Inversor</dt><dd>' + (M.inverter ? esc(M.inverter.brand + ' ' + M.inverter.model) : '—') + '</dd></div>' +
      '<div><dt>Baterías</dt><dd>' + (M.modeBat ? (M.bat && M.bat.valid ? M.bat.count + ' × ' + esc(M.battery.model) + ' (' + nf(M.bat.nomWh / 1000, 1) + ' kWh)' : '—') : 'No incluye') + '</dd></div>' +
      '</dl>' +
      '<div class="live__money"><div><span>Inversión</span><strong>' + money(M.costs.total) + '</strong></div><div><span>Ahorro año 1</span><strong>' + money(M.cash.firstYearSaving) + '</strong></div><div><span>Recuperación</span><strong>' + (M.cash.payback != null ? nf(M.cash.payback, 1) + ' años' : '> 25 años') + '</strong></div></div>' +
      '<div class="live__alerts"><h3 class="h5">' + (alerts.length ? (hasFail ? 'Hay pruebas que no cumplen' : 'Puntos por revisar') : 'Todas las pruebas cumplen') + '</h3>' +
      (alerts.length
        ? '<ul>' + alerts.slice(0, 5).map((a) => '<li><button type="button" class="alert alert--' + a.status + '" data-go="' + a.step + '"><span class="spill spill--' + a.status + '">' + STATUS_TXT[a.status] + '</span><span>' + esc(a.text) + '<small>' + esc(a.where) + '</small></span></button></li>').join('') + '</ul>' + (alerts.length > 5 ? '<p class="note">y ' + (alerts.length - 5) + ' más</p>' : '')
        : '<p class="note">Compatibilidad eléctrica verificada con los datos de las fichas cargadas.</p>') +
      '</div>';
    $('#live').classList.toggle('is-open', liveOpen);
  }
  $('#live').addEventListener('click', (e) => {
    if (!e.target.closest('.live__toggle')) return;
    liveOpen = !liveOpen;
    update();
    const t = $('#live .live__toggle');
    if (t) t.focus();
  });
  function renderStepper(M) {
    $$('.sstep').forEach((b) => {
      const k = b.dataset.go;
      const active = k === state.view;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-current', active ? 'step' : 'false');
      const st = M.steps[k] || 'na';
      b.dataset.status = st;
      const mark = b.querySelector('.sstep__s');
      mark.textContent = st === 'ok' ? '✓' : st === 'warn' ? '!' : st === 'fail' ? '×' : '';
      b.dataset.skip = k === 'baterias' && !M.modeBat ? '1' : '0';
    });
    $('#catOpen').classList.toggle('is-active', state.view === 'catalogo');
  }

  /* ------------------------------------------------------------------------
     10b. MODO BÁSICO
     ------------------------------------------------------------------------ */
  function renderPanelSelects(M) {
    const opts = byCat('panel').map((i) => '<option value="' + esc(i.id) + '">' + esc(i.brand + ' ' + i.model + ' · ' + nf(i.pmax) + ' W · ' + money(i.price, 2)) + '</option>').join('');
    ['#b-panel', '#vi-panel'].forEach((sel) => {
      const el = $(sel);
      if (el.dataset.sig !== opts) { el.innerHTML = opts || '<option value="">Sin paneles en el catálogo</option>'; el.dataset.sig = opts; }
      if (M.panel) el.value = M.panel.id;
    });
  }
  function basicModel(M) {
    const b = state.basic;
    const period = Number(b.period) === 1 ? 1 : 2;
    const kwhMonth = Math.max(0, Number(b.kwh) || 0) / period;
    const panel = M.panel;
    const est = C.basicEstimate({ kwhMonth, hsp: state.site.hsp, pr: state.site.pr, panelW: panel ? panel.pmax : 0, panelPrice: panel ? panel.price : 0, tariff: state.econ.tariff });
    return { period, kwhMonth, panel, est };
  }
  function renderBasic(M) {
    const B = basicModel(M);
    const e = B.est;
    const by = state.basic.by === 'paneles' ? 'paneles' : 'consumo';
    $$('input[name=b-by]').forEach((r) => { r.checked = r.value === by; });
    $$('[data-basic]').forEach((el) => { el.hidden = el.dataset.basic !== by; });
    $$('input[name=b-period]').forEach((r) => { r.checked = Number(r.value) === B.period; });
    $('#b-periodHint').textContent = B.period === 2 ? 'Se divide entre 2: ' + nf(B.kwhMonth, 0) + ' kWh al mes.' : nf(B.kwhMonth, 0) + ' kWh al mes.';
    $('#b-prOut').textContent = nf(state.site.pr, 2);
    const err = $('#basicErr');
    const fail = (msg) => {
      err.textContent = msg || ''; err.hidden = !msg;
      $('#basicTiles').innerHTML = msg ? '' : $('#basicTiles').innerHTML;
      $('#basicCompare').innerHTML = ''; $('#basicPanels').innerHTML = ''; $('#basicPanelsNote').textContent = '';
    };
    if (!B.panel) { fail('Agrega un panel al catálogo para estimar.'); return; }
    const hsp = Number(state.site.hsp), pr = Number(state.site.pr), tariff = Number(state.econ.tariff);
    if (!(hsp >= 1 && hsp <= 9)) { fail('Las horas solar pico deben estar entre 1 y 9.'); return; }
    if (!(pr >= 0.5 && pr <= 0.95)) { fail('El factor de rendimiento debe estar entre 0.50 y 0.95.'); return; }
    if (!(tariff >= 0)) { fail('El precio de la energía no puede ser negativo.'); return; }

    let nPanels, panelW, genMonth;
    if (by === 'paneles') {
      const n = Number(state.basic.n);
      const customW = Number(state.basic.panelW) > 0 && Number(state.basic.panelW) !== B.panel.pmax;
      panelW = customW ? Number(state.basic.panelW) : B.panel.pmax;
      const pw = $('#b-pw');
      if (document.activeElement !== pw) pw.value = panelW;
      if (!(Number.isInteger(n) && n >= 1 && n <= 500)) { fail('La cantidad de paneles debe ser un número entero entre 1 y 500.'); return; }
      if (!(panelW >= 1 && panelW <= 1000)) { fail('La potencia por panel debe estar entre 1 y 1000 W.'); return; }
      fail('');
      const r = C.basicFromPanels({ n, panelW, hsp, pr, tariff, panelPrice: customW ? 0 : B.panel.price });
      nPanels = n; genMonth = r.genMonth;
      $('#basicTiles').innerHTML =
        tile('Potencia instalada', nf(r.kwp, 2) + ' kWp', n + ' × ' + nf(panelW) + ' W' + (customW ? ' (potencia escrita)' : ' · ' + esc(B.panel.brand + ' ' + B.panel.model))) +
        tile('Generación diaria', nf(r.genDay, 1) + ' kWh', nf(r.kwp, 2) + ' kW × ' + nf(hsp, 1) + ' h × ' + nf(pr, 2), 'blue') +
        tile('Generación mensual', nf(r.genMonth, 0) + ' kWh', 'Diaria × 30.4 días') +
        tile('Generación anual', nf(r.genYear, 0) + ' kWh', 'Diaria × 365 días') +
        tile('Ahorro anual estimado', money(r.savingYear), 'Con ' + money(tariff, 2) + '/kWh, si se aprovecha toda', 'sun') +
        tile('Costo de los paneles', customW ? '—' : money(r.panelCost), customW ? 'Elige un panel del catálogo para ver el precio' : 'Sin IVA, sin inversor ni instalación');
    } else {
      if (B.kwhMonth <= 0) { fail('Escribe tu consumo (mayor que cero) para ver la estimación.'); return; }
      fail('');
      nPanels = e.panels; panelW = B.panel.pmax; genMonth = e.genMonth;
      $('#basicTiles').innerHTML =
        tile('Paneles necesarios', e.panels + ' × ' + nf(B.panel.pmax) + ' W', esc(B.panel.brand + ' ' + B.panel.model)) +
        tile('Potencia instalada', nf(e.kwp, 2) + ' kWp', 'Se necesitan ' + nf(e.requiredKW, 2) + ' kW', 'blue') +
        tile('Generación diaria', nf(e.genDay, 1) + ' kWh', 'Mensual: ' + nf(e.genMonth, 0) + ' kWh') +
        tile('Generación anual', nf(e.genMonth * 12, 0) + ' kWh', 'Diaria × 365 días') +
        tile('Ahorro estimado', money(e.savingYear) + '/año', money(e.savingMonth) + ' al mes con ' + money(tariff, 2) + '/kWh', 'sun') +
        tile('Costo de los paneles', money(e.panelCost), 'Sin IVA, sin inversor ni instalación');
    }
    if (B.kwhMonth > 0) {
      const max = Math.max(B.kwhMonth, genMonth) || 1;
      const cov = Math.min(genMonth, B.kwhMonth) / B.kwhMonth;
      $('#basicCompare').innerHTML =
        '<h3 class="h5">Consumo contra generación, por mes</h3>' +
        '<div class="bc-row"><span class="bc-n">Consumo</span><span class="bc-t"><i class="bc-c" style="width:' + (B.kwhMonth / max * 100).toFixed(1) + '%"></i></span><span class="bc-v">' + nf(B.kwhMonth, 0) + ' kWh</span></div>' +
        '<div class="bc-row"><span class="bc-n">Generación solar</span><span class="bc-t"><i class="bc-g" style="width:' + (genMonth / max * 100).toFixed(1) + '%"></i></span><span class="bc-v">' + nf(genMonth, 0) + ' kWh</span></div>' +
        '<p class="note">Cubre el ' + nf(cov * 100, 0) + ' % de un consumo de ' + nf(B.kwhMonth, 0) + ' kWh/mes' + (genMonth > B.kwhMonth * 1.02 ? '. Sobran ' + nf(genMonth - B.kwhMonth, 0) + ' kWh/mes' + (by === 'consumo' ? ', que no se cuentan como ahorro.' : '.') : '.') + '</p>';
    } else $('#basicCompare').innerHTML = '';
    const shown = Math.min(nPanels, 60);
    let cells = '';
    for (let k = 0; k < shown; k++) cells += '<span class="bp" style="--i:' + k + '"></span>';
    $('#basicPanels').innerHTML = cells;
    $('#basicPanelsNote').textContent = nPanels + ' panel(es) de ' + nf(panelW) + ' W' + (nPanels > shown ? ' (se muestran ' + shown + ')' : '') + '.';
  }

  /* ------------------------------------------------------------------------
     10c. MODO AVANZADO · CURVA I-V
     ------------------------------------------------------------------------ */
  // Datos eléctricos del módulo: del catálogo o capturados a mano
  function viPanel() {
    const v = state.vi;
    if (v.src === 'manual') {
      const m = v.manual || {};
      return { manual: true, brand: 'Módulo', model: 'capturado a mano', voc: Number(m.voc), isc: Number(m.isc), vmp: Number(m.vmp), imp: Number(m.imp), tcVoc: Number(m.tcVoc), pmax: NaN };
    }
    return pick('panel', state.sel.panel);
  }
  function viModel() {
    const panel = viPanel();
    if (!panel || !C.validatePanelData(panel).valid) return null;
    const v = state.vi;
    const g = Math.min(1200, Math.max(100, Number(v.g) || 1000));
    const tc = C.cellTemp(v.ta, g, v.noct);
    const m = C.ivParams(panel, g, tc, v.tcIsc);
    const ns = Math.min(30, Math.max(1, Math.round(Number(v.ns) || 1)));
    const np = Math.min(10, Math.max(1, Math.round(Number(v.np) || 1)));
    const arr = C.ivArray(m, ns, np);
    const ref = C.ivArray(C.ivParams(panel, 1000, 25, v.tcIsc), ns, np);
    const op = v.mppt ? { r: arr.rmp, v: arr.vmp, i: arr.imp, p: arr.pmp, ratio: 1 } : C.loadPoint(arr, v.r);
    return { panel, g, tc, m, ns, np, arr, ref, op };
  }
  function viChartSVG(d, compact) {
    const W = compact ? 440 : 720, H = compact ? 380 : 380, L = compact ? 44 : 58, R = compact ? 50 : 66, T = 26, B = 48;
    const vmax = Math.max(d.arr.voc, d.ref.voc) * 1.04;
    const imax = Math.max(d.arr.isc, d.ref.isc) * 1.12;
    const pmax = Math.max(d.arr.pmp, d.ref.pmp) * 1.18;
    const X = (v) => L + (v / vmax) * (W - L - R);
    const YI = (i) => T + (1 - i / imax) * (H - T - B);
    const YP = (p) => T + (1 - p / pmax) * (H - T - B);
    const vt = niceTicks(0, vmax, 6).ticks.filter((t) => t <= vmax);
    const it = niceTicks(0, imax, 5).ticks.filter((t) => t <= imax);
    const pt = niceTicks(0, pmax, 5).ticks.filter((t) => t <= pmax);
    const pfmt = (p) => (pmax >= 2000 ? nf(p / 1000, 1) + ' kW' : nf(p) + ' W');
    let g = '';
    it.forEach((t) => { g += '<line class="vi-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + YI(t).toFixed(1) + '" y2="' + YI(t).toFixed(1) + '"/><text class="vi-tick" x="' + (L - 8) + '" y="' + (YI(t) + 4).toFixed(1) + '" text-anchor="end">' + nf(t, t < 10 && it[1] < 5 ? 1 : 0) + '</text>'; });
    pt.forEach((t) => { g += '<text class="vi-tick vi-tick--p" x="' + (W - R + 8) + '" y="' + (YP(t) + 4).toFixed(1) + '">' + pfmt(t) + '</text>'; });
    vt.forEach((t) => { g += '<line class="vi-grid vi-grid--v" x1="' + X(t).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y1="' + T + '" y2="' + (H - B) + '"/><text class="vi-tick" x="' + X(t).toFixed(1) + '" y="' + (H - B + 18) + '" text-anchor="middle">' + nf(t) + '</text>'; });
    g += '<text class="vi-axis" x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">Voltaje (V)</text>' +
      '<text class="vi-axis" transform="translate(14 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">Corriente (A)</text>' +
      (compact ? '' : '<text class="vi-axis vi-axis--p" transform="translate(' + (W - 8) + ' ' + ((T + H - B) / 2) + ') rotate(90)" text-anchor="middle">Potencia</text>');
    const path = (pts, y) => pts.map((p, k) => (k ? 'L' : 'M') + X(p.v).toFixed(1) + ' ' + y(p).toFixed(1)).join('');
    const cur = C.ivCurve(d.arr, 140);
    const refc = C.ivCurve(d.ref, 100);
    // Rectángulo V × I del punto de operación (su área es la potencia)
    g += '<rect class="vi-rect" x="' + L + '" y="' + YI(d.op.i).toFixed(1) + '" width="' + (X(d.op.v) - L).toFixed(1) + '" height="' + (YI(0) - YI(d.op.i)).toFixed(1) + '"/>';
    g += '<path class="vi-ref" d="' + path(refc, (p) => YI(p.i)) + '"/>';
    g += '<path class="vi-p" d="' + path(cur, (p) => YP(p.p)) + '"/>';
    g += '<path class="vi-i" d="' + path(cur, (p) => YI(p.i)) + '"/>';
    // Recta de carga I = V / R, recortada al área de la gráfica
    if (!state.vi.mppt) {
      const r = d.op.r;
      let v2 = vmax, i2 = vmax / r;
      if (i2 > imax) { i2 = imax; v2 = imax * r; }
      g += '<line class="vi-load" x1="' + X(0) + '" y1="' + YI(0) + '" x2="' + X(v2).toFixed(1) + '" y2="' + YI(i2).toFixed(1) + '"/>';
    }
    g += '<line class="vi-axisline" x1="' + L + '" x2="' + (W - R) + '" y1="' + YI(0) + '" y2="' + YI(0) + '"/>';
    // Marcadores
    const mx = X(d.arr.vmp), my = YI(d.arr.imp);
    g += '<circle class="vi-mpp" cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="7"/>';
    g += '<circle class="vi-mpp vi-mpp--p" cx="' + mx.toFixed(1) + '" cy="' + YP(d.arr.pmp).toFixed(1) + '" r="5"/>';
    g += '<text class="vi-lab" x="' + (mx + 10).toFixed(1) + '" y="' + (YP(d.arr.pmp) - 10).toFixed(1) + '"' + (mx > W * 0.55 ? ' text-anchor="end" dx="-20"' : '') + '>' + (compact ? 'Máx. ' : 'Máxima potencia ') + pfmt(d.arr.pmp) + '</text>';
    const ox = X(d.op.v), oy = YI(d.op.i);
    const close = Math.abs(ox - mx) < 14 && Math.abs(oy - my) < 14;
    g += '<circle class="vi-op" cx="' + ox.toFixed(1) + '" cy="' + oy.toFixed(1) + '" r="' + (close ? 4 : 7) + '"/>';
    if (!close) g += '<text class="vi-lab vi-lab--op" x="' + (ox + (ox > W * 0.6 ? -12 : 12)).toFixed(1) + '" y="' + (oy + 22).toFixed(1) + '" text-anchor="' + (ox > W * 0.6 ? 'end' : 'start') + '">' + (compact ? '' : 'Operación ') + nf(d.op.v, 1) + ' V · ' + nf(d.op.i, 2) + ' A</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" class="vi-svg' + (compact ? ' vi-svg--compact' : '') + '" role="img" aria-label="Curva corriente-voltaje y potencia-voltaje del arreglo. Máxima potencia ' + pfmt(d.arr.pmp) + ' en ' + nf(d.arr.vmp, 1) + ' V y ' + nf(d.arr.imp, 2) + ' A. Punto de operación ' + nf(d.op.v, 1) + ' V y ' + nf(d.op.i, 2) + ' A.">' + g + '</svg>';
  }
  function renderCurva() {
    const d = viModel();
    const v = state.vi;
    $('#vi-gOut').textContent = nf(v.g) + ' W/m²';
    $('#vi-taOut').textContent = nf(v.ta) + ' °C';
    $('#vi-mppt').checked = !!v.mppt;
    const src = v.src === 'manual' ? 'manual' : 'catalogo';
    $$('input[name=vi-src]').forEach((r) => { r.checked = r.value === src; });
    $$('[data-visrc]').forEach((el) => { el.hidden = el.dataset.visrc !== src; });
    const vp = viPanel();
    const val = vp ? C.validatePanelData(vp) : { checks: [] };
    $('#viChecks').innerHTML = vp ? checksHTML(val.checks) : '<li class="empty">Sin panel en el catálogo.</li>';
    $('#viChecksSrc').textContent = vp ? (vp.manual ? '· datos capturados' : '· ' + vp.brand + ' ' + vp.model) : '';
    if (!d) {
      $('#viChart').innerHTML = '<p class="empty">Los datos del módulo no son coherentes (revisa la lista de abajo): no se puede trazar la curva.</p>';
      $('#viTiles').innerHTML = ''; $('#viNote').textContent = ''; $('#viTable').innerHTML = '';
      return;
    }
    const rl = $('#vi-rlog');
    if (document.activeElement !== rl) rl.value = String(Math.log10(Math.min(500, Math.max(0.1, d.op.r))));
    $('#vi-rOut').textContent = (v.mppt ? 'MPPT · ' : '') + nf(d.op.r, d.op.r < 10 ? 2 : 1) + ' Ω';
    const cw = $('#viChart').clientWidth;
    $('#viChart').innerHTML = viChartSVG(d, cw > 0 && cw < 560);
    const a = d.arr;
    const perCell = d.m.voc / d.m.nCells;
    $('#viTiles').innerHTML =
      tile('Voltaje de circuito abierto', nf(a.voc, 1) + ' V', d.ns + ' × ' + nf(d.m.voc, 2) + ' V · ~' + nf(perCell, 2) + ' V por celda') +
      tile('Corriente de corto circuito', nf(a.isc, 2) + ' A', d.np + ' × ' + nf(d.m.isc, 2) + ' A', 'blue') +
      tile('Máxima potencia', (a.pmp >= 2000 ? nf(a.pmp / 1000, 2) + ' kW' : nf(a.pmp, 0) + ' W'), nf(a.vmp, 1) + ' V × ' + nf(a.imp, 2) + ' A · FF ' + nf(a.ff, 2), 'sun') +
      tile('Punto de operación', nf(d.op.v, 1) + ' V · ' + nf(d.op.i, 2) + ' A', (d.op.p >= 2000 ? nf(d.op.p / 1000, 2) + ' kW' : nf(d.op.p, 0) + ' W') + ' = ' + nf(d.op.ratio * 100, 0) + ' % del máximo') +
      tile('Temperatura de celda', nf(d.tc, 1) + ' °C', 'Ambiente ' + nf(v.ta) + ' °C · ' + nf(d.g) + ' W/m²');
    let note;
    if (v.mppt) note = 'Con seguidor MPPT la carga equivale a R = V/I = ' + nf(a.rmp, 2) + ' Ω, y el arreglo entrega toda su potencia disponible.';
    else if (d.op.ratio > 0.97) note = 'La resistencia está cerca de la óptima (' + nf(a.rmp, 2) + ' Ω): el arreglo trabaja casi en su máxima potencia.';
    else if (d.op.r < a.rmp) note = 'La resistencia es menor que la óptima (' + nf(a.rmp, 2) + ' Ω): el arreglo trabaja como fuente de corriente, con poco voltaje, y desaprovecha el ' + nf((1 - d.op.ratio) * 100, 0) + ' % de su potencia.';
    else note = 'La resistencia es mayor que la óptima (' + nf(a.rmp, 2) + ' Ω): el arreglo trabaja cerca de Voc, con poca corriente, y desaprovecha el ' + nf((1 - d.op.ratio) * 100, 0) + ' % de su potencia.';
    $('#viNote').textContent = note + ' El área sombreada es V × I: la potencia que recibe la carga.';
    const rows = [];
    for (let k = 0; k <= 10; k++) { const V = (a.voc * k) / 10; const I = a.at(V); rows.push({ v: V, i: I, p: V * I, mpp: false }); }
    rows.push({ v: a.vmp, i: a.imp, p: a.pmp, mpp: true });
    rows.sort((x, y) => x.v - y.v);
    $('#viTable').innerHTML = '<thead><tr><th scope="col" class="num">Voltaje (V)</th><th scope="col" class="num">Corriente (A)</th><th scope="col" class="num">Potencia (W)</th><th scope="col">Punto</th></tr></thead><tbody>' +
      rows.map((r) => '<tr' + (r.mpp ? ' class="is-mpp"' : '') + '><td class="num">' + nf(r.v, 2) + '</td><td class="num">' + nf(r.i, 3) + '</td><td class="num">' + nf(r.p, 1) + '</td><td>' + (r.mpp ? 'Máxima potencia' : r.v === 0 ? 'Corto circuito' : Math.abs(r.v - a.voc) < 1e-9 ? 'Circuito abierto' : '') + '</td></tr>').join('') + '</tbody>';
  }
  let viFrame = 0;
  function scheduleVI() {
    if (viFrame) return;
    viFrame = requestAnimationFrame(() => { viFrame = 0; renderCurva(); saveState(); });
  }
  let viCompact = null;
  window.addEventListener('resize', () => {
    const cw = $('#viChart').clientWidth;
    const c = cw > 0 && cw < 560;
    if (c !== viCompact) { viCompact = c; scheduleVI(); }
  }, { passive: true });

  /* ------------------------------------------------------------------------
     11. REPORTE
     ------------------------------------------------------------------------ */
  function reportHTML(M) {
    const p = state.project;
    const date = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
    const s = state;
    const e = M.energy;
    const pb = M.cash.payback;
    const items = M.costs.items;
    const allChecks = (M.arr ? M.arr.checks : []).concat(M.batChecks);
    const fails = allChecks.filter((c) => c.status === 'fail').length;
    const warns = allChecks.filter((c) => c.status === 'warn').length;
    const unknown = allChecks.filter((c) => c.status === 'na').length;
    const verdict = fails ? 'Hay ' + fails + ' prueba(s) que no cumplen. Esta configuración no debe ofrecerse sin corregirla.' : warns ? 'Todas las pruebas críticas cumplen; hay ' + warns + ' punto(s) por revisar.' : 'Todas las pruebas de compatibilidad con los datos disponibles cumplen.';
    const yrs = [1, 5, 10, 15, 20, 25];
    let h = '';
    h += '<header class="rp-head"><div><img src="assets/logo.png" alt="" class="rp-logo"><p class="rp-company">' + esc(p.company || '') + '</p></div>' +
      '<div class="rp-meta"><strong>Propuesta técnico-comercial preliminar</strong><span>' + esc(date) + '</span></div></header>';
    h += '<h1 class="rp-title">' + esc(p.name || 'Sistema fotovoltaico') + '</h1>';
    h += '<dl class="rp-info"><div><dt>Cliente</dt><dd>' + esc(p.client || '—') + '</dd></div><div><dt>Ubicación</dt><dd>' + esc(p.place || '—') + '</dd></div><div><dt>Elaboró</dt><dd>' + esc(p.author || '—') + '</dd></div></dl>';

    h += '<section class="rp-sec"><h2>Resumen para decidir</h2><div class="rp-kpis">' +
      '<div><span>Inversión estimada</span><strong>' + money(M.costs.total) + '</strong></div>' +
      '<div><span>Ahorro del primer año</span><strong>' + money(M.cash.firstYearSaving) + '</strong></div>' +
      '<div><span>Recuperación</span><strong>' + (pb != null ? nf(pb, 1) + ' años' : 'Más de 25 años') + '</strong></div>' +
      '<div><span>Energía solar al año</span><strong>' + nf(e.selfKWh, 0) + ' kWh</strong></div></div>' +
      '<p>El espacio consume en promedio <strong>' + nf(M.loads.energyDayKWh, 1) + ' kWh por día de uso</strong> (' + nf(M.loads.annualKWh, 0) + ' kWh al año). Proponemos <strong>' + M.nInstalled + ' paneles de ' + nf(M.panel ? M.panel.pmax : 0) + ' W</strong> (' + nf(M.pdcW / 1000, 2) + ' kWp)' + (M.modeBat && M.bat && M.bat.valid ? ' con un banco de baterías de ' + nf(M.bat.nomWh / 1000, 1) + ' kWh' : ' conectados a la red') + '. Con una tarifa de ' + money(s.econ.tariff, 2) + ' por kWh, el sistema cubriría cerca del <strong>' + nf(e.coverage * 100, 0) + ' %</strong> del consumo y ' +
      (pb != null ? 'la inversión se recuperaría en aproximadamente <strong>' + nf(pb, 1) + ' años</strong>.' : 'con estos supuestos la inversión no se recuperaría dentro de 25 años.') + '</p>' +
      '<p class="rp-gloss"><strong>Cómo leerlo.</strong> Un kW mide qué tanta potencia se usa en un instante; un kWh es esa potencia sostenida durante una hora y es lo que cobra la CFE. Un kWp es la potencia máxima de los paneles bajo condiciones de prueba. El tiempo de recuperación es el año en que lo ahorrado iguala lo invertido.</p></section>';

    h += '<section class="rp-sec"><h2>Consumo del espacio</h2><table class="rp-table"><thead><tr><th>Equipo</th><th class="num">Cant.</th><th class="num">W c/u</th><th class="num">h/día</th><th class="num">Energía diaria</th></tr></thead><tbody>' +
      M.loads.rows.map((r) => '<tr><td>' + esc(r.name || '—') + '</td><td class="num">' + nf(r.qty, 0) + '</td><td class="num">' + nf(r.watts) + '</td><td class="num">' + nf(r.hours, 1) + '</td><td class="num">' + nf(r.energyWh / 1000, 2) + ' kWh</td></tr>').join('') +
      '</tbody><tfoot><tr><th colspan="4" scope="row">Total por día de uso (' + nf(M.loads.installedW / 1000, 2) + ' kW instalados, ' + nf(M.loads.demandW / 1000, 2) + ' kW de demanda simultánea)</th><td class="num">' + nf(M.loads.energyDayKWh, 2) + ' kWh</td></tr></tfoot></table></section>';

    h += '<section class="rp-sec"><h2>Sistema propuesto</h2><ul class="rp-list">' +
      (M.panel ? '<li><strong>Paneles:</strong> ' + M.nInstalled + ' × ' + esc(M.panel.brand + ' ' + M.panel.model) + ', ' + nf(M.panel.pmax) + ' W. Configuración: ' + (M.cfg && M.cfg.ns ? M.cfg.ns + ' en serie × ' + M.cfg.np + ' cadena(s) en paralelo' : '—') + '.</li>' : '') +
      (M.inverter ? '<li><strong>Inversor:</strong> ' + esc(M.inverter.brand + ' ' + M.inverter.model) + ', ' + nf(M.inverter.pacW / 1000, 1) + ' kW.</li>' : '') +
      (M.modeBat && M.bat && M.bat.valid ? '<li><strong>Baterías:</strong> ' + M.bat.count + ' × ' + esc(M.battery.brand + ' ' + M.battery.model) + ' (' + nf(M.bat.nomWh / 1000, 1) + ' kWh nominales, ' + nf(M.bat.usableWh / 1000, 1) + ' kWh utilizables). Autonomía ' + nf(M.bat.autonomyDays, 2) + ' días de uso o ' + nf(M.bat.autonomyHours, 1) + ' h con toda la demanda encendida.</li>' : '<li><strong>Baterías:</strong> no incluidas; la red eléctrica funciona como respaldo.</li>') +
      '</ul>' +
      (M.cfg && M.cfg.ns && M.panel ? '<div class="rp-diagram">' + arrayDiagramSVG(M.cfg.ns, M.cfg.np, M.cfg.ns * M.panel.vmp, M.cfg.np * M.panel.imp, M.panel) + '</div>' : '') +
      '<h3>Verificación de compatibilidad</h3><p class="rp-verdict">' + esc(verdict) + (unknown ? ' ' + unknown + ' prueba(s) no pudieron evaluarse por falta de datos en la ficha.' : '') + '</p>' +
      '<table class="rp-table"><thead><tr><th>Prueba</th><th>Resultado</th><th>Detalle</th></tr></thead><tbody>' +
      allChecks.map((c) => '<tr><td>' + esc(c.label) + '</td><td><span class="spill spill--' + c.status + '">' + STATUS_TXT[c.status] + '</span></td><td>' + esc(c.detail) + '</td></tr>').join('') + '</tbody></table></section>';

    h += '<section class="rp-sec rp-break"><h2>Inversión</h2><table class="rp-table"><thead><tr><th>Concepto</th><th class="num">Cant.</th><th class="num">Precio unitario</th><th class="num">Importe</th></tr></thead><tbody>' +
      items.map((i) => '<tr><td>' + esc(i.desc) + '</td><td class="num">' + i.qty + '</td><td class="num">' + money(i.unit, 2) + '</td><td class="num">' + money(i.total, 2) + '</td></tr>').join('') +
      '<tr><td colspan="3">Instalación y accesorios (' + nf(M.costs.installPct) + ' % del equipo)</td><td class="num">' + money(M.costs.install, 2) + '</td></tr>' +
      (M.costs.ivaPct > 0 ? '<tr><td colspan="3">IVA (' + nf(M.costs.ivaPct) + ' %)</td><td class="num">' + money(M.costs.iva, 2) + '</td></tr>' : '') +
      '</tbody><tfoot><tr><th scope="row" colspan="3">Total estimado (MXN)</th><td class="num">' + money(M.costs.total, 2) + '</td></tr></tfoot></table></section>';

    h += '<section class="rp-sec"><h2>Retorno de la inversión</h2><div class="rp-chart">' + cashChartSVG(M, 'rp') + '</div>' +
      '<table class="rp-table rp-table--years"><thead><tr><th>Año</th>' + yrs.map((y) => '<th class="num">' + y + '</th>').join('') + '</tr></thead><tbody>' +
      '<tr><th scope="row">Ahorro del año</th>' + yrs.map((y) => '<td class="num">' + money(M.cash.rows[y - 1].saving) + '</td>').join('') + '</tr>' +
      '<tr><th scope="row">Acumulado</th>' + yrs.map((y) => '<td class="num">' + money(M.cash.rows[y - 1].cumulative) + '</td>').join('') + '</tr></tbody></table></section>';

    h += '<section class="rp-sec"><h2>Supuestos y límites</h2><ul class="rp-list rp-list--small">' +
      '<li>Horas solar pico: ' + nf(s.site.hsp, 1) + ' kWh/m²/día; rendimiento del sistema (PR): ' + nf(s.site.pr, 2) + '. Temperaturas de diseño: mínima ' + nf(s.site.tMin) + ' °C y de celda máxima ' + nf(s.site.tCellMax) + ' °C.</li>' +
      '<li>El voltaje de máxima potencia con temperatura se estimó con el coeficiente de Voc del panel (aproximación).</li>' +
      '<li>Tarifa: ' + money(s.econ.tariff, 2) + '/kWh, con aumento anual de ' + nf(s.econ.escalationPct, 1) + ' %. Pérdida anual de producción: ' + nf(s.econ.degradPct, 1) + ' %. Mantenimiento: ' + money(s.econ.omYear) + ' al año.</li>' +
      '<li>' + (s.econ.netMetering ? 'Se valoran los excedentes con medición neta.' : 'Solo se valora la energía que el espacio consume el mismo día; la producción de días sin uso no se contabiliza.') + ' Se usan ' + nf(s.params.daysPerYear) + ' días de uso al año.</li>' +
      '<li>Instalación y accesorios: ' + nf(s.econ.installPct) + ' % del costo del equipo (supuesto, no cotización de mano de obra).</li>' +
      (M.modeBat ? '<li>Baterías: ' + nf(s.battery.days, 1) + ' días de autonomía; eficiencia del inversor ' + nf(s.battery.etaInv, 2) + ' y de ida y vuelta de la batería ' + nf(s.battery.etaRT, 2) + '. No se incluye el reemplazo de baterías durante la vida del sistema.</li>' : '') +
      '<li>Este documento es un dimensionamiento y una cotización <strong>preliminares</strong>; no es un proyecto ejecutivo autorizado para construcción. Un ingeniero responsable debe validar el diseño, las protecciones, el cableado y los trámites de interconexión.</li>' +
      '</ul></section>';

    const used = items.map((i) => i.item).filter(Boolean);
    h += '<section class="rp-sec"><h2>Productos y fuentes consultadas</h2><table class="rp-table rp-table--src"><thead><tr><th>Producto</th><th>Proveedor</th><th class="num">Precio</th><th>Consulta</th></tr></thead><tbody>' +
      used.map((i) => '<tr><td><strong>' + esc(i.brand + ' ' + i.model) + '</strong><br><a href="' + esc(safeUrl(i.url)) + '">' + esc(shortUrl(i.url)) + '</a>' + (safeUrl(i.specsUrl) ? '<br>Ficha: <a href="' + esc(safeUrl(i.specsUrl)) + '">' + esc(shortUrl(i.specsUrl)) + '</a>' : '') + '</td><td>' + esc(i.supplier) + '</td><td class="num">' + money(i.price, 2) + '</td><td>' + esc(fmtDate(i.consulted)) + '</td></tr>').join('') +
      '</tbody></table><p class="rp-small">Los precios corresponden a la fecha de consulta y pueden cambiar. Confirma existencias y si incluyen IVA con el proveedor antes de comprar.</p></section>';
    return h;
  }
  function shortUrl(u) {
    try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.replace(/\/$/, '') : ''); } catch (e) { return String(u || ''); }
  }
  function renderReport(M) {
    if (state.view !== 'reporte') return;
    $('#report').innerHTML = reportHTML(M);
  }

  /* ------------------------------------------------------------------------
     12. CATÁLOGO · lista, diálogo, importar/exportar
     ------------------------------------------------------------------------ */
  let catFilter = 'all';
  function renderCatalog() {
    const list = catalog.filter((i) => catFilter === 'all' || i.cat === catFilter);
    $$('[data-cat]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === catFilter)));
    $('#catalogList').innerHTML = list.length ? list.map((i) => {
      const url = safeUrl(i.url), specs = safeUrl(i.specsUrl);
      return '<article class="ccard" data-id="' + esc(i.id) + '">' +
        '<header><span class="badge badge--' + i.cat + '">' + CAT_LABEL[i.cat] + '</span><h3 class="h5">' + esc(i.brand) + ' ' + esc(i.model) + '</h3></header>' +
        (i.title ? '<p class="ccard__title">' + esc(i.title) + '</p>' : '') +
        '<p class="ccard__specs">' + esc(specLine(i)) + '</p>' +
        '<p class="ccard__price">' + money(i.price, 2) + ' <small>MXN</small></p>' +
        '<p class="ccard__src">' + esc(i.supplier) + '<br>Consultado el ' + esc(fmtDate(i.consulted)) + '</p>' +
        '<p class="ccard__links">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">Producto</a>' : '') + (specs ? '<a href="' + esc(specs) + '" target="_blank" rel="noopener">Ficha técnica</a>' : '') + '</p>' +
        ((i.notes || i.stock) ? '<details><summary>Existencias y notas</summary>' + (i.stock ? '<p><strong>Existencias:</strong> ' + esc(i.stock) + '</p>' : '') + (i.notes ? '<p>' + esc(i.notes) + '</p>' : '') + '</details>' : '') +
        '<footer><button class="btn btn--sm btn--ghost" type="button" data-edit>Editar</button><button class="btn btn--sm btn--ghost btn--danger" type="button" data-del>Eliminar</button></footer></article>';
    }).join('') : '<p class="empty">No hay productos en esta categoría.</p>';
  }
  const catMsg = (t) => { $('#catMsg').textContent = t || ''; };

  const dlg = $('#prodDialog');
  const form = $('#prodForm');
  let editingId = null;
  function toggleSpecGroups() {
    const cat = $('#pd-cat').value;
    $$('[data-for]', dlg).forEach((g) => { g.hidden = g.dataset.for !== cat; });
  }
  function setField(name, val) { const el = form.elements[name]; if (el) el.value = val == null ? '' : val; }
  function openDialog(item) {
    editingId = item ? item.id : null;
    $('#pd-title').textContent = item ? 'Editar producto' : 'Agregar producto';
    form.reset();
    $('#pd-error').hidden = true;
    const it = item || { cat: 'panel', consulted: todayISO(), tcVoc: -0.27, nMppt: 1, stringsPerMppt: 1, type: 'interconectado' };
    ['cat', 'brand', 'model', 'price', 'supplier', 'consulted', 'url', 'specsUrl', 'notes', 'pmax', 'voc', 'isc', 'vmp', 'imp', 'tcVoc', 'type', 'pacW', 'vdcMax', 'mpptMin', 'mpptMax', 'nMppt', 'stringsPerMppt', 'impMax', 'iscMax', 'pdcMax', 'vbat', 'iChargePvMax', 'vnom', 'kwh', 'irec']
      .forEach((k) => setField(k, it[k]));
    setField('dodPct', it.dod ? Math.round(it.dod * 1000) / 10 : '');
    $('#pd-cat').disabled = !!item;
    toggleSpecGroups();
    dlg.showModal();
    $('#pd-brand').focus();
  }
  function readNum(name) { const v = form.elements[name].value.trim(); return v === '' ? null : Number(v); }
  function buildItemFromForm() {
    const errors = [];
    const g = (n) => form.elements[n].value.trim();
    const cat = g('cat');
    const it = { id: editingId || 'u-' + Date.now().toString(36), cat, brand: g('brand'), model: g('model'), supplier: g('supplier'), url: g('url'), specsUrl: g('specsUrl'), consulted: g('consulted'), notes: g('notes') };
    const price = readNum('price');
    if (!it.brand) errors.push('Escribe la marca.');
    if (!it.model) errors.push('Escribe el modelo.');
    if (!it.supplier) errors.push('Escribe el proveedor.');
    if (price == null || !(price > 0)) errors.push('El precio debe ser mayor que cero.'); else it.price = price;
    if (!safeUrl(it.url)) errors.push('El enlace del producto debe empezar con http:// o https://.');
    if (it.specsUrl && !safeUrl(it.specsUrl)) errors.push('El enlace de la ficha técnica debe empezar con http:// o https://.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(it.consulted) || isNaN(new Date(it.consulted))) errors.push('Indica la fecha de consulta.');
    else if (it.consulted > todayISO()) errors.push('La fecha de consulta no puede ser futura.');
    const need = (names, labels) => names.forEach((n, k) => { const v = readNum(n); if (v == null || !(v > 0)) errors.push(labels[k] + ' debe ser mayor que cero.'); else it[n] = v; });
    const opt = (n) => { const v = readNum(n); if (v != null && v > 0) it[n] = v; else it[n] = null; };
    if (cat === 'panel') {
      need(['pmax', 'voc', 'isc', 'vmp', 'imp'], ['La potencia', 'Voc', 'Isc', 'Vmp', 'Imp']);
      const tc = readNum('tcVoc');
      if (tc == null) errors.push('Indica el coeficiente de Voc (%/°C), normalmente negativo.'); else it.tcVoc = tc;
      if (it.vmp && it.voc && it.vmp >= it.voc) errors.push('Vmp debe ser menor que Voc.');
      if (it.imp && it.isc && it.imp > it.isc) errors.push('Imp no puede ser mayor que Isc.');
    } else if (cat === 'inversor') {
      it.type = g('type');
      need(['pacW', 'vdcMax', 'mpptMin', 'mpptMax', 'nMppt', 'stringsPerMppt'], ['La potencia CA', 'El voltaje CD máximo', 'El MPPT mínimo', 'El MPPT máximo', 'El número de MPPT', 'Las cadenas por MPPT']);
      ['impMax', 'iscMax', 'pdcMax', 'iChargePvMax'].forEach(opt);
      if (it.mpptMin && it.mpptMax && it.mpptMin >= it.mpptMax) errors.push('El MPPT mínimo debe ser menor que el máximo.');
      if (it.mpptMax && it.vdcMax && it.mpptMax > it.vdcMax) errors.push('El MPPT máximo no puede superar el voltaje CD máximo.');
      if (it.type === 'aislado48') need(['vbat'], ['El voltaje de batería']);
    } else {
      need(['vnom', 'kwh', 'irec'], ['El voltaje nominal', 'La energía', 'La corriente recomendada']);
      const d = readNum('dodPct');
      if (d == null || !(d >= 1 && d <= 100)) errors.push('La profundidad de descarga debe estar entre 1 y 100 %.'); else it.dod = d / 100;
    }
    return { it, errors };
  }
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const { it, errors } = buildItemFromForm();
    const box = $('#pd-error');
    if (errors.length) {
      box.hidden = false;
      box.textContent = errors.join(' ');
      return;
    }
    const idx = catalog.findIndex((x) => x.id === it.id);
    if (idx >= 0) catalog[idx] = Object.assign({}, catalog[idx], it); else catalog.push(it);
    saveCatalog();
    dlg.close();
    catFilter = it.cat;
    catMsg((idx >= 0 ? 'Producto actualizado: ' : 'Producto agregado: ') + it.brand + ' ' + it.model + '.');
    update(true);
  });
  $('#pd-cat').addEventListener('change', toggleSpecGroups);
  $('#pdClose').addEventListener('click', () => dlg.close());
  $('#pdCancel').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('#catAdd').addEventListener('click', () => openDialog(null));

  let delArm = null;
  $('#catalogList').addEventListener('click', (e) => {
    const card = e.target.closest('.ccard');
    if (!card) return;
    const item = getItem(card.dataset.id);
    if (!item) return;
    if (e.target.closest('[data-edit]')) { openDialog(item); return; }
    const del = e.target.closest('[data-del]');
    if (del) {
      if (delArm === item.id) {
        catalog = catalog.filter((x) => x.id !== item.id);
        saveCatalog();
        delArm = null;
        catMsg('Producto eliminado: ' + item.brand + ' ' + item.model + '.');
        update(true);
      } else {
        delArm = item.id;
        del.textContent = '¿Seguro? Toca otra vez';
        setTimeout(() => { if (delArm === item.id) { delArm = null; if (del.isConnected) del.textContent = 'Eliminar'; } }, 3500);
      }
    }
  });
  $$('[data-cat]').forEach((b) => b.addEventListener('click', () => { catFilter = b.dataset.cat; renderCatalog(); }));

  $('#catExport').addEventListener('click', () => {
    try {
      const blob = new Blob([JSON.stringify({ version: window.SV_CATALOG_VERSION || 1, exported: todayISO(), items: catalog }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'catalogo-svolts-' + todayISO() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      catMsg('Catálogo exportado (' + catalog.length + ' productos).');
    } catch (err) { catMsg('Tu navegador no permitió la descarga.'); }
  });
  $('#catImportBtn').addEventListener('click', () => $('#catImport').click());
  $('#catImport').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result);
        const items = Array.isArray(data) ? data : data.items;
        if (!Array.isArray(items) || !items.length) throw new Error('vacío');
        const ok = items.filter((i) => i && ['panel', 'inversor', 'bateria'].includes(i.cat) && i.brand && i.model && Number(i.price) > 0 && safeUrl(i.url) &&
          (i.cat !== 'panel' || (i.pmax > 0 && i.voc > 0 && i.isc > 0 && i.vmp > 0 && i.imp > 0)) &&
          (i.cat !== 'inversor' || (i.pacW > 0 && i.vdcMax > 0 && i.mpptMin > 0 && i.mpptMax > 0 && i.nMppt > 0 && i.stringsPerMppt > 0)) &&
          (i.cat !== 'bateria' || (i.vnom > 0 && i.kwh > 0 && i.dod > 0 && i.dod <= 1 && i.irec > 0)));
        if (!ok.length) throw new Error('sin productos válidos');
        ok.forEach((i, k) => { if (!i.id) i.id = 'imp-' + Date.now().toString(36) + k; });
        catalog = ok;
        saveCatalog();
        catMsg('Catálogo importado: ' + ok.length + ' de ' + items.length + ' productos válidos.');
        update(true);
      } catch (err) { catMsg('No pude leer ese archivo. Usa un JSON exportado desde este catálogo.'); }
      e.target.value = '';
    };
    rd.readAsText(file);
  });
  let resetArm = false;
  $('#catReset').addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (!resetArm) {
      resetArm = true;
      b.textContent = '¿Seguro? Toca otra vez';
      setTimeout(() => { resetArm = false; b.textContent = 'Restablecer base'; }, 3500);
      return;
    }
    resetArm = false;
    b.textContent = 'Restablecer base';
    catalog = clone(SEED);
    saveCatalog();
    catMsg('Catálogo base restablecido.');
    update(true);
  });

  /* ------------------------------------------------------------------------
     13. NAVEGACIÓN ENTRE PASOS
     ------------------------------------------------------------------------ */
  const views = $$('.view');
  const ALL_VIEWS = ['basico', 'curva'].concat(STEP_ORDER, 'catalogo');
  function go(view, opts) {
    const o = opts || {};
    if (!views.some((v) => v.dataset.view === view)) view = 'basico';
    state.view = view;
    if (view !== 'basico') state.lastAdv = view;
    views.forEach((v) => { v.hidden = v.dataset.view !== view; });
    applyMode();
    saveState();
    if (!o.silent && location.hash.slice(1) !== view) { try { history.pushState(null, '', '#' + view); } catch (e) { location.hash = view; } }
    update(true);
    if (!o.silent) {
      const top = $('.sim__top').getBoundingClientRect().top + window.scrollY - 92;
      window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion.matches ? 'auto' : 'smooth' });
      const h = $('.view:not([hidden]) h2');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (b) { e.preventDefault(); go(b.dataset.go); }
  });
  window.addEventListener('popstate', () => { const h = location.hash.slice(1); if (ALL_VIEWS.includes(h)) go(h, { silent: true }); });
  $$('.simmode__btn').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.mode === 'basico') go('basico');
    else go(state.view !== 'basico' ? state.view : (ALL_VIEWS.includes(state.lastAdv) && state.lastAdv !== 'basico' ? state.lastAdv : 'curva'));
  }));
  function applyMode() {
    const basic = state.view === 'basico';
    $$('.simmode__btn').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.mode === 'basico') === basic)));
    $('#stepper').hidden = basic;
    $('#catOpen').hidden = basic;
    $('.sim__side').hidden = basic;
    $('.sim__grid').classList.toggle('is-basic', basic);
  }
  $('#viToMpp').addEventListener('click', () => {
    const v = viModel();
    if (!v) return;
    state.vi.r = Number(v.arr.rmp.toPrecision(3));
    state.vi.mppt = false;
    renderCurva();
    saveState();
  });

  /* ------------------------------------------------------------------------
     14. ENTRADAS
     ------------------------------------------------------------------------ */
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-bind]')) {
      const path = el.dataset.bind;
      let val;
      if (el.type === 'checkbox') val = el.checked;
      else if (el.type === 'number' || el.type === 'range') { val = el.valueAsNumber; if (Number.isNaN(val)) val = 0; }
      else val = el.value;
      setPath(state, path, val);
      if (path.startsWith('vi.')) scheduleVI();
      else update();
    } else if (el.closest('#loadsBody') && el.dataset.f) {
      const i = Number(el.closest('tr').dataset.i);
      const f = el.dataset.f;
      state.loads[i][f] = f === 'name' ? el.value : (Number.isNaN(el.valueAsNumber) ? 0 : el.valueAsNumber);
      update();
    } else if (el.id === 'b-pw') {
      const v = el.valueAsNumber;
      state.basic.panelW = Number.isFinite(v) ? v : -1;
      update();
    } else if (el.id === 'vi-rlog') {
      state.vi.r = Number(Math.pow(10, el.valueAsNumber).toPrecision(3));
      state.vi.mppt = false;
      scheduleVI();
    } else if (el.id === 'f-npan') {
      const n = el.valueAsNumber;
      state.nPanelsOverride = Number.isFinite(n) && n >= 1 ? Math.min(60, Math.round(n)) : null;
      update();
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.name === 'mode') { state.mode = el.value; state.nsOverride = null; update(true); }
    else if (el.name === 'sel-panel' || el.name === 'b-panel' || el.name === 'vi-panel') { state.sel.panel = el.value; state.nsOverride = null; update(true); }
    else if (el.name === 'b-period') { state.basic.period = Number(el.value) === 1 ? 1 : 2; update(); }
    else if (el.name === 'vi-src') {
      if (el.value === 'manual' && state.vi.src !== 'manual') {
        const p = pick('panel', state.sel.panel);
        if (p) state.vi.manual = { voc: p.voc, isc: p.isc, vmp: p.vmp, imp: p.imp, tcVoc: p.tcVoc != null ? p.tcVoc : -0.28 };
      }
      state.vi.src = el.value === 'manual' ? 'manual' : 'catalogo';
      update(true);
    }
    else if (el.name === 'b-by') { state.basic.by = el.value === 'paneles' ? 'paneles' : 'consumo'; update(); }
    else if (el.name === 'sel-inv') { state.sel.inverter = el.value; state.nsOverride = null; update(true); }
    else if (el.name === 'sel-bat') { state.sel.battery = el.value; update(true); }
    else if (el.id === 'f-ns') { state.nsOverride = el.value ? Number(el.value) : null; update(true); }
    else if (el.id === 'f-npan' && !el.value) { state.nPanelsOverride = null; update(true); }
  });
  loadsBody.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (!rm) return;
    const i = Number(rm.closest('tr').dataset.i);
    state.loads.splice(i, 1);
    renderLoadRows();
    update();
  });
  $('#addLoad').addEventListener('click', () => {
    state.loads.push({ name: '', qty: 1, watts: 0, hours: 0 });
    renderLoadRows();
    update();
    const last = $$('tr[data-i]', loadsBody).pop();
    if (last) last.querySelector('input').focus();
  });
  $('#loadExample').addEventListener('click', () => { state.loads = clone(EXAMPLE_LOADS); renderLoadRows(); update(); });
  $('#clearLoads').addEventListener('click', () => { state.loads = []; renderLoadRows(); update(); });
  $('#goBatteryMode').addEventListener('click', () => { state.mode = 'battery'; state.nsOverride = null; update(true); });

  $('#printBtn').addEventListener('click', () => {
    renderReport(compute());
    try { window.print(); } catch (e) { $('#printNote').textContent = 'Usa Ctrl/Cmd + P para imprimir.'; }
  });
  $('#printNote').textContent = 'Si no se abre el diálogo, usa Ctrl/Cmd + P y elige "Guardar como PDF".';

  function syncInputs() {
    $$('[data-bind]').forEach((el) => {
      if (document.activeElement === el) return;
      const v = getPath(state, el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else el.value = v == null ? '' : v;
    });
  }

  /* ------------------------------------------------------------------------
     15. CICLO PRINCIPAL
     ------------------------------------------------------------------------ */
  let M = null;
  function update(full) {
    M = compute();
    renderConsumo(M);
    renderPaneles(M);
    renderInversor(M);
    renderBaterias(M);
    renderEconomia(M);
    renderLive(M);
    renderStepper(M);
    renderBasic(M);
    renderCurva();
    if (full) {
      renderPanelSelects(M);
      renderProductLists(M);
      syncInputs();
      renderCatalog();
    }
    renderReport(M);
    saveState();
  }

  /* ------------------------------------------------------------------------
     16. BARRA DE NAVEGACIÓN (menú móvil, sombra al desplazar)
     ------------------------------------------------------------------------ */
  const nav = $('#nav');
  const menu = $('#menu');
  const burger = $('.burger');
  const setMenu = (open) => {
    menu.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  };
  burger.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') { setMenu(false); burger.focus(); } });
  document.addEventListener('click', (e) => { if (burger.getAttribute('aria-expanded') === 'true' && !e.target.closest('.nav__bar')) setMenu(false); });
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 12);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ------------------------------------------------------------------------
     INICIO
     ------------------------------------------------------------------------ */
  renderLoadRows();
  const h0 = location.hash.slice(1);
  go(ALL_VIEWS.includes(h0) ? h0 : 'basico', { silent: true });
})();
