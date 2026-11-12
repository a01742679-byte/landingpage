/* ==========================================================================
   SVOLTS · Laboratorio Solar Interactivo — infraestructura de la página
   Navegación entre simulaciones (#espectro, #fotoelectrico, #celda), estado
   compartido, ciclos de animación con pausa, lienzos nítidos en pantallas de
   alta densidad, controles segmentados accesibles y validación de números.
   Cada simulación se registra con SVLabUI.register(nombre, { show, hide }).
   ========================================================================== */
(() => {
  'use strict';

  const L = window.SVLab;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const nf = (v, d = 0) => Number(v).toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ---------------- Estado (se recuerda solo en este navegador) ---------------- */
  const KEY = 'svolts.lab.v1';
  const DEFAULTS = {
    specView: 'terrestre', specRegion: 'todo', specG: 1000, specBB: false, specL: 550,
    peL: 400, peI: 60, peMat: 'na', peV: 0,
    pnL: 550, pnI: 60, pnMat: 'si', pnMode: 'celda', pnField: true,
  };
  const state = Object.assign({}, DEFAULTS);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved === 'object') {
      Object.keys(DEFAULTS).forEach((k) => {
        if (typeof saved[k] === typeof DEFAULTS[k]) state[k] = saved[k];
      });
    }
  } catch (e) { /* sin almacenamiento */ }
  let saveTimer = 0;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ } }, 250);
  };

  /* ---------------- Ciclo de animación con pausa ----------------
     step(dt) recibe segundos (máx. 0.05 para evitar saltos tras pausas).
     Se detiene solo cuando la pestaña está oculta o la simulación no se ve. */
  function createLoop(step) {
    let raf = 0, last = 0, playing = false, visible = false;
    const tick = (t) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      step(dt);
      raf = requestAnimationFrame(tick);
    };
    const sync = () => {
      const run = playing && visible && !document.hidden;
      if (run && !raf) { last = 0; raf = requestAnimationFrame(tick); }
      if (!run && raf) { cancelAnimationFrame(raf); raf = 0; }
    };
    document.addEventListener('visibilitychange', sync);
    return {
      play() { playing = true; sync(); },
      pause() { playing = false; sync(); },
      toggle() { playing = !playing; sync(); return playing; },
      setVisible(v) { visible = v; sync(); },
      get playing() { return playing; },
    };
  }
  // Botón de reproducir/pausar ligado a un ciclo
  function bindPlay(btn, loop, onChange) {
    const paint = () => {
      btn.textContent = loop.playing ? 'Pausar' : 'Reproducir';
      btn.setAttribute('aria-pressed', String(!loop.playing));
    };
    btn.addEventListener('click', () => { loop.toggle(); paint(); if (onChange) onChange(); });
    paint();
    return paint;
  }

  /* ---------------- Lienzo nítido y adaptable ----------------
     aspect(w) devuelve la altura deseada en px CSS para un ancho dado. */
  function fitCanvas(canvas, aspect, onResize) {
    const ctx = canvas.getContext('2d');
    const box = { w: 0, h: 0, dpr: 1, ctx };
    let ready = false; // el primer ajuste es síncrono y no llama a onResize
    const resize = () => {
      const w = Math.max(240, Math.round(canvas.parentElement.clientWidth));
      const h = Math.round(aspect(w));
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (w === box.w && h === box.h && dpr === box.dpr) return;
      box.w = w; box.h = h; box.dpr = dpr;
      canvas.style.height = h + 'px';
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (onResize && ready) onResize(box);
    };
    resize();
    ready = true;
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(canvas.parentElement);
    else window.addEventListener('resize', resize);
    box.resize = resize;
    return box;
  }

  /* ---------------- Control segmentado (role=radiogroup) ---------------- */
  function segmented(el, attr, value, onChange) {
    const btns = $$('[role=radio]', el);
    const set = (v, focus) => {
      btns.forEach((b) => {
        const on = b.dataset[attr] === v;
        b.setAttribute('aria-checked', String(on));
        b.tabIndex = on ? 0 : -1;
        if (on && focus) b.focus();
      });
    };
    btns.forEach((b, i) => {
      b.addEventListener('click', () => { set(b.dataset[attr]); onChange(b.dataset[attr]); });
      b.addEventListener('keydown', (e) => {
        const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        const nb = btns[(i + d + btns.length) % btns.length];
        set(nb.dataset[attr], true);
        onChange(nb.dataset[attr]);
      });
    });
    set(value);
    return set;
  }

  /* ---------------- Entrada numérica validada ----------------
     Aplica el valor solo si es un número dentro de [min, max]; si no, muestra
     el mensaje en errEl y, al salir del campo, restaura el último valor válido. */
  function numberInput(input, opts) {
    const show = (msg) => { if (!opts.err) return; opts.err.textContent = msg || ''; opts.err.hidden = !msg; };
    input.addEventListener('input', () => {
      const raw = input.value.trim();
      if (raw === '') { show(''); return; }
      const v = Number(raw);
      if (!Number.isFinite(v)) { show(opts.label + ': escribe un número.'); return; }
      if (v < opts.min || v > opts.max) { show(opts.label + ': usa un valor entre ' + nf(opts.min, opts.dec || 0) + ' y ' + nf(opts.max, opts.dec || 0) + ' ' + opts.unit + '.'); input.setAttribute('aria-invalid', 'true'); return; }
      input.removeAttribute('aria-invalid');
      show('');
      opts.apply(v);
    });
    input.addEventListener('blur', () => { input.removeAttribute('aria-invalid'); show(''); opts.restore(); });
  }

  // Relleno del riel de un deslizador (feedback visual)
  function paintRange(r) {
    const min = Number(r.min), max = Number(r.max), v = Number(r.value);
    r.style.setProperty('--fill', ((v - min) / (max - min)) * 100 + '%');
  }
  document.addEventListener('input', (e) => { if (e.target.matches('input[type=range]')) paintRange(e.target); });

  /* ---------------- Navegación entre simulaciones ---------------- */
  const sims = {};
  const VIEWS = ['inicio', 'espectro', 'fotoelectrico', 'celda'];
  let current = null;
  function show(view, opts) {
    const o = opts || {};
    if (!VIEWS.includes(view)) view = 'inicio';
    if (view === current && !o.force) return;
    current = view;
    $$('.labview').forEach((s) => { s.hidden = s.dataset.labview !== view; });
    $$('.labtab').forEach((t) => {
      const on = t.dataset.lab === view;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    Object.keys(sims).forEach((k) => { if (k === view) sims[k].show(); else sims[k].hide(); });
    if (!o.silent) {
      const target = $('.labbody');
      const top = target.getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top: Math.max(0, top), behavior: reduce.matches || o.instant ? 'auto' : 'smooth' });
      const h = $('.labview:not([hidden]) h2');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-lab]');
    if (!a) return;
    e.preventDefault();
    const v = a.dataset.lab;
    if (a.dataset.carry && sims[v] && sims[v].carry) sims[v].carry(Number(a.dataset.carry));
    const hash = v === 'inicio' ? location.pathname + location.search : '#' + v;
    try { history.pushState(null, '', hash); } catch (err) { location.hash = v; }
    show(v);
  });
  window.addEventListener('popstate', () => show(location.hash.slice(1) || 'inicio', { silent: true }));

  /* ---------------- Barra de navegación ---------------- */
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

  /* ---------------- Fondo de la portada: fotones a la deriva ---------------- */
  (() => {
    const cv = $('#heroField');
    if (!cv) return;
    const box = fitCanvas(cv, () => cv.parentElement.clientHeight || 420);
    const dots = Array.from({ length: 46 }, () => ({ x: Math.random(), y: Math.random(), l: 380 + Math.random() * 370, s: 0.02 + Math.random() * 0.05, r: 1 + Math.random() * 2.2 }));
    const draw = (dt) => {
      const { ctx, w, h } = box;
      ctx.clearRect(0, 0, w, h);
      dots.forEach((d) => {
        d.x += d.s * dt; d.y -= d.s * 0.35 * dt;
        if (d.x > 1.02) d.x = -0.02;
        if (d.y < -0.02) d.y = 1.02;
        const c = L.wavelengthToRGB(d.l);
        ctx.fillStyle = L.rgbStr(c, 0.55);
        ctx.beginPath(); ctx.arc(d.x * w, d.y * h, d.r, 0, Math.PI * 2); ctx.fill();
      });
    };
    const loop = createLoop(draw);
    draw(0);
    loop.setVisible(true);
    if (!reduce.matches) loop.play();
    reduce.addEventListener('change', () => { if (reduce.matches) loop.pause(); else loop.play(); });
    if ('IntersectionObserver' in window) new IntersectionObserver((es) => loop.setVisible(es[0].isIntersecting)).observe(cv);
  })();

  /* ---------------- API para las simulaciones ---------------- */
  window.SVLabUI = {
    state, save, $, $$, nf, reduce, createLoop, bindPlay, fitCanvas, segmented, numberInput, paintRange,
    register(name, api) { sims[name] = api; },
    start() {
      $$('input[type=range]').forEach(paintRange);
      const h = location.hash.slice(1);
      show(VIEWS.includes(h) ? h : 'inicio', { silent: !VIEWS.includes(h) || h === 'inicio', instant: true });
    },
  };
  // Las simulaciones se cargan después de este archivo; se arranca al terminar.
  window.addEventListener('DOMContentLoaded', () => window.SVLabUI.start());
})();
