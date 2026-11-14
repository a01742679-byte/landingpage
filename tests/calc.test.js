const C = require(__dirname + '/../calc.js');
global.window = {}; require(__dirname + '/../catalogo.js');
const cat = window.SV_CATALOG_SEED;
let fails = 0;
const eq = (name, got, exp, tol = 1e-6) => {
  const ok = Math.abs(got - exp) <= tol;
  if (!ok) fails++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' got=' + got + ' exp=' + exp);
};
// 1. Consumo con valores manuales
const loads = [
  { qty: 8, watts: 18, hours: 6 },   // 144 W, 864 Wh
  { qty: 1, watts: 250, hours: 3 },  // 250 W, 750
  { qty: 1, watts: 65, hours: 6 },   // 65, 390
  { qty: 4, watts: 75, hours: 6 },   // 300, 1800
  { qty: 1, watts: 1100, hours: 5 }, // 1100, 5500
];
const L = C.loadsSummary(loads, { simultaneity: 0.8, acVolts: 127, daysPerYear: 200 });
eq('potencia instalada W', L.installedW, 1859);
eq('energía diaria Wh', L.energyDayWh, 9304);
eq('demanda W', L.demandW, 1487.2);
eq('corriente A (ley de Ohm)', L.demandCurrentA, 1487.2 / 127);
eq('kWh anuales', L.annualKWh, 9.304 * 200);
// 2. Paneles: 9.304 kWh / (5.5*0.75) = 2.2555 kW -> 4 paneles de 620
const pv = C.pvRequirement({ energyDayWh: 9304, hsp: 5.5, pr: 0.75, chainEff: 1, panelW: 620 });
eq('potencia FV requerida kW', pv.requiredKW, 9.304 / 4.125);
eq('núm. paneles', pv.panels, 4);
// 3. Voltajes y serie/paralelo con JA 620 e inversor MIN 10000
const ja = cat.find(x => x.id === 'panel-ja-620');
const min = cat.find(x => x.id === 'inv-min10000-x2');
const spf = cat.find(x => x.id === 'inv-spf6000t');
const v = C.panelVoltages(ja, 5, 70);
eq('Voc en frío', v.vocCold, 52.07 * (1 + (-0.0026) * (5 - 25)), 1e-9);
eq('Vmp en calor', v.vmpHot, 43.51 * (1 - 0.0026 * 45), 1e-9);
const cfg = C.arrayConfig(ja, min, 4, 5, 70);
console.log('cfg MIN', cfg.nsMin, cfg.nsMax, cfg.ns, cfg.np, cfg.total, cfg.feasible);
eq('MIN ns_max', cfg.nsMax, Math.floor(600 / (52.07 * (1 + 0.0026 * 20))));
const vr = C.verifyArray(ja, min, cfg, { tMin: 5, tCellMax: 70 }, { demandW: L.demandW, cable: { lengthM: 20, sectionMm2: 6 } });
vr.checks.forEach(c => console.log('  ', c.status, c.label, '-', c.detail));
const cfgS = C.arrayConfig(ja, spf, 5, 5, 70);
console.log('cfg SPF', cfgS.nsMin, cfgS.nsMax, cfgS.ns, cfgS.np, cfgS.total, cfgS.feasible);
// 4. Ohm: R = 0.0206*2*20/6
const d = C.voltageDrop(14.25, 20, 6, 4 * 43.51);
eq('R cable', d.resistanceOhm, 0.0206 * 40 / 6);
eq('ΔV', d.dropV, 14.25 * 0.0206 * 40 / 6);
eq('pérdida W', d.lossW, 14.25 ** 2 * 0.0206 * 40 / 6);
// 5. Batería: US5000, 0.5 día
const us = cat.find(x => x.id === 'bat-us5000');
const bs = C.batterySizing({ battery: us, vbus: 48, days: 0.5, etaInv: 0.92, energyDayWh: 9304, demandW: L.demandW });
console.log('bat', bs.nsB, bs.npB, bs.count, bs.nomWh, bs.autonomyDays.toFixed(2), bs.autonomyHours.toFixed(2), bs.iDis.toFixed(1));
eq('energía nominal necesaria', bs.eNomNeeded, 9304 * 0.5 / 0.92 / 0.95, 1e-6);
eq('módulos', bs.count, Math.max(Math.ceil(bs.eNomNeeded / 4800), Math.ceil(bs.iDis / 80)));
C.verifyBattery(us, spf, bs, 5 * 620).forEach(c => console.log('  ', c.status, c.label, '-', c.detail));
// 6. Economía
const costsR = C.costs({ panel: ja, nPanels: 4, inverter: min, battery: null, nBattery: 0, installPct: 20, ivaPct: 0 });
eq('equipo', costsR.equipment, 4 * 3800.80 + 24259.62, 1e-6);
eq('instalación 20%', costsR.install, costsR.equipment * 0.2, 1e-6);
const energy = { pdcW: 2480, hsp: 5.5, pr: 0.75, chainEff: 1, energyDayWh: 9304, daysPerYear: 200, netMetering: false };
const e0 = C.energyYear(energy);
eq('gen diaria kWh', e0.genDayKWh, 2.48 * 5.5 * 0.75, 1e-9);
eq('ahorro kWh/año (sin medición neta, limitado al consumo diario)', e0.selfKWh, 200 * Math.min(2.48 * 5.5 * 0.75, 9.304), 1e-9);
const cf = C.cashflow({ investment: costsR.total, energy, tariff: 2.5, degradPct: 0, escalationPct: 0, omYear: 0 });
eq('payback simple = inversión / ahorro año 1', cf.simplePayback, costsR.total / (e0.selfKWh * 2.5), 1e-9);
console.log('payback', cf.payback, 'neto 25 años', cf.net.toFixed(0));
// Interpolación payback con flujo constante: debe coincidir con simple
eq('payback interpolado = simple (sin degradación)', cf.payback, cf.simplePayback, 1e-6);
// Medición neta
const en = C.energyYear(Object.assign({}, energy, { netMetering: true }));
eq('medición neta: min(gen anual, consumo anual)', en.selfKWh, Math.min(2.48 * 5.5 * 0.75 * 365, 9.304 * 200), 1e-9);
console.log(fails ? ('FALLAS: ' + fails) : 'TODAS LAS PRUEBAS PASARON');
process.exit(fails ? 1 : 0);
