/* Pruebas del motor de física del laboratorio. Ejecutar: node tests/lab.test.js */
const L = require(__dirname + '/../lab-core.js');
global.window = {};
require(__dirname + '/../data/astm-g173.js');
const G = window.SV_G173;
let fails = 0;
const ok = (name, cond, info) => { console.log((cond ? 'PASS ' : 'FAIL ') + name + (info !== undefined ? '  → ' + info : '')); if (!cond) fails++; };
const near = (a, b, rel) => Math.abs(a - b) <= Math.abs(b) * rel;

// Fotón: E = hc/λ, f = c/λ
const p = L.photon(550);
ok('f(550 nm) = 5.451e14 Hz', near(p.f, 5.4508e14, 1e-4), p.f);
ok('E(550 nm) = 3.612e-19 J', near(p.eJ, 3.6117e-19, 1e-4), p.eJ);
ok('E(550 nm) = 2.254 eV', near(p.eV, 2.2543, 1e-4), p.eV);
ok('hc = 1239.84 eV·nm', near(L.HC_EVNM, 1239.842, 1e-6), L.HC_EVNM);
ok('E = h·f coherente', near(p.eJ, L.H * p.f, 1e-12));
ok('λ desde f regresa al valor', near(L.lambdaFromF(p.f), 550, 1e-9));
ok('λ desde E regresa al valor', near(L.lambdaFromEv(p.eV), 550, 1e-9));
ok('regiones', L.regionOf(300).id === 'uv' && L.regionOf(550).id === 'vis' && L.regionOf(1000).id === 'ir');

// Espectros: integrales de ASTM G173 y de Planck
ok('G173 global ≈ 1000.4 W/m²', near(L.integrate(G.wl, G.global), 1000.4, 2e-3), L.integrate(G.wl, G.global));
ok('G173 ETR ≈ 1347.9 W/m² (280–4000 nm)', near(L.integrate(G.wl, G.etr), 1347.9, 2e-3), L.integrate(G.wl, G.etr));
ok('G173 directa ≈ 900.1 W/m²', near(L.integrate(G.wl, G.direct), 900.1, 2e-3), L.integrate(G.wl, G.direct));
const regs = L.integrate(G.wl, G.global, 280, 380) + L.integrate(G.wl, G.global, 380, 750) + L.integrate(G.wl, G.global, 750, 4000);
ok('UV + visible + IR = total', near(regs, L.integrate(G.wl, G.global), 1e-9));
const wl = [], bb = [];
for (let l = 50; l <= 100000; l += l < 3000 ? 1 : 20) { wl.push(l); bb.push(L.planckEarth(l, 5772)); }
const sb = 5.670374419e-8 * Math.pow(5772, 4) * Math.pow(L.R_SUN / L.AU, 2);
ok('∫ Planck 5772 K = σT⁴(R/UA)² ≈ 1361 W/m²', near(L.integrate(wl, bb), sb, 5e-3), L.integrate(wl, bb).toFixed(1) + ' vs ' + sb.toFixed(1));
ok('pico de Planck 5772 K ≈ 502 nm (Wien)', (() => { let m = 0, lm = 0; wl.forEach((l, i) => { if (bb[i] > m) { m = bb[i]; lm = l; } }); return Math.abs(lm - 2.897771955e6 / 5772) <= 1; })());
ok('flujo de fotones AM1.5G ≈ 4.3e21 /s/m²', near(L.photonFlux(G.wl, G.global), 4.31e21, 0.03), L.photonFlux(G.wl, G.global));

// Efecto fotoeléctrico
const na = L.MATERIALS.find((m) => m.id === 'na');
const a = L.photoelectric({ lambdaNm: 400, phiEv: na.phi, powerW: 10e-6, volts: 0 });
ok('Na, 400 nm: Kmax = hf − Φ', near(a.kmaxEv, L.photon(400).eV - 2.36, 1e-9), a.kmaxEv);
ok('V₀ = Kmax/e', near(a.stopV, a.kmaxEv, 1e-12));
ok('umbral del Na ≈ 525 nm', near(a.thresholdNm, 1239.842 / 2.36, 1e-6), a.thresholdNm);
const below = L.photoelectric({ lambdaNm: 600, phiEv: na.phi, powerW: 1e-3, volts: 2 });
ok('debajo del umbral no hay emisión aunque la intensidad sea alta', !below.emits && below.current === 0);
const b2 = L.photoelectric({ lambdaNm: 400, phiEv: na.phi, powerW: 20e-6, volts: 0 });
ok('más intensidad → más corriente', near(b2.current, 2 * a.current, 1e-9));
ok('más intensidad → misma Kmax', b2.kmaxEv === a.kmaxEv);
const c2 = L.photoelectric({ lambdaNm: 300, phiEv: na.phi, powerW: 10e-6, volts: 0 });
ok('más frecuencia → mayor Kmax', c2.kmaxEv > a.kmaxEv);
const st = L.photoelectric({ lambdaNm: 400, phiEv: na.phi, powerW: 10e-6, volts: -a.stopV });
ok('con V = −V₀ la corriente es cero', st.current === 0);
const half = L.photoelectric({ lambdaNm: 400, phiEv: na.phi, powerW: 10e-6, volts: -a.stopV / 2 });
ok('con V = −V₀/2 se recolecta la mitad', near(half.collection, 0.5, 1e-9));
ok('voltaje positivo: saturación', L.photoelectric({ lambdaNm: 400, phiEv: na.phi, powerW: 10e-6, volts: 3 }).current === a.current);
ok('corriente del orden de nA (10 µW, Y = 1e-3)', a.current > 1e-9 && a.current < 1e-8, a.current);
const iv = L.photoelectricIV({ lambdaNm: 400, phiEv: na.phi, powerW: 10e-6 }, -2, 2, 40);
ok('curva I(V) monótona creciente', iv.every((q, i) => i === 0 || q.i >= iv[i - 1].i - 1e-30));

// Celda p-n
const si = L.pvPhoton(1200, 1.12);
ok('Si no absorbe 1200 nm', !si.absorbed);
ok('corte del Si ≈ 1107 nm', near(L.pvPhoton(500, 1.12).cutoffNm, 1107, 1e-3), L.pvPhoton(500, 1.12).cutoffNm);
const s5 = L.pvPhoton(500, 1.12);
ok('útil + calor = energía del fotón', near(s5.usefulEv + s5.heatEv, s5.photon.eV, 1e-12));

// Formato
ok('formato científico', L.sci(5.4508e14, 3) === '5.45 × 10¹⁴', L.sci(5.4508e14, 3));
ok('formato negativo', L.sci(3.6117e-19, 3) === '3.61 × 10⁻¹⁹', L.sci(3.6117e-19, 3));

console.log(fails ? fails + ' PRUEBA(S) FALLARON' : 'TODAS LAS PRUEBAS DEL LABORATORIO PASARON');
process.exitCode = fails ? 1 : 0;
