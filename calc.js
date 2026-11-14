/* ==========================================================================
   SVOLTS · Simulador solar — motor de cálculo
   Funciones puras (sin DOM). Se usan en el navegador (window.SVCalc) y en
   Node para pruebas. Todas las fórmulas están documentadas junto al código.
   Es un dimensionamiento PRELIMINAR, no un proyecto ejecutivo.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SVCalc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const num = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : (d === undefined ? 0 : d); };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const f = (v, d = 1) => Number(v).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
  const EPS = 1e-9;

  /* ------------------------------------------------------------------------
     1. CONSUMO
     Potencia de cada renglón:   P = cantidad × potencia unitaria      [W]
     Energía diaria del renglón: E = P × horas de uso al día           [Wh]
     Demanda simultánea:         P_dem = Σ P × factor de simultaneidad [W]
     Corriente (ley de Ohm con potencia):  I = P / V   (factor de potencia = 1)
     ------------------------------------------------------------------------ */
  function loadsSummary(loads, opts) {
    const o = opts || {};
    const fs = clamp(num(o.simultaneity, 1), 0, 1);
    const volts = Math.max(1, num(o.acVolts, 127));
    const daysYear = clamp(num(o.daysPerYear, 200), 0, 366);
    let installedW = 0;
    let energyWh = 0;
    const rows = (loads || []).map((l) => {
      const qty = Math.max(0, num(l.qty));
      const w = Math.max(0, num(l.watts));
      const h = clamp(num(l.hours), 0, 24);
      const powerW = qty * w;
      const eWh = powerW * h;
      installedW += powerW;
      energyWh += eWh;
      return Object.assign({}, l, { powerW, energyWh: eWh, currentA: powerW / volts });
    });
    rows.forEach((r) => { r.share = energyWh > 0 ? r.energyWh / energyWh : 0; });
    const demandW = installedW * fs;
    return {
      rows,
      installedW,
      demandW,
      energyDayWh: energyWh,
      energyDayKWh: energyWh / 1000,
      demandCurrentA: demandW / volts,
      installedCurrentA: installedW / volts,
      daysPerYear: daysYear,
      annualKWh: (energyWh / 1000) * daysYear,
      avgPowerDuringUseW: null, // se calcula si hay horas equivalentes
      acVolts: volts,
      simultaneity: fs,
    };
  }

  /* ------------------------------------------------------------------------
     2. PANELES
     Potencia FV necesaria:  P_fv = E_dia / (HSP × PR × η_cadena)
       HSP = horas solar pico (kWh/m²/día ≙ h a 1 kW/m²)
       PR  = factor de rendimiento (pérdidas por temperatura, suciedad, cableado, inversor)
       η_cadena = eficiencia extra de la ruta (1 sin baterías; ida y vuelta de baterías si la hay)
     Número de paneles:  N = ⌈ P_fv / P_panel ⌉
     ------------------------------------------------------------------------ */
  function pvRequirement(p) {
    const hsp = Math.max(0.1, num(p.hsp, 5));
    const pr = clamp(num(p.pr, 0.75), 0.3, 1);
    const chain = clamp(num(p.chainEff, 1), 0.3, 1);
    const eKWh = Math.max(0, num(p.energyDayWh)) / 1000;
    const requiredKW = eKWh / (hsp * pr * chain);
    const panelW = Math.max(1, num(p.panelW, 1));
    const panels = Math.max(1, Math.ceil((requiredKW * 1000) / panelW - EPS));
    return { requiredKW, panels, hsp, pr, chain };
  }

  /* Voltajes de un panel con temperatura. Se usa el coeficiente de Voc (%/°C)
     como aproximación para Vmp (supuesto documentado en el reporte). */
  function panelVoltages(panel, tMin, tCellMax) {
    const tc = num(panel.tcVoc, -0.27) / 100;
    return {
      vocCold: panel.voc * (1 + tc * (tMin - 25)),
      vmpCold: panel.vmp * (1 + tc * (tMin - 25)),
      vmpHot: panel.vmp * (1 + tc * (tCellMax - 25)),
    };
  }

  /* Configuración serie/paralelo.
     Ns_max = ⌊ V_dc,max / Voc(T_min) ⌋      (nunca superar el voltaje máximo del inversor)
     Ns_min = ⌈ V_mppt,min / Vmp(T_celda,max) ⌉ (mantenerse dentro de la ventana MPPT en calor)
     Np_max = nº de MPPT × cadenas por MPPT
     Entre las combinaciones válidas se elige la de menor número total de paneles ≥ objetivo
     y, a igualdad, la de menos cadenas (más serie). */
  function arrayConfig(panel, inv, nTarget, tMin, tCellMax, forcedNs) {
    const v = panelVoltages(panel, tMin, tCellMax);
    const nsMax = Math.floor(inv.vdcMax / v.vocCold + EPS);
    const nsMin = Math.max(1, Math.ceil(inv.mpptMin / v.vmpHot - EPS));
    const stringsMax = Math.max(1, num(inv.nMppt, 1) * num(inv.stringsPerMppt, 1));
    const out = { v, nsMin, nsMax, stringsMax, ns: null, np: null, total: null, feasible: false, note: '' };
    if (nsMax < 1 || nsMax < nsMin) {
      out.note = 'No existe un número de paneles en serie que respete a la vez el voltaje máximo y la ventana MPPT del inversor.';
      return out;
    }
    const target = Math.max(1, Math.round(nTarget));
    const options = [];
    for (let ns = nsMin; ns <= nsMax; ns++) {
      const np = Math.ceil(target / ns);
      if (np > stringsMax) continue;
      options.push({ ns, np, total: ns * np });
    }
    out.options = options;
    if (forcedNs && forcedNs >= nsMin && forcedNs <= nsMax) {
      const np = Math.ceil(target / forcedNs);
      out.ns = forcedNs; out.np = np; out.total = forcedNs * np;
      out.feasible = np <= stringsMax;
      if (!out.feasible) out.note = 'Con ' + forcedNs + ' en serie se necesitan ' + np + ' cadenas y el inversor admite ' + stringsMax + '.';
      return out;
    }
    if (options.length) {
      options.sort((a, b) => a.total - b.total || b.ns - a.ns);
      const b = options[0];
      out.ns = b.ns; out.np = b.np; out.total = b.total; out.feasible = true;
      return out;
    }
    // No alcanza el nº de cadenas: se propone el máximo posible
    out.ns = nsMax; out.np = stringsMax; out.total = nsMax * stringsMax; out.feasible = false;
    out.note = 'El inversor solo admite ' + (nsMax * stringsMax) + ' paneles con esta configuración; se necesitan ' + target + '.';
    return out;
  }

  /* Caída de tensión en conductor (ley de Ohm)
     R = ρ · 2L / S     (ida y vuelta)     ρ(cobre, 70 °C) ≈ 0.0206 Ω·mm²/m
     ΔV = I · R         %ΔV = ΔV / V · 100          P_perdida = I² · R */
  const RHO_CU_70 = 0.0206;
  function voltageDrop(currentA, lengthM, sectionMm2, systemV) {
    const s = Math.max(0.1, num(sectionMm2, 6));
    const r = RHO_CU_70 * 2 * Math.max(0, num(lengthM)) / s;
    const dv = currentA * r;
    return { resistanceOhm: r, dropV: dv, dropPct: systemV > 0 ? (dv / systemV) * 100 : 0, lossW: currentA * currentA * r };
  }

  /* Verificación del arreglo contra el inversor. Devuelve una lista de pruebas:
     status = ok | warn | fail | na */
  function verifyArray(panel, inv, cfg, site, sys) {
    const checks = [];
    const add = (id, label, status, detail) => checks.push({ id, label, status, detail });
    const v = cfg.v;
    const ns = cfg.ns || 0;
    const np = cfg.np || 0;
    const total = ns * np;
    const pdcW = total * panel.pmax;

    add('vmax', 'Voltaje máximo en frío',
      ns * v.vocCold <= inv.vdcMax ? 'ok' : 'fail',
      ns + ' × ' + f(v.vocCold) + ' V = ' + f(ns * v.vocCold) + ' V (Voc a ' + site.tMin + ' °C) frente a ' + f(inv.vdcMax, 0) + ' V máx. del inversor.');

    const vhot = ns * v.vmpHot;
    add('mppt-min', 'Voltaje mínimo de operación en calor',
      vhot >= inv.mpptMin ? 'ok' : 'fail',
      ns + ' × ' + f(v.vmpHot) + ' V = ' + f(vhot) + ' V (Vmp a ' + site.tCellMax + ' °C) frente a ' + f(inv.mpptMin, 0) + ' V mínimo MPPT.');

    const vcoldMp = ns * v.vmpCold;
    add('mppt-max', 'Voltaje de máxima potencia en frío',
      vcoldMp <= inv.mpptMax ? 'ok' : 'warn',
      f(vcoldMp) + ' V (Vmp a ' + site.tMin + ' °C) frente a ' + f(inv.mpptMax, 0) + ' V máx. de la ventana MPPT.' + (vcoldMp > inv.mpptMax ? ' Fuera de ventana: el inversor limitará la potencia.' : ''));

    add('strings', 'Cadenas en paralelo',
      np <= cfg.stringsMax ? 'ok' : 'fail',
      np + ' cadena(s) frente a ' + cfg.stringsMax + ' que admite el inversor (' + inv.nMppt + ' MPPT × ' + inv.stringsPerMppt + ').');

    const perMppt = Math.max(1, Math.ceil(np / Math.max(1, num(inv.nMppt, 1))));
    if (inv.impMax) {
      const imp = perMppt * panel.imp;
      add('imp', 'Corriente de operación por MPPT', imp <= inv.impMax ? 'ok' : 'fail',
        perMppt + ' × ' + f(panel.imp, 2) + ' A = ' + f(imp, 2) + ' A frente a ' + f(inv.impMax, 1) + ' A máx. por MPPT.');
    } else {
      add('imp', 'Corriente de operación por MPPT', 'na', 'La ficha cargada no indica la corriente máxima por MPPT. Verifícala antes de cotizar.');
    }
    if (inv.iscMax) {
      const isc = perMppt * panel.isc;
      add('isc', 'Corriente de cortocircuito por MPPT', isc <= inv.iscMax ? 'ok' : 'fail',
        perMppt + ' × ' + f(panel.isc, 2) + ' A = ' + f(isc, 2) + ' A frente a ' + f(inv.iscMax, 1) + ' A máx. de cortocircuito.');
    } else {
      add('isc', 'Corriente de cortocircuito por MPPT', 'na', 'La ficha cargada no indica la corriente de cortocircuito máxima por MPPT.');
    }

    if (inv.pdcMax) {
      add('pdcmax', 'Potencia FV máxima del inversor', pdcW <= inv.pdcMax ? 'ok' : 'fail',
        f(pdcW / 1000, 2) + ' kW de paneles frente a ' + f(inv.pdcMax / 1000, 2) + ' kW de entrada FV máxima.');
    }

    const ratio = inv.pacW > 0 ? pdcW / inv.pacW : 0;
    let rs = 'ok';
    let rd = 'Relación CD/CA = ' + f(ratio, 2) + ' (' + f(pdcW / 1000, 2) + ' kW de paneles / ' + f(inv.pacW / 1000, 2) + ' kW del inversor).';
    if (ratio < 0.6) { rs = 'warn'; rd += ' El inversor está muy sobrado para este arreglo: pagas capacidad que no usas.'; }
    else if (ratio > 1.4) { rs = 'warn'; rd += ' Hay más potencia FV que la que el inversor puede entregar; se recortará en horas pico.'; }
    add('ratio', 'Relación paneles / inversor', rs, rd);

    if (sys && sys.demandW != null) {
      add('demand', 'Potencia del inversor frente a la demanda',
        inv.pacW >= sys.demandW ? 'ok' : 'fail',
        'Demanda simultánea ' + f(sys.demandW / 1000, 2) + ' kW frente a ' + f(inv.pacW / 1000, 2) + ' kW de salida continua.');
    }

    if (sys && sys.cable) {
      const c = sys.cable;
      const vd = voltageDrop(panel.imp, c.lengthM, c.sectionMm2, ns * panel.vmp);
      add('drop', 'Caída de tensión en la cadena', vd.dropPct <= 3 ? 'ok' : 'warn',
        'R = ' + f(vd.resistanceOhm, 3) + ' Ω; ΔV = ' + f(vd.dropV, 2) + ' V (' + f(vd.dropPct, 2) + ' %); pérdida ' + f(vd.lossW, 0) + ' W. Criterio de referencia: ≤ 3 %.');
    }
    return { checks, pdcW, ratio };
  }

  /* ------------------------------------------------------------------------
     3. BATERÍAS
     Energía útil necesaria en terminales de batería:  E_util = E_dia × días / η_inv
     Energía nominal necesaria:                        E_nom  = E_util / DoD
     Módulos en serie por rama: Ns_b = V_bus / V_módulo   (entero)
     Ramas en paralelo:         Np_b = ⌈ E_nom / (Ns_b × E_módulo) ⌉
     Corriente de descarga:     I_dis = P_dem / (V_bus × η_inv)  ≤  Np_b × I_recomendada
     Autonomía real (h) = energía entregada / demanda simultánea
     ------------------------------------------------------------------------ */
  function batterySizing(p) {
    const bat = p.battery;
    const vbus = p.vbus;
    const days = Math.max(0, num(p.days, 0.5));
    const etaInv = clamp(num(p.etaInv, 0.92), 0.5, 1);
    const eDay = Math.max(0, num(p.energyDayWh));
    const demand = Math.max(1, num(p.demandW, 1));
    const out = { valid: false, note: '' };
    const nsF = vbus / bat.vnom;
    if (Math.abs(nsF - Math.round(nsF)) > 1e-6 || Math.round(nsF) < 1) {
      out.note = 'El voltaje del módulo (' + bat.vnom + ' V) no es divisor del voltaje de la batería del inversor (' + vbus + ' V).';
      return out;
    }
    const nsB = Math.round(nsF);
    const modWh = bat.kwh * 1000;
    const eUtilNeeded = (eDay * days) / etaInv;
    const eNomNeeded = eUtilNeeded / bat.dod;
    let npB = Math.max(1, Math.ceil(eNomNeeded / (nsB * modWh) - EPS));
    const iDis = demand / (vbus * etaInv);
    const npCurrent = Math.ceil(iDis / bat.irec - EPS);
    let bumped = false;
    if (npCurrent > npB) { npB = npCurrent; bumped = true; }
    const count = nsB * npB;
    const nomWh = count * modWh;
    const usableWh = nomWh * bat.dod;
    const deliveredWh = usableWh * etaInv;
    return {
      valid: true, nsB, npB, count, nomWh, usableWh, deliveredWh,
      eNomNeeded, eUtilNeeded, iDis, iCap: npB * bat.irec, bumpedForCurrent: bumped,
      autonomyDays: eDay > 0 ? deliveredWh / eDay : 0,
      autonomyHours: deliveredWh / demand,
      note: '',
    };
  }

  function verifyBattery(bat, inv, bs, pdcW) {
    const checks = [];
    const add = (id, label, status, detail) => checks.push({ id, label, status, detail });
    if (!bs.valid) { add('bus', 'Voltaje del banco', 'fail', bs.note); return checks; }
    add('bus', 'Voltaje del banco', 'ok',
      bs.nsB + ' módulo(s) de ' + bat.vnom + ' V en serie = ' + (bs.nsB * bat.vnom) + ' V, igual al voltaje de batería del inversor (' + inv.vbat + ' V).');
    add('idis', 'Corriente de descarga', bs.iDis <= bs.iCap ? 'ok' : 'fail',
      f(bs.iDis, 0) + ' A requeridos frente a ' + f(bs.iCap, 0) + ' A recomendados (' + bs.npB + ' × ' + bat.irec + ' A).' + (bs.bumpedForCurrent ? ' Se añadieron módulos para cumplir la corriente.' : ''));
    if (inv.iChargePvMax) {
      const ic = pdcW / inv.vbat;
      add('ichg', 'Corriente de carga desde paneles', ic <= inv.iChargePvMax ? 'ok' : 'warn',
        f(ic, 0) + ' A (potencia FV / ' + inv.vbat + ' V) frente a ' + f(inv.iChargePvMax, 0) + ' A de carga solar máx. del inversor.' + (ic > inv.iChargePvMax ? ' La potencia excedente se perdería en horas pico.' : ''));
    }
    const icap = bs.npB * bat.irec;
    const ic2 = pdcW / inv.vbat;
    add('icap', 'Corriente de carga frente a la batería', ic2 <= icap ? 'ok' : 'warn',
      f(ic2, 0) + ' A de carga frente a ' + f(icap, 0) + ' A recomendados para el banco.');
    return checks;
  }

  /* ------------------------------------------------------------------------
     4. ENERGÍA Y ECONOMÍA
     Generación diaria:  G = P_fv[kW] × HSP × PR × η_cadena × factor de degradación
     Sin medición neta:  solo se ahorra lo que se consume el mismo día de uso:
          ahorro_kWh/año = días_uso × min( G_dia , E_dia )
     Con medición neta:  ahorro_kWh/año = min( G × 365 , E_dia × días_uso )
     Flujo de caja año y:  ahorro_y = kWh_y × tarifa × (1+inflación)^(y-1) − O&M
     ------------------------------------------------------------------------ */
  function energyYear(p, degradFactor) {
    const deg = degradFactor === undefined ? 1 : degradFactor;
    const genDayKWh = (p.pdcW / 1000) * p.hsp * p.pr * p.chainEff * deg;
    const consDayKWh = p.energyDayWh / 1000;
    const consYearKWh = consDayKWh * p.daysPerYear;
    const genYearKWh = genDayKWh * 365;
    const selfKWh = p.netMetering
      ? Math.min(genYearKWh, consYearKWh)
      : p.daysPerYear * Math.min(genDayKWh, consDayKWh);
    return { genDayKWh, genYearKWh, consYearKWh, selfKWh, coverage: consYearKWh > 0 ? selfKWh / consYearKWh : 0 };
  }

  function costs(p) {
    const items = [];
    if (p.panel) items.push({ cat: 'panel', desc: p.panel.brand + ' ' + p.panel.model, qty: p.nPanels, unit: p.panel.price, total: p.nPanels * p.panel.price, item: p.panel });
    if (p.inverter) items.push({ cat: 'inversor', desc: p.inverter.brand + ' ' + p.inverter.model, qty: 1, unit: p.inverter.price, total: p.inverter.price, item: p.inverter });
    if (p.battery && p.nBattery > 0) items.push({ cat: 'bateria', desc: p.battery.brand + ' ' + p.battery.model, qty: p.nBattery, unit: p.battery.price, total: p.nBattery * p.battery.price, item: p.battery });
    const equipment = items.reduce((s, i) => s + i.total, 0);
    const installPct = Math.max(0, num(p.installPct, 0));
    const install = equipment * installPct / 100;
    const subtotal = equipment + install;
    const ivaPct = Math.max(0, num(p.ivaPct, 0));
    const iva = subtotal * ivaPct / 100;
    return { items, equipment, install, installPct, subtotal, ivaPct, iva, total: subtotal + iva };
  }

  function cashflow(p) {
    const years = p.years || 25;
    const degr = clamp(num(p.degradPct, 0.5), 0, 5) / 100;
    const esc = clamp(num(p.escalationPct, 0), -10, 30) / 100;
    const om = Math.max(0, num(p.omYear, 0));
    const rows = [];
    let cum = -p.investment;
    let payback = null;
    for (let y = 1; y <= years; y++) {
      const e = energyYear(p.energy, Math.pow(1 - degr, y - 1));
      const tariff = p.tariff * Math.pow(1 + esc, y - 1);
      const saving = e.selfKWh * tariff - om;
      const prev = cum;
      cum += saving;
      if (payback === null && cum >= 0 && saving > 0) payback = (y - 1) + (-prev / saving);
      rows.push({ year: y, kwh: e.selfKWh, tariff, saving, cumulative: cum });
    }
    const first = rows[0] ? rows[0].saving : 0;
    return {
      rows,
      payback,
      simplePayback: first > 0 ? p.investment / first : null,
      net: cum,
      firstYearSaving: first,
      totalSaving: rows.reduce((s, r) => s + r.saving, 0),
    };
  }

  /* ------------------------------------------------------------------------
     9. MODO BÁSICO · estimación rápida
     Días por mes:            365 / 12 = 30.42
     Potencia FV:             P_fv = E_mes / (días × HSP × PR)          [kW]
     Paneles:                 N = ceil(P_fv / P_panel)
     Producción mensual:      E_gen = N × P_panel × HSP × PR × días      [kWh]
     Ahorro anual (sin venta de excedentes):
                              12 × min(E_gen, E_mes) × tarifa            [MXN]
     ------------------------------------------------------------------------ */
  const DAYS_MONTH = 365 / 12;
  function basicEstimate(p) {
    const kwhMonth = Math.max(0, num(p.kwhMonth));
    const hsp = Math.max(0.1, num(p.hsp, 5.5));
    const pr = clamp(num(p.pr, 0.75), 0.3, 1);
    const panelW = Math.max(1, num(p.panelW, 620));
    const tariff = Math.max(0, num(p.tariff));
    const requiredKW = kwhMonth / (DAYS_MONTH * hsp * pr);
    const panels = kwhMonth > 0 ? Math.max(1, Math.ceil((requiredKW * 1000) / panelW - EPS)) : 0;
    const kwp = (panels * panelW) / 1000;
    const genMonth = kwp * hsp * pr * DAYS_MONTH;
    const usedMonth = Math.min(genMonth, kwhMonth);
    const savingYear = 12 * usedMonth * tariff;
    const panelCost = panels * Math.max(0, num(p.panelPrice));
    return {
      requiredKW, panels, kwp, genMonth, genDay: genMonth / DAYS_MONTH,
      coverage: kwhMonth > 0 ? usedMonth / kwhMonth : 0,
      savingYear, savingMonth: savingYear / 12, panelCost,
      panelPayback: savingYear > 0 && panelCost > 0 ? panelCost / savingYear : null,
      days: DAYS_MONTH,
    };
  }

  /* Modo básico por número de paneles:
       P_inst = N × P_panel                         [kWp]
       E_día  = P_inst × HSP × PR                   [kWh/día]
       E_mes  = E_día × 365/12      E_año = E_día × 365
     El ahorro supone que toda la energía generada se consume o se compensa. */
  function basicFromPanels(p) {
    const n = Math.max(0, Math.round(num(p.n)));
    const panelW = Math.max(0, num(p.panelW));
    const hsp = Math.max(0, num(p.hsp, 5.5));
    const pr = clamp(num(p.pr, 0.75), 0, 1);
    const kwp = (n * panelW) / 1000;
    const genDay = kwp * hsp * pr;
    const genYear = genDay * 365;
    return {
      n, kwp, genDay, genMonth: genDay * DAYS_MONTH, genYear,
      savingYear: genYear * Math.max(0, num(p.tariff)),
      panelCost: n * Math.max(0, num(p.panelPrice)),
    };
  }

  /* Coherencia de los datos eléctricos de un módulo (ficha o captura manual).
     Rangos típicos de módulos de silicio cristalino comerciales; fuera de
     ellos se marca "Revisar", no necesariamente error. */
  function validatePanelData(p) {
    const voc = num(p.voc, NaN), isc = num(p.isc, NaN), vmp = num(p.vmp, NaN), imp = num(p.imp, NaN);
    const pmax = num(p.pmax, NaN), tc = num(p.tcVoc, NaN);
    const checks = [];
    const add = (id, label, status, detail) => checks.push({ id, label, status, detail });
    const pos = [voc, isc, vmp, imp].every((v) => Number.isFinite(v) && v > 0);
    add('pos', 'Valores positivos', pos ? 'ok' : 'fail', pos ? 'Voc, Isc, Vmp e Imp son mayores que cero.' : 'Voc, Isc, Vmp e Imp deben ser números mayores que cero.');
    if (!pos) return { checks, valid: false };
    add('v', 'Vmp menor que Voc', vmp < voc ? 'ok' : 'fail', f(vmp, 2) + ' V frente a ' + f(voc, 2) + ' V. ' + (vmp < voc ? 'Relación Vmp/Voc = ' + f(vmp / voc, 3) + (vmp / voc < 0.74 || vmp / voc > 0.9 ? ' (fuera del rango típico 0.74–0.90).' : '.') : 'En el punto de máxima potencia el voltaje siempre es menor que en circuito abierto.'));
    add('i', 'Imp menor que Isc', imp < isc ? 'ok' : 'fail', f(imp, 2) + ' A frente a ' + f(isc, 2) + ' A. ' + (imp < isc ? 'Relación Imp/Isc = ' + f(imp / isc, 3) + (imp / isc < 0.85 || imp / isc > 0.98 ? ' (fuera del rango típico 0.85–0.98).' : '.') : 'La corriente de máxima potencia siempre es menor que la de corto circuito.'));
    const valid = vmp < voc && imp < isc;
    const prod = vmp * imp;
    if (Number.isFinite(pmax) && pmax > 0) {
      const err = Math.abs(prod - pmax) / pmax;
      add('p', 'Pmax = Vmp × Imp', err <= 0.02 ? 'ok' : err <= 0.05 ? 'warn' : 'fail', f(vmp, 2) + ' V × ' + f(imp, 2) + ' A = ' + f(prod, 1) + ' W frente a ' + f(pmax, 0) + ' W de la ficha (diferencia ' + f(err * 100, 1) + ' %).');
    } else {
      add('p', 'Pmax = Vmp × Imp', 'ok', 'Potencia máxima calculada: ' + f(prod, 1) + ' W.');
    }
    const ff = prod / (voc * isc);
    add('ff', 'Factor de forma', ff >= 0.7 && ff <= 0.86 ? 'ok' : ff >= 0.5 && ff <= 0.9 ? 'warn' : 'fail', 'FF = (Vmp × Imp) / (Voc × Isc) = ' + f(ff, 3) + '. En módulos de silicio comerciales suele estar entre 0.70 y 0.86.');
    if (Number.isFinite(tc)) add('tc', 'Coeficiente de Voc', tc <= -0.15 && tc >= -0.5 ? 'ok' : 'warn', f(tc, 3) + ' %/°C. Los módulos de silicio suelen estar entre −0.20 y −0.40 %/°C; el voltaje baja al calentarse.');
    else add('tc', 'Coeficiente de Voc', 'warn', 'Sin dato: se usa −0.28 %/°C.');
    return { checks, valid, ff };
  }

  /* ------------------------------------------------------------------------
     10. MODO AVANZADO · curva corriente-voltaje (I-V) de un módulo y un arreglo
     Modelo explícito de un diodo a partir de la ficha (Voc, Isc, Vmp, Imp):
       C2 = (Vmp/Voc − 1) / ln(1 − Imp/Isc)
       C1 = (1 − Imp/Isc) · exp(−Vmp / (C2 · Voc))
       I(V) = Isc · [1 − C1 · (exp(V / (C2 · Voc)) − 1)]
     La curva pasa exactamente por (0, Isc) y (Vmp, Imp), y llega a ~0 A en Voc.
     Corrección por irradiancia G [W/m²] y temperatura de celda Tc [°C]:
       Isc' = Isc · G/1000 · (1 + α·(Tc − 25))        α = coef. de Isc  [%/°C]
       Voc' = Voc · (1 + β·(Tc − 25)) + n·Ns·Vt·ln(G/1000)
              β = coef. de Voc [%/°C]; Vt = k·T/q; n = 1.2; Ns ≈ Voc / 0.72 V
       Imp' = Imp · G/1000 · (1 + α·(Tc − 25));  Vmp' = Vmp · Voc'/Voc
     Temperatura de celda (método NOCT):  Tc = Ta + (NOCT − 20) / 800 · G
     Arreglo de Ns módulos en serie y Np cadenas en paralelo:
       V_arreglo = Ns · V_módulo        I_arreglo = Np · I_módulo
     Carga resistiva R (ley de Ohm):   I = V / R  → el punto de operación es
     el cruce de esa recta con la curva I-V.
     Es una aproximación de ingeniería: no sustituye la curva medida.
     ------------------------------------------------------------------------ */
  const K_OVER_Q = 8.617333262e-5; // V/K
  function cellTemp(ta, g, noct) {
    return num(ta, 25) + ((num(noct, 45) - 20) / 800) * Math.max(0, num(g, 1000));
  }
  function ivParams(panel, g, tc, tcIscPct) {
    const G = clamp(num(g, 1000), 1, 1500);
    const T = clamp(num(tc, 25), -40, 100);
    const ratio = G / 1000;
    const dT = T - 25;
    const a = num(tcIscPct, 0.05) / 100;
    const b = num(panel.tcVoc, -0.28) / 100;
    const nCells = Math.max(1, Math.round(num(panel.voc) / 0.72));
    const vtMod = 1.2 * nCells * K_OVER_Q * (T + 273.15);
    const voc = Math.max(0.05, num(panel.voc) * (1 + b * dT) + vtMod * Math.log(ratio));
    const isc = Math.max(1e-6, num(panel.isc) * ratio * (1 + a * dT));
    const imp = Math.min(isc * 0.995, Math.max(1e-6, num(panel.imp) * ratio * (1 + a * dT)));
    const vmp = Math.min(voc * 0.995, num(panel.vmp) * (voc / num(panel.voc, 1)));
    const c2 = (vmp / voc - 1) / Math.log(1 - imp / isc);
    const c1 = (1 - imp / isc) * Math.exp(-vmp / (c2 * voc));
    return { g: G, tc: T, voc, isc, vmp, imp, c1, c2, nCells };
  }
  function ivCurrent(m, v) {
    if (v <= 0) return m.isc;
    if (v >= m.voc) return 0;
    return Math.max(0, m.isc * (1 - m.c1 * (Math.exp(v / (m.c2 * m.voc)) - 1)));
  }
  function ivArray(m, ns, np) {
    const Ns = Math.max(1, Math.round(num(ns, 1)));
    const Np = Math.max(1, Math.round(num(np, 1)));
    const at = (V) => Np * ivCurrent(m, V / Ns);
    const voc = Ns * m.voc;
    const isc = Np * m.isc;
    // Punto de máxima potencia: barrido + refinamiento por sección dorada.
    let best = 0, bestV = 0;
    const N = 200;
    for (let k = 1; k < N; k++) {
      const V = (voc * k) / N;
      const P = V * at(V);
      if (P > best) { best = P; bestV = V; }
    }
    let lo = Math.max(0, bestV - voc / N), hi = Math.min(voc, bestV + voc / N);
    const gr = (Math.sqrt(5) - 1) / 2;
    for (let k = 0; k < 40; k++) {
      const x1 = hi - gr * (hi - lo), x2 = lo + gr * (hi - lo);
      if (x1 * at(x1) < x2 * at(x2)) lo = x1; else hi = x2;
    }
    const vmp = (lo + hi) / 2;
    const imp = at(vmp);
    const pmp = vmp * imp;
    return { ns: Ns, np: Np, at, voc, isc, vmp, imp, pmp, ff: voc * isc > 0 ? pmp / (voc * isc) : 0, rmp: imp > 0 ? vmp / imp : Infinity };
  }
  function ivCurve(arr, nPts) {
    const n = Math.max(10, nPts || 120);
    const pts = [];
    for (let k = 0; k <= n; k++) {
      const V = (arr.voc * k) / n;
      const I = arr.at(V);
      pts.push({ v: V, i: I, p: V * I });
    }
    return pts;
  }
  // Punto de operación con una carga resistiva R: resuelve I(V) = V/R (bisección).
  function loadPoint(arr, r) {
    const R = Math.max(1e-4, num(r, 1));
    let lo = 0, hi = arr.voc;
    for (let k = 0; k < 80; k++) {
      const mid = (lo + hi) / 2;
      if (arr.at(mid) - mid / R > 0) lo = mid; else hi = mid;
    }
    const v = (lo + hi) / 2;
    const i = v / R;
    return { r: R, v, i, p: v * i, ratio: arr.pmp > 0 ? (v * i) / arr.pmp : 0 };
  }

  return { loadsSummary, pvRequirement, panelVoltages, arrayConfig, verifyArray, voltageDrop, batterySizing, verifyBattery, energyYear, costs, cashflow, basicEstimate, basicFromPanels, validatePanelData, cellTemp, ivParams, ivCurrent, ivArray, ivCurve, loadPoint, fmt: f, RHO_CU_70 };
});
