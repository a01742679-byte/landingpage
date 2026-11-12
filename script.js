/* ==========================================================================
   SVOLTS · Ingeniería Solar — interacciones
   JavaScript sin dependencias. Todo el contenido educativo es conceptual:
   no se calculan valores eléctricos ni cotizaciones.
   ========================================================================== */
(() => {
  'use strict';

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ------------------------------------------------------------------------
     1. NAVEGACIÓN: estado al desplazar, menú móvil, sección activa
     ------------------------------------------------------------------------ */
  const nav = $('#nav');
  const menu = $('#menu');
  const burger = $('.burger');
  const navLinks = $$('[data-nav]');
  const dot = $('.nav__dot');
  const sectionIds = navLinks.map((a) => a.getAttribute('href').slice(1));

  function setMenu(open) {
    if (!menu || !burger) return;
    menu.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  }
  burger?.addEventListener('click', () => setMenu(burger.getAttribute('aria-expanded') !== 'true'));
  navLinks.forEach((a) => a.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && burger?.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      burger.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (burger?.getAttribute('aria-expanded') === 'true' && !e.target.closest('.nav__bar')) setMenu(false);
  });

  function moveDot() {
    if (!dot) return;
    const active = navLinks.find((a) => a.classList.contains('is-active'));
    if (!active || getComputedStyle(dot).display === 'none') return;
    const x = active.offsetLeft + active.offsetWidth / 2 - 3;
    dot.style.transform = `translateX(${x}px)`;
    dot.classList.add('is-ready');
  }
  function setActive(id) {
    navLinks.forEach((a) => {
      const on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
    moveDot();
  }
  if ('IntersectionObserver' in window) {
    const visible = new Map();
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => visible.set(en.target.id, en.isIntersecting ? en.intersectionRatio : 0));
        let best = null;
        let bestRatio = 0;
        visible.forEach((ratio, id) => {
          if (ratio > bestRatio) { best = id; bestRatio = ratio; }
        });
        if (best) setActive(best);
      },
      { rootMargin: '-35% 0px -45% 0px', threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );
    sectionIds.forEach((id) => { const el = document.getElementById(id); if (el) sectionObserver.observe(el); });
  }
  setActive('inicio');
  window.addEventListener('resize', () => { moveDot(); if (window.innerWidth > 1080) setMenu(false); });

  /* ------------------------------------------------------------------------
     2. APARICIÓN AL DESPLAZAR
     ------------------------------------------------------------------------ */
  const revealEls = $$('[data-reveal]');
  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
      }),
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-in'));
  }
  const closing = $('.closing');
  if (closing) {
    if ('IntersectionObserver' in window) {
      const lit = new IntersectionObserver((es) => es.forEach((en) => {
        if (en.isIntersecting) { closing.classList.add('is-lit'); lit.disconnect(); }
      }), { threshold: 0.25 });
      lit.observe(closing);
    } else closing.classList.add('is-lit');
  }

  /* ------------------------------------------------------------------------
     3. SCROLL: nav compacta, anillo de progreso, profundidad del hero
     ------------------------------------------------------------------------ */
  const totop = $('#totop');
  const ring = $('#totopRing');
  const rig = $('#sceneRig');
  const hero = $('#inicio');
  const RING_LEN = 131.95;
  let ticking = false;

  function onScroll() {
    const y = window.scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    nav?.classList.toggle('is-scrolled', y > 16);
    totop?.classList.toggle('is-visible', y > 640);
    if (ring) ring.style.strokeDashoffset = String(RING_LEN * (1 - clamp(y / max, 0, 1)));
    if (rig && hero && !reduceMotion.matches && y < hero.offsetHeight) {
      rig.style.setProperty('--py', `${(-y * 0.07).toFixed(1)}px`);
    }
    ticking = false;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  totop?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    const home = $('.brand');
    setTimeout(() => home?.focus({ preventScroll: true }), reduceMotion.matches ? 0 : 500);
  });

  /* ------------------------------------------------------------------------
     4. HERO: isla flotante en proyección isométrica + perspectiva interactiva
     ------------------------------------------------------------------------ */
  function buildIsland() {
    const svg = $('#isoSvg');
    if (!svg) return;
    const s = 34, ox = 290, oy = 118, K = 0.866;
    const P = (x, y, z = 0) => [ox + (x - y) * K * s, oy + (x + y) * 0.5 * s - z * s];
    const f = (n) => n.toFixed(1);
    const pt = (arr) => arr.map((p) => f(p[0]) + ',' + f(p[1])).join(' ');
    const poly = (arr, fill, round = true, extra = '') =>
      `<polygon points="${pt(arr)}" fill="${fill}"${round ? ` stroke="${fill}" stroke-width="3" stroke-linejoin="round"` : ''} ${extra}/>`;
    const box = (x0, y0, z0, x1, y1, z1, c) => {
      const L = [P(x0, y1, z0), P(x1, y1, z0), P(x1, y1, z1), P(x0, y1, z1)];
      const R = [P(x1, y1, z0), P(x1, y0, z0), P(x1, y0, z1), P(x1, y1, z1)];
      const T = [P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)];
      return poly(L, c.l) + poly(R, c.r) + poly(T, c.t);
    };
    const line = (a, b) => `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;

    const X = 10, Y = 8;
    let defs = '';
    let back = '';
    const items = [];

    // Rocas flotantes pequeñas
    const chip = (x, y, z, w) => box(x, y, z, x + w, y + w, z + w * 0.9, { t: '#3B74AC', l: '#17375F', r: '#0B1F3A' });
    back += chip(-1.9, 4.6, -3.6, 0.9) + chip(11, 2.8, -3.0, 0.7) + chip(3.0, 9.4, -5.1, 0.6);

    // Roca inferior (cono invertido)
    const A = P(4.7, 4.5, -6.9);
    back += poly([P(0, Y, -1), P(X, Y, -1), A], '#1B5A93');
    back += poly([P(X, Y, -1), P(X, 0, -1), A], '#12335B');
    back += poly([P(0, Y, -1), P(3.4, Y, -1), A], '#2473B8', false, 'opacity=".55"');
    back += poly([P(X, Y, -1), P(X, 4.6, -1), A], '#0B1F3A', false, 'opacity=".45"');

    // Losa superior
    back += box(0, 0, -1, X, Y, 0, { t: '#E6F0F9', l: '#A9CBE8', r: '#86B3DA' });

    // Cuadrícula de plano técnico
    let grid = '';
    for (let i = 1; i < X; i++) grid += line(P(i, 0, 0), P(i, Y, 0));
    for (let j = 1; j < Y; j++) grid += line(P(0, j, 0), P(X, j, 0));
    back += `<path d="${grid}" stroke="rgba(36,115,184,.16)" stroke-width="1" fill="none"/>`;

    // Paneles: 3 columnas x 2 filas
    const cols = 3, rows = 2, w = 2.1, d = 2.4, gx = 0.45, gy = 0.5, x0 = 0.9, y0 = 1.0;
    let shadows = '';
    let n = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = x0 + c * (w + gx);
        const y = y0 + r * (d + gy);
        shadows += poly([P(x + 0.45, y + 0.45, 0), P(x + w + 0.45, y + 0.45, 0), P(x + w + 0.45, y + d + 0.45, 0), P(x + 0.45, y + d + 0.45, 0)], 'rgba(11,31,58,.11)', false);

        const zt = 0.62, ins = 0.14;
        const xa = x + ins, xb = x + w - ins, ya = y + ins, yb = y + d - ins;
        const cell = [P(xa, ya, zt), P(xb, ya, zt), P(xb, yb, zt), P(xa, yb, zt)];
        let g = '';
        for (let k = 1; k < 6; k++) { const xx = xa + ((xb - xa) * k) / 6; g += line(P(xx, ya, zt), P(xx, yb, zt)); }
        for (let k = 1; k < 4; k++) { const yy = ya + ((yb - ya) * k) / 4; g += line(P(xa, yy, zt), P(xb, yy, zt)); }
        const xs = cell.map((p) => p[0]), ys = cell.map((p) => p[1]);
        const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys) - 2, maxy = Math.max(...ys) + 2;
        const bw = maxx - minx, bandW = bw * 0.26, sx = minx - bw * 0.7;
        const band = [[sx, maxy], [sx + bandW * 0.6, miny], [sx + bandW * 1.6, miny], [sx + bandW, maxy]];
        defs += `<clipPath id="pc${n}"><polygon points="${pt(cell)}"/></clipPath>`;

        const svgPanel =
          box(x, y, 0.3, x + w, y + d, zt, { t: '#BCD8EE', l: '#5C93C6', r: '#3B74AC' }) +
          poly(cell, '#17375F', true) +
          `<path d="${g}" stroke="#3C82C4" stroke-width="1.2" fill="none"/>` +
          `<g clip-path="url(#pc${n})"><g class="iso-sheen" style="--sw:${(bw * 1.9).toFixed(0)}px;--sd:${(n * 0.9).toFixed(1)}s"><polygon points="${pt(band)}" fill="#fff" opacity=".26"/></g></g>`;
        items.push({ d: x + w + y + d, svg: svgPanel });
        n++;
      }
    }

    // Equipo: inversor y batería
    const inv =
      box(8.55, 1.4, 0, 9.55, 2.9, 1.5, { t: '#FFFFFF', l: '#DCE6F0', r: '#B6CBE0' }) +
      `<path d="${line(P(9.55, 1.75, 0.55), P(9.55, 2.55, 0.55))}" stroke="#86B3DA" stroke-width="2.5" stroke-linecap="round"/>` +
      `<circle class="iso-led" cx="${f(P(9.55, 2.25, 1.15)[0])}" cy="${f(P(9.55, 2.25, 1.15)[1])}" r="3.4" fill="#F5A623"/>`;
    items.push({ d: 9.55 + 2.9, svg: inv });

    let bars = '';
    [[0.3, 0.55], [0.8, 1.05], [1.3, 1.55]].forEach(([za, zb]) => {
      bars += poly([P(9.55, 3.8, za), P(9.55, 4.95, za), P(9.55, 4.95, zb), P(9.55, 3.8, zb)], '#F5A623', true);
    });
    const bat = box(8.55, 3.5, 0, 9.55, 5.2, 1.95, { t: '#FFFFFF', l: '#DCE6F0', r: '#B6CBE0' }) + bars;
    items.push({ d: 9.55 + 5.2, svg: bat });

    // Arbustos redondeados
    const bush = (x, y, r) => {
      const [px, py] = P(x, y, 0);
      return (
        `<circle cx="${f(px - r * 0.85)}" cy="${f(py - r * 0.5)}" r="${f(r * 0.7)}" fill="#1B5A93"/>` +
        `<circle cx="${f(px + r * 0.9)}" cy="${f(py - r * 0.45)}" r="${f(r * 0.74)}" fill="#1B5A93"/>` +
        `<circle cx="${f(px)}" cy="${f(py - r * 0.95)}" r="${r}" fill="#2473B8"/>` +
        `<circle cx="${f(px + r * 0.05)}" cy="${f(py - r * 0.3)}" r="${f(r * 0.78)}" fill="#2473B8"/>`
      );
    };
    items.push({ d: 0.7 + 0.5, svg: bush(0.6, 0.5, 17) });
    items.push({ d: 9.3 + 0.6, svg: bush(9.4, 0.5, 14) });
    items.push({ d: 0.8 + 6.9, svg: bush(0.8, 6.9, 24) });
    items.push({ d: 1.8 + 7.3, svg: bush(1.9, 7.3, 15) });
    items.push({ d: 9.0 + 6.8, svg: bush(9.0, 6.8, 19) });
    items.push({ d: 6.2 + 7.2, svg: bush(6.4, 7.2, 12) });

    items.sort((a, b) => a.d - b.d);
    svg.innerHTML = `<defs>${defs}</defs>${back}${shadows}${items.map((i) => i.svg).join('')}`;
  }
  buildIsland();

  // Perspectiva con el cursor (escritorio) o arrastre horizontal (táctil)
  (function initScene() {
    const scene = $('#scene');
    if (!scene || !rig || reduceMotion.matches) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0, dragging = false, startX = 0, startY = 0, baseX = 0, baseY = 0;

    const loop = () => {
      cx += (tx - cx) * 0.08;
      cy += (ty - cy) * 0.08;
      rig.style.setProperty('--rx', cy.toFixed(2));
      rig.style.setProperty('--ry', cx.toFixed(2));
      if (Math.abs(tx - cx) > 0.02 || Math.abs(ty - cy) > 0.02) raf = requestAnimationFrame(loop);
      else raf = 0;
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

    hero.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse' || !finePointer.matches) return;
      const r = scene.getBoundingClientRect();
      const nx = clamp((e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2), -1, 1);
      const ny = clamp((e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2), -1, 1);
      tx = nx * 9;
      ty = -ny * 6;
      kick();
    });
    hero.addEventListener('pointerleave', () => { if (!dragging) { tx = 0; ty = 0; kick(); } });

    scene.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      dragging = true; startX = e.clientX; startY = e.clientY; baseX = tx; baseY = ty;
    });
    scene.addEventListener('pointermove', (e) => {
      if (!dragging || e.pointerType === 'mouse') return;
      tx = clamp(baseX + (e.clientX - startX) * 0.18, -16, 16);
      ty = clamp(baseY - (e.clientY - startY) * 0.1, -9, 9);
      kick();
    });
    const end = () => { if (dragging) { dragging = false; tx = 0; ty = 0; kick(); } };
    scene.addEventListener('pointerup', end);
    scene.addEventListener('pointercancel', end);
  })();

  /* ------------------------------------------------------------------------
     5. SERVICIOS: modal con navegación entre servicios
     ------------------------------------------------------------------------ */
  const SERVICES = [
    {
      title: 'Análisis de consumo eléctrico',
      lead: 'Todo diseño solar empieza por entender cuánta energía se usa, en qué equipos y en qué momentos del día.',
      doing: ['Inventariamos los equipos del inmueble.', 'Registramos potencia nominal y horarios de uso.', 'Organizamos la información en un perfil de consumo.'],
      evalu: ['Potencia instalada.', 'Horarios y patrones de utilización.', 'Historial de consumo, cuando está disponible.'],
      out: 'Un perfil de consumo claro que sirve como base para el resto del diseño.'
    },
    {
      title: 'Dimensionamiento fotovoltaico',
      lead: 'Con el consumo definido, establecemos cuántos paneles se necesitan y cómo se organizan.',
      doing: ['Calculamos la cantidad de paneles según la necesidad energética.', 'Definimos la configuración del arreglo.', 'Consideramos las condiciones del proyecto.'],
      evalu: ['Demanda a cubrir.', 'Espacio disponible, orientación e inclinación.', 'Sombras y condiciones del sitio.'],
      out: 'Una configuración fotovoltaica propuesta, con su justificación técnica.'
    },
    {
      title: 'Selección de inversores',
      lead: 'El inversor conecta todo el sistema. Elegirlo bien depende de la compatibilidad entre componentes.',
      doing: ['Comparamos alternativas de inversores.', 'Verificamos que sus rangos coincidan con el arreglo de paneles.', 'Revisamos la compatibilidad con baterías, cuando existen.'],
      evalu: ['Potencia nominal.', 'Voltaje y corriente de operación.', 'Tipo de sistema: interconectado, híbrido o aislado.'],
      out: 'Una lista de verificación de compatibilidad entre inversor y demás componentes.'
    },
    {
      title: 'Sistemas de almacenamiento',
      lead: 'Las baterías permiten usar la energía cuando la generación y la demanda no coinciden.',
      doing: ['Dimensionamos de forma conceptual el banco de baterías.', 'Evaluamos las necesidades de autonomía.', 'Identificamos las cargas que conviene respaldar.'],
      evalu: ['Autonomía deseada.', 'Cargas críticas del inmueble.', 'Tecnología y voltaje del banco, a nivel conceptual.'],
      out: 'Un dimensionamiento conceptual de almacenamiento y los criterios que lo respaldan.'
    },
    {
      title: 'Evaluación económica',
      lead: 'Una buena decisión necesita números claros y supuestos visibles.',
      doing: ['Estimamos la inversión necesaria.', 'Analizamos el ahorro potencial.', 'Calculamos el periodo de recuperación, cuando hay datos suficientes.'],
      evalu: ['Costo de los componentes seleccionados.', 'Consumo y tarifa considerados.', 'Supuestos utilizados en cada estimación.'],
      out: 'Una evaluación económica transparente, con sus supuestos explícitos.'
    },
    {
      title: 'Propuestas técnicas',
      lead: 'Reunimos el análisis técnico y económico en un documento claro para decidir con confianza.',
      doing: ['Integramos los resultados de cada etapa.', 'Documentamos las especificaciones del sistema recomendado.', 'Presentamos la información de forma comprensible.'],
      evalu: ['Coherencia entre consumo, diseño y componentes.', 'Alcance y supuestos de la propuesta.', 'Claridad de las especificaciones.'],
      out: 'Un reporte con especificaciones técnicas y económicas del sistema recomendado.'
    }
  ];

  const dlg = $('#svcDialog');
  if (dlg && typeof dlg.showModal === 'function') {
    let current = 0;
    let lastTrigger = null;
    const els = {
      num: $('#svcNum'), title: $('#svcTitle'), lead: $('#svcLead'), doing: $('#svcDo'),
      evalu: $('#svcEval'), out: $('#svcOut'), count: $('#svcCount')
    };
    const fillList = (ul, arr) => { ul.innerHTML = ''; arr.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); }); };
    const render = (i) => {
      current = (i + SERVICES.length) % SERVICES.length;
      const s = SERVICES[current];
      els.num.textContent = String(current + 1).padStart(2, '0');
      els.title.textContent = s.title;
      els.lead.textContent = s.lead;
      fillList(els.doing, s.doing);
      fillList(els.evalu, s.evalu);
      els.out.textContent = s.out;
      els.count.textContent = `${current + 1} / ${SERVICES.length}`;
    };
    const open = (i, trigger) => {
      lastTrigger = trigger || null;
      render(i);
      dlg.showModal();
      document.documentElement.classList.add('no-scroll');
      requestAnimationFrame(() => requestAnimationFrame(() => dlg.classList.add('is-open')));
    };
    const close = () => {
      dlg.classList.remove('is-open');
      const done = () => {
        if (dlg.open) dlg.close();
        document.documentElement.classList.remove('no-scroll');
        lastTrigger?.focus({ preventScroll: true });
      };
      if (reduceMotion.matches) done(); else setTimeout(done, 280);
    };
    $$('[data-service]').forEach((btn) => btn.addEventListener('click', (e) => { e.stopPropagation(); open(Number(btn.dataset.service), btn); }));
    $$('.tile').forEach((tile) => tile.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      tile.querySelector('[data-service]')?.click();
    }));
    $('#svcClose').addEventListener('click', close);
    $('#svcPrev').addEventListener('click', () => render(current - 1));
    $('#svcNext').addEventListener('click', () => render(current + 1));
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) close(); });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') render(current + 1);
      if (e.key === 'ArrowLeft') render(current - 1);
    });
  }

  /* ------------------------------------------------------------------------
     6. INGENIERÍA: pestañas
     ------------------------------------------------------------------------ */
  const tabs = $$('.tab');
  const panels = tabs.map((t) => document.getElementById(t.getAttribute('aria-controls')));
  function selectTab(i, focus) {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (panels[k]) panels[k].hidden = !on;
    });
    if (focus) tabs[i].focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => selectTab(i));
    t.addEventListener('keydown', (e) => {
      let k = null;
      if (e.key === 'ArrowRight') k = (i + 1) % tabs.length;
      if (e.key === 'ArrowLeft') k = (i - 1 + tabs.length) % tabs.length;
      if (e.key === 'Home') k = 0;
      if (e.key === 'End') k = tabs.length - 1;
      if (k !== null) { e.preventDefault(); selectTab(k, true); }
    });
  });

  function swap(el) {
    if (reduceMotion.matches) return;
    el.classList.remove('is-swap');
    void el.offsetWidth;
    el.classList.add('is-swap');
  }

  /* ------------------------------------------------------------------------
     7. DIAGRAMA DEL SISTEMA FOTOVOLTAICO
     ------------------------------------------------------------------------ */
  const NODES = {
    panels: {
      name: 'Paneles solares', tag: 'Generación',
      func: 'Convierten la radiación solar en electricidad de corriente continua (CC).',
      feat: ['Formados por celdas fotovoltaicas conectadas entre sí.', 'Sus datos de placa (potencia, voltaje, corriente) vienen en la ficha técnica.', 'Orientación, inclinación y sombras influyen en su producción.'],
      rel: ['inverter'], relText: 'Entregan su energía en CC al inversor.'
    },
    inverter: {
      name: 'Inversor', tag: 'Conversión y control',
      func: 'Convierte la corriente continua en corriente alterna (CA) y coordina el flujo de energía del sistema.',
      feat: ['Se elige por potencia, rango de voltaje y corriente máxima.', 'Debe ser compatible con los paneles y, si existen, con las baterías.', 'Incluye funciones de protección y monitoreo.'],
      rel: ['panels', 'load', 'battery', 'grid'], relText: 'Recibe energía de los paneles y la reparte hacia el consumo, las baterías y la red.'
    },
    battery: {
      name: 'Baterías', tag: 'Almacenamiento',
      func: 'Guardan energía para usarla cuando la generación solar y la demanda no coinciden.',
      feat: ['Su capacidad se define según la autonomía deseada.', 'La tecnología y el voltaje del banco influyen en su integración.', 'Suelen respaldar solo las cargas que se consideran críticas.'],
      rel: ['inverter'], relText: 'Se cargan con el excedente y devuelven energía a través del inversor.'
    },
    grid: {
      name: 'Red eléctrica', tag: 'Suministro externo',
      func: 'Es la red de distribución que respalda al inmueble y puede complementar al sistema solar.',
      feat: ['Trabaja en corriente alterna.', 'En sistemas interconectados, el intercambio de energía depende de la normativa y el contrato aplicables.', 'No está presente en sistemas aislados.'],
      rel: ['inverter'], relText: 'Se conecta al inversor para complementar el consumo o recibir excedentes, según el sistema.'
    },
    load: {
      name: 'Consumo del inmueble', tag: 'Demanda',
      func: 'Son los equipos e instalaciones que usan la energía: iluminación, motores, electrónica y más.',
      feat: ['Se describe por su potencia instalada y sus horarios de uso.', 'Su perfil es el punto de partida del dimensionamiento.', 'Puede tener picos de demanda que conviene identificar.'],
      rel: ['inverter'], relText: 'Recibe energía en CA desde el inversor y, cuando hace falta, desde la red.'
    }
  };
  const TIME = {
    day: {
      text: 'De día, los paneles alimentan el consumo y el excedente puede almacenarse o enviarse a la red.',
      edges: { e1: 'fwd', e2: 'fwd', e3: 'fwd', e4: 'fwd' }
    },
    night: {
      text: 'De noche, los paneles no generan: las baterías y la red cubren el consumo.',
      edges: { e1: 'idle', e2: 'fwd', e3: 'rev', e4: 'rev' }
    }
  };

  const diagram = $('#diagram');
  if (diagram) {
    const nodeEls = $$('.node', diagram);
    const edgeEls = $$('.edge', diagram);
    const detail = $('#detail');
    let selected = 'inverter';
    let time = 'day';

    const applyTime = (t) => {
      time = t;
      edgeEls.forEach((e) => {
        const state = TIME[t].edges[e.dataset.edge];
        e.classList.toggle('is-idle', state === 'idle');
        e.classList.toggle('is-rev', state === 'rev');
      });
      nodeEls.forEach((n) => n.classList.toggle('is-off', t === 'night' && n.dataset.node === 'panels'));
      $('#sysStatus').textContent = TIME[t].text;
      $$('[data-time]').forEach((b) => {
        const on = b.dataset.time === t;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    };

    const select = (id, userAction) => {
      selected = id;
      const data = NODES[id];
      const related = new Set([id, ...data.rel]);
      nodeEls.forEach((n) => {
        const on = n.dataset.node === id;
        n.classList.toggle('is-selected', on);
        n.classList.toggle('is-dim', !related.has(n.dataset.node));
        n.setAttribute('aria-pressed', String(on));
      });
      edgeEls.forEach((e) => {
        const nodes = e.dataset.nodes.split(' ');
        const hit = nodes.includes(id);
        e.classList.toggle('is-hl', hit);
        e.classList.toggle('is-dim', !hit);
      });
      $('#dTag').textContent = data.tag;
      $('#dTitle').textContent = data.name;
      $('#dFunc').textContent = data.func;
      const ul = $('#dFeat');
      ul.innerHTML = '';
      data.feat.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
      const rel = $('#dRel');
      rel.innerHTML = '';
      data.rel.forEach((r) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'rel-chip';
        b.textContent = NODES[r].name;
        b.addEventListener('click', () => select(r, true));
        rel.appendChild(b);
      });
      $('#dRelText').textContent = data.relText;
      if (userAction) swap(detail);
    };

    nodeEls.forEach((n) => {
      n.addEventListener('click', () => select(n.dataset.node, true));
      n.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(n.dataset.node, true); }
      });
    });
    $$('[data-time]').forEach((b) => b.addEventListener('click', () => applyTime(b.dataset.time)));
    applyTime('day');
    select('inverter', false);
    // En pantallas estrechas el esquema se desplaza dentro de su contenedor: se centra al cargar.
    const wrap = $('#diagramWrap');
    const center = () => { if (wrap && wrap.scrollWidth > wrap.clientWidth) wrap.scrollLeft = (wrap.scrollWidth - wrap.clientWidth) / 2; };
    center();
    window.addEventListener('resize', center);
    tabs[0]?.addEventListener('click', () => requestAnimationFrame(center));
  }

  /* ------------------------------------------------------------------------
     8. CONEXIONES EN SERIE Y EN PARALELO (solo visual)
     ------------------------------------------------------------------------ */
  const sp = $('#spdiagram');
  if (sp) {
    // Duplica cada cable: base fija + capa animada de flujo.
    $$('.wires', sp).forEach((group) => {
      const isSeries = group.classList.contains('wires--series');
      $$('path.wire', group).forEach((p) => {
        const neg = p.classList.contains('wire--neg') || (isSeries && p === group.lastElementChild);
        const base = p.cloneNode();
        base.setAttribute('class', 'wire__base');
        const flow = p.cloneNode();
        flow.setAttribute('class', 'wire__flow' + (neg ? ' is-neg' : ''));
        p.replaceWith(base, flow);
      });
    });

    const SP = {
      series: {
        tag: 'Conexión en serie', title: 'Un solo camino para la corriente',
        text: 'Los paneles se enlazan uno tras otro: la terminal positiva de cada panel se une con la negativa del siguiente.',
        pills: [['Tensión: se acumula', true], ['Corriente: se mantiene', false]],
        list: ['Un único circuito recorre todos los paneles.', 'Solo quedan dos terminales libres hacia la carga.', 'Un panel sombreado o dañado puede afectar a toda la cadena.']
      },
      parallel: {
        tag: 'Conexión en paralelo', title: 'Varios caminos hacia la misma carga',
        text: 'Todas las terminales positivas se unen en un mismo conductor y todas las negativas en otro.',
        pills: [['Tensión: se mantiene', false], ['Corriente: se acumula', true]],
        list: ['Cada panel tiene su propio camino hacia la carga.', 'Aparecen dos conductores comunes: uno positivo y otro negativo.', 'Un panel con problemas afecta menos al resto.']
      }
    };
    const setConn = (mode, user) => {
      sp.dataset.mode = mode;
      const d = SP[mode];
      $('#spTag').textContent = d.tag;
      $('#spTitle').textContent = d.title;
      $('#spText').textContent = d.text;
      const pills = $('#spPills');
      pills.innerHTML = '';
      d.pills.forEach(([t, sun]) => { const s = document.createElement('span'); s.className = 'pill' + (sun ? ' pill--sun' : ''); s.textContent = t; pills.appendChild(s); });
      const ul = $('#spList');
      ul.innerHTML = '';
      d.list.forEach((t) => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
      $$('[data-conn]').forEach((b) => {
        const on = b.dataset.conn === mode;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', String(on));
      });
      sp.setAttribute('aria-label', `Esquema conceptual de tres paneles conectados en ${mode === 'series' ? 'serie' : 'paralelo'} hacia una carga.`);
      if (user) swap(sp.closest('.sp').querySelector('.detail'));
    };
    $$('[data-conn]').forEach((b) => b.addEventListener('click', () => setConn(b.dataset.conn, true)));
    setConn('series', false);
  }

  /* ------------------------------------------------------------------------
     9. PANEL SOLAR 3D: giro controlado y vista explosionada
     ------------------------------------------------------------------------ */
  const pvStage = $('#pvStage');
  const pvRig = $('#pvRig');
  if (pvStage && pvRig) {
    const DEF = { rx: 58, rz: -32 };
    let rx = DEF.rx, rz = DEF.rz;
    let dragging = false, lastX = 0, lastY = 0, selectedLayer = null;
    const apply = () => {
      pvRig.style.setProperty('--prx', rx.toFixed(1));
      pvRig.style.setProperty('--prz', rz.toFixed(1));
    };
    const rotate = (dz, dx) => { rz += dz; rx = clamp(rx + dx, 8, 84); apply(); };

    pvStage.addEventListener('pointerdown', (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      pvStage.setPointerCapture?.(e.pointerId);
    });
    pvStage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      rotate(dx * 0.45, e.pointerType === 'mouse' ? -dy * 0.3 : 0);
    });
    const stop = () => { dragging = false; };
    pvStage.addEventListener('pointerup', stop);
    pvStage.addEventListener('pointercancel', stop);
    pvStage.addEventListener('keydown', (e) => {
      const m = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, 6], ArrowDown: [0, -6] }[e.key];
      if (m) { e.preventDefault(); rotate(m[0], m[1]); }
    });
    $$('[data-rot]').forEach((b) => b.addEventListener('click', () => {
      const m = { left: [-14, 0], right: [14, 0], up: [0, 7], down: [0, -7] }[b.dataset.rot];
      rotate(m[0], m[1]);
    }));

    const explodeBtn = $('#pvExplode');
    const setExploded = (on) => {
      pvRig.classList.toggle('is-exploded', on);
      explodeBtn.setAttribute('aria-pressed', String(on));
      explodeBtn.textContent = on ? 'Vista ensamblada' : 'Vista explosionada';
    };
    explodeBtn.addEventListener('click', () => setExploded(!pvRig.classList.contains('is-exploded')));

    const layerEls = $$('.pv__layer', pvRig);
    const layerBtns = $$('.layers__btn');
    const highlight = (name) => layerEls.forEach((l) => l.classList.toggle('is-hl', l.dataset.layer === name));
    layerBtns.forEach((b) => {
      const name = b.dataset.layer;
      b.addEventListener('mouseenter', () => highlight(name));
      b.addEventListener('focus', () => highlight(name));
      b.addEventListener('mouseleave', () => highlight(selectedLayer));
      b.addEventListener('blur', () => highlight(selectedLayer));
      b.addEventListener('click', () => {
        selectedLayer = selectedLayer === name ? null : name;
        layerBtns.forEach((x) => x.classList.toggle('is-on', x.dataset.layer === selectedLayer));
        highlight(selectedLayer);
        if (selectedLayer) setExploded(true);
      });
    });

    $('#pvReset').addEventListener('click', () => {
      rx = DEF.rx; rz = DEF.rz; apply();
      setExploded(false);
      selectedLayer = null;
      layerBtns.forEach((x) => x.classList.remove('is-on'));
      highlight(null);
    });
    apply();
  }

  /* ------------------------------------------------------------------------
     10. METODOLOGÍA: línea de proceso interactiva
     ------------------------------------------------------------------------ */
  const steps = $$('.step');
  function activateStep(i) {
    steps.forEach((s, k) => {
      const on = k === i;
      s.classList.toggle('is-active', on);
      s.classList.toggle('is-done', k < i);
      s.querySelector('.step__head').setAttribute('aria-expanded', String(on));
    });
  }
  steps.forEach((s, i) => {
    const head = s.querySelector('.step__head');
    head.addEventListener('click', () => activateStep(i));
    head.addEventListener('focus', () => activateStep(i));
    head.addEventListener('mouseenter', () => { if (finePointer.matches && window.innerWidth > 860) activateStep(i); });
  });
  activateStep(0);

  /* ------------------------------------------------------------------------
     11. BENEFICIOS: órbita ligada a la lista
     ------------------------------------------------------------------------ */
  const orbitNodes = $('#orbitNodes');
  const items = $$('.bitem');
  if (orbitNodes && items.length) {
    const cx = 180, cy = 180, R = 140;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('class', 'orbit__line');
    line.setAttribute('x1', cx); line.setAttribute('y1', cy);
    orbitNodes.parentNode.insertBefore(line, orbitNodes);
    const nodes = items.map((_, i) => {
      const a = (-90 + i * (360 / items.length)) * (Math.PI / 180);
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'onode');
      const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      g.dataset.x = x; g.dataset.y = y;
      g.innerHTML = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="17"/><text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${i + 1}</text>`;
      orbitNodes.appendChild(g);
      return g;
    });
    const setBenefit = (i) => {
      items.forEach((it, k) => it.classList.toggle('is-active', k === i));
      nodes.forEach((n, k) => n.classList.toggle('is-on', k === i));
      line.setAttribute('x2', nodes[i].dataset.x);
      line.setAttribute('y2', nodes[i].dataset.y);
      line.classList.add('is-on');
    };
    items.forEach((it, i) => {
      it.addEventListener('mouseenter', () => setBenefit(i));
      it.addEventListener('focus', () => setBenefit(i));
      it.addEventListener('click', () => setBenefit(i));
    });
    if ('IntersectionObserver' in window) {
      const bo = new IntersectionObserver((entries) => entries.forEach((en) => {
        if (en.isIntersecting) setBenefit(items.indexOf(en.target));
      }), { rootMargin: '-42% 0px -42% 0px' });
      items.forEach((it) => bo.observe(it));
    }
  }

  /* ------------------------------------------------------------------------
     Botones "Simulador de Celdas Solares": transición breve antes de abrir
     el simulador (se omite si el usuario prefiere menos movimiento).
     ------------------------------------------------------------------------ */
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-sim-link]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    e.preventDefault();
    document.body.classList.add('page-leave');
    window.setTimeout(() => { window.location.href = a.href; }, 200);
  });
  window.addEventListener('pageshow', () => document.body.classList.remove('page-leave'));
})();
